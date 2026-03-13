<template>
  <div class="flex flex-col h-full">
    <transition name="home-view-fade" mode="out-in">
      <div :key="viewTransitionKey" class="flex flex-1 flex-col min-h-0 min-w-0">
    <!-- 顶栏组件 -->
    <!-- 顶栏组件 -->
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
    
    <!-- 主内容区 -->
        <div class="flex-1 flex overflow-hidden relative min-w-0">
      <!-- 侧边栏 -->
      <MasterPanel v-if="localViewMode === 'folder'"
        :isManagementMode="isManagementMode"
      />
      
      <!-- 歌曲列表区域 (带有自滚动) -->
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

        <!-- Statistics View -->
        <StatisticsPage v-if="localViewMode === 'statistics'" />

        <!-- Artist Content Area -->
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

        <!-- Main song table (如果不是 artist 或者 artist tab === 'songs') -->
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
    
    <!-- 弹窗组件 -->
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
import { useRoute } from 'vue-router';
import { invoke } from '@tauri-apps/api/core';
import { usePlayer, Song } from '../composables/player';
import { useToast } from '../composables/toast';
import { useCoverCache } from '../composables/useCoverCache';

// 组件导入
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


const { 
  songList, 
  displaySongList, 
  currentViewMode, 
  playSong, 
  addSongsToPlaylist, 
  favoritePaths, 
  moveFilesToFolder,
  switchViewToAll,
  switchToRecent,
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
  librarySongs,
  albumSortMode,
  albumCustomOrder,
  viewAlbum
} = usePlayer();

const { coverCache, loadingSet, preloadCovers } = useCoverCache();

const localViewMode = ref(currentViewMode.value);
const localFilterCondition = ref(filterCondition.value);

const localSongList = computed(() => displaySongList.value);

const selectedAlbumSong = computed(() => localSongList.value[0] || null);
const songHasArtistName = (song: Song, artistName: string) =>
  (song.effective_artist_names?.length ? song.effective_artist_names : song.artist_names || [song.artist]).includes(artistName);

// ========== 状态管理 ==========
const syncRootSelection = async (path: string | null, options: { forceRefresh?: boolean } = {}) => {
  const normalizedPath = path || '';
  const shouldRefresh =
    !!normalizedPath && (
      options.forceRefresh ||
      activeRootPath.value !== normalizedPath ||
      currentFolderFilter.value !== normalizedPath
    );

  activeRootPath.value = path;
  currentFolderFilter.value = normalizedPath;

  if (!shouldRefresh) {
    return;
  }

  try {
    await refreshFolder(normalizedPath);
  } catch (e: any) {
    useToast().showToast("切换文件夹失败: " + (e?.message || e), 'error');
  }
};

const handleActiveRootChange = (path: string | null) => {
  void syncRootSelection(path, { forceRefresh: true });
};

const skipNextRootSync = ref(false);

watch(activeRootPath, (newPath, oldPath) => {
  if (skipNextRootSync.value) {
    skipNextRootSync.value = false;
    return;
  }

  if (!newPath || newPath === oldPath) {
    return;
  }

  void syncRootSelection(newPath);
});

const isBatchMode = ref(false);
const isManagementMode = ref(false); // 🟢 Local Management Mode State
const selectedPaths = ref<Set<string>>(new Set());
const songTableRef = ref<any>(null);
const artistActiveTab = ref<'songs' | 'albums' | 'details'>('songs');
const viewTransitionKey = computed(() => `${localViewMode.value}:${localFilterCondition.value}:${artistActiveTab.value}`);


// 初始化拖拽逻辑
const { handleTableDragStart } = useSongDrag(localSongList, isBatchMode, selectedPaths, songTableRef);

