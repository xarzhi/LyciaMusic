<script setup lang="ts">
import { usePlayer, dragSession } from '../../composables/player';
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'; // 🟢 Added computed
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core'; // 🟢 1. 引入转换工具
import FolderTreeItem from '../common/FolderTreeItem.vue'; // 🟢 Import
import FolderContextMenu from '../overlays/FolderContextMenu.vue';
import ModernModal from '../common/ModernModal.vue'; 
import { useToast } from '../../composables/toast';

import { FolderNode } from '../../composables/playerState';

const props = withDefaults(defineProps<{
  isManagementMode?: boolean; // 🟢 Prop, now optional
}>(), {
  isManagementMode: false
});

const { 
  currentViewMode, localMusicTab, currentArtistFilter, currentAlbumFilter,
  artistList, albumList, folderList, currentFolderFilter,
  isLocalMusic, isFolderMode,
  playSong, openInFinder, createPlaylist, 
  getSongsInFolder, moveFilesToFolder,
  refreshFolder, // 🟢 Ensure imported
  addSongsToQueue,
  reorderWatchedFolders, 
  updateArtistOrder,
  updateAlbumOrder,
  folderTree, // 🟢 New
  activeRootPath, // 🟢 New Global State
  fetchFolderTree, // 🟢 New
  removeSidebarFolder, // 🟢 Decoupled Sidebar
  deleteFolder, // 🟢 Import
  // isManagementMode, 
  libraryFolders, // 🟢 新增
  addLibraryFolderPath, // 🟢 新增
} = usePlayer();

const sidebarImageCache = ref<Map<string, string>>(new Map());
const dragOverId = ref<string | null>(null);
const dragPosition = ref<'top' | 'bottom' | null>(null);

const activeTreeNodes = computed(() => {
    if (!activeRootPath.value) return [];
    const root = folderTree.value.find(n => n.path === activeRootPath.value);
    return root ? root.children : [];
});

// Auto-select first capsule if none selected
watch(() => folderTree.value, (newVal) => {
    // Logic to ensure an active root is selected
    if (newVal.length > 0) {
       // If no selection, or selection invalid, select first
       if (!activeRootPath.value || !newVal.find(n => n.path === activeRootPath.value)) {
           activeRootPath.value = newVal[0].path;
       }
    } else {
        activeRootPath.value = null;
    }
}, { immediate: true });

// --- Custom Drag & Drop for Folders/Artists/Albums ---
let mouseDownInfo: { x: number, y: number, index: number, item: any, type: 'folder' | 'artist' | 'album' } | null = null;

const handleMouseDown = (e: MouseEvent, index: number, item: any, type: 'folder' | 'artist' | 'album') => {
  if (e.button !== 0) return;
  mouseDownInfo = { x: e.clientX, y: e.clientY, index, item, type };
};

const handleGlobalMouseMove = (e: MouseEvent) => {
  if (mouseDownInfo && !dragSession.active) {
    const dist = Math.sqrt(Math.pow(e.clientX - mouseDownInfo.x, 2) + Math.pow(e.clientY - mouseDownInfo.y, 2));
    if (dist > 5) {
      dragSession.active = true;
      dragSession.type = mouseDownInfo.type;
      
      if (mouseDownInfo.type === 'folder') {
        dragSession.data = { index: mouseDownInfo.index, path: mouseDownInfo.item.path, name: mouseDownInfo.item.name };
      } else {
        dragSession.data = { index: mouseDownInfo.index, name: mouseDownInfo.item.name };
      }
    }
  }
};

