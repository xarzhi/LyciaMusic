<script setup lang="ts">
import { usePlayer } from '../../composables/player';
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'; // 🟢 Added computed
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core'; // 🟢 1. 引入转换工具
import FolderTreeItem from '../common/FolderTreeItem.vue'; // 🟢 Import
import FolderContextMenu from '../overlays/FolderContextMenu.vue';
import ModernModal from '../common/ModernModal.vue'; 
import ModernInputModal from '../common/ModernInputModal.vue';
import { useToast } from '../../composables/toast';
import { dragSession } from '../../composables/dragState';
import type { FolderNode } from '../../types';

const props = withDefaults(defineProps<{
  isManagementMode?: boolean; // 🟢 Prop, now optional
}>(), {
  isManagementMode: false
});

const { 
  currentViewMode, localMusicTab, 
  artistList, albumList, folderList, currentFolderFilter,
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
  removeLibraryFolder,
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
watch(() => folderTree.value, async (newVal) => {
    // Logic to ensure an active root is selected
    if (newVal.length > 0) {
       // If no selection, or selection invalid, select first
       if (!activeRootPath.value || !newVal.find(n => n.path === activeRootPath.value)) {
           activeRootPath.value = newVal[0].path;
       }
       // 🟢 方案C：如果选中的根目录没有子文件夹，自动选中根目录本身并加载歌曲
       const selectedRoot = newVal.find(n => n.path === activeRootPath.value);
       if (selectedRoot && selectedRoot.children.length === 0 && selectedRoot.song_count > 0) {
           currentFolderFilter.value = selectedRoot.path;
           // 🟢 关键：直接调用 refreshFolder 加载歌曲数据
           try {
               await refreshFolder(selectedRoot.path);
           } catch (e) {
               console.error("Failed to auto-load songs for root folder:", e);
           }
       }
    } else {
        activeRootPath.value = null;
    }
}, { immediate: true, deep: true });

// --- Custom Drag & Drop for Folders/Artists/Albums ---
let mouseDownInfo: { x: number, y: number, index: number, item: any, type: 'folder' | 'artist' | 'album' } | null = null;



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
const showCreateFolderModal = ref(false);
const showPhysicalDeleteConfirm = ref(false); // 🟢 Physical Delete State
const foldersToDelete = ref<string[]>([]);
const createFolderParentPath = ref('');

const normalizePath = (path: string | null) => (path || '').replace(/\\/g, '/').replace(/\/+$/, '');
const getParentFolderPath = (path: string) => path.replace(/[\\/][^\\/]+$/, '');
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

const expandTreeToPath = (nodes: FolderNode[], targetPath: string): boolean => {
  for (const node of nodes) {
    if (node.path === targetPath) {
      return true;
    }
    if (node.children.length > 0 && expandTreeToPath(node.children, targetPath)) {
      node.is_expanded = true;
      return true;
    }
  }
  return false;
};
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

const handleCreateFolder = () => {
  if (!props.isManagementMode || !targetFolder.value) {
    return;
  }

  const rootPath = activeRootPath.value || targetFolder.value.path;
  if (rootPath && getRelativeDepth(rootPath, targetFolder.value.path) + 1 > 3) {
    useToast().showToast('当前文件夹视图最多支持 3 层嵌套，请不要继续向更深层级新建。', 'info');
    showMenu.value = false;
    return;
  }

  createFolderParentPath.value = targetFolder.value.path;
  showCreateFolderModal.value = true;
  showMenu.value = false;
};

const executeCreateFolder = async (folderName: string) => {
  if (!createFolderParentPath.value) {
    return;
  }

  try {
    const newFolderPath = await invoke<string>('create_folder', {
      parentPath: createFolderParentPath.value,
      folderName,
    });

    await fetchFolderTree();
    expandTreeToPath(folderTree.value, newFolderPath);
    currentFolderFilter.value = newFolderPath;
    useToast().showToast(`已创建文件夹：${folderName}`, 'success');
  } catch (e) {
    useToast().showToast('新建文件夹失败: ' + e, 'error');
  } finally {
    showCreateFolderModal.value = false;
    createFolderParentPath.value = '';
  }
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
            const deletedPath = folderToPhysicalDelete.value;
            const rootPath = activeRootPath.value || '';
            const shouldResetSelection =
              normalizePath(currentFolderFilter.value) === normalizePath(deletedPath) ||
              normalizePath(currentFolderFilter.value).startsWith(`${normalizePath(deletedPath)}/`);
            const fallbackPath = shouldResetSelection
              ? (() => {
                  const parentPath = getParentFolderPath(deletedPath);
                  const normalizedRoot = normalizePath(rootPath);
                  const normalizedParent = normalizePath(parentPath);
                  return normalizedRoot && normalizedParent.startsWith(normalizedRoot)
                    ? parentPath
                    : rootPath;
                })()
              : currentFolderFilter.value;
            await deleteFolder(deletedPath);
            useToast().showToast("文件夹已永久删除", "success");
            await fetchFolderTree();
            if (fallbackPath) {
              expandTreeToPath(folderTree.value, fallbackPath);
              currentFolderFilter.value = fallbackPath;
            }
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
  // Remove selected roots from the library-backed folder tree
  for (const path of foldersToDelete.value) {
      await removeLibraryFolder(path);
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
    

    <div class="flex flex-col h-full bg-transparent">
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
             
             <!-- Empty State for Active Root (No Subfolders) -->
             <div v-else-if="activeRootPath" class="flex flex-col items-center justify-center py-10 text-gray-400 dark:text-gray-500 space-y-2 text-center px-4">
                 <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                 <span class="text-xs leading-relaxed">当前目录下无子文件夹<br/>已显示所有歌曲</span>
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
      @new-folder="handleCreateFolder"
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

    <ModernInputModal
      :visible="showCreateFolderModal"
      title="新建文件夹"
      placeholder="输入文件夹名称"
      confirm-text="创建"
      @cancel="showCreateFolderModal = false"
      @confirm="executeCreateFolder"
    />

  </aside>
</template>
