<script setup lang="ts">
import { computed } from 'vue';
import { usePlayer } from '../../composables/player';

interface TopSong {
  song_path: string;
  play_count: number;
  value: number; // Generic value (count or duration)
}

interface TopArtist {
  artist: string;
  play_count: number;
}

interface TopAlbum {
  album: string;
  play_count: number;
}

const props = defineProps<{
  totalPlays7d: number;
  totalDuration: number;
  topSongs7d: TopSong[];
  topSongsByDuration: TopSong[];
  topArtists: TopArtist[];
  topAlbums: TopAlbum[];
  hourDistribution: number[];
  hiddenCards: Set<string>;
}>();

const emit = defineEmits<{
  hide: [title: string];
}>();

const { songList } = usePlayer();

// 根据路径查找歌曲信息
function getSongInfo(path: string) {
  const song = songList.value.find(s => s.path === path);
  return song ? { title: song.title || '未知歌曲', artist: song.artist || '未知艺术家' } : { title: path.split(/[/\\]/).pop() || '未知', artist: '未知艺术家' };
}

// 格式化时长
function formatDuration(seconds: number) {
  if (!seconds) return "0秒";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) return `${hours}小时 ${minutes}分钟`;
  return `${minutes}分钟 ${Math.floor(seconds % 60)}秒`;
}

function formatDurationShort(seconds: number) {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    return `${mins}m`;
}

// Top Songs
// (Split into two columns, no longer need tab switching state)

// 小时分布的最大值（用于计算柱状图高度）
const maxHourCount = computed(() => Math.max(...props.hourDistribution, 1));

// 找出最活跃的时段
const peakHour = computed(() => {
  let maxIdx = 0;
  for (let i = 1; i < props.hourDistribution.length; i++) {
    if (props.hourDistribution[i] > props.hourDistribution[maxIdx]) {
      maxIdx = i;
    }
  }
  return maxIdx;
});

// 时段描述
function getHourLabel(hour: number): string {
  if (hour >= 6 && hour < 12) return '上午';
  if (hour >= 12 && hour < 14) return '中午';
  if (hour >= 14 && hour < 18) return '下午';
  if (hour >= 18 && hour < 22) return '晚上';
  return '深夜';
}

const peakTimeDesc = computed(() => {
  const h = peakHour.value;
  return `${getHourLabel(h)} ${h}:00 - ${h + 1}:00`;
});
</script>

