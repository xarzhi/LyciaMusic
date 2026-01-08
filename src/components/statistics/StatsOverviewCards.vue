<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  totalSongs: number;
  totalDuration: number;  // 秒
  totalFileSize: number;  // 字节
  favoriteRate: number;   // 百分比
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

// 格式化收藏率
const formattedFavoriteRate = computed(() => {
  return props.favoriteRate.toFixed(1) + '%';
});

const cards = computed(() => [
  {
    title: '总曲目',
    value: props.totalSongs.toLocaleString(),
    icon: 'music',
    gradient: 'from-blue-500 to-cyan-400'
  },
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
    title: '收藏率',
    value: formattedFavoriteRate.value,
    icon: 'heart',
    gradient: 'from-rose-500 to-red-400'
  }
]);
</script>

<template>
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
    <div
      v-for="card in cards"
      :key="card.title"
      class="stat-card relative overflow-hidden rounded-xl p-4 backdrop-blur-md bg-white/60 dark:bg-white/5 border border-white/20 dark:border-white/10 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02] group"
    >
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
          <!-- Clock Icon -->
          <svg v-else-if="card.icon === 'clock'" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <!-- Database Icon -->
          <svg v-else-if="card.icon === 'database'" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
          </svg>
          <!-- Heart Icon -->
          <svg v-else-if="card.icon === 'heart'" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </div>
        
        <!-- Title -->
        <p class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{{ card.title }}</p>
        
        <!-- Value -->
        <p class="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">{{ card.value }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stat-card {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s ease;
}
</style>
