<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  totalSongs: number;
  albumCount: number;
  artistCount: number;
  totalDuration: number;
  totalFileSize: number;
  losslessCount: number;
  thisMonthAdded: number;
  hiddenCards: Set<string>;
}>();

const emit = defineEmits<{
  hide: [title: string];
}>();

// 格式化时长 (秒 -> X天X小时X分)
const formattedDuration = computed(() => {
  const seconds = props.totalDuration;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) {
    return `${days}天${hours}小时`;
  } else if (hours > 0) {
    return `${hours}小时${minutes}分`;
  } else {
    return `${minutes}分钟`;
  }
});

// 格式化文件大小 (字节 -> GB/MB)
const formattedSize = computed(() => {
  const bytes = props.totalFileSize;
  if (bytes >= 1024 * 1024 * 1024) {
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  } else if (bytes >= 1024 * 1024) {
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  } else {
    return (bytes / 1024).toFixed(1) + ' KB';
  }
});

// 计算无损占比
const losslessRate = computed(() => {
  if (props.totalSongs === 0) return '0%';
  return ((props.losslessCount / props.totalSongs) * 100).toFixed(1) + '%';
});

// 第一行卡片：总曲目、专辑数、歌手数
const row1Cards = computed(() => [
  {
    title: '总曲目',
    value: props.totalSongs.toLocaleString(),
    subtitle: props.thisMonthAdded > 0 ? `本月 +${props.thisMonthAdded}` : null,
    icon: 'music',
    gradient: 'from-blue-500 to-cyan-400'
  },
  {
    title: '专辑',
    value: props.albumCount.toLocaleString(),
    icon: 'album',
    gradient: 'from-violet-500 to-purple-400'
  },
  {
    title: '歌手',
    value: props.artistCount.toLocaleString(),
    icon: 'artist',
    gradient: 'from-emerald-500 to-teal-400'
  }
]);

// 第二行卡片：总时长、库大小、无损占比
const row2Cards = computed(() => [
  {
    title: '总时长',
    value: formattedDuration.value,
    icon: 'clock',
    gradient: 'from-purple-500 to-pink-400'
  },
  {
    title: '库大小',
    value: formattedSize.value,
    icon: 'database',
    gradient: 'from-orange-500 to-amber-400'
  },
  {
    title: '无损占比',
    value: losslessRate.value,
    icon: 'hires',
    gradient: 'from-rose-500 to-red-400'
  }
]);
</script>

<template>
  <section>
    <!-- 第一行卡片 -->
    <div v-if="row1Cards.some(c => !hiddenCards.has(c.title))" class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
      <template v-for="card in row1Cards" :key="card.title">
        <div
          v-if="!hiddenCards.has(card.title)"
          class="stat-card relative overflow-hidden rounded-xl p-4 backdrop-blur-md bg-white/60 dark:bg-white/5 border border-white/20 dark:border-white/10 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02] group"
        >
          <!-- Close Button -->
          <button 
            @click.stop="emit('hide', card.title)"
            class="absolute top-2 right-2 z-20 p-1 rounded-full bg-black/5 dark:bg-white/5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
            title="隐藏此卡片"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        <!-- Gradient Background -->
        <div
          :class="['absolute inset-0 opacity-10 dark:opacity-20 bg-gradient-to-br', card.gradient]"
        ></div>
        
        <!-- Content -->
        <div class="relative z-10">
          <!-- Icon -->
          <div :class="['w-10 h-10 rounded-lg flex items-center justify-center mb-3 bg-gradient-to-br text-white shadow-md', card.gradient]">
            <!-- Music Icon -->
            <svg v-if="card.icon === 'music'" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
            <!-- Album Icon -->
            <svg v-else-if="card.icon === 'album'" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <!-- Artist Icon -->
            <svg v-else-if="card.icon === 'artist'" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          
          <!-- Title -->
          <p class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{{ card.title }}</p>
          
          <!-- Value and Subtitle -->
          <div class="flex items-baseline justify-between">
            <p class="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">{{ card.value }}</p>
            
            <!-- Subtitle (本月+N) -->
            <p v-if="card.subtitle" class="text-xs text-emerald-500 dark:text-emerald-400 font-medium">
              {{ card.subtitle }}
            </p>
          </div>
        </div>
        </div>
      </template>
    </div>

    <!-- 第二行卡片 -->
    <div v-if="row2Cards.some(c => !hiddenCards.has(c.title))" class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <template v-for="card in row2Cards" :key="card.title">
        <div
          v-if="!hiddenCards.has(card.title)"
          class="stat-card relative overflow-hidden rounded-xl p-4 backdrop-blur-md bg-white/60 dark:bg-white/5 border border-white/20 dark:border-white/10 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02] group"
        >
          <!-- Close Button -->
          <button 
            @click.stop="emit('hide', card.title)"
            class="absolute top-2 right-2 z-20 p-1 rounded-full bg-black/5 dark:bg-white/5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
            title="隐藏此卡片"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        <!-- Gradient Background -->
        <div
          :class="['absolute inset-0 opacity-10 dark:opacity-20 bg-gradient-to-br', card.gradient]"
        ></div>
        
        <!-- Content -->
        <div class="relative z-10">
          <!-- Icon -->
          <div :class="['w-10 h-10 rounded-lg flex items-center justify-center mb-3 bg-gradient-to-br text-white shadow-md', card.gradient]">
            <!-- Clock Icon -->
            <svg v-if="card.icon === 'clock'" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <!-- Database Icon -->
            <svg v-else-if="card.icon === 'database'" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
            </svg>
            <!-- HiRes Icon -->
            <svg v-else-if="card.icon === 'hires'" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          </div>
          
          <!-- Title -->
          <p class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{{ card.title }}</p>
          
          <!-- Value and Subtitle (Keep structure same as row1 for exact height) -->
          <div class="flex items-baseline justify-between">
            <p class="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">{{ card.value }}</p>
          </div>
        </div>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.stat-card {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s ease;
  height: 135px;
  display: flex;
  flex-direction: column;
}
</style>
