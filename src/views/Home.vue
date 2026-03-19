<template>
  <div class="flex flex-col h-full">
    <transition name="home-view-fade" mode="out-in">
      <div :key="viewTransitionKey" class="flex flex-1 flex-col min-h-0 min-w-0">
        <FoldersHeader
          v-if="localViewMode === 'folder'"
          v-model:isBatchMode="isBatchMode"
          :activeRootPath="activeRootPath"
          :selectedCount="selectedPaths.size"
          :folderTree="folderTree"
          :currentFolderFilter="currentFolderFilter"
          @playAll="handlePlayAll"
          @batchPlay="handleBatchPlay"
          @addToPlaylist="showAddToPlaylistModal = true"
          @batchDelete="handleFolderBatchDelete"
          @batchMove="handleBatchMove"
          @addFolder="handleAddFolder"
          @refreshFolder="handleRefreshFolder"
          @removeFolder="handleRemoveFolderWithConfirm"
          @newFolder="handleRootCreateFolderRequest"
          @deleteFolderDisk="handleRootDeleteFolderRequest"
          @update:activeRootPath="handleActiveRootChange"
          v-model:isManagementMode="isManagementMode"
        />
        <DetailHeader
          v-else-if="localViewMode === 'playlist'"
          v-model:isBatchMode="isBatchMode"
          :title="playlistDetail?.name || ''"
          :subtitle="playlistDetail?.date ? `${playlistDetail.date} 创建` : ''"
          :songs="localSongList"
          :selectedCount="selectedPaths.size"
          :showRename="true"
          @playAll="handlePlayAll"
          @batchPlay="handleBatchPlay"
          @addToPlaylist="showAddToPlaylistModal = true"
          @batchDelete="requestBatchDelete"
          @rename="handleRenamePlaylist"
        />

        <LocalMusicHeader
          v-else-if="!['statistics', 'artist', 'album'].includes(localViewMode)"
          v-model:isBatchMode="isBatchMode"
          :selectedCount="selectedPaths.size"
          @playAll="handlePlayAll"
          @batchPlay="handleBatchPlay"
          @addToPlaylist="showAddToPlaylistModal = true"
          @batchDelete="requestBatchDelete"
          @batchMove="handleBatchMove"
          @refreshAll="handleRefreshAll"
        />

        <div class="flex-1 flex overflow-hidden relative min-w-0">
          <MasterPanel
            v-if="localViewMode === 'folder'"
            :isManagementMode="isManagementMode"
          />

          <section class="flex-1 min-w-0 flex flex-col overflow-y-auto overflow-x-hidden custom-scrollbar relative">
            <ArtistDetailHeader
              v-if="localViewMode === 'artist'"
              v-model:isBatchMode="isBatchMode"
              v-model:activeTab="artistActiveTab"
              :artistName="localFilterCondition || '未知歌手'"
              :songs="localSongList"
              :selectedCount="selectedPaths.size"
              @playAll="handlePlayAll"
              @batchPlay="handleBatchPlay"
              @addToPlaylist="showAddToPlaylistModal = true"
              @batchDelete="requestBatchDelete"
              @batchMove="handleBatchMove"
            />

            <AlbumDetailHeader
              v-else-if="localViewMode === 'album'"
              v-model:isBatchMode="isBatchMode"
              :albumName="selectedAlbumSong?.album || '未知专辑'"
              :albumArtist="selectedAlbumSong?.album_artist || selectedAlbumSong?.artist || '未知歌手'"
              :songs="localSongList"
              :selectedCount="selectedPaths.size"
              @playAll="handlePlayAll"
              @batchPlay="handleBatchPlay"
              @addToPlaylist="showAddToPlaylistModal = true"
              @batchDelete="requestBatchDelete"
              @batchMove="handleBatchMove"
            />

            <StatisticsPage v-if="localViewMode === 'statistics'" />

            <section
              v-else-if="localViewMode === 'artist' && artistActiveTab === 'albums'"
              class="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 custom-scrollbar relative z-0"
            >
              <div
                v-if="artistAlbumList.length > 0"
                class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-x-6 gap-y-10"
              >
                <div
                  v-for="album in artistAlbumList"
                  :key="album.key"
                  @click="handleArtistAlbumClick(album.key)"
                  class="group cursor-pointer rounded-xl p-2 md:p-3 transition-all duration-300 flex flex-col relative select-none hover:bg-white/40 dark:hover:bg-white/5"
                >
                  <div class="relative w-full aspect-square mb-3 mt-4">
                    <div class="absolute inset-x-2 top-0 bottom-1/2 bg-[#1c1c1c] rounded-t-full shadow-inner origin-bottom translate-y-[-10%] group-hover:translate-y-[-24%] transition-transform duration-500 ease-out z-0 flex items-center justify-center overflow-hidden border border-[#333]">
                      <div class="absolute inset-0 rounded-t-full border border-white/5 scale-90"></div>
                      <div class="absolute inset-0 rounded-t-full border border-white/5 scale-75"></div>
                      <div class="absolute inset-0 rounded-t-full border border-white/5 scale-50"></div>
                    </div>

                    <div class="absolute inset-0 z-10 bg-white dark:bg-gray-800 rounded-md shadow-md border border-gray-100 dark:border-white/10 p-1 flex items-center justify-center overflow-hidden group-hover:shadow-xl transition-shadow duration-300">
                      <div
                        v-if="coverCache.get(album.firstSongPath)"
                        class="w-full h-full bg-cover bg-center rounded-sm"
                        :style="{ backgroundImage: `url(${coverCache.get(album.firstSongPath)})` }"
                      ></div>

                      <div
                        v-else
                        class="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-white/5 dark:to-white/10 rounded-sm flex items-center justify-center text-4xl font-bold text-gray-300 dark:text-gray-600 shadow-inner"
                        :class="{ 'animate-pulse': loadingSet.has(album.firstSongPath) }"
                      >
                        {{ album.name ? album.name.substring(0, 1).toUpperCase() : 'A' }}
                      </div>
                    </div>
                  </div>

                  <div class="flex flex-col items-start px-1 z-20">
                    <h3 class="font-bold text-sm md:text-base text-gray-800 dark:text-gray-200 truncate w-full group-hover:text-[#EC4141] transition-colors leading-tight">
                      {{ album.name }}
                    </h3>
                    <p class="text-xs text-gray-500 dark:text-gray-400 truncate w-full mt-1.5 flex items-center gap-1.5 opacity-80">
                      <span class="font-medium">{{ album.count }}首</span>
                      <span class="w-0.5 h-0.5 rounded-full bg-gray-400"></span>
                      <span>{{ album.artist }}</span>
                    </p>
                  </div>
                </div>
              </div>

              <div v-else class="flex min-h-[400px] flex-col items-center justify-center text-gray-400 dark:text-gray-500">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <p class="text-sm">暂无专辑数据</p>
              </div>
            </section>

            <div v-else-if="localViewMode === 'artist' && artistActiveTab === 'details'" class="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 min-h-[400px]">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p class="text-sm">歌手详情敬请期待</p>
            </div>

            <SongTable
              v-else
              ref="songTableRef"
              :songs="localSongList"
              :isBatchMode="isBatchMode"
              :selectedPaths="selectedPaths"
              class="min-h-[500px]"
              @play="playSong"
              @contextmenu="handleContextMenu"
              @update:selectedPaths="selectedPaths = $event"
              @drag-start="handleTableDragStart"
            />
          </section>
        </div>
      </div>
    </transition>

    <DragGhost />

    <AddToPlaylistModal
      :visible="showAddToPlaylistModal"
      :selectedCount="isBatchMode ? selectedPaths.size : 1"
      @close="showAddToPlaylistModal = false"
      @add="handleAddToPlaylist"
    />

    <MoveToFolderModal
      :visible="showMoveToFolderModal"
      :selectedCount="selectedPaths.size"
      @close="showMoveToFolderModal = false"
      @confirm="confirmBatchMove"
    />

    <SongContextMenu
      :visible="showContextMenu"
      :x="contextMenuX"
      :y="contextMenuY"
      :song="contextMenuTargetSong"
      :is-playlist-view="localViewMode === 'playlist'"
      :isManagementMode="isManagementMode"
      @close="showContextMenu = false"
      @add-to-playlist="showAddToPlaylistModal = true"
      @delete-disk="handleSongPhysicalDelete"
    />

    <ModernModal
      :visible="showConfirm"
      :title="confirmTitle"
      :content="confirmMessage"
      type="danger"
      :confirm-text="confirmButtonText"
      @confirm="executeConfirmAction"
      @cancel="showConfirm = false"
    />

    <ModernModal
      v-model:visible="showSongPhysicalDeleteConfirm"
      title="⚠️ 永久删除文件"
      :content="`确定要从磁盘中永久删除歌曲 '${songToPhysicalDelete?.title}' 吗？此操作不可恢复！`"
      type="danger"
      confirm-text="永久删除"
      @confirm="executeSongPhysicalDelete"
    />

    <ModernModal
      v-model:visible="showFolderDeleteConfirm"
      title="删除文件夹"
      :content="`确定要删除文件夹 '${folderToDeletePath}' 吗？这会同时删除该文件夹及其内部所有本地文件。`"
      type="danger"
      confirm-text="删除文件夹"
      @confirm="executeDeleteFolder"
    />

    <ModernInputModal
      :visible="showCreateFolderModal"
      title="新建文件夹"
      placeholder="输入文件夹名称"
      confirm-text="创建"
      @cancel="showCreateFolderModal = false"
      @confirm="confirmCreateFolder"
    />

    <ModernInputModal
      :visible="showRenameModal"
      title="重命名歌单"
      :initial-value="renameInitialValue"
      @cancel="showRenameModal = false"
      @confirm="confirmRename"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePlayer, Song } from '../composables/player';
