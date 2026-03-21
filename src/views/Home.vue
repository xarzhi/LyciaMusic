<template>
  <div class="flex flex-col h-full">
    <HomeViewPane
      :viewTransitionKey="viewTransitionKey"
      :localViewMode="localViewMode"
      :isBatchMode="isBatchMode"
      :isManagementMode="isManagementMode"
      :activeRootPath="activeRootPath || ''"
      :selectedCount="selectedPaths.size"
      :folderTree="folderTree"
      :currentFolderFilter="currentFolderFilter"
      :playlistDetail="playlistDetail"
      :localSongList="localSongList"
      :artistActiveTab="artistActiveTab"
      :localFilterCondition="localFilterCondition"
      :selectedAlbumSong="selectedAlbumSong"
      :artistAlbumList="artistAlbumList"
      :coverCache="coverCache"
      :loadingSet="loadingSet"
      :selectedPaths="selectedPaths"
      :songTableRef="songTableRef"
      @update:isBatchMode="isBatchMode = $event"
      @update:isManagementMode="isManagementMode = $event"
      @update:artistActiveTab="artistActiveTab = $event"
      @update:selectedPaths="selectedPaths = $event"
      @playAll="handlePlayAll"
      @batchPlay="handleBatchPlay"
      @showAddToPlaylist="showAddToPlaylistModal = true"
      @batchDelete="requestBatchDelete"
      @folderBatchDelete="handleFolderBatchDelete"
      @batchMove="handleBatchMove"
      @addFolder="handleAddFolder"
      @refreshFolder="handleRefreshFolder"
      @removeFolder="handleRemoveFolderWithConfirm"
      @rootCreateFolder="handleRootCreateFolderRequest"
      @rootDeleteFolder="handleRootDeleteFolderRequest"
      @activeRootChange="handleActiveRootChange"
      @renamePlaylist="handleRenamePlaylist"
      @refreshAll="handleRefreshAll"
      @playSong="playSong"
      @contextMenuSong="handleContextMenu"
      @tableDragStart="handleTableDragStart"
      @artistAlbumClick="handleArtistAlbumClick"
    />

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
      title="Delete File Permanently"
      :content="`Are you sure you want to permanently delete '${songToPhysicalDelete?.title}' from disk? This cannot be undone.`"
      type="danger"
      confirm-text="Delete Permanently"
      @confirm="executeSongPhysicalDelete"
    />

    <ModernModal
      v-model:visible="showFolderDeleteConfirm"
      title="Delete Folder"
      :content="`Are you sure you want to delete folder '${folderToDeletePath}'? This will also remove local files inside it.`"
      type="danger"
      confirm-text="Delete Folder"
      @confirm="executeDeleteFolder"
    />

    <ModernInputModal
      :visible="showCreateFolderModal"
      title="Create Folder"
      placeholder="Enter folder name"
      confirm-text="Create"
      @cancel="showCreateFolderModal = false"
      @confirm="confirmCreateFolder"
    />

    <ModernInputModal
      :visible="showRenameModal"
      title="Rename Playlist"
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
import { useHomeNavigation } from '../composables/useHomeNavigation';
import { useHomeRouteSync } from '../composables/useHomeRouteSync';
import { useLibraryCollections } from '../composables/useLibraryCollections';
import DragGhost from '../components/common/DragGhost.vue';
import HomeViewPane from '../components/home/HomeViewPane.vue';
import AddToPlaylistModal from '../components/overlays/AddToPlaylistModal.vue';
import MoveToFolderModal from '../components/overlays/MoveToFolderModal.vue';
import SongContextMenu from '../components/overlays/SongContextMenu.vue';
import ModernModal from '../components/common/ModernModal.vue';
import ModernInputModal from '../components/common/ModernInputModal.vue';
import { useSongDrag } from '../composables/useSongDrag';
import { compareByAlphabetIndex } from '../utils/alphabetIndex';

const route = useRoute();
const router = useRouter();
const { openHomeAlbum } = useHomeNavigation(router);
const { showToast } = useToast();

const {
  songList,
  displaySongList,
  currentViewMode,
  playSong,
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
  filterCondition,
  searchQuery,
  librarySongs,
  albumSortMode,
  albumCustomOrder,
} = usePlayer();
const {
  addSongsToPlaylist,
  favoritePaths,
  removeFromHistory,
  playlists,
} = useLibraryCollections();

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
  showToast('鍒锋柊瀹屾垚', 'success');
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
    showToast('Playlist renamed', 'success');
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
  void openHomeAlbum(albumKey);
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
