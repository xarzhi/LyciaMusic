<script setup lang="ts">
import { usePlayer, Song, dragSession } from '../../composables/player';
import { computed, watch, ref, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
// 引用子组件
import SongTable from './SongTable.vue'; 
import SongListHeader from './SongListHeader.vue';
import SongListSidebar from './SongListSidebar.vue';
import AddToPlaylistModal from '../overlays/AddToPlaylistModal.vue';
import SongContextMenu from '../overlays/SongContextMenu.vue';
import ModernModal from '../common/ModernModal.vue';
import FavoritesGrid from '../common/FavoritesGrid.vue';
import DragGhost from '../common/DragGhost.vue';
import MoveToFolderModal from '../overlays/MoveToFolderModal.vue';
import { useToast } from '../../composables/toast';

// 🟢 新增 props: 允许隐藏内部 header
defineProps<{
  hideHeader?: boolean;
}>();

const route = useRoute();
const router = useRouter();

const { 
  songList, displaySongList, currentViewMode, 
  favTab, favDetailFilter, playSong, 
  addSongsToPlaylist, favoritePaths, moveFilesToFolder,
  switchViewToAll, switchToRecent, switchToFavorites
} = usePlayer();

// 状态管理
const isBatchMode = ref(false);
const selectedPaths = ref<Set<string>>(new Set());
// 引用 SongTable 组件实例
const songTableRef = ref<{ containerRef: HTMLElement | null } | null>(null);

// --- 弹窗与右键菜单状态 ---
const showAddToPlaylistModal = ref(false);
const showMoveToFolderModal = ref(false);
const showConfirm = ref(false);
const confirmMessage = ref('');
const confirmAction = ref<() => void>(() => {});
const showContextMenu = ref(false);
const contextMenuX = ref(0);
const contextMenuY = ref(0);
const contextMenuTargetSong = ref<Song | null>(null);

watch(isBatchMode, (val) => { if (!val) selectedPaths.value.clear(); });

// --- 业务逻辑处理 ---
const handleContextMenu = (e: MouseEvent, song: Song) => {
  if (isBatchMode.value) return; 
  contextMenuTargetSong.value = song;
  contextMenuX.value = e.clientX;
  const menuHeight = 250;
  contextMenuY.value = e.clientY + menuHeight > window.innerHeight ? e.clientY - menuHeight : e.clientY;
  showContextMenu.value = true;
};

const handleBatchPlay = () => {
  const selected = displaySongList.value.filter(s => selectedPaths.value.has(s.path));
  if (selected.length > 0) playSong(selected[0]);
};

const executeBatchDelete = () => {
  if (currentViewMode.value === 'all' && route.path === '/') {
    const newPathSet = new Set(selectedPaths.value);
    songList.value = songList.value.filter(s => !newPathSet.has(s.path));
  } else if (route.path === '/favorites') {
    const newPathSet = new Set(selectedPaths.value);
    favoritePaths.value = favoritePaths.value.filter(p => !newPathSet.has(p));
  }
  selectedPaths.value.clear();
  showConfirm.value = false;
};

const requestBatchDelete = () => {
  if (selectedPaths.value.size === 0) return;
  confirmMessage.value = `确定要移除选中的 ${selectedPaths.value.size} 首歌曲吗？`;
  confirmAction.value = executeBatchDelete;
  showConfirm.value = true;
};

const handleBatchMove = () => { if (selectedPaths.value.size > 0) showMoveToFolderModal.value = true; };
const confirmBatchMove = async (targetFolder: string, folderName: string) => {
  try {
    const paths = Array.from(selectedPaths.value);
    const count = await moveFilesToFolder(paths, targetFolder);
    useToast().showToast(`已成功移动 ${count} 首歌曲到 "${folderName}"`, 'success');
    showMoveToFolderModal.value = false; selectedPaths.value.clear();
  } catch (e: any) { 
    const msg = e.message || e;
    useToast().showToast("移动失败: " + msg, 'error'); 
  }
};

const handleAddToPlaylist = (playlistId: string) => {
  const songsToAdd = isBatchMode.value ? Array.from(selectedPaths.value) : (contextMenuTargetSong.value ? [contextMenuTargetSong.value.path] : []);
  const addedCount = addSongsToPlaylist(playlistId, songsToAdd);
  showAddToPlaylistModal.value = false;
  const msg = addedCount === 0 ? "歌单内歌曲重复" : "已加入歌单";
  useToast().showToast(msg, addedCount === 0 ? 'info' : 'success');
};

// --- 🔥 拖拽核心逻辑 ---
let isMouseDown = false;
let startX = 0;
let startY = 0;
const ROW_HEIGHT = 60; 

// 自动滚动
let autoScrollTimer: number | null = null;
const startAutoScroll = (direction: 'up' | 'down') => {
  if (autoScrollTimer) return;
  const container = songTableRef.value?.containerRef;
  if (!container) return;

  const scroll = () => {
    if (!isMouseDown) { stopAutoScroll(); return; }
    const speed = 15;
    if (direction === 'up') container.scrollTop -= speed;
    else container.scrollTop += speed;
    autoScrollTimer = requestAnimationFrame(scroll);
  };
  autoScrollTimer = requestAnimationFrame(scroll);
};

const stopAutoScroll = () => {
  if (autoScrollTimer) { cancelAnimationFrame(autoScrollTimer); autoScrollTimer = null; }
};

const lastSelectedIndex = ref<number>(-1);
const isSelectionDragging = ref(false);
const dragSelectAction = ref<'select' | 'deselect' | null>(null);

// 1. MouseDown
const handleTableDragStart = ({ event, song, index }: { event: MouseEvent; song: Song; index: number }) => {
  isMouseDown = true;
  startX = event.clientX;
  startY = event.clientY;

  // --- 分支 A: 批量多选模式 (恢复了你丢失的逻辑) ---
  if (isBatchMode.value) {
    const tr = event.currentTarget as HTMLElement;
    const rect = tr.getBoundingClientRect();
    
    // 判断点击位置：如果点击在左侧 60% 区域，视为“选择操作”
    // (逻辑：计算鼠标相对于这一行的水平位置)
    if ((event.clientX - rect.left) / rect.width < 0.6) {
      isSelectionDragging.value = true;
      
      // 1. Shift 连选逻辑
      if (event.shiftKey && lastSelectedIndex.value !== -1) {
        const start = Math.min(lastSelectedIndex.value, index);
        const end = Math.max(lastSelectedIndex.value, index);
        // 将中间的所有歌曲加入选中集合
        for (let i = start; i <= end; i++) {
           if (displaySongList.value[i]) selectedPaths.value.add(displaySongList.value[i].path);
        }
      } else {
        // 2. 普通点击：单选/反选
        if (selectedPaths.value.has(song.path)) {
            selectedPaths.value.delete(song.path);
        } else {
            selectedPaths.value.add(song.path);
        }
        lastSelectedIndex.value = index;
      }
      
      // 记录当前动作是“选中”还是“取消选中”，以便后续拖拽时跟随
      dragSelectAction.value = selectedPaths.value.has(song.path) ? 'select' : 'deselect';
    } else {
      // 点击右侧区域，视为“拖拽已选歌曲”
      isSelectionDragging.value = false;
      // 如果拖拽的这首歌还没被选中，先选中它
      if (!selectedPaths.value.has(song.path)) selectedPaths.value.add(song.path);
      // 准备拖拽数据
      dragSession.songs = displaySongList.value.filter(s => selectedPaths.value.has(s.path));
      // 锁定当前位置为插槽，防止跳动
      dragSession.insertIndex = index;
    }
  } 
  // --- 分支 B: 单曲/普通模式 (应用了新的锁定修复) ---
  else {
    if (['folder', 'playlist', 'all'].includes(currentViewMode.value)) {
       dragSession.type = 'song';
       dragSession.songs = [song];
       // 🔥 关键修复：按下瞬间，锁定当前位置为“空白坑位”
       // 这保证了拖拽开始时列表不会乱跳
       dragSession.insertIndex = index; 
    }
  }
};

// 2. MouseMove
const onGlobalMouseMove = (e: MouseEvent) => {
  if (!isMouseDown) return;

  // 1. 批量模式下的“滑动框选”逻辑
  if (isBatchMode.value && isSelectionDragging.value) {
    const container = songTableRef.value?.containerRef;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
      // 动态获取 header 高度以修正 offset
      const header = container.querySelector('thead') as HTMLElement | null;
      const headerHeight = header ? header.offsetHeight : 0;
      
      const relativeY = e.clientY - rect.top + container.scrollTop;
      // 修正 currentIndex 计算，减去 headerHeight
      let currentIndex = Math.floor((relativeY - headerHeight) / ROW_HEIGHT);
      
      // 边界处理
      currentIndex = Math.max(0, Math.min(displaySongList.value.length - 1, currentIndex));

      if (currentIndex !== lastSelectedIndex.value) {
        // 范围选择逻辑：防止快速滑动导致跳过某些行
        const start = Math.min(lastSelectedIndex.value, currentIndex);
        const end = Math.max(lastSelectedIndex.value, currentIndex);
        
        for (let i = start; i <= end; i++) {
          const song = displaySongList.value[i];
          if (song) {
            if (dragSelectAction.value === 'select') {
              selectedPaths.value.add(song.path);
            } else if (dragSelectAction.value === 'deselect') {
              selectedPaths.value.delete(song.path);
            }
          }
        }
        lastSelectedIndex.value = currentIndex;
      }
      
      const threshold = 60;
      if (e.clientY < rect.top + threshold) startAutoScroll('up');
      else if (e.clientY > rect.bottom - threshold) startAutoScroll('down');
      else stopAutoScroll();
    }
    return; 
  }

  // --- 拖拽激活判断 ---
  if (!dragSession.active) {
    const dist = Math.sqrt(Math.pow(e.clientX - startX, 2) + Math.pow(e.clientY - startY, 2));
    if (dist > 5) {
      dragSession.active = true;
      dragSession.showGhost = true; // 🟢 显示拖拽幽灵
    }
  }

  if (dragSession.active) {
    dragSession.mouseX = e.clientX;
    dragSession.mouseY = e.clientY;

    const container = songTableRef.value?.containerRef;
    
    // Auto Scroll
    if (container) {
       const rect = container.getBoundingClientRect();
       const threshold = 60;
       if (e.clientY < rect.top + threshold) startAutoScroll('up');
       else if (e.clientY > rect.bottom - threshold) startAutoScroll('down');
       else stopAutoScroll();
    }
    
    // Sidebar / Playlist Detection (侧边栏/歌单检测 - 即使多选时也允许拖入文件夹)
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const folderEl = target?.closest('.folder-drop-target');
    if (folderEl) {
      dragSession.targetFolder = { path: folderEl.getAttribute('data-folder-path')!, name: folderEl.getAttribute('data-folder-name')! };
      dragSession.targetPlaylist = null;
      dragSession.insertIndex = -1;
      return; 
    } else {
      dragSession.targetFolder = null;
    }

    const playlistEl = target?.closest('.playlist-drop-target');
    if (playlistEl) {
      dragSession.targetPlaylist = { id: playlistEl.getAttribute('data-playlist-id')!, name: playlistEl.getAttribute('data-playlist-name')! };
      dragSession.targetFolder = null;
      dragSession.insertIndex = -1;
      return;
    } else {
      dragSession.targetPlaylist = null;
    }

    // 🔥🔥🔥 核心修改点在这里 🔥🔥🔥
    // 增加 !isBatchMode.value 判断
    // 意思就是：如果没有命中侧边栏，且【不是批量模式】，才允许进行列表内的排序计算
    if (!isBatchMode.value && !dragSession.targetFolder && !dragSession.targetPlaylist && container) {
      const containerRect = container.getBoundingClientRect();
      
      if (
        e.clientX >= containerRect.left && 
        e.clientX <= containerRect.right &&
        e.clientY >= containerRect.top &&
        e.clientY <= containerRect.bottom
      ) {
         const offsetY = e.clientY - containerRect.top + container.scrollTop;
         
         let currentGapIndex = dragSession.insertIndex;
         if (currentGapIndex === -1) currentGapIndex = 0;

         // 50% 深度缓冲逻辑
         const upTriggerLimit = (currentGapIndex - 0.5) * ROW_HEIGHT;
         const downTriggerLimit = (currentGapIndex + 1.5) * ROW_HEIGHT;

         const maxIndex = displaySongList.value.length - 1;

         if (offsetY < upTriggerLimit) {
           const newIndex = Math.floor(offsetY / ROW_HEIGHT);
           dragSession.insertIndex = Math.max(0, newIndex);
         } 
         else if (offsetY > downTriggerLimit) {
           const newIndex = Math.floor(offsetY / ROW_HEIGHT);
           dragSession.insertIndex = Math.min(maxIndex, newIndex);
         }
      } else {
        dragSession.insertIndex = -1;
      }
    } 
    // 如果是批量模式 (isBatchMode)，这里什么都不做，dragSession.insertIndex 保持 -1
    // 这样列表里的歌曲就不会乱动了。
  }
};