import { useToast } from '../composables/toast';
import { useCoverCache } from '../composables/useCoverCache';
import { useHomeBatchActions } from '../composables/useHomeBatchActions';
import { useHomeFolderManagement } from '../composables/useHomeFolderManagement';
import { useHomeRouteSync } from '../composables/useHomeRouteSync';
import LocalMusicHeader from '../components/headers/LocalMusicHeader.vue';
import FoldersHeader from '../components/headers/FoldersHeader.vue';
import DetailHeader from '../components/headers/DetailHeader.vue';
import ArtistDetailHeader from '../components/headers/ArtistDetailHeader.vue';
import AlbumDetailHeader from '../components/headers/AlbumDetailHeader.vue';
import MasterPanel from '../components/song-list/MasterPanel.vue';
import SongTable from '../components/song-list/SongTable.vue';
import DragGhost from '../components/common/DragGhost.vue';
import AddToPlaylistModal from '../components/overlays/AddToPlaylistModal.vue';
import MoveToFolderModal from '../components/overlays/MoveToFolderModal.vue';
import SongContextMenu from '../components/overlays/SongContextMenu.vue';
import ModernModal from '../components/common/ModernModal.vue';
import ModernInputModal from '../components/common/ModernInputModal.vue';
import StatisticsPage from '../components/statistics/StatisticsPage.vue';
import { useSongDrag } from '../composables/useSongDrag';
import { compareByAlphabetIndex } from '../utils/alphabetIndex';

