<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import StatsOverviewCards from './StatsOverviewCards.vue';
import BehaviorStatsSection from './BehaviorStatsSection.vue';

// 类型定义
interface LibraryStats {
  total_songs: number;
  total_duration: number;
  total_file_size: number;
  album_count: number;
  artist_count: number;
  lossless_count: number;
  hires_count: number;
  this_month_added: number;
}

interface TopSong {
  song_path: string;
  play_count: number;
  value: number;
}

interface TopArtist {
  artist: string;
  play_count: number;
}

interface TopAlbum {
  album: string;
  play_count: number;
}

interface BehaviorStats {
  total_plays: number;
  total_duration: number;
  top_songs: TopSong[];
  top_songs_by_duration: TopSong[];
  top_artists: TopArtist[];
  top_albums: TopAlbum[];
  hour_distribution: number[];
  recent_activity: number[];
}

type TimeRangeType = 'All' | 'Days7' | 'Days30' | 'ThisYear';
type TimeRange = { type: TimeRangeType };

const stats = ref<LibraryStats | null>(null);
const behaviorStats = ref<BehaviorStats | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const lastUpdated = ref<Date | null>(null);
const isRefreshing = ref(false);

// 行为统计时间范围
const currentBehaviorTimeRange = ref<TimeRangeType>('Days7');
const behaviorTimeOptions: { label: string; value: TimeRangeType }[] = [
  { label: '近7天', value: 'Days7' },
  { label: '近30天', value: 'Days30' },
  { label: '今年', value: 'ThisYear' },
  { label: '全部', value: 'All' },
];

function updateBehaviorTime(range: TimeRangeType) {
  currentBehaviorTimeRange.value = range;
  fetchBehaviorStats();
}

async function fetchStats() {
  try {
    stats.value = await invoke<LibraryStats>('get_library_stats');
  } catch (e) {
    console.warn('Failed to fetch library stats:', e);
    error.value = String(e);
  }
}

async function fetchBehaviorStats() {
  try {
    const timeRange: TimeRange = { type: currentBehaviorTimeRange.value };
    behaviorStats.value = await invoke<BehaviorStats>('get_behavior_stats', { timeRange });
  } catch (e) {
    console.warn('Failed to fetch behavior stats:', e);
  }
}

// 刷新按钮：并发请求 + 防抖
async function handleRefresh() {
  if (isRefreshing.value) return;
  isRefreshing.value = true;
  
  try {
    await Promise.all([fetchStats(), fetchBehaviorStats()]);
    lastUpdated.value = new Date();
  } finally {
    isRefreshing.value = false;
  }
}

// 隐藏卡片管理
const hiddenCards = ref<Set<string>>(new Set());
const showManager = ref(false);

// 从 localStorage 加载隐藏设置
function loadHiddenSettings() {
  const saved = localStorage.getItem('lycia-hidden-stats-cards');
  if (saved) {
    try {
      hiddenCards.value = new Set(JSON.parse(saved));
    } catch (e) {
      console.error('Failed to parse hidden cards settings:', e);
    }
  }
}

// 保存隐藏设置
function saveHiddenSettings() {
  localStorage.setItem('lycia-hidden-stats-cards', JSON.stringify(Array.from(hiddenCards.value)));
}

function toggleCardVisibility(cardTitle: string) {
  if (hiddenCards.value.has(cardTitle)) {
    hiddenCards.value.delete(cardTitle);
  } else {
    hiddenCards.value.add(cardTitle);
  }
  saveHiddenSettings();
}

function hideCard(cardTitle: string) {
  hiddenCards.value.add(cardTitle);
  saveHiddenSettings();
}

