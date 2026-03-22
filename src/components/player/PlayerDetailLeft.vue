<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useCoverCache } from '../../composables/useCoverCache';
import { usePlaybackController } from '../../composables/usePlaybackController';
import FooterContextMenu from "../overlays/FooterContextMenu.vue";

const props = defineProps<{
  isExpanded?: boolean;
}>();

const { 
  currentSong, currentCover, isPlaying, dominantColors
} = usePlaybackController();
const { loadCover } = useCoverCache();

const showContextMenu = ref(false);
const contextMenuX = ref(0);
const contextMenuY = ref(0);
const currentSongPath = computed(() => currentSong.value?.path ?? '');

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
const bigCoverCache = new Map<string, string>();
const bigCoverPath = ref('');
const localCoverPath = ref('');
const reflectionCoverUrl = ref('');
let coverRequestId = 0;
let reflectionRequestId = 0;

const normalizeCoverUrl = (path: string) => {
  if (!path) return '';
  if (
    path.startsWith('http://')
    || path.startsWith('https://')
    || path.startsWith('data:')
    || path.startsWith('asset:')
    || path.startsWith('tauri:')
  ) {
    return path;
  }
  return convertFileSrc(path);
};

const currentBigCoverUrl = computed(() =>
  bigCoverPath.value === currentSongPath.value ? bigCoverUrl.value : ''
);
const currentLocalCoverUrl = computed(() =>
  localCoverPath.value === currentSongPath.value ? localCoverUrl.value : ''
);

const preloadImage = (src: string) => new Promise<boolean>((resolve) => {
  if (!src) {
    resolve(false);
    return;
  }

  const image = new Image();
  image.decoding = 'async';
  image.onload = () => resolve(true);
  image.onerror = () => resolve(false);
  image.src = src;
});

watch(currentSongPath, async (path) => {
  const requestId = ++coverRequestId;
  bigCoverLoaded.value = false;

  if (!path) {
    bigCoverUrl.value = '';
    localCoverUrl.value = '';
    bigCoverPath.value = '';
    localCoverPath.value = '';
    reflectionCoverUrl.value = '';
    return;
  }

  const cachedBigCoverUrl = bigCoverCache.get(path) || '';
  bigCoverUrl.value = cachedBigCoverUrl;
  bigCoverPath.value = cachedBigCoverUrl ? path : '';

  try {
    const cachedThumbUrl = await loadCover(path);
    if (requestId !== coverRequestId || path !== currentSongPath.value) return;
    localCoverUrl.value = cachedThumbUrl || '';
    localCoverPath.value = path;
  } catch {
    if (requestId !== coverRequestId || path !== currentSongPath.value) return;
    localCoverUrl.value = '';
    localCoverPath.value = path;
  }
}, { immediate: true });

watch(() => currentCover.value, (cover) => {
  const path = currentSongPath.value;
  if (!path) {
    bigCoverUrl.value = '';
    bigCoverPath.value = '';
    bigCoverLoaded.value = false;
    return;
  }

  const resolvedUrl = normalizeCoverUrl(cover);
  bigCoverCache.set(path, resolvedUrl);
  bigCoverUrl.value = resolvedUrl;
  bigCoverPath.value = path;
  bigCoverLoaded.value = false;
}, { immediate: true });

watch([currentSongPath, currentLocalCoverUrl, currentBigCoverUrl], async ([path, localUrl, bigUrl]) => {
  const requestId = ++reflectionRequestId;

  if (!path) {
    reflectionCoverUrl.value = '';
    return;
  }

  // Reflection does not benefit from full-size art. Prefer the current song's
  // thumbnail so the source changes at most once and the node never hard-remounts.
  const nextReflectionUrl = localUrl || bigUrl || '';
  if (!nextReflectionUrl) {
    reflectionCoverUrl.value = '';
    return;
  }

  if (nextReflectionUrl === reflectionCoverUrl.value) {
    return;
  }

  const loaded = await preloadImage(nextReflectionUrl);
  if (!loaded || requestId !== reflectionRequestId || path !== currentSongPath.value) return;
  reflectionCoverUrl.value = nextReflectionUrl;
}, { immediate: true });

const onBigCoverLoad = () => {
  bigCoverLoaded.value = true;
};

const onBigCoverError = () => {
  bigCoverLoaded.value = false;
};

const detailCoverRef = ref<HTMLElement | null>(null);
defineExpose({ detailCoverRef });
</script>

