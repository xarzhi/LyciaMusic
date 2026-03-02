<script setup lang="ts">
import { usePlayer } from '../../composables/player';

defineProps<{
  isBatchMode: boolean;
  selectedCount?: number;
}>();

const emit = defineEmits(['update:isBatchMode', 'playAll', 'batchPlay', 'addToPlaylist', 'batchDelete', 'batchMove', 'refreshAll', 'addAllToQueue']);

const { 
  localSortMode,
  setLocalSortMode,
} = usePlayer();

import { ref, onMounted, onUnmounted } from 'vue';
const showSortMenu = ref(false);
const sortMenuX = ref(0);
const sortMenuY = ref(0);
const sortMenuIsRightAligned = ref(false);

const handleSortClick = (e: MouseEvent) => {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const windowWidth = window.innerWidth;
  
  if (rect.left > windowWidth / 2) {
    sortMenuIsRightAligned.value = true;
    sortMenuX.value = windowWidth - rect.right;
  } else {
    sortMenuIsRightAligned.value = false;
    sortMenuX.value = rect.left;
  }
  
  sortMenuY.value = rect.bottom + 8;
  showSortMenu.value = !showSortMenu.value;
};

// 全局点击关闭菜单
const handleGlobalClick = (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  if (!target.closest('.sort-menu-trigger')) {
    showSortMenu.value = false;
  }
};
onMounted(() => window.addEventListener('click', handleGlobalClick));
onUnmounted(() => window.removeEventListener('click', handleGlobalClick));

const handleRefreshAll = () => {
  emit('refreshAll');
};

const handlePlayAll = () => { 
  emit('playAll');
};

const handleAddAllToQueue = () => {
  emit('addAllToQueue');
};

const handleEnterBatchMode = () => {
  emit('update:isBatchMode', true);
};
</script>

<template>
  <div class="px-6 shrink-0 select-none flex flex-col pt-2 pb-3 h-auto justify-center">
    
    <!-- 批量操作模式 -->
    <div v-if="isBatchMode" class="flex items-center justify-between animate-in fade-in slide-in-from-top-1 duration-200">
      <div class="flex items-center gap-3">
        <button @click="emit('batchPlay')" class="bg-[#EC4141] hover:bg-[#d13b3b] text-white px-4 py-1.5 rounded-full text-sm transition flex items-center gap-1 active:scale-95 shadow-sm">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" /></svg>
        </button>
        <button class="bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 text-gray-700 dark:text-gray-200 px-4 py-1.5 rounded text-sm transition flex items-center gap-1 active:scale-95">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" /></svg> 添加到播放列表
        </button>
        <button @click="emit('addToPlaylist')" class="bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 text-gray-700 dark:text-gray-200 px-4 py-1.5 rounded text-sm transition flex items-center gap-1 active:scale-95">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg> 收藏到歌单
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
      <!-- 左侧标题 -->
      <div class="flex items-center gap-2 pb-1">
        <h2 class="text-xl font-bold text-gray-900 dark:text-white">本地音乐</h2>
      </div>

      <!-- 右侧操作按钮 -->
      <div class="flex items-center gap-2">
        
        <!-- 播放全部 -->
        <button 
          @click="handlePlayAll" 
          class="bg-white/1 hover:bg-white/10 border border-white/1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 w-7 h-7 flex items-center justify-center rounded-full transition active:scale-95 shadow-sm hover:border-gray-200 dark:hover:border-white/20"
          title="播放全部"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" /></svg>
        </button>

        <!-- 刷新所有歌曲 -->
        <button 
          @click="handleRefreshAll" 
          class="bg-white/1 hover:bg-white/10 border border-white/1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 w-7 h-7 flex items-center justify-center rounded-full transition active:scale-95 shadow-sm hover:border-gray-200 dark:hover:border-white/20"
          title="刷新所有歌曲"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
        </button>

        <!-- 全部添加至播放列表 -->
        <button 
          @click="handleAddAllToQueue" 
          class="bg-white/1 hover:bg-white/10 border border-white/1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 w-7 h-7 flex items-center justify-center rounded-full transition active:scale-95 shadow-sm hover:border-gray-200 dark:hover:border-white/20"
          title="全部添加至播放列表"
        >
          <!-- 播放三角形 + 右下角加号 -->
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M6.3 2.84A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.27l9.344-5.891a1.5 1.5 0 000-2.538L6.3 2.84z" />
            <circle cx="15" cy="15" r="4.5" fill="currentColor" stroke="white" stroke-width="1.5"/>
            <path d="M15 13v4M13 15h4" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>

        <!-- 批量操作 -->
        <button 
          @click="handleEnterBatchMode" 
          class="bg-white/1 hover:bg-white/10 border border-white/1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 w-7 h-7 flex items-center justify-center rounded-full transition active:scale-95 shadow-sm hover:border-gray-200 dark:hover:border-white/20"
          title="批量操作"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
        </button>

        <!-- 排序方式按钮 -->
        <button 
          @click.stop="handleSortClick"
          class="sort-menu-trigger bg-white/1 hover:bg-white/10 border border-white/1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 w-7 h-7 flex items-center justify-center rounded-full transition active:scale-95 shadow-sm hover:border-gray-200 dark:hover:border-white/20"
          :class="{ 'text-blue-500 border-blue-200 bg-blue-50/50 dark:bg-blue-500/10': localSortMode !== 'default' }"
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
              v-for="mode in (['title', 'name', 'artist', 'added_at', 'custom', 'default'] as const)" 
              :key="mode"
              @click="setLocalSortMode(mode); showSortMenu = false"
              class="px-3 py-2 text-xs cursor-pointer flex items-center justify-between hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
              :class="localSortMode === mode ? 'text-blue-500 font-medium' : 'text-gray-600 dark:text-gray-300'"
            >
              <span>{{ { title: '歌曲名', name: '文件名', artist: '歌手', added_at: '添加时间', custom: '自定义', default: '默认' }[mode] }}</span>
              <svg v-if="localSortMode === mode" xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
              </svg>
            </div>
          </div>
        </Teleport>
      </div>
    </div>

  </div>
</template>
