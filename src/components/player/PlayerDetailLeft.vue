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
const bigCoverLoaded = ref(false);
let coverRequestId = 0;

// Fetch thumbnail and full-size cover for the current song.
watch(currentSong, async (newSong) => {
  const requestId = ++coverRequestId;
  bigCoverLoaded.value = false;

  if (newSong && newSong.path) {
    try {
      const thumbPath = await invoke<string>('get_song_cover_thumbnail', { path: newSong.path });
      if (requestId !== coverRequestId) return;

      localCoverUrl.value = thumbPath ? convertFileSrc(thumbPath) : '';

      const path = await invoke<string>('get_song_cover', { path: newSong.path });
      if (requestId !== coverRequestId) return;

      bigCoverUrl.value = path ? convertFileSrc(path) : '';
    } catch {
      if (requestId !== coverRequestId) return;
      bigCoverUrl.value = '';
      localCoverUrl.value = '';
    }
  } else {
    if (requestId !== coverRequestId) return;
    bigCoverUrl.value = '';
    localCoverUrl.value = '';
  }
}, { immediate: true });

const onBigCoverLoad = () => {
  bigCoverLoaded.value = true;
};

// --- 鏆撮湶灏侀潰 ref 缁欑埗缁勪欢 ---
const detailCoverRef = ref<HTMLElement | null>(null);
defineExpose({ detailCoverRef });
</script>

<template>
  <div class="pointer-events-none" @contextmenu="handleContextMenu">
    
    <!-- Album Art -->
    <div 
      ref="detailCoverRef"
      class="absolute aspect-square transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] z-50 will-change-transform detail-cover-reflect pointer-events-auto"
      :class="props.isExpanded ? 'top-[45%] left-[calc(100px+18%)] -translate-x-1/2 -translate-y-1/2 w-[clamp(220px,45vh,580px)] rounded-2xl' : 'top-[calc(100vh-64px)] left-[16px] translate-x-0 translate-y-0 w-12 rounded-lg pointer-events-none'"
      :style="{ 
        boxShadow: props.isExpanded && isPlaying
          ? `0 30px 60px -12px rgba(0,0,0,0.6), 0 18px 36px -18px rgba(0,0,0,0.7), 0 0 80px -20px ${dominantColors[0]}44` 
          : (props.isExpanded ? `0 10px 20px -5px rgba(0,0,0,0.4)` : 'none'),
        transform: props.isExpanded ? (isPlaying ? 'scale(1)' : 'scale(1)') : 'scale(1)',
        opacity: 1,
      }"
    >
      <div class="w-full h-full rounded-[inherit] overflow-hidden relative isolate">
        <!-- 鍗犱綅鍥?(灏忓浘) -->
        <img v-if="localCoverUrl" :src="localCoverUrl" class="absolute inset-0 w-full h-full object-cover select-none transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] z-10" :class="props.isExpanded ? 'scale-100' : 'scale-125'" draggable="false" decoding="async" />
        
        <!-- 楂樻竻澶у浘 (鍔犺浇瀹屽悗娓愭樉閬洊灞€閮? -->
        <img v-show="bigCoverUrl" :src="bigCoverUrl" @load="onBigCoverLoad" class="absolute inset-0 w-full h-full object-cover select-none transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] z-20" :class="[props.isExpanded ? 'scale-100' : 'scale-125', bigCoverLoaded ? 'opacity-100' : 'opacity-0']" draggable="false" decoding="async" />
        
        <!-- 鏃犲浘鏃剁殑榛樿鍙戝厜鍏冪礌 -->
        <div v-if="!localCoverUrl && !bigCoverUrl" class="absolute inset-0 w-full h-full bg-white/5 flex items-center justify-center text-white/10 z-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-32 w-32" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
        </div>
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
/* 灏侀潰鍊掑奖鏁堟灉 */
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