<template>
  <div class="pointer-events-none" @contextmenu="handleContextMenu">
    
    <!-- Album Art -->
    <div 
      ref="detailCoverRef"
      class="absolute aspect-square transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] z-50 will-change-transform pointer-events-auto"
      :class="props.isExpanded ? 'top-[45%] left-[calc(75px+18%)] -translate-x-1/2 -translate-y-1/2 w-[clamp(220px,45vh,580px)] rounded-2xl' : 'top-[calc(100vh-64px)] left-[16px] translate-x-0 translate-y-0 w-12 rounded-lg pointer-events-none'"
      :style="{ 
        boxShadow: props.isExpanded && isPlaying
          ? `0 30px 60px -12px rgba(0,0,0,0.6), 0 18px 36px -18px rgba(0,0,0,0.7), 0 0 80px -20px ${dominantColors[0]}44` 
          : (props.isExpanded ? `0 10px 20px -5px rgba(0,0,0,0.4)` : 'none'),
        transform: props.isExpanded ? (isPlaying ? 'scale(1)' : 'scale(1)') : 'scale(1)',
        opacity: 1,
      }"
    >
      <!-- Main Cover Container -->
      <div class="w-full h-full rounded-[inherit] overflow-hidden relative isolate z-20">
        <img v-if="currentLocalCoverUrl" :key="`thumb:${currentSongPath}:${currentLocalCoverUrl}`" :src="currentLocalCoverUrl" class="absolute inset-0 w-full h-full object-cover select-none transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] z-10" :class="props.isExpanded ? 'scale-100' : 'scale-125'" draggable="false" decoding="async" />
        <img v-if="currentBigCoverUrl" :key="`big:${currentSongPath}:${currentBigCoverUrl}`" :src="currentBigCoverUrl" @load="onBigCoverLoad" @error="onBigCoverError" class="absolute inset-0 w-full h-full object-cover select-none transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] z-20" :class="[props.isExpanded ? 'scale-100' : 'scale-125', bigCoverLoaded ? 'opacity-100' : 'opacity-0']" draggable="false" decoding="async" />
        <div v-if="!currentLocalCoverUrl && !currentBigCoverUrl" class="absolute inset-0 w-full h-full bg-white/5 flex items-center justify-center text-white/10 z-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-32 w-32" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
        </div>
      </div>

      <!-- Glass Table Reflection Layer -->
      <transition name="reflection-reveal" appear>
        <div v-if="props.isExpanded" class="absolute top-[calc(100%+2px)] left-0 w-full h-[65%] pointer-events-none z-10 reflection-wrapper rounded-[inherit] overflow-hidden">
          <div class="absolute inset-0 reflection-glass rounded-[inherit] overflow-hidden">
            <img v-if="reflectionCoverUrl" :src="reflectionCoverUrl" class="absolute top-0 left-0 w-full aspect-square object-cover scale-y-[-1]" draggable="false" decoding="async" />
          </div>
        </div>
      </transition>
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
.reflection-wrapper {
  perspective: 1500px;
  transform-origin: top;
  /* rotateX(50deg) 让倒影铺在桌面上 */
  /* skewX(-15deg) 让它变成平行四边形 */
  /* scale(1.1) 补偿旋转带来的视觉缩小，确保边缘对齐 */
  transform: rotateX(40deg) skewX(-18deg) scale(1.01);
  opacity: 0.2;
}

.reflection-glass {
  -webkit-mask-image: linear-gradient(
    to bottom,
    black 0%,
    rgba(0, 0, 0, 0.5) 30%,
    transparent 85%
  );
  mask-image: linear-gradient(
    to bottom,
    black 0%,
    rgba(0, 0, 0, 0.5) 30%,
    transparent 85%
  );
}

.reflection-reveal-enter-active,
.reflection-reveal-appear-active {
  transition:
    transform 560ms cubic-bezier(0.22, 1, 0.36, 1) 220ms,
    opacity 420ms ease-out 220ms,
    filter 560ms cubic-bezier(0.22, 1, 0.36, 1) 220ms;
}

.reflection-reveal-leave-active {
  transition:
    transform 220ms cubic-bezier(0.4, 0, 0.2, 1),
    opacity 180ms ease-in,
    filter 220ms cubic-bezier(0.4, 0, 0.2, 1);
}

.reflection-reveal-enter-from,
.reflection-reveal-appear-from,
.reflection-reveal-leave-to {
  opacity: 0;
  filter: blur(10px);
}

.reflection-reveal-enter-from,
.reflection-reveal-appear-from {
  transform: translateY(-18px) rotateX(58deg) skewX(-22deg) scale(0.96);
}

.reflection-reveal-leave-to {
  transform: translateY(-10px) rotateX(48deg) skewX(-20deg) scale(0.985);
}
</style>
