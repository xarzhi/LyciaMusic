<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { 
  Music, 
  Disc, 
  Mic2, 
  Clock, 
  Database, 
  Zap 
} from 'lucide-vue-next';

// 控制"本月新增"标签显示
const showMonthlyBadge = ref(true);
let badgeTimer: ReturnType<typeof setTimeout> | null = null;

onMounted(() => {
  // 3秒后开始淡出
  badgeTimer = setTimeout(() => {
    showMonthlyBadge.value = false;
  }, 3000);
});

onUnmounted(() => {
  if (badgeTimer) {
    clearTimeout(badgeTimer);
  }
});

const props = defineProps<{
  totalSongs: number;
  albumCount: number;
  artistCount: number;
  totalDuration: number;
  totalFileSize: number;
  losslessCount: number;
  thisMonthAdded: number;
  hiddenCards: Set<string>;
  expandedCard: string | null;
}>();

const emit = defineEmits<{
  hide: [title: string];
  'card-click': [title: string];
}>();

// 判断卡片是否可点击
const isClickable = (title: string) => title === '无损占比' || title === '库大小';

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

// 所有卡片配置
// 采用邻近色系：蓝色 -> 紫色 -> 粉色，避免颜色过于跳跃
const allCards = computed(() => [
  {
    title: '总曲目',
    value: props.totalSongs.toLocaleString(),
    subtitle: props.thisMonthAdded > 0 ? `本月 +${props.thisMonthAdded}` : null,
    icon: Music,
    // Blue
    colorClass: 'text-blue-500 dark:text-blue-400',
    bgClass: 'bg-blue-500/10 dark:bg-blue-400/10',
    borderClass: 'group-hover:border-blue-500/30'
  },
  {
    title: '专辑',
    value: props.albumCount.toLocaleString(),
    icon: Disc,
    // Indigo
    colorClass: 'text-indigo-500 dark:text-indigo-400',
    bgClass: 'bg-indigo-500/10 dark:bg-indigo-400/10',
    borderClass: 'group-hover:border-indigo-500/30'
  },
  {
    title: '歌手',
    value: props.artistCount.toLocaleString(),
    icon: Mic2,
    // Violet
    colorClass: 'text-violet-500 dark:text-violet-400',
    bgClass: 'bg-violet-500/10 dark:bg-violet-400/10',
    borderClass: 'group-hover:border-violet-500/30'
  },
  {
    title: '总时长',
    value: formattedDuration.value,
    icon: Clock,
    // Purple
    colorClass: 'text-purple-500 dark:text-purple-400',
    bgClass: 'bg-purple-500/10 dark:bg-purple-400/10',
    borderClass: 'group-hover:border-purple-500/30'
  },
  {
    title: '库大小',
    value: formattedSize.value,
    icon: Database,
    // Fuchsia
    colorClass: 'text-fuchsia-500 dark:text-fuchsia-400',
    bgClass: 'bg-fuchsia-500/10 dark:bg-fuchsia-400/10',
    borderClass: 'group-hover:border-fuchsia-500/30'
  },
  {
    title: '无损占比',
    value: losslessRate.value,
    icon: Zap,
    // Pink
    colorClass: 'text-pink-500 dark:text-pink-400',
    bgClass: 'bg-pink-500/10 dark:bg-pink-400/10',
    borderClass: 'group-hover:border-pink-500/30'
  }
]);
</script>

<template>
  <section>
    <!-- 所有卡片：在大屏上一行显示 6 个 -->
    <div v-if="allCards.some(c => !hiddenCards.has(c.title))" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
      <template v-for="(card, index) in allCards" :key="card.title">
        <div
          v-if="!hiddenCards.has(card.title)"
          class="stat-card relative overflow-hidden rounded-xl p-4 backdrop-blur-md bg-white/40 dark:bg-white/5 border border-white/20 dark:border-white/5 transition-all duration-300 hover:scale-[1.02] group animate-slide-up-fade"
          :class="[
            'hover:bg-white/60 dark:hover:bg-white/10', 
            card.borderClass,
            isClickable(card.title) ? 'cursor-pointer' : '',
            expandedCard === card.title && card.title === '无损占比' ? 'ring-2 ring-pink-500/50 bg-white/60 dark:bg-white/10' : '',
            expandedCard === card.title && card.title === '库大小' ? 'ring-2 ring-fuchsia-500/50 bg-white/60 dark:bg-white/10' : ''
          ]"
          :style="{ animationDelay: `${index * 100}ms` }"
          @click="isClickable(card.title) && emit('card-click', card.title)"
        >
          <!-- Clickable Indicator for expandable cards - positioned at bottom right -->
          <div 
            v-if="isClickable(card.title)" 
            class="absolute right-3 bottom-3 opacity-30 group-hover:opacity-100 transition-opacity duration-300"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              class="h-4 w-4 transition-transform duration-300"
              :class="[
                expandedCard === card.title ? 'rotate-180' : '',
                card.title === '无损占比' ? 'text-pink-500' : 'text-fuchsia-500'
              ]"
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          <!-- Close Button with Corner Hover Zone -->
          <div class="close-zone absolute top-0 right-0 w-10 h-10 z-20">
            <button 
              @click.stop="emit('hide', card.title)"
              class="absolute top-2 right-2 p-1 rounded-full bg-black/5 dark:bg-white/5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 opacity-0 close-btn transition-opacity duration-200"
              title="隐藏此卡片"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <!-- Content -->
          <div class="relative z-10 flex flex-col h-full justify-between">
            <div class="flex items-start justify-between mb-2">
               <!-- Icon Container -->
              <div :class="['p-2 rounded-lg transition-colors duration-300', card.bgClass, card.colorClass]">
                <component :is="card.icon" :stroke-width="1.5" class="w-5 h-5" />
              </div>
            </div>

            <div>
               <!-- Title -->
              <p class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">{{ card.title }}</p>
              
              <!-- Value and Subtitle -->
              <div class="flex items-baseline gap-2 flex-nowrap">
                <p class="text-xl font-bold text-gray-900 dark:text-white tracking-tight">{{ card.value }}</p>
                
                <!-- Subtitle (本月+N) -->
                <Transition name="fade">
                  <p v-if="card.subtitle && showMonthlyBadge" class="text-[10px] text-emerald-500 dark:text-emerald-400 font-medium bg-emerald-500/10 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                    {{ card.subtitle }}
                  </p>
                </Transition>

              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.stat-card {
  height: 120px;
}

/* 右上角热区悬停时显示删除按钮 */
.close-zone:hover .close-btn {
  opacity: 1;
}

/* 淡出动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