const handleGlobalMouseUp = () => {
  if (!dragSession.active) {
    mouseDownInfo = null;
    return;
  }

  // Handle Drop based on Type
  if (dragSession.type === 'folder') {
    handleDropLogic(folderList.value, 'path', reorderWatchedFolders);
  } else if (dragSession.type === 'artist') {
    handleDropLogic(artistList.value, 'name', (from, to) => {
        const list = [...artistList.value];
        const [removed] = list.splice(from, 1);
        list.splice(to, 0, removed);
        updateArtistOrder(list.map(a => a.name));
    });
  } else if (dragSession.type === 'album') {
    handleDropLogic(albumList.value, 'name', (from, to) => {
        const list = [...albumList.value];
        const [removed] = list.splice(from, 1);
        list.splice(to, 0, removed);
        updateAlbumOrder(list.map(a => a.name));
    });
  } else if (dragSession.type === 'song' && dragSession.targetFolder) {
      // 🟢 Handle Song Drop on Folder - Show Modal, Do NOT reset state yet
      handleDropEvent();
      // Reset state will happen in executeMove or when modal is cancelled
      mouseDownInfo = null;
      dragOverId.value = null;
      dragPosition.value = null;
      return; // Exit early, don't reset dragSession
  }
  
  // Reset for non-song-drop cases
  mouseDownInfo = null;
  if (['folder', 'artist', 'album'].includes(dragSession.type)) {
     dragSession.active = false;
     dragSession.type = 'song';
     dragSession.data = null;
     dragOverId.value = null;
     dragPosition.value = null;
  }
};

const handleDropLogic = (list: any[], key: string, callback: (from: number, to: number) => void) => {
    if (dragOverId.value && mouseDownInfo) {
      const fromIndex = mouseDownInfo.index;
      const targetIndex = list.findIndex(i => i[key] === dragOverId.value);
      
      if (targetIndex !== -1) {
        let toIndex = targetIndex;
        if (dragPosition.value === 'bottom') {
          toIndex++;
        }
        if (fromIndex < toIndex) {
          toIndex--;
        }
        
        if (fromIndex !== toIndex) {
          callback(fromIndex, toIndex);
        }
      }
    }
};

// ...



const handleItemMouseMove = (e: MouseEvent, id: string, type: 'folder' | 'artist' | 'album') => {
  if (dragSession.active && dragSession.type === type) {
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    
    dragOverId.value = id;
    dragPosition.value = e.clientY < mid ? 'top' : 'bottom';
  }
};


// ------------------------------

// 🟢 2. 修改加载逻辑：路径 -> Asset URL
const loadSidebarCover = async (path: string) => {
  if (!path || sidebarImageCache.value.has(path)) return;
  try { 
    // 后端现在返回的是绝对路径 (例如 C:\Users\...\covers\xxx.jpg)
    const filePath = await invoke<string>('get_song_cover_thumbnail', { path }); 
    if (filePath && filePath.length > 0) {
      // 必须转换为 asset:// 链接，浏览器才能加载
      const assetUrl = convertFileSrc(filePath);
      sidebarImageCache.value.set(path, assetUrl); 
    }
  } catch {}
};

watch([artistList, albumList, folderList, currentViewMode, localMusicTab], () => {
  let list: any[] = [];
  if (currentViewMode.value === 'all') {
    list = localMusicTab.value === 'artist' ? artistList.value : (localMusicTab.value === 'album' ? albumList.value : []);
  } else if (currentViewMode.value === 'folder') {
    list = folderList.value;
  }
  list.forEach(item => { if (item.firstSongPath) loadSidebarCover(item.firstSongPath); });
}, { immediate: true, deep: true });

const showMenu = ref(false);
const menuX = ref(0);
const menuY = ref(0);
const targetFolder = ref<{ name: string, path: string } | null>(null);

// 🟢 批量选择逻辑
// 🟢 批量选择逻辑
const selectedFolderPaths = ref<Set<string>>(new Set());
const lastSelectedFolderPath = ref<string | null>(null);

const handleContextMenu = (e: MouseEvent, folder: { name: string, path: string }) => { 
  e.preventDefault(); 
  e.stopPropagation(); // 防止冒泡
  targetFolder.value = folder; 
  
  // 如果右键点击的项不在选中集合中，则视为单选该项（符合操作系统习惯）
  if (!selectedFolderPaths.value.has(folder.path)) {
    selectedFolderPaths.value.clear();
    selectedFolderPaths.value.add(folder.path);
    lastSelectedFolderPath.value = folder.path;
    currentFolderFilter.value = folder.path;
  }

  menuX.value = e.clientX; 
  menuY.value = e.clientY; 
  showMenu.value = true; 
};

