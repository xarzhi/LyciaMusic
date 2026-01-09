<template>
  <div class="flex flex-col h-full">
    <!-- 顶栏组件 -->
    <!-- 顶栏组件 -->
    <FoldersHeader
      v-if="currentViewMode === 'folder'"
      v-model:isBatchMode="isBatchMode"
      v-model:activeRootPath="activeRootPath"
      :selectedCount="selectedPaths.size"
      :folderTree="folderTree"
      :currentFolderFilter="currentFolderFilter"
      @playAll="handlePlayAll"
      @batchPlay="handleBatchPlay"
      @addToPlaylist="showAddToPlaylistModal = true"
      @batchDelete="requestBatchDelete"
      @batchMove="handleBatchMove"
      @addFolder="handleAddFolder"
      @refreshFolder="handleRefreshFolder"
      @removeFolder="handleRemoveFolderWithConfirm"
      v-model:isManagementMode="isManagementMode"
    />
    <DetailHeader
      v-else-if="currentViewMode === 'playlist'"
      v-model:isBatchMode="isBatchMode"
      :title="playlistDetail?.name || ''"
      :subtitle="playlistDetail?.date ? `${playlistDetail.date} 创建` : ''"
      :songs="displaySongList"
      :selectedCount="selectedPaths.size"
      :showRename="true"
      @playAll="handlePlayAll"
      @batchPlay="handleBatchPlay"
      @addToPlaylist="showAddToPlaylistModal = true"
      @batchDelete="requestBatchDelete"
      @rename="handleRenamePlaylist"
    />

    <LocalMusicHeader
      v-else-if="currentViewMode !== 'statistics'"
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
    <div class="flex-1 flex overflow-hidden relative">
      <!-- 侧边栏 -->
      <SongListSidebar 
        :isManagementMode="isManagementMode"
      />
      
      <!-- 歌曲列表区域 -->
      <section class="flex-1 flex overflow-hidden">
        <!-- Statistics View -->
        <StatisticsPage v-if="currentViewMode === 'statistics'" />

        <!-- Show grid view for favorites (artists/albums tabs) -->
        <FavoritesGrid 
          v-else-if="shouldShowGrid" 
          @enterDetail="enterFavDetail"
        />
        
        <!-- Main song table -->
        <SongTable
          v-else
          ref="songTableRef"
          :songs="displaySongList"
          :isBatchMode="isBatchMode"
          :selectedPaths="selectedPaths"
          @play="playSong"
          @contextmenu="handleContextMenu"
          @update:selectedPaths="selectedPaths = $event"
          @drag-start="handleTableDragStart"
        />
      </section>
    </div>
    
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
      :is-playlist-view="currentViewMode === 'playlist'" 
      :isManagementMode="isManagementMode"
      @close="showContextMenu = false" 
      @add-to-playlist="showAddToPlaylistModal = true"
      @delete-disk="handleSongPhysicalDelete"
    />
    
    <ModernModal 
      :visible="showConfirm" 
      title="移除歌曲" 
      :content="confirmMessage" 
      type="danger" 
      confirm-text="移除" 
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

// 组件导入
import LocalMusicHeader from '../components/headers/LocalMusicHeader.vue';
import FoldersHeader from '../components/headers/FoldersHeader.vue';
import DetailHeader from '../components/headers/DetailHeader.vue';

import SongListSidebar from '../components/song-list/SongListSidebar.vue';
import SongTable from '../components/song-list/SongTable.vue';
import FavoritesGrid from '../components/common/FavoritesGrid.vue';
import DragGhost from '../components/common/DragGhost.vue';
import AddToPlaylistModal from '../components/overlays/AddToPlaylistModal.vue';
import MoveToFolderModal from '../components/overlays/MoveToFolderModal.vue';
import SongContextMenu from '../components/overlays/SongContextMenu.vue';
import ModernModal from '../components/common/ModernModal.vue';
import ModernInputModal from '../components/common/ModernInputModal.vue';
import StatisticsPage from '../components/statistics/StatisticsPage.vue';
import { useSongDrag } from '../composables/useSongDrag';