const route = useRoute();
const router = useRouter();
const { showToast } = useToast();

const {
  songList,
  displaySongList,
  currentViewMode,
  playSong,
  addSongsToPlaylist,
  favoritePaths,
  moveFilesToFolder,
  refreshAllFolders,
  deleteFromDisk,
  addSidebarFolder,
  createFolder,
  deleteFolder,
  expandFolderPath,
  fetchFolderTree,
  removeSidebarFolderLinked,
  refreshFolder,
  folderTree,
  activeRootPath,
  currentFolderFilter,
  removeFromHistory,
  playlists,
  filterCondition,
  searchQuery,
  librarySongs,
  albumSortMode,
  albumCustomOrder,
  viewAlbum,
} = usePlayer();

const { coverCache, loadingSet, preloadCovers } = useCoverCache();

const localViewMode = ref(currentViewMode.value);
const localFilterCondition = ref(filterCondition.value);
const localSongList = computed(() => displaySongList.value);
const selectedAlbumSong = computed(() => localSongList.value[0] || null);
const songHasArtistName = (song: Song, artistName: string) =>
  (song.effective_artist_names?.length ? song.effective_artist_names : song.artist_names || [song.artist]).includes(artistName);

const isBatchMode = ref(false);
const isManagementMode = ref(false);
const selectedPaths = ref<Set<string>>(new Set());
const songTableRef = ref<any>(null);
const artistActiveTab = ref<'songs' | 'albums' | 'details'>('songs');
const viewTransitionKey = computed(() => `${localViewMode.value}:${localFilterCondition.value}:${artistActiveTab.value}`);