const handleMenuCancel = () => {
  showMenu.value = false;
  // 右键菜单取消（点击外部），重置为单选当前文件夹
  if (currentFolderFilter.value) {
    selectedFolderPaths.value.clear();
    selectedFolderPaths.value.add(currentFolderFilter.value);
  }
};

const playFolder = () => { if (targetFolder.value) { const s = getSongsInFolder(targetFolder.value.path); if (s.length > 0) { playSong(s[0]); currentFolderFilter.value = targetFolder.value.path; } showMenu.value = false; } };
const addToQueue = () => { if (targetFolder.value) { const s = getSongsInFolder(targetFolder.value.path); addSongsToQueue(s); showMenu.value = false; } };
const showAddToLibraryConfirm = ref(false);
const pendingFolderToPlaylist = ref<{ name: string, path: string } | null>(null);

const createPlaylistFromFolder = () => { 
  if (targetFolder.value) { 
    // 🟢 检查策略：判断该文件夹或其父级是否已经在库里
    // 由于 libraryFolders 存储的是根路径，我们检查 targetFolder 的路径是否以某个库根路径开头
    const isInLibrary = libraryFolders.value.some(f => {
        const root = f.path.replace(/\\/g, '/').toLowerCase();
        const target = targetFolder.value!.path.replace(/\\/g, '/').toLowerCase();
        return target.startsWith(root);
    });

    if (!isInLibrary) {
      pendingFolderToPlaylist.value = { ...targetFolder.value };
      showAddToLibraryConfirm.value = true;
      showMenu.value = false;
      return;
    }

    const s = getSongsInFolder(targetFolder.value.path); 
    if (s.length > 0) createPlaylist(targetFolder.value.name, s.map(song => song.path)); 
    showMenu.value = false; 
  } 
};

const executeAddToLibraryAndCreate = async () => {
  if (pendingFolderToPlaylist.value) {
    const folder = pendingFolderToPlaylist.value;
    await addLibraryFolderPath(folder.path);
    // 等待扫描完成（addLibraryFolderPath 已经包含了 scanLibrary 等待）
    const s = getSongsInFolder(folder.path);
    if (s.length > 0) {
      createPlaylist(folder.name, s.map(song => song.path));
      useToast().showToast(`已将 ${folder.name} 添加到库并创建歌单`, "success");
    } else {
      useToast().showToast("文件夹中未发现歌曲", "info");
    }
  }
  showAddToLibraryConfirm.value = false;
};
const openFolder = () => { if (targetFolder.value) { openInFinder(targetFolder.value.path); showMenu.value = false; } };

// 🟢 批量删除逻辑
const showDeleteConfirm = ref(false);
const showPhysicalDeleteConfirm = ref(false); // 🟢 Physical Delete State
const foldersToDelete = ref<string[]>([]);
const folderToPhysicalDelete = ref<string | null>(null); // 🟢 Target for physical deletion

const removeFolderItem = () => {
  if (selectedFolderPaths.value.size > 0) {
    foldersToDelete.value = Array.from(selectedFolderPaths.value);
    showDeleteConfirm.value = true;
  } else if (targetFolder.value) {
    foldersToDelete.value = [targetFolder.value.path];
    showDeleteConfirm.value = true;
  }
  showMenu.value = false;
};

// 🟢 Physical Delete Handlers
const handlePhysicalDelete = () => {
    if (targetFolder.value) {
        folderToPhysicalDelete.value = targetFolder.value.path;
        showPhysicalDeleteConfirm.value = true;
        showMenu.value = false;
    }
};

