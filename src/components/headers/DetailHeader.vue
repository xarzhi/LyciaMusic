<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { Song } from '../../composables/player';

const props = defineProps<{
  title: string;
  subtitle?: string;
  songs: Song[];
  isBatchMode: boolean;
  selectedCount: number;
  showRename?: boolean;
}>();

const emit = defineEmits([
  'update:isBatchMode',
  'playAll',
  'batchPlay',
  'batchDelete',
  'openAddToPlaylist',
  'rename'
]);

const headerCover = ref('');

const updateHeaderCover = async () => {
  if (props.songs.length > 0) {
    const firstSongPath = props.songs[0].path;
    try {
      const filePath = await invoke<string>('get_song_cover', { path: firstSongPath });
      if (filePath && filePath.length > 0) {
        headerCover.value = convertFileSrc(filePath);
      } else {
        headerCover.value = '';
      }
    } catch (e) {
      headerCover.value = '';
    }
  } else {
    headerCover.value = '';
  }
};

watch(() => props.songs, updateHeaderCover, { immediate: true });

const handlePlayAll = () => {
  emit('playAll');
};
</script>

<template>
  <div class="px-6 shrink-0 select-none flex flex-col pt-2 pb-4 h-auto justify-start">
    
    <!-- 批量操作模式 -->
    <div v-if="isBatchMode" class="flex items-center justify-between animate-in fade-in slide-in-from-top-1 duration-200">
      <div class="flex items-center gap-3">
        <button @click="emit('batchPlay')" class="bg-[#EC4141] hover:bg-[#d13b3b] text-white px-4 py-1.5 rounded-full text-sm transition flex items-center gap-1 active:scale-95 shadow-sm">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" /></svg>
        </button>
        <button @click="emit('openAddToPlaylist')" class="bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 text-gray-700 dark:text-gray-200 px-4 py-1.5 rounded text-sm transition flex items-center gap-1 active:scale-95">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg> 收藏到歌单
        </button>
        <button @click="emit('batchDelete')" class="bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 text-gray-700 dark:text-gray-200 px-4 py-1.5 rounded text-sm transition flex items-center gap-1 active:scale-95">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg> 移除
        </button>
      </div>
      <div class="flex items-center gap-4">
        <button @click="emit('update:isBatchMode', false)" class="text-[#EC4141] hover:bg-red-50 dark:hover:bg-red-500/10 px-3 py-1 rounded transition">完成</button>
      </div>
    </div>

    <!-- 详情展示模式 -->
    <div v-else class="flex gap-6 h-auto mt-1">
      <!-- 封面图 -->
      <div class="w-40 h-40 rounded-2xl shadow-sm flex items-center justify-center shrink-0 overflow-hidden group relative select-none bg-gray-100 dark:bg-white/5">
        <img v-if="headerCover" :src="headerCover" class="w-full h-full object-cover animate-in fade-in duration-300" alt="Cover" />
        <div v-else class="flex flex-col items-center justify-center h-full w-full">
           <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-16 h-16 text-indigo-500/50 mb-2 drop-shadow-md"><path fill-rule="evenodd" d="M19.952 1.651a.75.75 0 01.298.599V16.303a3 3 0 01-2.176 2.884l-1.32.377a2.553 2.553 0 11-1.403-4.909l2.311-.66a1.5 1.5 0 001.088-1.442V6.994l-9 2.572v9.737a3 3 0 01-2.176 2.884l-1.32.377a2.553 2.553 0 11-1.403-4.909l2.311-.66a1.5 1.5 0 001.088-1.442V9.017c0-.528.246-1.032.67-1.371l10.038-5.996z" clip-rule="evenodd" /></svg>
        </div>
      </div>
      
      <!-- 文本信息与操作 -->
      <div class="h-40 flex flex-col justify-between py-1 flex-1 min-w-0">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <h1 class="text-3xl font-bold text-gray-800 dark:text-white truncate max-w-[500px]">{{ title }}</h1>
            <button 
              v-if="showRename" 
              @click="emit('rename')" 
              class="text-gray-500 dark:text-white/60 hover:text-gray-800 dark:hover:text-white transition p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 shrink-0"
              title="修改名称"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          </div>
          
          <div v-if="subtitle" class="text-xs text-gray-400 dark:text-gray-500 font-medium">
             {{ subtitle }}
          </div>
        </div>

        <div class="flex items-center gap-3">
           <button @click="handlePlayAll" class="bg-white/1 hover:bg-white/10 border border-white/1 text-gray-900 dark:text-gray-100 px-5 py-2 rounded-full text-sm font-medium transition flex items-center gap-2 active:scale-95 shadow-sm hover:border-gray-200 dark:hover:border-white/20">
             <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" /></svg>
             播放全部
           </button>
           
           <button @click="emit('update:isBatchMode', true)" title="批量操作" class="bg-white/1 hover:bg-white/10 border border-white/1 text-gray-900 dark:text-gray-100 px-5 py-2 rounded-full text-sm font-medium transition flex items-center gap-2 active:scale-95 shadow-sm hover:border-gray-200 dark:hover:border-white/20">
             <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
             </svg>
           </button>
        </div>
      </div>
    </div>

  </div>
</template>