// 弹窗状态
const showAddToPlaylistModal = ref(false);
const showMoveToFolderModal = ref(false);
const showConfirm = ref(false);
const confirmTitle = ref('移除歌曲');
const confirmButtonText = ref('移除');
const confirmMessage = ref('');
const confirmAction = ref<() => void | Promise<void>>(() => {});
const showContextMenu = ref(false);
const contextMenuX = ref(0);
const contextMenuY = ref(0);
const contextMenuTargetSong = ref<Song | null>(null);
const showCreateFolderModal = ref(false);
const createFolderParentPath = ref('');
const createFolderRootPath = ref<string | null>(null);
const showFolderDeleteConfirm = ref(false);
const folderToDeletePath = ref('');

// 重命名相关
const showRenameModal = ref(false);
const renameInitialValue = ref('');

// 物理删除相关
const showSongPhysicalDeleteConfirm = ref(false);
const songToPhysicalDelete = ref<any>(null);

// 监听批量模式变化，清空选择
watch(isBatchMode, (val) => { if (!val) selectedPaths.value.clear(); });

// ========== 计算属性 ==========


const playlistDetail = computed(() => {
  if (localViewMode.value === 'playlist') {
    const pl = playlists.value.find(p => p.id === localFilterCondition.value);
    if (pl) return { 
      name: pl.name, 
      date: (pl as any).createdAt || '' 
    };
  }
  return null;
});

const artistAlbumList = computed(() => {
  const artistName = localFilterCondition.value || filterCondition.value;
  if (!artistName) {
    return [];
  }

  const albumMap = new Map<string, { key: string; name: string; count: number; artist: string; firstSongPath: string }>();

  librarySongs.value.forEach(song => {
    if (!songHasArtistName(song, artistName)) {
      return;
    }

    const albumKey = song.album_key || `${song.album || 'Unknown'}::${song.album_artist || song.artist || 'Unknown'}`;
    const albumName = song.album || 'Unknown';
    const existing = albumMap.get(albumKey);

    if (existing) {
      existing.count++;
      return;
    }

    albumMap.set(albumKey, {
      key: albumKey,
      name: albumName,
      count: 1,
      artist: song.album_artist || song.artist || 'Unknown',
      firstSongPath: song.path
    });
  });

  const albums = Array.from(albumMap.values());

  if (albumSortMode.value === 'name') {
    albums.sort((a, b) => compareByAlphabetIndex(a.name, b.name));
  } else if (albumSortMode.value === 'custom') {
    const orderMap = new Map(albumCustomOrder.value.map((key, index) => [key, index]));
    albums.sort((a, b) => {
      const aIndex = orderMap.has(a.key) ? orderMap.get(a.key)! : Number.MAX_SAFE_INTEGER;
      const bIndex = orderMap.has(b.key) ? orderMap.get(b.key)! : Number.MAX_SAFE_INTEGER;
      return aIndex - bIndex;
    });
  } else if (albumSortMode.value === 'artist') {
    albums.sort((a, b) => {
      const artistDiff = compareByAlphabetIndex(a.artist, b.artist);
      return artistDiff !== 0 ? artistDiff : compareByAlphabetIndex(a.name, b.name);
    });
  } else {
    albums.sort((a, b) => b.count - a.count || compareByAlphabetIndex(a.artist, b.artist));
  }

  return albums;
});

watch(artistAlbumList, (albums) => {
  preloadCovers(albums.map(album => album.firstSongPath).filter(Boolean));
}, { immediate: true });

const normalizePath = (path: string | null) => (path || '').replace(/\\/g, '/').replace(/\/+$/, '');

