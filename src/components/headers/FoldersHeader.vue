<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

import FolderContextMenu from '../overlays/FolderContextMenu.vue';
import { useToast } from '../../composables/toast';
import { usePlayer } from '../../composables/player';

const { folderSortMode, setFolderSortMode } = usePlayer();

const props = defineProps<{
  isBatchMode: boolean;
  selectedCount: number;
  folderTree: any[];
  activeRootPath: string;
  currentFolderFilter: string;
  isManagementMode: boolean; // 🟢 Prop
}>();

const emit = defineEmits([
  'update:isBatchMode', 
  'update:activeRootPath',
  'playAll', 
  'batchPlay', 
  'batchDelete', 
  'batchMove', 
  'addToPlaylist',
  'addFolder',
  'refreshFolder',
  'refreshFolder',
  'removeFolder',
  'update:isManagementMode' // 🟢 Emit
]);

const toast = useToast();

const targetRootPath = ref('');
const showRootMenu = ref(false);
const rootMenuX = ref(0);
const rootMenuY = ref(0);

const showSortMenu = ref(false);
const sortMenuX = ref(0);
const sortMenuY = ref(0);

// 切换管理模式并显示 toast 提示（防抖）
let toastTimer: ReturnType<typeof setTimeout> | null = null;

const toggleManagementMode = (enable: boolean) => {
  // 状态没变就不操作
  if (props.isManagementMode === enable) return;
  
  emit('update:isManagementMode', enable);
  
  // 清除之前的定时器，实现防抖
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  
  // 延迟 300ms 显示 toast，快速切换只显示最后一次
  toastTimer = setTimeout(() => {
    if (enable) {
      toast.showToast('注意！已进入管理模式，将会对本地文件直接进行操作', 'error');
    } else {
      toast.showToast('已退出管理模式', 'success');
    }
  }, 300);
};

const handleRootContextMenu = (e: MouseEvent, path: string) => {
  e.preventDefault();
  targetRootPath.value = path;
  rootMenuX.value = e.clientX;
  rootMenuY.value = e.clientY;
  showRootMenu.value = true;
  showSortMenu.value = false;
};

const sortMenuIsRightAligned = ref(false);

const handleSortClick = (e: MouseEvent) => {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const windowWidth = window.innerWidth;
  
  // 如果按钮靠近屏幕右侧，则切换到右对齐模式
  if (rect.left > windowWidth / 2) {
    sortMenuIsRightAligned.value = true;
    sortMenuX.value = windowWidth - rect.right;
  } else {
    sortMenuIsRightAligned.value = false;
    sortMenuX.value = rect.left;
  }
  
  sortMenuY.value = rect.bottom + 8;
  showSortMenu.value = !showSortMenu.value;
  showRootMenu.value = false;
};

const handleGlobalClick = (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  if (!target.closest('.root-folder-menu') && !target.closest('.sort-menu-trigger')) {
    showRootMenu.value = false;
    showSortMenu.value = false;
  }
};

onMounted(() => window.addEventListener('click', handleGlobalClick));
onUnmounted(() => {
  window.removeEventListener('click', handleGlobalClick);
  // isManagementMode.value = false; // 🟢 Managed by parent now
});
</script>

