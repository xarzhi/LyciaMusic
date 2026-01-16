<template>
  <div class="flex flex-col h-full">
    <DetailHeader
      v-if="favDetailFilter"
      v-model:isBatchMode="isBatchMode"
      :title="favDetailFilter.name"
      :subtitle="favDetailFilter.type === 'artist' ? '歌手详情' : '专辑详情'"
      :songs="displaySongList"
      :selectedCount="selectedPaths.size"
      @playAll="handlePlayAll"
      @batchPlay="handleBatchPlay"
      @addToPlaylist="showAddToPlaylistModal = true"
      @batchDelete="requestBatchDelete"
    />
    <FavoritesHeader
      v-else
      v-model:isBatchMode="isBatchMode"
      :selectedCount="selectedPaths.size"
      @playAll="handlePlayAll"
      @batchPlay="handleBatchPlay"
      @addToPlaylist="showAddToPlaylistModal = true"
      @batchDelete="requestBatchDelete"
      @clearAll="handleClearAll"
      @addAllToQueue="handleAddAllToQueue"
    />
    
    <div class="flex-1 flex overflow-hidden relative">
      <MasterPanel :isManagementMode="false" />
      
      <section class="flex-1 flex overflow-hidden">
        <FavoritesGrid 
          v-if="shouldShowGrid" 
          @enterDetail="enterFavDetail"
        />
        
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
    
    <SongContextMenu 
      :visible="showContextMenu" 
      :x="contextMenuX" 
      :y="contextMenuY" 
      :song="contextMenuTargetSong" 
      :is-playlist-view="false" 
      @close="showContextMenu = false" 
      @add-to-playlist="showAddToPlaylistModal = true"
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePlayer, Song } from '../composables/player';
import { useToast } from '../composables/toast';

// 组件导入
import FavoritesHeader from '../components/headers/FavoritesHeader.vue';
import DetailHeader from '../components/headers/DetailHeader.vue';
import MasterPanel from '../components/song-list/MasterPanel.vue';
import SongTable from '../components/song-list/SongTable.vue';
import FavoritesGrid from '../components/common/FavoritesGrid.vue';
import DragGhost from '../components/common/DragGhost.vue';
import AddToPlaylistModal from '../components/overlays/AddToPlaylistModal.vue';
import SongContextMenu from '../components/overlays/SongContextMenu.vue';
import ModernModal from '../components/common/ModernModal.vue';
import { useSongDrag } from '../composables/useSongDrag';

const route = useRoute();
const router = useRouter();

const { 
  displaySongList, 
  favTab,
  favDetailFilter,
  playSong, 
  addSongsToPlaylist, 
  favoritePaths,
  switchToFavorites,
  clearFavorites
} = usePlayer();

// ========== 状态管理 ==========
const isBatchMode = ref(false);
const selectedPaths = ref<Set<string>>(new Set());
const songTableRef = ref<any>(null);

// 初始化拖拽逻辑
const { handleTableDragStart } = useSongDrag(displaySongList, isBatchMode, selectedPaths, songTableRef);

// 弹窗状态
const showAddToPlaylistModal = ref(false);
const showConfirm = ref(false);
const confirmMessage = ref('');
const confirmAction = ref<() => void>(() => {});
const showContextMenu = ref(false);
const contextMenuX = ref(0);
const contextMenuY = ref(0);
const contextMenuTargetSong = ref<Song | null>(null);

// 监听批量模式变化，清空选择
watch(isBatchMode, (val) => { if (!val) selectedPaths.value.clear(); });

// ========== 计算属性 ==========
const shouldShowGrid = computed(() => 
  !favDetailFilter.value && favTab.value !== 'songs'
);

// ========== 业务逻辑处理 ==========

// 播放全部
const handlePlayAll = () => {
  if (displaySongList.value.length > 0) {
    playSong(displaySongList.value[0]);
  }
};

const handleAddAllToQueue = () => {
  const { addSongsToQueue } = usePlayer();
  addSongsToQueue(displaySongList.value);
};

// 批量播放
const handleBatchPlay = () => {
  const selected = displaySongList.value.filter(s => selectedPaths.value.has(s.path));
  if (selected.length > 0) playSong(selected[0]);
};

// 批量删除（从收藏移除）
const executeBatchDelete = () => {
  const newPathSet = new Set(selectedPaths.value);
  favoritePaths.value = favoritePaths.value.filter(p => !newPathSet.has(p));
  selectedPaths.value.clear();
  showConfirm.value = false;
};

const requestBatchDelete = () => {
  if (selectedPaths.value.size === 0) return;
  confirmMessage.value = `确定要从收藏中移除选中的 ${selectedPaths.value.size} 首歌曲吗？`;
  confirmAction.value = executeBatchDelete;
  showConfirm.value = true;
};

const executeConfirmAction = async () => {
  await confirmAction.value();
  showConfirm.value = false;
};

// 清空收藏
const handleClearAll = () => {
  confirmMessage.value = "确定要清空收藏列表吗？";
  confirmAction.value = clearFavorites;
  showConfirm.value = true;
};

// 添加到歌单
const handleAddToPlaylist = (playlistId: string) => {
  const songsToAdd = isBatchMode.value 
    ? Array.from(selectedPaths.value) 
    : (contextMenuTargetSong.value ? [contextMenuTargetSong.value.path] : []);
  const addedCount = addSongsToPlaylist(playlistId, songsToAdd);
  showAddToPlaylistModal.value = false;
  const msg = addedCount === 0 ? "歌单内歌曲重复" : "已加入歌单";
  useToast().showToast(msg, addedCount === 0 ? 'info' : 'success');
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

// 收藏详情页
const enterFavDetail = (type: 'artist' | 'album', name: string) => { 
  router.push({ query: { type, name } }); 
};

// ========== 路由监听 ==========
watch(() => route.query, (query) => {
  if (query.type && query.name) {
    favDetailFilter.value = { type: query.type as 'artist' | 'album', name: query.name as string };
  } else {
    favDetailFilter.value = null;
  }
}, { immediate: true });

watch(() => route.path, (path) => {
  if (path === '/favorites') {
    switchToFavorites();
  }
}, { immediate: true });
</script>