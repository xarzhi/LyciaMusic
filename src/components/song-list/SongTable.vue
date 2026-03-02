<script setup lang="ts">
import { ref, computed, watch, reactive, onMounted, onUnmounted } from 'vue';
import { Song, usePlayer, dragSession } from '../../composables/player';
import { currentSong, isPlaying } from '../../composables/playerState';
import { useSettings } from '../../composables/settings';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import QualityBadge from '../common/QualityBadge.vue';

const { settings } = useSettings();

const props = defineProps<{
  songs: Song[];
  isBatchMode: boolean;
  selectedPaths: Set<string>;
}>();

const emit = defineEmits<{
  (e: 'play', song: Song): void;
  (e: 'contextmenu', event: MouseEvent, song: Song): void;
  (e: 'update:selectedPaths', newSet: Set<string>): void;
  (e: 'drag-start', payload: { event: MouseEvent; song: Song; index: number }): void; 
}>();

const { isFavorite, toggleFavorite, formatDuration, currentViewMode } = usePlayer();

// --- 虚拟滚动逻辑 ---
const ROW_HEIGHT = 72;
const containerRef = ref<HTMLElement | null>(null);
const scrollTop = ref(0);
const containerHeight = ref(600);

const updateContainerHeight = () => {
  if (containerRef.value) containerHeight.value = containerRef.value.clientHeight;
};

const virtualData = computed(() => {
  const total = props.songs.length;
  const start = Math.floor(scrollTop.value / ROW_HEIGHT);
  const visibleCount = Math.ceil(containerHeight.value / ROW_HEIGHT);
  const buffer = 5;
  const renderStart = Math.max(0, start - buffer);
  const renderEnd = Math.min(total, start + visibleCount + buffer);
  
  return {
    items: props.songs.slice(renderStart, renderEnd).map((song, index) => ({
      ...song,
      virtualIndex: renderStart + index
    })),
    paddingTop: renderStart * ROW_HEIGHT,
    paddingBottom: (total - renderEnd) * ROW_HEIGHT,
  };
});

const onScroll = (e: Event) => {
  scrollTop.value = (e.target as HTMLElement).scrollTop;
};

// --- LRU Cache ---
const MAX_CACHE_SIZE = 200;
const coverCache = reactive(new Map<string, string>());
const loadingSet = new Set<string>();

const updateCache = (key: string, value: string) => {
  if (coverCache.has(key)) coverCache.delete(key);
  else if (coverCache.size >= MAX_CACHE_SIZE) {
    const firstKey = coverCache.keys().next().value;
    if (firstKey) coverCache.delete(firstKey);
  }
  coverCache.set(key, value);
};

const loadCoverDebounced = (() => {
  let timer: any = null;
  return (items: any[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      items.forEach(async (song) => {
        if (coverCache.has(song.path) || loadingSet.has(song.path)) return;
        loadingSet.add(song.path);
        try {
          const filePath = await invoke<string>('get_song_cover_thumbnail', { path: song.path });
          if (filePath) updateCache(song.path, convertFileSrc(filePath));
          else updateCache(song.path, '');
        } catch { updateCache(song.path, ''); } 
        finally { loadingSet.delete(song.path); }
      });
    }, 20);
  };
})();

watch(() => virtualData.value.items, (newItems) => loadCoverDebounced(newItems), { immediate: true });

const handleMouseDown = (e: MouseEvent, song: Song, index: number) => {
  if (e.button !== 0) return;
  emit('drag-start', { event: e, song, index });
};



const showDragIcon = computed(() => ['folder', 'playlist', 'all', 'artist', 'album', 'genre', 'year'].includes(currentViewMode.value));

onMounted(() => {
  window.addEventListener('resize', updateContainerHeight);
  if (containerRef.value) updateContainerHeight();
});
onUnmounted(() => {
  window.removeEventListener('resize', updateContainerHeight);
});

defineExpose({ containerRef });

// --- 🔥 CSS Transform 计算逻辑 ---
const getRowStyle = (songIndex: number, songPath: string) => {
  const baseStyle: any = { height: `${ROW_HEIGHT}px` };

  if (!dragSession.active || dragSession.insertIndex === -1) return baseStyle;

  const dragSourcePath = dragSession.songs[0]?.path;
  const dragIndex = props.songs.findIndex(s => s.path === dragSourcePath);
  const targetIndex = dragSession.insertIndex;

  // 1. 被拖拽的行：瞬移到目标位置
  if (songPath === dragSourcePath) {
    const diff = targetIndex - dragIndex;
    return {
      ...baseStyle,
      transform: `translateY(${diff * 100}%)`,
      transition: 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)',
      opacity: 0, 
      zIndex: 0
    };
  }

  // 2. 其他行：让位逻辑
  let translateY = 0;
  
  if (targetIndex > dragIndex) {
    // 向下拖拽：中间的行向上移
    if (songIndex > dragIndex && songIndex <= targetIndex) {
      translateY = -100;
    }
  } else if (targetIndex < dragIndex) {
    // 向上拖拽：中间的行向下移
    if (songIndex >= targetIndex && songIndex < dragIndex) {
      translateY = 100;
    }
  }

  if (translateY !== 0) {
    return {
      ...baseStyle,
      transform: `translateY(${translateY}%)`,
      transition: 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)',
      zIndex: 1
    };
  }

  return { ...baseStyle, transition: 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)' };
};
</script>