<template>
  <div class="px-6 shrink-0 select-none flex flex-col pt-2 pb-3 h-auto justify-center">
    
    <!-- 批量操作模式 -->
    <div v-if="isBatchMode" class="flex items-center justify-between animate-in fade-in slide-in-from-top-1 duration-200">
      <div class="flex items-center gap-3">
        <button @click="emit('batchPlay')" class="bg-[#EC4141] hover:bg-[#d13b3b] text-white px-4 py-1.5 rounded-full text-sm transition flex items-center gap-1 active:scale-95 shadow-sm">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" /></svg>
        </button>
        <button @click="emit('addToPlaylist')" class="bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 text-gray-700 dark:text-gray-200 px-4 py-1.5 rounded text-sm transition flex items-center gap-1 active:scale-95">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg> 收藏到歌单
        </button>
        <button @click="emit('batchMove')" class="bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 text-gray-700 dark:text-gray-200 px-4 py-1.5 rounded text-sm transition flex items-center gap-1 active:scale-95">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg> 移动到文件夹
        </button>
        <button @click="emit('batchDelete')" class="bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 text-gray-700 dark:text-gray-200 px-4 py-1.5 rounded text-sm transition flex items-center gap-1 active:scale-95">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg> 删除
        </button>
      </div>
      <div class="flex items-center gap-4">
        <button @click="emit('update:isBatchMode', false)" class="text-[#EC4141] hover:bg-red-50 dark:hover:bg-red-500/10 px-3 py-1 rounded transition">完成</button>
      </div>
    </div>

    <!-- 正常模式 -->
    <div v-else class="flex items-center justify-between">
      <!-- 左侧文件夹胶囊 -->
      <div class="flex items-center gap-2 overflow-x-auto overflow-y-visible custom-scrollbar no-scrollbar py-2 pr-2">
        <div 
            v-for="rootNode in folderTree" 
            :key="rootNode.path"
            @click="emit('update:activeRootPath', rootNode.path)"
            @contextmenu.prevent="handleRootContextMenu($event, rootNode.path)"
            :class="[
                'group relative px-4 py-1.5 rounded-full text-sm font-medium transition-all cursor-pointer select-none shrink-0 border',
                activeRootPath === rootNode.path 
                    ? 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-500/20 dark:text-blue-200 dark:border-blue-500/30' 
                    : 'bg-gray-50 text-gray-500 border-transparent hover:bg-gray-100 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10'
            ]"
        >
           <span>{{ rootNode.name }}</span>
           <button
             @click.stop="emit('removeFolder', rootNode.path, rootNode.name)"
             class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-400 hover:text-white shadow-sm"
             title="移除此文件夹"
           >
             <svg xmlns="http://www.w3.org/2000/svg" class="h-2.5 w-2.5" viewBox="0 0 20 20" fill="currentColor">
               <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
             </svg>
           </button>
        </div>
        
        <FolderContextMenu 
            :visible="showRootMenu" 
            :x="rootMenuX" 
            :y="rootMenuY" 
            :folder-path="targetRootPath"
            :selected-count="1" 
            @close="showRootMenu = false"
            @remove="path => emit('removeFolder', path)"
            :isManagementMode="isManagementMode"
        />
      </div>

      <!-- 右侧操作按钮 -->
      <div class="flex items-center gap-3">
        
        <!-- 胶囊模式切换 -->
        <div class="flex p-0.5 bg-gray-100 dark:bg-white/5 rounded-full relative w-24 h-6 items-center cursor-pointer select-none">
          <!-- 滑动背景 -->
          <div 
            class="absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] bg-white dark:bg-white/10 rounded-full shadow-sm transition-all duration-300 ease-out z-0"
            :style="{ transform: isManagementMode ? 'translateX(100%)' : 'translateX(0)' }"
          ></div>
          
          <!-- 浏览按钮 -->
          <div 
            @click="toggleManagementMode(false)"
            class="flex-1 flex items-center justify-center text-[11px] font-medium transition-colors z-10"
            :class="!isManagementMode ? 'text-[#EC4141] dark:text-red-400' : 'text-gray-400'"
          >
            浏览
          </div>
          
          <!-- 管理按钮 -->
          <div 
            @click="toggleManagementMode(true)"
            class="flex-1 flex items-center justify-center text-[11px] font-medium transition-colors z-10"
            :class="isManagementMode ? 'text-[#EC4141] dark:text-red-400' : 'text-gray-400'"
          >
            管理
          </div>
        </div>

        <!-- 添加文件夹按钮 -->
        <button 
          @click="emit('addFolder')" 
          class="bg-white/1 hover:bg-white/10 border border-white/1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 w-7 h-7 flex items-center justify-center rounded-full transition active:scale-95 shadow-sm hover:border-gray-200 dark:hover:border-white/20"
          title="添加文件夹"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
        </button>

        <!-- 刷新文件夹按钮 -->
        <button 
          v-if="currentFolderFilter"
          @click="emit('refreshFolder')" 
          class="bg-white/1 hover:bg-white/10 border border-white/1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 w-7 h-7 flex items-center justify-center rounded-full transition active:scale-95 shadow-sm hover:border-gray-200 dark:hover:border-white/20"
          title="刷新文件夹"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
        </button>

        <!-- 批量操作按钮 -->
        <button 
          @click="emit('update:isBatchMode', true)" 
          class="bg-white/1 hover:bg-white/10 border border-white/1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 w-7 h-7 flex items-center justify-center rounded-full transition active:scale-95 shadow-sm hover:border-gray-200 dark:hover:border-white/20"
          title="批量操作"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
        </button>

        <!-- 排序方式按钮 -->
        <button 
          @click="handleSortClick"
          class="sort-menu-trigger bg-white/1 hover:bg-white/10 border border-white/1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 w-7 h-7 flex items-center justify-center rounded-full transition active:scale-95 shadow-sm hover:border-gray-200 dark:hover:border-white/20"
          :class="{ 'text-blue-500 border-blue-200 bg-blue-50/50 dark:bg-blue-500/10': folderSortMode !== 'title' }"
          title="排序方式"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
          </svg>
        </button>

        <!-- 排序菜单 -->
        <Teleport to="body">
          <div 
            v-if="showSortMenu"
            class="fixed z-[9999] bg-white dark:bg-[#2b2b2b] rounded-lg shadow-xl border border-gray-100 dark:border-white/10 py-1 min-w-[120px] isolate animate-in fade-in zoom-in-95 duration-100"
            :style="sortMenuIsRightAligned 
              ? { right: sortMenuX + 'px', top: sortMenuY + 'px' }
              : { left: sortMenuX + 'px', top: sortMenuY + 'px' }"
          >
            <div 
              v-for="mode in (['title', 'name', 'artist', 'added_at', 'custom'] as const)" 
              :key="mode"
              @click="setFolderSortMode(mode); showSortMenu = false"
              class="px-3 py-2 text-xs cursor-pointer flex items-center justify-between hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
              :class="folderSortMode === mode ? 'text-blue-500 font-medium' : 'text-gray-600 dark:text-gray-300'"
            >
              <span>{{ { title: '歌曲名', name: '文件名', artist: '歌手', added_at: '添加时间', custom: '自定义' }[mode] }}</span>
              <svg v-if="folderSortMode === mode" xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
              </svg>
            </div>
          </div>
        </Teleport>
      </div>
    </div>

  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