const executePhysicalDelete = async () => {
    if (folderToPhysicalDelete.value) {
        try {
            await deleteFolder(folderToPhysicalDelete.value);
            useToast().showToast("文件夹已永久删除", "success");
            await refreshFolder(activeRootPath.value || '');
        } catch(e) {
            useToast().showToast("删除失败: " + e, "error");
        }
    }
    showPhysicalDeleteConfirm.value = false;
};

const handleTreeContextMenu = ({ event, node }: { event: MouseEvent, node: FolderNode }) => {
    handleContextMenu(event, { name: node.name, path: node.path });
};

const executeDeleteFolders = async () => {
  // Use removeSidebarFolder for decoupled removal
  for (const path of foldersToDelete.value) {
      await removeSidebarFolder(path);
  }
  selectedFolderPaths.value.clear();
  foldersToDelete.value = [];
  showDeleteConfirm.value = false;
};

const handleRefreshFolder = async () => {
  if (targetFolder.value) {
    try {
      await refreshFolder(targetFolder.value.path);
      showMenu.value = false;
      useToast().showToast("刷新成功", "success");
    } catch (e) {
      useToast().showToast("刷新失败: " + e, "error");
    }
  }
};

// --- Move Confirmation Logic ---
const showMoveConfirm = ref(false);
const dragPendingFiles = ref<string[]>([]);
const moveTarget = ref<{ name: string, path: string } | null>(null);

const handleDropEvent = () => {
  if (!props.isManagementMode) return;

  if (dragSession.targetFolder && dragSession.targetFolder.path !== currentFolderFilter.value) {
    const songsToMove = dragSession.songs && dragSession.songs.length > 0 
        ? dragSession.songs 
        : (dragSession.data ? [dragSession.data] : []);

    if (songsToMove.length > 0) {
        dragPendingFiles.value = songsToMove.map(s => s.path);
        moveTarget.value = { ...dragSession.targetFolder };
        showMoveConfirm.value = true;
    }
  }
};

const executeMove = async () => {
  if (moveTarget.value && dragPendingFiles.value.length > 0) {
    try {
      await moveFilesToFolder(dragPendingFiles.value, moveTarget.value.path);
      useToast().showToast("移动成功", "success");
    } catch (e) {
      useToast().showToast("移动失败: " + e, "error");
    }
  }
  // Always reset state after move (success or failure)
  resetMoveState();
};

const cancelMove = () => {
  resetMoveState();
};

const resetMoveState = () => {
  dragPendingFiles.value = [];
  showMoveConfirm.value = false;
  moveTarget.value = null;
  // Reset dragSession
  dragSession.showGhost = false;
  dragSession.active = false;
  dragSession.targetFolder = null;
  dragSession.songs = [];
};

// 🟢 New Handlers
const handleTreeSelect = (node: FolderNode) => {
    currentFolderFilter.value = node.path;
};

// 🟢 Auto-fetch songs when selecting a folder
watch(currentFolderFilter, async (newPath) => {
    if (newPath) {
        try {
           await refreshFolder(newPath);
        } catch (e) {
           console.error("Failed to load songs for folder:", e);
        }
    }
});

onMounted(async () => {
  window.addEventListener('custom-drop-trigger', handleDropEvent);
  window.addEventListener('mousemove', handleGlobalMouseMove);
  window.addEventListener('mouseup', handleGlobalMouseUp);
  // Initial fetch
  await fetchFolderTree();
});
onUnmounted(() => {
  window.removeEventListener('custom-drop-trigger', handleDropEvent);
});

// 🟢 Sidebar Resizing Logic
const sidebarWidth = ref(240); // Default width
const isResizing = ref(false);
let resizeStartX = 0;
let resizeStartWidth = 0;

const startResize = (e: MouseEvent) => {
  isResizing.value = true;
  resizeStartX = e.clientX;
  resizeStartWidth = sidebarWidth.value;
  
  document.addEventListener('mousemove', handleResize);
  document.addEventListener('mouseup', stopResize);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none'; 
};

