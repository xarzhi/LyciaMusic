<script setup lang="ts">
import { ref, watch } from 'vue';
import { usePlayer } from '../../composables/player';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import FooterContextMenu from "../overlays/FooterContextMenu.vue";

const props = defineProps<{
  isExpanded?: boolean;
}>();

const { 
  currentSong, isPlaying, dominantColors
} = usePlayer();

// --- Context Menu State ---
const showContextMenu = ref(false);
const contextMenuX = ref(0);
const contextMenuY = ref(0);

const handleContextMenu = (e: MouseEvent) => {
  if (!currentSong.value) return;
  e.preventDefault();
  contextMenuX.value = e.clientX;
  contextMenuY.value = e.clientY;
  showContextMenu.value = true;
};

const bigCoverUrl = ref('');
const localCoverUrl = ref('');

// 获取高清大图及小图
watch(currentSong, async (newSong) => {
  if (newSong && newSong.path) {
    try {
      // 获取小图 (作为占位符)
      const thumbPath = await invoke<string>('get_song_cover_thumbnail', { path: newSong.path });
      if (thumbPath) {
        localCoverUrl.value = convertFileSrc(thumbPath);
      } else {
        localCoverUrl.value = '';
      }
      // 获取大图
      const path = await invoke<string>('get_song_cover', { path: newSong.path });
      if (path) {
        bigCoverUrl.value = convertFileSrc(path);
      } else {
        bigCoverUrl.value = '';
      }
    } catch (e) {
      bigCoverUrl.value = '';
      localCoverUrl.value = '';
    }
  } else {
    bigCoverUrl.value = '';
    localCoverUrl.value = '';
  }
}, { immediate: true });

// --- 暴露封面 ref 给父组件 ---
const detailCoverRef = ref<HTMLElement | null>(null);
defineExpose({ detailCoverRef });
</script>

<template>
  <div class="pointer-events-none" @contextmenu="handleContextMenu">
    
    <!-- Album Art -->
    <div 
      ref="detailCoverRef"
      class="absolute transition-all duration-700 cubic-bezier(0.34,1.56,0.64,1) z-50 will-change-transform detail-cover-reflect pointer-events-auto"
      :class="props.isExpanded ? 'top-1/2 left-[25%] -translate-x-1/2 -translate-y-[45%] w-[clamp(280px,40vw,480px)] aspect-square rounded-2xl' : 'top-[16px] left-[16px] translate-x-0 translate-y-0 w-12 h-12 rounded-lg pointer-events-none'"
      :style="{ 
        boxShadow: props.isExpanded && isPlaying
          ? `0 30px 60px -12px rgba(0,0,0,0.6), 0 18px 36px -18px rgba(0,0,0,0.7), 0 0 80px -20px ${dominantColors[0]}44` 
          : (props.isExpanded ? `0 10px 20px -5px rgba(0,0,0,0.4)` : 'none'),
        transform: props.isExpanded ? (isPlaying ? 'scale(1)' : 'scale(1)') : 'scale(1)',
        opacity: 1,
      }"
    >
      <img v-if="bigCoverUrl" :src="bigCoverUrl" class="w-full h-full object-cover select-none transition-transform duration-700" :class="props.isExpanded ? 'scale-100' : 'scale-125'" draggable="false" />
      <img v-else-if="localCoverUrl" :src="localCoverUrl" class="w-full h-full object-cover select-none transition-transform duration-700" :class="props.isExpanded ? 'scale-100' : 'scale-125'" draggable="false" />
      <div v-else class="w-full h-full bg-white/5 flex items-center justify-center text-white/10">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-32 w-32" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
      </div>
    </div>

    <FooterContextMenu 
      :visible="showContextMenu" 
      :x="contextMenuX" 
      :y="contextMenuY" 
      :path="currentSong?.path || ''"
      @close="showContextMenu = false"
    />

  </div>
</template>

<style scoped>
/* 封面倒影效果 */
.detail-cover-reflect {
  -webkit-box-reflect: below 8px 
    linear-gradient(
      to bottom,
      transparent 0%,
      rgba(0, 0, 0, 0.15) 35%,
      transparent 100%
    );
}
</style>