const { handleTableDragStart } = useSongDrag(localSongList, isBatchMode, selectedPaths, songTableRef);

const showAddToPlaylistModal = ref(false);
const showContextMenu = ref(false);
const contextMenuX = ref(0);
const contextMenuY = ref(0);
const contextMenuTargetSong = ref<Song | null>(null);
const showRenameModal = ref(false);
const renameInitialValue = ref('');
const showSongPhysicalDeleteConfirm = ref(false);
const songToPhysicalDelete = ref<any>(null);

watch(isBatchMode, (value) => {
  if (!value) {
    selectedPaths.value.clear();
  }
});

const {
  showMoveToFolderModal,
  showConfirm,
  confirmTitle,
  confirmButtonText,
  confirmMessage,
  requestBatchDelete,
  handleFolderBatchDelete,
  executeConfirmAction,
  handleBatchMove,
  confirmBatchMove,
  handleAddToPlaylist,
  openConfirm,
} = useHomeBatchActions({
  currentViewMode,
  selectedPaths,
  isBatchMode,
  isManagementMode,
  songList,
  favoritePaths,
  playlists,
  contextMenuTargetSong,
  showAddToPlaylistModal,
  addSongsToPlaylist,
  moveFilesToFolder,
  removeFromHistory,
  showToast,
  getRoutePath: () => route.path,
});

const {
  showCreateFolderModal,
  showFolderDeleteConfirm,
  folderToDeletePath,
  handleActiveRootChange,
  confirmCreateFolder,
  executeDeleteFolder,
  handleAddFolder,
  handleRootCreateFolderRequest,
  handleRootDeleteFolderRequest,
  handleRefreshFolder,
  handleRemoveFolderWithConfirm,
} = useHomeFolderManagement({
  isManagementMode,
  activeRootPath,
  currentFolderFilter,
  folderTree,
  songList,
  refreshFolder,
  fetchFolderTree,
  createFolder,
  deleteFolder,
  expandFolderPath,
  addSidebarFolder,
  removeSidebarFolderLinked,
  showToast,
  openConfirm,
});

useHomeRouteSync({
  route,
  router,
  currentViewMode,
  filterCondition,
  currentFolderFilter,
  activeRootPath,
  folderTree,
  searchQuery,
});

const playlistDetail = computed(() => {
  if (localViewMode.value === 'playlist') {
    const playlist = playlists.value.find((item) => item.id === localFilterCondition.value);
    if (playlist) {
      return {
        name: playlist.name,
        date: (playlist as any).createdAt || '',
      };
    }
  }

  return null;
});