// 3. MouseUp
const onGlobalMouseUp = () => {
  isMouseDown = false;
  stopAutoScroll();
  isSelectionDragging.value = false;
  dragSelectAction.value = null;

  if (dragSession.active) {
    if (dragSession.targetFolder) {
      // 🟢 Yield to Sidebar: Do not handle here, and DO NOT reset active immediately.
      // SongListSidebar will handle the drop and reset active.
      
      // 🟢 但是立即隐藏拖拽幽灵
      dragSession.showGhost = false;
      
      // We do NOT reset dragSession.active here.
      return; 
    } 
    
    if (dragSession.targetPlaylist) {
      const paths = dragSession.songs.map(s => s.path);
      const count = addSongsToPlaylist(dragSession.targetPlaylist.id, paths);
      const msg = count > 0 ? `已添加 ${count} 首歌曲到 ${dragSession.targetPlaylist.name}` : '歌曲已存在于歌单';
      useToast().showToast(msg, count > 0 ? 'success' : 'info');
      dragSession.showGhost = false;
      dragSession.active = false;
    } else if (dragSession.insertIndex > -1) {
      // 🔥 Drop 逻辑：精确修复
      const movingSongs = dragSession.songs;
      if (movingSongs.length > 0) {
        
        // 🟢 分支处理：如果是歌单视图，只调整歌单内的 songPaths 顺序
        if (currentViewMode.value === 'playlist') {
           const plId = usePlayer().filterCondition.value; // 使用 usePlayer() 获取当前 filterCondition
           const pl = usePlayer().playlists.value.find(p => p.id === plId);
           
           if (pl) {
             const sourcePath = movingSongs[0].path;
             const sourceIndex = pl.songPaths.indexOf(sourcePath);
             
             // 目标位置的歌曲 (在视觉列表中的位置)
             const targetVisualSong = displaySongList.value[dragSession.insertIndex];
             
             if (sourceIndex !== -1) {
                // 1. 移除
                pl.songPaths.splice(sourceIndex, 1);
                
                // 2. 确定新位置
                if (targetVisualSong) {
                   // 找到目标歌曲在 songPaths 中的新索引 (因为已经移除了 source，索引可能变化)
                   let targetIndex = pl.songPaths.indexOf(targetVisualSong.path);
                   
                   // 插入逻辑同理
                   if (targetIndex >= sourceIndex) {
                       // 目标在原位置之后（或就是原位置），由于已经移除了 source，
                       // 实际上 targetIndex 已经指向了“原目标的前一个”或者“原目标自己位移后”的位置
                       // 但这里 indexof 返回的是移除后的数组中的位置
                       // 逻辑：向下拖拽，视觉上要插在 target 后面
                       pl.songPaths.splice(targetIndex + 1, 0, sourcePath);
                   } else {
                       // 向上拖拽，插在 target 前面
                       pl.songPaths.splice(targetIndex, 0, sourcePath);
                   }
                } else {
                   // 拖到底部
                   pl.songPaths.push(sourcePath);
                }
             }
           }
        } 
        // 🟢 默认逻辑：调整全局 songList (Folder视图/All视图)
        else {
            const sourcePath = movingSongs[0].path;
            const fullList = [...songList.value];
            const sourceRealIndex = fullList.findIndex(s => s.path === sourcePath);
            
            // 目标位置的歌曲
            const targetVisualSong = displaySongList.value[dragSession.insertIndex];
            
            if (sourceRealIndex !== -1 && targetVisualSong) {
                // 1. 移除源
                const [item] = fullList.splice(sourceRealIndex, 1);
                
                // 2. 找目标（在移除后的列表中）
                let newTargetIndex = fullList.findIndex(s => s.path === targetVisualSong.path);
                
                // 3. 插入逻辑
                if (newTargetIndex >= sourceRealIndex) {
                    // 👇 向下拖拽
                    fullList.splice(newTargetIndex + 1, 0, item);
                } else {
                    // 👆 向上拖拽
                    fullList.splice(newTargetIndex, 0, item);
                }
                
                songList.value = fullList;
            } else if (sourceRealIndex !== -1) {
                // 拖到底部空白区
                const [item] = fullList.splice(sourceRealIndex, 1);
                fullList.push(item);
                songList.value = fullList;
            }
        }
      }
      dragSession.showGhost = false;
      dragSession.active = false;
    } else {
      // Nothing
      dragSession.showGhost = false;
      dragSession.active = false;
    }
    
    dragSession.insertIndex = -1;
    setTimeout(() => { 
      // dragSession.targetFolder = null; // Do not clear immediately if yielded? 
      // Actually SongListSidebar will clear it or we clear it later.
      // But we should clear playlist/other
      dragSession.targetPlaylist = null;
    }, 100);
  }
};