<template>
  <div class="behavior-stats mt-6 space-y-6">
    <!-- 顶层卡片网格 -->
    <div v-if="!hiddenCards.has('总听歌时长') || !hiddenCards.has('播放次数') || !hiddenCards.has('最活跃时段')" class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <!-- 播放总时长 (新) -->
      <div v-if="!hiddenCards.has('总听歌时长')" class="stat-card relative overflow-hidden rounded-xl p-4 backdrop-blur-md bg-white/60 dark:bg-white/5 border border-white/20 dark:border-white/10 shadow-lg group">
        <!-- Close Button -->
        <button 
          @click.stop="emit('hide', '总听歌时长')"
          class="absolute top-2 right-2 z-20 p-1 rounded-full bg-black/5 dark:bg-white/5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
          title="隐藏此卡片"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div class="absolute inset-0 opacity-10 dark:opacity-20 bg-gradient-to-br from-pink-500 to-rose-400"></div>
        <div class="relative z-10">
          <div class="w-10 h-10 rounded-lg flex items-center justify-center mb-3 bg-gradient-to-br from-pink-500 to-rose-400 text-white shadow-md">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">总听歌时长</p>
          <p class="text-xl font-bold text-gray-900 dark:text-white tracking-tight">{{ formatDuration(totalDuration) }}</p>
        </div>
      </div>

      <!-- 播放次数 -->
      <div v-if="!hiddenCards.has('播放次数')" class="stat-card relative overflow-hidden rounded-xl p-4 backdrop-blur-md bg-white/60 dark:bg-white/5 border border-white/20 dark:border-white/10 shadow-lg group">
        <!-- Close Button -->
        <button 
          @click.stop="emit('hide', '播放次数')"
          class="absolute top-2 right-2 z-20 p-1 rounded-full bg-black/5 dark:bg-white/5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
          title="隐藏此卡片"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div class="absolute inset-0 opacity-10 dark:opacity-20 bg-gradient-to-br from-green-500 to-emerald-400"></div>
        <div class="relative z-10">
          <div class="w-10 h-10 rounded-lg flex items-center justify-center mb-3 bg-gradient-to-br from-green-500 to-emerald-400 text-white shadow-md">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">播放次数</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">{{ totalPlays7d }}</p>
        </div>
      </div>

      <!-- 最活跃时段 -->
      <div v-if="!hiddenCards.has('最活跃时段')" class="stat-card relative overflow-hidden rounded-xl p-4 backdrop-blur-md bg-white/60 dark:bg-white/5 border border-white/20 dark:border-white/10 shadow-lg group">
        <!-- Close Button -->
        <button 
          @click.stop="emit('hide', '最活跃时段')"
          class="absolute top-2 right-2 z-20 p-1 rounded-full bg-black/5 dark:bg-white/5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
          title="隐藏此卡片"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div class="absolute inset-0 opacity-10 dark:opacity-20 bg-gradient-to-br from-indigo-500 to-violet-400"></div>
        <div class="relative z-10">
          <div class="w-10 h-10 rounded-lg flex items-center justify-center mb-3 bg-gradient-to-br from-indigo-500 to-violet-400 text-white shadow-md">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <p class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">最活跃时段</p>
          <p class="text-xl font-bold text-gray-900 dark:text-white tracking-tight">{{ peakTimeDesc }}</p>
        </div>
      </div>
    </div>

    <!-- Top 3 歌曲 (双栏布局) -->
    <div v-if="!hiddenCards.has('最常播放 (按次数)') || !hiddenCards.has('最常播放 (按时长)')" class="grid grid-cols-1 md:grid-cols-2 gap-4">
      
      <!-- 左侧: 按次数 -->
      <div v-if="!hiddenCards.has('最常播放 (按次数)') && topSongs7d.length > 0" class="relative rounded-xl p-4 backdrop-blur-md bg-white/60 dark:bg-white/5 border border-white/20 dark:border-white/10 shadow-lg group">
        <!-- Close Button -->
        <button 
          @click.stop="emit('hide', '最常播放 (按次数)')"
          class="absolute top-2 right-2 z-20 p-1 rounded-full bg-black/5 dark:bg-white/5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
          title="隐藏此卡片"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h4 class="text-sm font-medium text-gray-600 dark:text-gray-300 mb-3 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
          最常播放 (按次数)
        </h4>
        <div class="space-y-2">
          <div
            v-for="(song, index) in topSongs7d"
            :key="song.song_path"
            class="flex items-center gap-3 p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <!-- 排名 -->
            <div :class="[
              'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
              index === 0 ? 'bg-yellow-400 text-yellow-900' :
              index === 1 ? 'bg-gray-300 text-gray-700' :
              'bg-amber-600 text-amber-100'
            ]">
              {{ index + 1 }}
            </div>
            <!-- 歌曲信息 -->
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                {{ getSongInfo(song.song_path).title }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400 truncate">
                {{ getSongInfo(song.song_path).artist }}
              </p>
            </div>
            <!-- 数值展示 -->
            <div class="text-sm text-gray-500 dark:text-gray-400 text-right">
              {{ song.value }} 次
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧: 按时长 -->
      <div v-if="!hiddenCards.has('最常播放 (按时长)') && topSongsByDuration.length > 0" class="relative rounded-xl p-4 backdrop-blur-md bg-white/60 dark:bg-white/5 border border-white/20 dark:border-white/10 shadow-lg group">
        <!-- Close Button -->
        <button 
          @click.stop="emit('hide', '最常播放 (按时长)')"
          class="absolute top-2 right-2 z-20 p-1 rounded-full bg-black/5 dark:bg-white/5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
          title="隐藏此卡片"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h4 class="text-sm font-medium text-gray-600 dark:text-gray-300 mb-3 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          最常播放 (按时长)
        </h4>
        <div class="space-y-2">
          <div
            v-for="(song, index) in topSongsByDuration"
            :key="song.song_path"
            class="flex items-center gap-3 p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <!-- 排名 -->
            <div :class="[
              'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
              index === 0 ? 'bg-pink-400 text-pink-900' :
              index === 1 ? 'bg-gray-300 text-gray-700' :
              'bg-pink-700 text-pink-100'
            ]">
              {{ index + 1 }}
            </div>
            <!-- 歌曲信息 -->
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                {{ getSongInfo(song.song_path).title }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400 truncate">
                {{ getSongInfo(song.song_path).artist }}
              </p>
            </div>
            <!-- 数值展示 -->
            <div class="text-sm text-gray-500 dark:text-gray-400 text-right">
              {{ formatDurationShort(song.value) }}
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- 三列排行榜：常听歌曲、常听歌手、常听专辑 -->
    <div v-if="!hiddenCards.has('常听歌曲') || !hiddenCards.has('常听歌手') || !hiddenCards.has('常听专辑')" class="grid grid-cols-1 md:grid-cols-3 gap-4">
      
      <!-- 常听歌曲 Top 5 -->
      <div v-if="!hiddenCards.has('常听歌曲')" class="relative rounded-xl p-4 backdrop-blur-md bg-white/60 dark:bg-white/5 border border-white/20 dark:border-white/10 shadow-lg group">
        <button 
          @click.stop="emit('hide', '常听歌曲')"
          class="absolute top-2 right-2 z-20 p-1 rounded-full bg-black/5 dark:bg-white/5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
          title="隐藏此卡片"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h4 class="text-sm font-medium text-gray-600 dark:text-gray-300 mb-3 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
          常听歌曲
        </h4>
        <div v-if="topSongs7d.length > 0" class="space-y-2">
          <div
            v-for="(song, index) in topSongs7d.slice(0, 5)"
            :key="song.song_path"
            class="flex items-center gap-3 p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <div :class="[
              'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
              index === 0 ? 'bg-yellow-400 text-yellow-900' :
              index === 1 ? 'bg-gray-300 text-gray-700' :
              index === 2 ? 'bg-amber-600 text-amber-100' :
              'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
            ]">
              {{ index + 1 }}
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate" :title="getSongInfo(song.song_path).title">
                {{ getSongInfo(song.song_path).title }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400 truncate" :title="getSongInfo(song.song_path).artist">
                {{ getSongInfo(song.song_path).artist }}
              </p>
            </div>
            <div class="text-xs text-gray-400 dark:text-gray-500 shrink-0">
              {{ song.value }} 次
            </div>
          </div>
        </div>
        <div v-else class="text-center py-6 text-gray-400 dark:text-gray-500 text-sm">
          暂无数据，去播放几首歌吧
        </div>
      </div>

      <!-- 常听歌手 Top 5 -->
      <div v-if="!hiddenCards.has('常听歌手')" class="relative rounded-xl p-4 backdrop-blur-md bg-white/60 dark:bg-white/5 border border-white/20 dark:border-white/10 shadow-lg group">
        <button 
          @click.stop="emit('hide', '常听歌手')"
          class="absolute top-2 right-2 z-20 p-1 rounded-full bg-black/5 dark:bg-white/5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
          title="隐藏此卡片"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h4 class="text-sm font-medium text-gray-600 dark:text-gray-300 mb-3 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          常听歌手
        </h4>
        <div v-if="topArtists.length > 0" class="space-y-2">
          <div
            v-for="(artist, index) in topArtists"
            :key="artist.artist"
            class="flex items-center gap-3 p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <div :class="[
              'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
              index === 0 ? 'bg-yellow-400 text-yellow-900' :
              index === 1 ? 'bg-gray-300 text-gray-700' :
              index === 2 ? 'bg-amber-600 text-amber-100' :
              'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
            ]">
              {{ index + 1 }}
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate" :title="artist.artist">
                {{ artist.artist }}
              </p>
            </div>
            <div class="text-xs text-gray-400 dark:text-gray-500 shrink-0">
              {{ artist.play_count }} 次
            </div>
          </div>
        </div>
        <div v-else class="text-center py-6 text-gray-400 dark:text-gray-500 text-sm">
          暂无数据，去播放几首歌吧
        </div>
      </div>

      <!-- 常听专辑 Top 5 -->
      <div v-if="!hiddenCards.has('常听专辑')" class="relative rounded-xl p-4 backdrop-blur-md bg-white/60 dark:bg-white/5 border border-white/20 dark:border-white/10 shadow-lg group">
        <button 
          @click.stop="emit('hide', '常听专辑')"
          class="absolute top-2 right-2 z-20 p-1 rounded-full bg-black/5 dark:bg-white/5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
          title="隐藏此卡片"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h4 class="text-sm font-medium text-gray-600 dark:text-gray-300 mb-3 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          常听专辑
        </h4>
        <div v-if="topAlbums.length > 0" class="space-y-2">
          <div
            v-for="(album, index) in topAlbums"
            :key="album.album"
            class="flex items-center gap-3 p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <div :class="[
              'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
              index === 0 ? 'bg-yellow-400 text-yellow-900' :
              index === 1 ? 'bg-gray-300 text-gray-700' :
              index === 2 ? 'bg-amber-600 text-amber-100' :
              'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
            ]">
              {{ index + 1 }}
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate" :title="album.album">
                {{ album.album }}
              </p>
            </div>
            <div class="text-xs text-gray-400 dark:text-gray-500 shrink-0">
              {{ album.play_count }} 次
            </div>
          </div>
        </div>
        <div v-else class="text-center py-6 text-gray-400 dark:text-gray-500 text-sm">
          暂无数据，去播放几首歌吧
        </div>
      </div>
    </div>

    <!-- 小时分布图 -->
    <div v-if="!hiddenCards.has('24 小时播放分布')" class="relative rounded-xl p-4 backdrop-blur-md bg-white/60 dark:bg-white/5 border border-white/20 dark:border-white/10 shadow-lg group">
      <!-- Close Button -->
      <button 
        @click.stop="emit('hide', '24 小时播放分布')"
        class="absolute top-2 right-2 z-20 p-1 rounded-full bg-black/5 dark:bg-white/5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
        title="隐藏此卡片"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <h4 class="text-sm font-medium text-gray-600 dark:text-gray-300 mb-4 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        24 小时播放分布
      </h4>
      <div class="flex items-end gap-1 h-24">
        <div
          v-for="(count, hour) in hourDistribution"
          :key="hour"
          class="flex-1 flex flex-col items-center gap-1"
        >
          <div
            :style="{ height: `${(count / maxHourCount) * 100}%` }"
            :class="[
              'w-full rounded-t transition-all duration-300 min-h-[2px]',
              hour === peakHour ? 'bg-gradient-to-t from-green-500 to-emerald-400' : 'bg-gradient-to-t from-blue-400/60 to-cyan-300/60 dark:from-blue-500/40 dark:to-cyan-400/40'
            ]"
            :title="`${hour}:00 - ${count} 次`"
          ></div>
        </div>
      </div>
      <!-- 时间轴标签 -->
      <div class="flex justify-between mt-2 text-xs text-gray-400">
        <span>0</span>
        <span>6</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stat-card {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s ease;
  height: 135px;
  display: flex;
  flex-direction: column;
}
.stat-card:hover {
  transform: scale(1.02);
}
</style>