const getOwningRootPath = (path: string) => {
  const normalizedTarget = normalizePath(path);
  const matchedRoots = folderTree.value
    .map(node => node.path)
    .filter(root => {
      const normalizedRoot = normalizePath(root);
      return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}/`);
    })
    .sort((a, b) => normalizePath(b).length - normalizePath(a).length);

  return matchedRoots[0] || activeRootPath.value || null;
};

const getRelativeDepth = (rootPath: string, folderPath: string) => {
  const normalizedRoot = normalizePath(rootPath);
  const normalizedFolder = normalizePath(folderPath);

  if (!normalizedRoot || normalizedFolder === normalizedRoot) {
    return 0;
  }

  if (!normalizedFolder.startsWith(`${normalizedRoot}/`)) {
    return 0;
  }

  return normalizedFolder
    .slice(normalizedRoot.length + 1)
    .split('/')
    .filter(Boolean)
    .length;
};

const getParentFolderPath = (path: string) => path.replace(/[\\/][^\\/]+$/, '');

const requestCreateFolder = (parentPath: string) => {
  if (!isManagementMode.value) {
    return;
  }

  const rootPath = getOwningRootPath(parentPath);
  if (rootPath && getRelativeDepth(rootPath, parentPath) + 1 > 3) {
    useToast().showToast('当前文件夹视图最多支持 3 层嵌套，请不要继续向更深层级新建。', 'info');
    return;
  }

  createFolderParentPath.value = parentPath;
  createFolderRootPath.value = rootPath;
  showCreateFolderModal.value = true;
};

const confirmCreateFolder = async (folderName: string) => {
  if (!createFolderParentPath.value) {
    return;
  }

  try {
    const newFolderPath = await createFolder(createFolderParentPath.value, folderName);
    await fetchFolderTree();

    if (createFolderRootPath.value) {
      skipNextRootSync.value = true;
      activeRootPath.value = createFolderRootPath.value;
    }

    expandFolderPath(newFolderPath);
    currentFolderFilter.value = newFolderPath;
    useToast().showToast(`已创建文件夹：${folderName}`, 'success');
  } catch (e: any) {
    useToast().showToast('新建文件夹失败: ' + (e?.message || e), 'error');
  } finally {
    showCreateFolderModal.value = false;
    createFolderParentPath.value = '';
    createFolderRootPath.value = null;
  }
};

const requestDeleteFolder = (folderPath: string) => {
  if (!isManagementMode.value) {
    return;
  }

  folderToDeletePath.value = folderPath;
  showFolderDeleteConfirm.value = true;
};

const executeDeleteFolder = async () => {
  if (!folderToDeletePath.value) {
    return;
  }

  const deletedPath = folderToDeletePath.value;
  const owningRootPath = getOwningRootPath(deletedPath);
  const deletedRoot = owningRootPath && normalizePath(owningRootPath) === normalizePath(deletedPath);
  const fallbackPath = deletedRoot
    ? null
    : (() => {
        const parentPath = getParentFolderPath(deletedPath);
        if (!owningRootPath) {
          return parentPath || '';
        }
        const normalizedRoot = normalizePath(owningRootPath);
        const normalizedParent = normalizePath(parentPath);
        return normalizedParent.startsWith(normalizedRoot) ? parentPath : owningRootPath;
      })();

  try {
    await deleteFolder(deletedPath);
    await fetchFolderTree();

    if (deletedRoot) {
      const nextRoot = folderTree.value[0]?.path || null;
      if (nextRoot) {
        await syncRootSelection(nextRoot, { forceRefresh: true });
      } else {
        await syncRootSelection(null);
        songList.value = [];
      }
    } else if (fallbackPath) {
      if (owningRootPath) {
        skipNextRootSync.value = true;
        activeRootPath.value = owningRootPath;
      }
      expandFolderPath(fallbackPath);
      currentFolderFilter.value = fallbackPath;
    }

    useToast().showToast('文件夹已删除', 'success');
  } catch (e: any) {
    useToast().showToast('删除文件夹失败: ' + (e?.message || e), 'error');
  } finally {
    showFolderDeleteConfirm.value = false;
    folderToDeletePath.value = '';
  }
};

// ========== 业务逻辑处理 ==========

// 播放全部
const handlePlayAll = () => {
  if (localSongList.value.length > 0) {
    playSong(localSongList.value[0]);
  }
};

// 批量播放
const handleBatchPlay = () => {
  const selected = localSongList.value.filter(s => selectedPaths.value.has(s.path));
  if (selected.length > 0) playSong(selected[0]);
};

// 批量删除（移除）
const executeBatchDelete = () => {
  if (currentViewMode.value === 'all' && route.path === '/') {
    const newPathSet = new Set(selectedPaths.value);
    songList.value = songList.value.filter(s => !newPathSet.has(s.path));
  } else if (route.path === '/favorites') {
    const newPathSet = new Set(selectedPaths.value);
    favoritePaths.value = favoritePaths.value.filter(p => !newPathSet.has(p));
  }
  selectedPaths.value.clear();
  isBatchMode.value = false;
  showConfirm.value = false;
};

const executeBatchPhysicalDelete = async () => {
  const paths = Array.from(selectedPaths.value);
  if (paths.length === 0) {
    return;
  }

  const deletedPaths = new Set<string>();

  for (const path of paths) {
    try {
      await invoke('delete_music_file', { path });
      deletedPaths.add(path);
    } catch (e) {
      console.error('Failed to delete song from disk:', path, e);
    }
  }

  if (deletedPaths.size > 0) {
    songList.value = songList.value.filter(song => !deletedPaths.has(song.path));
    favoritePaths.value = favoritePaths.value.filter(path => !deletedPaths.has(path));
    await removeFromHistory(Array.from(deletedPaths));
    playlists.value.forEach(playlist => {
      playlist.songPaths = playlist.songPaths.filter(path => !deletedPaths.has(path));
    });

    useToast().showToast(`已删除 ${deletedPaths.size} 首本地歌曲`, 'success');
  }

  const failedCount = paths.length - deletedPaths.size;
  if (failedCount > 0) {
    useToast().showToast(`${failedCount} 首歌曲删除失败`, 'error');
  }

  selectedPaths.value.clear();
  isBatchMode.value = false;
  showConfirm.value = false;
};

const requestBatchDelete = () => {
  if (selectedPaths.value.size === 0) return;
  confirmTitle.value = '移除歌曲';
  confirmButtonText.value = '移除';
  confirmMessage.value = `确定要移除选中的 ${selectedPaths.value.size} 首歌曲吗？`;
  confirmAction.value = executeBatchDelete;
  showConfirm.value = true;
};

const requestBatchPhysicalDelete = () => {
  if (selectedPaths.value.size === 0) return;
  confirmTitle.value = '删除本地歌曲';
  confirmButtonText.value = '删除';
  confirmMessage.value = `确定要删除选中的 ${selectedPaths.value.size} 首本地歌曲吗？此操作会删除磁盘上的真实文件，且不可恢复。`;
  confirmAction.value = executeBatchPhysicalDelete;
  showConfirm.value = true;
};

const handleFolderBatchDelete = () => {
  if (isManagementMode.value) {
    requestBatchPhysicalDelete();
    return;
  }

  requestBatchDelete();
};

const executeConfirmAction = async () => {
  await confirmAction.value();
  showConfirm.value = false;
};

// 批量移动
const handleBatchMove = () => { 
  if (selectedPaths.value.size > 0) showMoveToFolderModal.value = true; 
};

const confirmBatchMove = async (targetFolder: string, folderName: string) => {
  try {
    const paths = Array.from(selectedPaths.value);
    const count = await moveFilesToFolder(paths, targetFolder);
    useToast().showToast(`已成功移动 ${count} 首歌曲到 "${folderName}"`, 'success');
    showMoveToFolderModal.value = false; 
    selectedPaths.value.clear();
    isBatchMode.value = false;
  } catch (e: any) { 
    const msg = e.message || e;
    useToast().showToast("移动失败: " + msg, 'error'); 
  }
};

// 添加到歌单
const handleAddToPlaylist = (playlistId: string) => {
  const songsToAdd = isBatchMode.value 
    ? Array.from(selectedPaths.value) 
    : (contextMenuTargetSong.value ? [contextMenuTargetSong.value.path] : []);
  const addedCount = addSongsToPlaylist(playlistId, songsToAdd);
  if (isBatchMode.value) {
    isBatchMode.value = false;
  }
  showAddToPlaylistModal.value = false;
  const msg = addedCount === 0 ? "歌单内歌曲重复" : "已加入歌单";
  useToast().showToast(msg, addedCount === 0 ? 'info' : 'success');
};

// 刷新所有歌曲
const handleRefreshAll = async () => {
  await refreshAllFolders();
  useToast().showToast('刷新完成', 'success');
};



// 重命名歌单
const handleRenamePlaylist = () => {
  if (currentViewMode.value !== 'playlist') return;
  const pl = playlists.value.find(p => p.id === filterCondition.value);
  if (pl) {
    renameInitialValue.value = pl.name;
    showRenameModal.value = true;
  }
};

const confirmRename = (newName: string) => {
  if (currentViewMode.value !== 'playlist') return;
  const pl = playlists.value.find(p => p.id === filterCondition.value);
  if (pl && newName.trim()) {
    pl.name = newName.trim();
    useToast().showToast('歌单重命名成功', 'success');
    showRenameModal.value = false;
  }
};

// ========== 文件夹管理 ==========

// 添加文件夹
const handleAddFolder = async () => {
  await addSidebarFolder();
};

const handleRootCreateFolderRequest = (path: string) => {
  requestCreateFolder(path);
};

const handleRootDeleteFolderRequest = (path: string) => {
  requestDeleteFolder(path);
};

// 刷新单个文件夹
const handleRefreshFolder = async () => {
  if (currentFolderFilter.value) {
    try {
      await refreshFolder(currentFolderFilter.value);
      useToast().showToast('文件夹刷新成功', 'success');
    } catch (e: any) {
      useToast().showToast("刷新失败: " + (e.message || e), 'error');
    }
  }
};

// 移除文件夹
const handleRemoveFolderWithConfirm = (path: string, name?: string) => {
  confirmTitle.value = '移除文件夹';
  confirmButtonText.value = '移除';
  confirmMessage.value = name ? `确定要移除「${name}」吗？这不会删除本地文件。` : "确定要移除此文件夹吗？这不会删除本地文件。";
  confirmAction.value = async () => {
    const wasActive = activeRootPath.value === path;
    await removeSidebarFolderLinked(path);
    if (wasActive) {
      if (folderTree.value.length > 0) {
        await syncRootSelection(folderTree.value[0].path, { forceRefresh: true });
      } else {
        await syncRootSelection(null);
        songList.value = [];
      }
    }
    showConfirm.value = false;
  };
  showConfirm.value = true;
};

// 右键菜单
const handleContextMenu = (e: MouseEvent, song: Song) => {
  if (isBatchMode.value) return; 
  contextMenuTargetSong.value = song;
  contextMenuX.value = e.clientX;
  const menuHeight = 250;
  contextMenuY.value = e.clientY + menuHeight > window.innerHeight ? e.clientY - menuHeight : e.clientY;
  showContextMenu.value = true;
};

// 物理删除
const handleSongPhysicalDelete = (song: any) => {
  songToPhysicalDelete.value = song;
  showSongPhysicalDeleteConfirm.value = true;
  showContextMenu.value = false;
};

const executeSongPhysicalDelete = async () => {
  if (songToPhysicalDelete.value) {
    await deleteFromDisk(songToPhysicalDelete.value);
    showSongPhysicalDeleteConfirm.value = false;
    songToPhysicalDelete.value = null;
  }
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
// ========== 路由监听 ==========
watch(() => route.path, (path) => {
  if (path === '/recent') {
    switchToRecent();
  } else if (path === '/') {
    if (!['folder', 'playlist', 'artist', 'album', 'statistics'].includes(currentViewMode.value)) {
       switchViewToAll();
    }
  }
}, { immediate: true });

// 🟢 Auto-reset Management Mode when leaving Folder view
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