onMounted(() => {
  window.addEventListener('mousemove', onGlobalMouseMove);
  window.addEventListener('mouseup', onGlobalMouseUp);
});
onUnmounted(() => {
  stopAutoScroll();
  window.removeEventListener('mousemove', onGlobalMouseMove);
  window.removeEventListener('mouseup', onGlobalMouseUp);
});

const enterFavDetail = (type: 'artist' | 'album', name: string) => { router.push({ query: { type, name } }); };
const isFavorites = computed(() => route.path === '/favorites');

// 监听 query 参数变化，控制详情页显隐
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

// 🟢 Song Physical Delete Logic
const showSongPhysicalDeleteConfirm = ref(false);
const songToPhysicalDelete = ref<any>(null);

const { deleteFromDisk } = usePlayer(); // Import action

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

// 🟢 暴露给父组件使用的方法和状态
defineExpose({
  isBatchMode,
  selectedPaths,
  handleBatchPlay,
  requestBatchDelete,
  handleBatchMove,
  showAddToPlaylistModal
});
</script>

<template>
  <div class="flex-1 flex flex-col h-full bg-transparent relative transition-colors duration-500">
    <DragGhost /> 
    <SongListHeader 
      v-if="!hideHeader"
      v-model:isBatchMode="isBatchMode" 
      @batchPlay="handleBatchPlay" 
      @openAddToPlaylist="showAddToPlaylistModal = true" 
      @batchDelete="requestBatchDelete" 
      @batchMove="handleBatchMove" 
    />

    <div class="flex-1 flex overflow-hidden relative">
      <SongListSidebar />

      <section class="flex-1 flex overflow-hidden">
        <FavoritesGrid v-if="isFavorites && !favDetailFilter && favTab !== 'songs'" @enterDetail="enterFavDetail"/>
        
        <SongTable 
          v-else
          ref="songTableRef"
          :songs="displaySongList"
          :isBatchMode="isBatchMode"
          :selectedPaths="selectedPaths"
          @play="playSong"
          @contextmenu="handleContextMenu"
          @drag-start="handleTableDragStart" 
        />
      </section>
    </div>
    
    <AddToPlaylistModal :visible="showAddToPlaylistModal" :selectedCount="isBatchMode ? selectedPaths.size : 1" @close="showAddToPlaylistModal = false" @add="handleAddToPlaylist"/>
    <MoveToFolderModal :visible="showMoveToFolderModal" :selectedCount="selectedPaths.size" @close="showMoveToFolderModal = false" @confirm="confirmBatchMove" />
    <SongContextMenu 
      :visible="showContextMenu" 
      :x="contextMenuX" 
      :y="contextMenuY" 
      :song="contextMenuTargetSong" 
      :is-playlist-view="currentViewMode === 'playlist'" 
      @close="showContextMenu = false" 
      @add-to-playlist="showAddToPlaylistModal = true"
      @delete-disk="handleSongPhysicalDelete"
    />
    <ModernModal :visible="showConfirm" title="移除歌曲" :content="confirmMessage" type="danger" confirm-text="移除" @confirm="executeBatchDelete" @cancel="showConfirm = false" />

    <!-- 🟢 Song Physical Delete Modal -->
    <ModernModal 
      v-model:visible="showSongPhysicalDeleteConfirm" 
      title="⚠️ 永久删除文件" 
      :content="`确定要从磁盘中永久删除歌曲 '${songToPhysicalDelete?.title}' 吗？此操作不可恢复！`" 
      type="danger"
      confirm-text="永久删除"
      @confirm="executeSongPhysicalDelete" 
    />
  </div>
</template>

<style scoped>
</style>