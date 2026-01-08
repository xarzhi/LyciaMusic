<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { usePlayer } from '../../composables/player';
import StatsOverviewCards from './StatsOverviewCards.vue';
import BehaviorStatsSection from './BehaviorStatsSection.vue';

// 类型定义
interface LibraryStats {
  total_songs: number;
  total_duration: number;  // 秒
  total_file_size: number; // 字节
  favorite_count: number;
}

interface TopSong {
  song_path: string;
  play_count: number;
  value: number;
}

interface BehaviorStats {
  total_plays: number;
  total_duration: number;
  top_songs: TopSong[];
  top_songs_by_duration: TopSong[];
  hour_distribution: number[];
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
const behaviorStats = ref<BehaviorStats | null>(null);
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

// 行为统计的独立时间范围
const currentBehaviorTimeRange = ref<TimeRangeType>('Days7');
const behaviorTimeOptions: { label: string; value: TimeRangeType }[] = [
  { label: '近7天', value: 'Days7' },
  { label: '近30天', value: 'Days30' },
  { label: '今年', value: 'ThisYear' },
  { label: '全部', value: 'All' },
];

function updateBehaviorTime(range: TimeRangeType) {
  currentBehaviorTimeRange.value = range;
  // watcher will handle fetch
}

async function fetchBehaviorStats() {
  try {
    const scope = buildScope();
    const timeRange: TimeRange = { type: currentBehaviorTimeRange.value };
    behaviorStats.value = await invoke<BehaviorStats>('get_behavior_stats', { 
      scope, 
      timeRange 
    });
  } catch (e) {
    console.warn('Failed to fetch behavior stats:', e);
  }
}

// 监听 scope 变化，刷新两边
// 监听 behaviorTime 变化，只刷新行为
watch([currentScope, currentScopeValue], () => {
  fetchStats();
  fetchBehaviorStats();
});

watch(currentBehaviorTimeRange, () => {
  fetchBehaviorStats();
});
// 我们可以共用一个 watch，或者在 fetchStats 调用时顺便调用 fetchBehaviorStats?
// 为了解耦 UI 部分刷新，我们可以分别 watch。
// 但 StatisticsPage 目前的逻辑是：StatsOverviewCards 用 fetchStats，BehaviorStatsSection 用 fetchBehaviorStats。
// 它们都依赖 currentScope。

watch([currentScope, currentScopeValue], () => {
  fetchStats();
  fetchBehaviorStats();
});

// 暴露方法和状态供父组件调用
defineExpose({ 
  fetchStats,
  currentScope,
  currentScopeValue,
  currentTimeRange,
});

onMounted(() => {
  fetchStats();
  fetchBehaviorStats();
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
      <template v-else-if="stats">
        
        <!-- Section 1: 曲库概览 -->
        <section class="mb-10">
          <div class="flex items-center gap-2 mb-4">
            <h2 class="text-lg font-bold text-gray-900 dark:text-gray-100">曲库概览</h2>
            
            <!-- 语义标签: 入库语义 -->
            <div class="group relative flex items-center">
              <span class="px-2 py-0.5 rounded text-xs font-medium bg-blue-100/50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800/30">
                入库
              </span>
              <!-- Tooltip -->
              <div class="absolute bottom-full left-0 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 hidden group-hover:block">
                基于歌曲入库时间 (added_at) 统计，用于观察曲库规模变化。
              </div>
            </div>
            
            <div class="ml-auto">
               <!-- 这里复用 DetailHeader 传递下来的时间选择器逻辑吗？ 
                    目前 StatisticsHeader 把 currentTimeRange 传下来了。
                    所以不需要在这里重复放 Selector，主要依靠顶部的 Selector。
               -->
               <span class="text-xs text-gray-400">时间范围：顶部控制</span>
            </div>
          </div>

          <StatsOverviewCards
            :total-songs="stats.total_songs"
            :total-duration="stats.total_duration"
            :total-file-size="stats.total_file_size"
            :favorite-rate="favoriteRate"
          />
        </section>

        <!-- Divider -->
        <hr class="border-gray-100 dark:border-gray-800 mb-10" />

        <!-- Section 2: 听歌行为 -->
        <section>
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-2">
              <h2 class="text-lg font-bold text-gray-900 dark:text-gray-100">
                听歌行为
              </h2>

              <!-- 语义标签: 播放语义 -->
              <div class="group relative flex items-center">
                <span class="px-2 py-0.5 rounded text-xs font-medium bg-purple-100/50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border border-purple-200 dark:border-purple-800/30">
                  播放
                </span>
                <!-- Tooltip -->
                <div class="absolute bottom-full left-0 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 hidden group-hover:block">
                  基于实际播放时间 (played_at) 统计，反映您的听歌习惯。
                </div>
              </div>
            </div>

            <!-- 独立时间选择器 -->
             <div class="flex items-center bg-gray-100 dark:bg-white/5 rounded-lg p-0.5">
              <button 
                v-for="range in behaviorTimeOptions" 
                :key="range.value"
                @click="updateBehaviorTime(range.value)"
                class="px-3 py-1 text-xs rounded-md transition-all duration-200"
                :class="currentBehaviorTimeRange === range.value 
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' 
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'"
              >
                {{ range.label }}
              </button>
            </div>
          </div>
          
          <div class="mb-4 text-xs text-gray-400">
             范围：{{ currentScope === 'All' ? '全库' : (currentScope === 'Folder' ? '当前文件夹' : currentScope) }}
             <span class="mx-1">|</span>
             时间：按播放记录统计（独立于上方入库时间）
          </div>

          <BehaviorStatsSection
            v-if="behaviorStats"
            :total-plays7d="behaviorStats.total_plays"
            :total-duration="behaviorStats.total_duration"
            :top-songs7d="behaviorStats.top_songs"
            :top-songs-by-duration="behaviorStats.top_songs_by_duration"
            :hour-distribution="behaviorStats.hour_distribution"
          />
        </section>
      </template>
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