const route = useRoute();
const router = useRouter();

const { 
  songList, 
  displaySongList, 
  currentViewMode, 
  favTab, 
  favDetailFilter, 
  playSong, 
  addSongsToPlaylist, 
  favoritePaths, 
  moveFilesToFolder,
  switchViewToAll,
  switchToRecent,
  switchToFavorites,
  refreshAllFolders,
  deleteFromDisk,
  addSidebarFolder,
  removeSidebarFolder,
  refreshFolder,
  folderTree,
  activeRootPath,
  currentFolderFilter,
  playlists,
  filterCondition
} = usePlayer();

// ========== 状态管理 ==========
const isBatchMode = ref(false);
const isManagementMode = ref(false); // 🟢 Local Management Mode State
const selectedPaths = ref<Set<string>>(new Set());
const songTableRef = ref<any>(null);


// 初始化拖拽逻辑
const { handleTableDragStart } = useSongDrag(displaySongList, isBatchMode, selectedPaths, songTableRef);

// 弹窗状态
const showAddToPlaylistModal = ref(false);
const showMoveToFolderModal = ref(false);
const showConfirm = ref(false);
const confirmMessage = ref('');
const confirmAction = ref<() => void>(() => {});
const showContextMenu = ref(false);
const contextMenuX = ref(0);
const contextMenuY = ref(0);
const contextMenuTargetSong = ref<Song | null>(null);

// 重命名相关
const showRenameModal = ref(false);
const renameInitialValue = ref('');

// 物理删除相关
const showSongPhysicalDeleteConfirm = ref(false);
const songToPhysicalDelete = ref<any>(null);

// 监听批量模式变化，清空选择
watch(isBatchMode, (val) => { if (!val) selectedPaths.value.clear(); });

// ========== 计算属性 ==========
const isFavorites = computed(() => route.path === '/favorites');
const shouldShowGrid = computed(() => 
  isFavorites.value && !favDetailFilter.value && favTab.value !== 'songs'
);

const playlistDetail = computed(() => {
  if (currentViewMode.value === 'playlist') {
    const pl = playlists.value.find(p => p.id === filterCondition.value);
    if (pl) return { 
      name: pl.name, 
      date: (pl as any).createdAt || '' 
    };
  }
  return null;
});

// ========== 业务逻辑处理 ==========

// 播放全部
const handlePlayAll = () => {
  if (displaySongList.value.length > 0) {
    playSong(displaySongList.value[0]);
  }
};

// 批量播放
const handleBatchPlay = () => {
  const selected = displaySongList.value.filter(s => selectedPaths.value.has(s.path));
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

const requestBatchDelete = () => {
  if (selectedPaths.value.size === 0) return;
  confirmMessage.value = `确定要移除选中的 ${selectedPaths.value.size} 首歌曲吗？`;
  confirmAction.value = executeBatchDelete;
  showConfirm.value = true;
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
  confirmMessage.value = name ? `确定要移除「${name}」吗？这不会删除本地文件。` : "确定要移除此文件夹吗？这不会删除本地文件。";
  confirmAction.value = async () => {
    const wasActive = activeRootPath.value === path;
    await removeSidebarFolder(path);
    if (wasActive) {
      if (folderTree.value.length > 0) {
        activeRootPath.value = folderTree.value[0].path;
      } else {
        activeRootPath.value = '';
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

// 收藏详情页
const enterFavDetail = (type: 'artist' | 'album', name: string) => { 
  router.push({ query: { type, name } }); 
};

// ========== 路由监听 ==========
watch(() => route.query, (query) => {
  if (route.path === '/favorites') {
    if (query.type && query.name) {
      favDetailFilter.value = { type: query.type as 'artist' | 'album', name: query.name as string };
    } else {
      favDetailFilter.value = null;
    }
  }
}, { immediate: true });

watch(() => route.path, (path) => {
  if (path === '/favorites') {
    switchToFavorites();
  } else if (path === '/recent') {
    switchToRecent();
  } else if (path === '/') {
    if (currentViewMode.value !== 'folder' && currentViewMode.value !== 'playlist') {
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