onMounted(async () => {
  loadHiddenSettings();
  loading.value = true;
  error.value = null;
  try {
    await Promise.all([fetchStats(), fetchBehaviorStats()]);
    lastUpdated.value = new Date();
  } catch (e) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="statistics-page h-full overflow-y-auto custom-scrollbar w-full select-none">
    <div class="px-6 py-6">
      <!-- Loading State -->
      <div v-if="loading && !stats" class="grid grid-cols-3 gap-4">
        <div v-for="i in 6" :key="i" class="h-24 rounded-xl bg-gray-100/50 dark:bg-white/5 animate-pulse"></div>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="p-6 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
        <p class="text-red-600 dark:text-red-400">加载失败：{{ error }}</p>
        <button @click="handleRefresh" class="mt-2 px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors">
          重试
        </button>
      </div>

      <!-- Empty State -->
      <div v-else-if="stats && stats.total_songs === 0" class="text-center py-12">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
        <p class="text-gray-500 dark:text-gray-400 text-lg">暂无数据</p>
        <p class="text-gray-400 dark:text-gray-500 text-sm mt-1">先去设置中添加音乐库文件夹吧</p>
      </div>

      <!-- Stats Content -->
      <template v-else-if="stats">
        <div class="flex items-center justify-between mb-4 animate-fade-in-up" style="animation-delay: 0ms;">
          <h2 class="text-lg font-bold text-gray-900 dark:text-gray-100 italic flex items-center gap-2">
            曲库概览
            <button 
              @click="showManager = !showManager"
              class="text-[10px] font-normal not-italic px-1.5 py-0.5 rounded border border-gray-200 dark:border-white/10 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              :class="{ 'bg-blue-500/10 text-blue-500 border-blue-500/20': showManager }"
            >
              管理卡片
            </button>
          </h2>
          
          <div class="flex items-center gap-3">
            <span v-if="lastUpdated" class="text-xs text-gray-400 dark:text-gray-500">
              更新于 {{ lastUpdated.toLocaleTimeString() }}
            </span>
            <button 
              @click="handleRefresh"
              class="bg-white/1 hover:bg-white/10 border border-white/1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 w-7 h-7 flex items-center justify-center rounded-full transition active:scale-95 shadow-sm hover:border-gray-200 dark:hover:border-white/20"
              :class="{ 'animate-spin': isRefreshing }"
              :disabled="isRefreshing"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        <!-- 卡片管理器 -->
        <transition
          enter-active-class="transition duration-200 ease-out"
          enter-from-class="transform -translate-y-2 opacity-0"
          enter-to-class="transform translate-y-0 opacity-100"
          leave-active-class="transition duration-150 ease-in"
          leave-from-class="transform translate-y-0 opacity-100"
          leave-to-class="transform -translate-y-2 opacity-0"
        >
          <div v-if="showManager" class="mb-6 p-4 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10">
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">勾选以显示卡片：</p>
            <div class="flex flex-wrap gap-x-6 gap-y-2">
              <label v-for="c in ['总曲目', '专辑', '歌手', '总时长', '库大小', '无损占比', '总听歌时长', '播放次数', '最活跃时段', '最常播放 (按次数)', '最常播放 (按时长)', '24 小时播放分布', '常听歌手', '常听专辑']" :key="c" class="flex items-center gap-2 cursor-pointer group">
                <input 
                  type="checkbox" 
                  :checked="!hiddenCards.has(c)" 
                  @change="toggleCardVisibility(c)"
                  class="w-3.5 h-3.5 rounded border-gray-300 text-blue-500 focus:ring-blue-500/20"
                />
                <span class="text-xs text-gray-600 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                  {{ c }}
                </span>
              </label>
            </div>
          </div>
        </transition>

        <!-- Section 1: 曲库概览 -->
        <StatsOverviewCards
          :total-songs="stats.total_songs"
          :total-duration="stats.total_duration"
          :total-file-size="stats.total_file_size"
          :album-count="stats.album_count"
          :artist-count="stats.artist_count"
          :lossless-count="stats.lossless_count"
          :this-month-added="stats.this_month_added"
          :hidden-cards="hiddenCards"
          @hide="hideCard"
        />

        <!-- Divider -->
        <hr class="border-gray-100 dark:border-gray-800 my-8 animate-fade-in" style="animation-delay: 600ms;" />

        <!-- Section 2: 听歌行为 -->
        <section class="mt-8 animate-fade-in-up" style="animation-delay: 700ms;"> <!-- Added top margin -->
          <div class="flex items-center justify-between mb-6"> <!-- Increased bottom margin -->
            <h2 class="text-lg font-bold text-gray-900 dark:text-gray-100 italic">听歌行为</h2>

            <!-- Segmented Control 时间选择器 -->
             <div class="relative bg-gray-100 dark:bg-white/5 rounded-lg p-1 shrink-0 grid grid-cols-4" style="min-width: 240px;">
               <!-- Gliding Background - 使用 transform 实现滑动动画 -->
               <div
                 class="rounded-md bg-white dark:bg-gray-700 shadow-sm transition-transform duration-300 ease-spring row-start-1 col-start-1"
                 :style="{
                   transform: `translateX(${behaviorTimeOptions.findIndex(o => o.value === currentBehaviorTimeRange) * 100}%)`
                 }"
               ></div>

              <button 
                v-for="(range, index) in behaviorTimeOptions" 
                :key="range.value"
                @click="updateBehaviorTime(range.value)"
                class="row-start-1 z-10 px-2 py-1.5 text-xs font-medium rounded-md transition-colors duration-200 text-center whitespace-nowrap"
                :style="{ gridColumn: index + 1 }"
                :class="currentBehaviorTimeRange === range.value 
                  ? 'text-gray-900 dark:text-white' 
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
              >
                {{ range.label }}
              </button>
            </div>
          </div>

          <BehaviorStatsSection
            v-if="behaviorStats"
            :total-plays7d="behaviorStats.total_plays"
            :total-duration="behaviorStats.total_duration"
            :top-songs7d="behaviorStats.top_songs"
            :top-songs-by-duration="behaviorStats.top_songs_by_duration"
            :top-artists="behaviorStats.top_artists"
            :top-albums="behaviorStats.top_albums"
            :hour-distribution="behaviorStats.hour_distribution"
            :recent-activity="behaviorStats.recent_activity"
            :hidden-cards="hiddenCards"
            @hide="hideCard"
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

<style>
/* 统一入场动画定义 */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
    filter: blur(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
    filter: blur(0);
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes slideUpFade {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.98);
    filter: blur(2px);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0);
  }
}