const artistAlbumList = computed(() => {
  const artistName = localFilterCondition.value || filterCondition.value;
  if (!artistName) {
    return [];
  }

  const albumMap = new Map<string, { key: string; name: string; count: number; artist: string; firstSongPath: string }>();

  librarySongs.value.forEach((song) => {
    if (!songHasArtistName(song, artistName)) {
      return;
    }

    const albumKey = song.album_key || `${song.album || 'Unknown'}::${song.album_artist || song.artist || 'Unknown'}`;
    const albumName = song.album || 'Unknown';
    const existing = albumMap.get(albumKey);

    if (existing) {
      existing.count += 1;
      return;
    }

    albumMap.set(albumKey, {
      key: albumKey,
      name: albumName,
      count: 1,
      artist: song.album_artist || song.artist || 'Unknown',
      firstSongPath: song.path,
    });
  });

  const albums = Array.from(albumMap.values());

  if (albumSortMode.value === 'name') {
    albums.sort((left, right) => compareByAlphabetIndex(left.name, right.name));
  } else if (albumSortMode.value === 'custom') {
    const orderMap = new Map(albumCustomOrder.value.map((key, index) => [key, index]));
    albums.sort((left, right) => {
      const leftIndex = orderMap.has(left.key) ? orderMap.get(left.key)! : Number.MAX_SAFE_INTEGER;
      const rightIndex = orderMap.has(right.key) ? orderMap.get(right.key)! : Number.MAX_SAFE_INTEGER;
      return leftIndex - rightIndex;
    });
  } else if (albumSortMode.value === 'artist') {
    albums.sort((left, right) => {
      const artistDiff = compareByAlphabetIndex(left.artist, right.artist);
      return artistDiff !== 0 ? artistDiff : compareByAlphabetIndex(left.name, right.name);
    });
  } else {
    albums.sort((left, right) => right.count - left.count || compareByAlphabetIndex(left.artist, right.artist));
  }

  return albums;
});

watch(artistAlbumList, (albums) => {
  preloadCovers(albums.map((album) => album.firstSongPath).filter(Boolean));
}, { immediate: true });

const handlePlayAll = () => {
  if (localSongList.value.length > 0) {
    playSong(localSongList.value[0]);
  }
};

const handleBatchPlay = () => {
  const selected = localSongList.value.filter((song) => selectedPaths.value.has(song.path));
  if (selected.length > 0) {
    playSong(selected[0]);
  }
};

const handleRefreshAll = async () => {
  await refreshAllFolders();
  showToast('刷新完成', 'success');
};

const handleRenamePlaylist = () => {
  if (currentViewMode.value !== 'playlist') return;

  const playlist = playlists.value.find((item) => item.id === filterCondition.value);
  if (playlist) {
    renameInitialValue.value = playlist.name;
    showRenameModal.value = true;
  }
};

const confirmRename = (newName: string) => {
  if (currentViewMode.value !== 'playlist') return;

  const playlist = playlists.value.find((item) => item.id === filterCondition.value);
  if (playlist && newName.trim()) {
    playlist.name = newName.trim();
    showToast('歌单重命名成功', 'success');
    showRenameModal.value = false;
  }
};

const handleContextMenu = (event: MouseEvent, song: Song) => {
  if (isBatchMode.value) return;

  contextMenuTargetSong.value = song;
  contextMenuX.value = event.clientX;
  const menuHeight = 250;
  contextMenuY.value =
    event.clientY + menuHeight > window.innerHeight
      ? event.clientY - menuHeight
      : event.clientY;
  showContextMenu.value = true;
};

const handleSongPhysicalDelete = (song: Song) => {
  songToPhysicalDelete.value = song;
  showSongPhysicalDeleteConfirm.value = true;
  showContextMenu.value = false;
};

const executeSongPhysicalDelete = async () => {
  if (!songToPhysicalDelete.value) {
    return;
  }

  await deleteFromDisk(songToPhysicalDelete.value);
  showSongPhysicalDeleteConfirm.value = false;
  songToPhysicalDelete.value = null;
};

const handleArtistAlbumClick = (albumKey: string) => {
  viewAlbum(albumKey);
};

watch(currentViewMode, (newMode) => {
  localViewMode.value = newMode;
  if (newMode !== 'artist') {
    artistActiveTab.value = 'songs';
  }
}, { immediate: true });

watch(filterCondition, (newFilter) => {
  localFilterCondition.value = newFilter;
}, { immediate: true });

watch(currentViewMode, (newMode) => {
  if (newMode !== 'folder') {
    isManagementMode.value = false;
  }
});
</script>

<style scoped>
.home-view-fade-enter-active,
.home-view-fade-leave-active {
  transition: opacity 0.28s ease, transform 0.28s ease;
}

.home-view-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.home-view-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