<template>
  <div 
    ref="containerRef" 
    class="flex-1 overflow-y-auto pl-2.5 pr-3 pb-8 custom-scrollbar song-list-scroll-container" 
    @scroll="onScroll"
  >
    <div class="w-full relative">
      <div :style="{ height: virtualData.paddingTop + 'px' }"></div>

      <div v-for="song in virtualData.items" :key="song.path" 
        :data-index="song.virtualIndex"
        @mousedown="handleMouseDown($event, song, song.virtualIndex)" 
        @dblclick="!isBatchMode && emit('play', song)"
        @contextmenu.prevent="emit('contextmenu', $event, song)"
        @dragstart.prevent
        class="group border-b border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5 select-none cursor-default relative flex items-center px-2 gap-3" 
        :class="{ 'bg-red-500/10 dark:bg-red-500/20': selectedPaths.has(song.path) }"
        :style="getRowStyle(song.virtualIndex, song.path)"
      >
        <!-- 左侧：序号 / 勾选 -->
        <div class="w-10 shrink-0 flex items-center justify-center">
          <div v-if="isBatchMode" class="flex items-center justify-center">
            <input type="checkbox" :checked="selectedPaths.has(song.path)" class="rounded text-[#EC4141] focus:ring-[#EC4141] pointer-events-none" />
          </div>
          <!-- 正在播放：频谱动画 -->
          <div v-else-if="currentSong?.path === song.path && isPlaying" class="flex items-center justify-center gap-[3px] w-5 h-5">
            <span class="spectrum-bar w-[3px] rounded-full bg-[#EC4141]" style="animation-delay: 0s"></span>
            <span class="spectrum-bar w-[3px] rounded-full bg-[#EC4141]" style="animation-delay: 0.2s"></span>
            <span class="spectrum-bar w-[3px] rounded-full bg-[#EC4141]" style="animation-delay: 0.4s"></span>
          </div>
          <!-- 已暂停：静态频谱 -->
          <div v-else-if="currentSong?.path === song.path && !isPlaying" class="flex items-center justify-center gap-[3px] w-5 h-5">
            <span class="w-[3px] h-[6px] rounded-full bg-[#EC4141]/60"></span>
            <span class="w-[3px] h-[10px] rounded-full bg-[#EC4141]/60"></span>
            <span class="w-[3px] h-[4px] rounded-full bg-[#EC4141]/60"></span>
          </div>
          <!-- 默认：圆点 / hover 拖拽 -->
          <div v-else class="flex items-center justify-center">
            <span class="text-xs font-mono text-gray-400 dark:text-white/40 group-hover:hidden">
              {{ song.virtualIndex + 1 < 10 ? '0' + (song.virtualIndex + 1) : song.virtualIndex + 1 }}
            </span>
            <div class="hidden group-hover:flex items-center justify-center transition-opacity duration-200">
              <span v-if="showDragIcon" class="text-gray-500 dark:text-white/60 active:text-[#EC4141] cursor-grab">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </span>
              <span v-else class="text-gray-500 dark:text-white/60">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" />
                </svg>
              </span>
            </div>
          </div>
        </div>

        <!-- 封面图 -->
        <div class="w-12 h-12 rounded-lg bg-gray-200/50 dark:bg-white/5 flex items-center justify-center shrink-0 overflow-hidden text-gray-400 dark:text-white/40 relative border border-black/5 dark:border-white/5">
          <img v-if="coverCache.get(song.path)" :src="coverCache.get(song.path)" class="w-full h-full object-cover transition-opacity duration-300" alt="Cover"/>
          <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 opacity-40 absolute inset-0 m-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
        </div>

        <!-- 双行文字区域 -->
        <div class="w-[40%] shrink-0 min-w-0 flex flex-col justify-center gap-0.5">
          <!-- 第一行：歌曲标题 -->
          <span class="text-[15px] text-gray-900 dark:text-gray-100 font-semibold truncate leading-snug">{{ song.title || song.name.replace(/\.[^/.]+$/, "") }}</span>
          <!-- 第二行：音质标签 + 歌手 -->
          <div class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-white/50 leading-snug">
            <QualityBadge
              v-if="settings.showQualityBadges"
              class="shrink-0"
              :bitrate="song.bitrate || 0"
              :sample-rate="song.sample_rate || 0"
              :bit-depth="song.bit_depth || 0"
              :format="song.format || ''"
            />
            <span class="truncate">{{ song.artist }}</span>
          </div>
        </div>

        <!-- 中间：专辑名 -->
        <div class="flex-1 min-w-0 truncate text-xs text-gray-500 dark:text-white/40">
          {{ song.album }}
        </div>

        <!-- 右侧：收藏 + 时长 -->
        <div class="shrink-0 flex items-center gap-3 text-xs font-mono text-gray-500 dark:text-white/50" :class="{'opacity-20 pointer-events-none': dragSession.active}">
          <button v-if="!isBatchMode" @click.stop="toggleFavorite(song)" class="focus:outline-none">
            <svg v-if="isFavorite(song)" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-[#EC4141]" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd" /></svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-400 dark:text-white/40 hover:text-gray-600 dark:hover:text-white opacity-0 group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
          </button>
          <span class="w-10 text-right">{{ formatDuration(song.duration) }}</span>
        </div>
      </div>

      <div :style="{ height: virtualData.paddingBottom + 'px' }"></div>
    </div>
    
    <div v-if="songs.length === 0" class="py-20 text-center select-none text-gray-500 dark:text-white/60">
      {{ currentViewMode === 'folder' ? '该文件夹内暂无歌曲' : (currentViewMode === 'playlist' ? '歌单暂无歌曲' : '列表为空') }}
    </div>
  </div>
</template>

<style scoped>
.spectrum-bar {
  animation: spectrum 1s ease-in-out infinite;
}

@keyframes spectrum {
  0%, 100% { height: 4px; }
  25% { height: 14px; }
  50% { height: 6px; }
  75% { height: 12px; }
}
</style>