const handleResize = (e: MouseEvent) => {
  if (isResizing.value) {
    const delta = e.clientX - resizeStartX;
    const newWidth = Math.max(150, Math.min(500, resizeStartWidth + delta));
    sidebarWidth.value = newWidth;
  }
};

const stopResize = () => {
  isResizing.value = false;
  document.removeEventListener('mousemove', handleResize);
  document.removeEventListener('mouseup', stopResize);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
};

</script>

<template>
  <aside 
    v-if="(isLocalMusic && localMusicTab !== 'default') || isFolderMode" 
    class="h-full border-r border-white/10 bg-transparent shrink-0 select-none relative group/sidebar"
    :style="{ width: sidebarWidth + 'px' }"
  >
    <!-- Resizer Handle -->
    <div 
        class="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-[#EC4141] transition-colors z-10"
        :class="{ 'bg-[#EC4141]': isResizing }"
        @mousedown="startResize"
    ></div>

    <!-- Scrollable Content -->
    <div class="h-full overflow-y-auto custom-scrollbar">
    
    <ul v-if="isLocalMusic && localMusicTab === 'artist'" class="p-2 space-y-1">
        <li 
          v-for="(item, index) in artistList" 
          :key="item.name" 
          @mousedown="handleMouseDown($event, index, item, 'artist')"
          @mousemove="handleItemMouseMove($event, item.name, 'artist')"
          @click="currentArtistFilter = item.name" 
          :class="[
            currentArtistFilter === item.name ? 'bg-white/40 dark:bg-white/20 shadow-sm' : 'hover:bg-white/20 dark:hover:bg-white/10',
            (dragSession.active && dragSession.type === 'artist' && dragSession.data?.name === item.name) ? 'opacity-50' : '',
            (dragSession.type === 'artist' && dragOverId === item.name && dragPosition === 'top') ? '!border-t-2 !border-t-[#EC4141]' : '',
            (dragSession.type === 'artist' && dragOverId === item.name && dragPosition === 'bottom') ? '!border-b-2 !border-b-[#EC4141]' : ''
          ]"
          class="flex items-center p-2 rounded-lg cursor-pointer transition-all border-t-2 border-transparent border-b-2 select-none"
        >
          <div class="w-10 h-10 rounded-full bg-white/30 dark:bg-white/10 flex items-center justify-center text-gray-500 dark:text-gray-400 font-bold mr-3 shrink-0 overflow-hidden relative">
            <img v-if="sidebarImageCache.get(item.firstSongPath)" :src="sidebarImageCache.get(item.firstSongPath)" class="w-full h-full object-cover" />
            <span v-else>{{ item.name.charAt(0).toUpperCase() }}</span>
          </div>
          <div class="flex-1 min-w-0"><div class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{{ item.name }}</div><div class="text-xs text-gray-500 dark:text-gray-400">{{ item.count }} 首</div></div>
        </li>
    </ul>

    <ul v-if="isLocalMusic && localMusicTab === 'album'" class="p-2 space-y-1">
        <li 
          v-for="(item, index) in albumList" 
          :key="item.name" 
          @mousedown="handleMouseDown($event, index, item, 'album')"
          @mousemove="handleItemMouseMove($event, item.name, 'album')"
          @click="currentAlbumFilter = item.name" 
          :class="[
            currentAlbumFilter === item.name ? 'bg-white/40 dark:bg-white/20 shadow-sm' : 'hover:bg-white/20 dark:hover:bg-white/10',
            (dragSession.active && dragSession.type === 'album' && dragSession.data?.name === item.name) ? 'opacity-50' : '',
            (dragSession.type === 'album' && dragOverId === item.name && dragPosition === 'top') ? '!border-t-2 !border-t-[#EC4141]' : '',
            (dragSession.type === 'album' && dragOverId === item.name && dragPosition === 'bottom') ? '!border-b-2 !border-b-[#EC4141]' : ''
          ]"
          class="flex items-center p-2 rounded-lg cursor-pointer transition-all border-t-2 border-transparent border-b-2 select-none"
        >
          <div class="w-10 h-10 rounded bg-white/30 dark:bg-white/10 flex items-center justify-center text-gray-500 dark:text-gray-400 mr-3 shrink-0 overflow-hidden relative">
            <img v-if="sidebarImageCache.get(item.firstSongPath)" :src="sidebarImageCache.get(item.firstSongPath)" class="w-full h-full object-cover" />
            <span v-else>💿</span>
          </div>
          <div class="flex-1 min-w-0"><div class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{{ item.name }}</div><div class="text-xs text-gray-500 dark:text-gray-400">{{ item.count }} 首</div></div>
        </li>
    </ul>

    <div v-show="isFolderMode" class="flex flex-col h-full bg-transparent">
        <div class="flex-1 overflow-y-auto custom-scrollbar px-2 pb-4 space-y-0.5 mt-1">
             <div v-if="activeTreeNodes && activeTreeNodes.length > 0">
                 <FolderTreeItem 
                    v-for="node in activeTreeNodes" 
                    :key="node.path"
                    :node="node"
                    :depth="0"
                    :selectedPath="currentFolderFilter"
                    @select="handleTreeSelect"
                    @contextmenu="handleTreeContextMenu"
                 />
             </div>
             
             <!-- Empty State for Active Root -->
             <div v-else-if="activeRootPath" class="flex flex-col items-center justify-center py-10 text-gray-400 dark:text-gray-500 space-y-2">
                 <span class="text-xs">该文件夹为空</span>
             </div>

             <!-- Empty State for No Roots -->
             <div v-if="folderTree.length === 0" class="flex flex-col items-center justify-center py-10 text-gray-400 dark:text-gray-500 space-y-2">
                 <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 00-2-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" /></svg>
                 <span class="text-xs">点击右上角 "..." 添加文件夹</span>
             </div>
        </div>
    </div>

    </div> <!-- End Scrollable Content -->

    <!-- ... Context Menus ... -->
    <FolderContextMenu 
      :visible="showMenu" 
      :x="menuX" 
      :y="menuY" 
      :folder-path="targetFolder?.path || ''" 
      :selected-count="selectedFolderPaths.size"
      @close="showMenu = false" 
      @cancel="handleMenuCancel"
      @play="playFolder" 
      @add-to-queue="addToQueue" 
      @create-playlist="createPlaylistFromFolder" 
      @open-folder="openFolder" 
      @refresh="handleRefreshFolder" 
      @remove="removeFolderItem" 
      @delete-disk="handlePhysicalDelete"
      :isManagementMode="isManagementMode"
    />

    <ModernModal 
      v-model:visible="showMoveConfirm" 
      title="物理移动文件" 
      :content="`确定将这 ${dragPendingFiles.length} 个文件物理移动到文件夹 '${moveTarget?.name}' 吗？`" 
      @confirm="executeMove" 
      @cancel="cancelMove"
    />

    <ModernModal 
      v-model:visible="showDeleteConfirm" 
      title="移除文件夹" 
      :content="`确定要从列表中移除选中的 ${foldersToDelete.length} 个文件夹吗？`" 
      type="danger"
      confirm-text="移除"
      @confirm="executeDeleteFolders" 
    />

    <!-- 🟢 Physical Delete Modal -->
    <ModernModal 
      v-model:visible="showPhysicalDeleteConfirm" 
      title="⚠️ 永久删除文件夹" 
      :content="`确定要从磁盘中永久删除文件夹 '${folderToPhysicalDelete}' 吗？此操作不可恢复！`" 
      type="danger"
      confirm-text="永久删除"
      @confirm="executePhysicalDelete" 
    />

    <ModernModal 
      v-model:visible="showAddToLibraryConfirm" 
      title="添加到音乐库" 
      :content="`文件夹 '${pendingFolderToPlaylist?.name}' 尚未添加到音乐库，无法直接创建歌单。要先将其添加到音乐库吗？`" 
      confirm-text="添加到库并创建"
      @confirm="executeAddToLibraryAndCreate" 
    />

  </aside>
</template>