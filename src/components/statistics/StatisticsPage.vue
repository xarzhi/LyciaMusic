<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { usePlayer } from '../../composables/player';
import StatsOverviewCards from './StatsOverviewCards.vue';

// 类型定义
interface LibraryStats {
  total_songs: number;
  total_duration: number;  // 秒
  total_file_size: number; // 字节
  favorite_count: number;
}

type ScopeType = 'All' | 'Playlist' | 'Folder' | 'Artist';
type TimeRangeType = 'All' | 'Days7' | 'Days30' | 'ThisYear';

// Rust 端需要的 scope 结构（带 type 标签的判别联合）
type StatisticsScope = 
  | { type: 'All' }
  | { type: 'Playlist'; song_paths: string[] }
  | { type: 'Folder'; path: string }
  | { type: 'Artist'; name: string };

type TimeRange = { type: TimeRangeType };

const { favoritePaths, playlists } = usePlayer();

const stats = ref<LibraryStats | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

// 当前选择的范围
const currentScope = ref<ScopeType>('All');
const currentScopeValue = ref<string>(''); // 歌单名/文件夹路径/歌手名
const currentTimeRange = ref<TimeRangeType>('All');

// 收藏率计算
const favoriteRate = computed(() => {
  if (!stats.value || stats.value.total_songs === 0) return 0;
  return (stats.value.favorite_count / stats.value.total_songs) * 100;
});

// 构建 Rust 端需要的 scope 对象
function buildScope(): StatisticsScope {
  switch (currentScope.value) {
    case 'All':
      return { type: 'All' };
    case 'Playlist': {
      // 根据歌单名找到歌单，获取歌曲路径
      const pl = playlists.value.find(p => p.name === currentScopeValue.value);
      return { type: 'Playlist', song_paths: pl?.songPaths ?? [] };
    }
    case 'Folder':
      return { type: 'Folder', path: currentScopeValue.value };
    case 'Artist':
      return { type: 'Artist', name: currentScopeValue.value };
    default:
      return { type: 'All' };
  }
}

async function fetchStats() {
  loading.value = true;
  error.value = null;
  try {
    const scope = buildScope();
    const timeRange: TimeRange = { type: currentTimeRange.value };
    
    stats.value = await invoke<LibraryStats>('get_statistics', {
      scope,
      timeRange,
      favoritePaths: favoritePaths.value
    });
  } catch (e) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
}



// 暴露方法和状态供父组件调用
defineExpose({ 
  fetchStats,
  currentScope,
  currentScopeValue,
  currentTimeRange,
});

onMounted(() => {
  fetchStats();
});
</script>

<template>
  <div class="statistics-page h-full overflow-y-auto custom-scrollbar w-full">
    <!-- Content -->
    <div class="px-6 py-6">
      <!-- Loading State -->
      <div v-if="loading && !stats" class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div v-for="i in 4" :key="i" class="h-24 rounded-xl bg-gray-100/50 dark:bg-white/5 animate-pulse"></div>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="p-6 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
        <p class="text-red-600 dark:text-red-400">加载失败：{{ error }}</p>
        <button @click="fetchStats" class="mt-2 px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors">
          重试
        </button>
      </div>

      <!-- Empty State -->
      <div v-else-if="stats && stats.total_songs === 0" class="text-center py-12">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
        <p class="text-gray-500 dark:text-gray-400 text-lg">
          {{ currentScope === 'All' ? '暂无数据' : '该范围内暂无歌曲' }}
        </p>
        <p class="text-gray-400 dark:text-gray-500 text-sm mt-1">
          {{ currentScope === 'All' ? '先去扫描本地文件夹吧' : '尝试选择其他统计范围' }}
        </p>
      </div>

      <!-- Stats Content -->
      <StatsOverviewCards
        v-else-if="stats"
        :total-songs="stats.total_songs"
        :total-duration="stats.total_duration"
        :total-file-size="stats.total_file_size"
        :favorite-rate="favoriteRate"
      />
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 10px;
}
.dark .custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
}
</style>