/* 柱状图生长动画 */
@keyframes barGrow {
  from {
    transform: scaleY(0);
    opacity: 0;
  }
  to {
    transform: scaleY(1);
    opacity: 1;
  }
}

/* 数字计数动画（弹跳效果） */
@keyframes popIn {
  0% {
    opacity: 0;
    transform: scale(0.8);
  }
  60% {
    transform: scale(1.05);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

/* 渐变扫光效果（用于分割线） */
@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

.animate-fade-in-up {
  opacity: 0;
  animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.animate-fade-in {
  opacity: 0;
  animation: fadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.animate-slide-up-fade {
  opacity: 0;
  animation: slideUpFade 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.animate-pop-in {
  opacity: 0;
  animation: popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

/* 分割线渐变扫光 */
hr.animate-fade-in {
  background: linear-gradient(
    90deg, 
    transparent, 
    rgba(99, 102, 241, 0.3), 
    transparent
  );
  background-size: 200% 100%;
  animation: fadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards,
             shimmer 2s ease-in-out 0.5s;
  border: none;
  height: 1px;
}

/* 卡片悬停时的微动效 */
.animate-slide-up-fade:hover {
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* prefer-reduced-motion 支持 */
@media (prefers-reduced-motion: reduce) {
  .animate-fade-in-up,
  .animate-fade-in,
  .animate-slide-up-fade,
  .animate-pop-in {
    animation: none;
    opacity: 1;
    transform: none;
    filter: none;
  }
}
</style>
