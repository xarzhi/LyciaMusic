<script setup lang="ts">
import { computed } from 'vue';
import { convertFileSrc } from '@tauri-apps/api/core';
import { usePlayer } from '../../composables/player';
import { useThemeSettings } from '../../composables/useThemeSettings';
import { useWindowMaterial } from '../../composables/windowMaterial';

const { currentCover, dominantColors, showPlayerDetail } = usePlayer();
const { theme, isDarkTheme } = useThemeSettings();
const { activeWindowMaterial } = useWindowMaterial();

const hasWindowMaterial = computed(() => activeWindowMaterial.value !== 'none');
const isMicaWindowMaterial = computed(() => activeWindowMaterial.value === 'mica');
const reduceDynamicEffects = computed(() => showPlayerDetail.value);

const activeBackgroundInfo = computed(() => {
  const currentTheme = theme.value;

  if (currentTheme.mode === 'custom' && currentTheme.customBackground.imagePath) {
    return {
      src: currentTheme.customBackground.imagePath,
      blur: currentTheme.customBackground.blur,
      opacity: currentTheme.customBackground.opacity,
      maskColor: currentTheme.customBackground.maskColor,
      maskAlpha: currentTheme.customBackground.maskAlpha,
      scale: currentTheme.customBackground.scale,
      isDynamic: false,
      type: 'custom' as const,
    };
  }

  if (currentTheme.dynamicBgType === 'flow') {
    return {
      src: currentCover.value,
      blur: 60,
      opacity: 0.9,
      isDynamic: true,
      type: 'flow' as const,
    };
  }

  if (currentTheme.dynamicBgType === 'blur') {
    return {
      src: currentCover.value,
      blur: 50,
      opacity: 0.7,
      scale: 1.5,
      isDynamic: false,
      type: 'blur' as const,
    };
  }

  return null;
});

const bgImageSrc = computed(() => {
  if (!activeBackgroundInfo.value?.src) return '';

  if (
    activeBackgroundInfo.value.src.startsWith('http') ||
    activeBackgroundInfo.value.src.startsWith('data:')
  ) {
    return activeBackgroundInfo.value.src;
  }

  return convertFileSrc(activeBackgroundInfo.value.src);
});

const dynamicShellClass = computed(() => {
  if (isMicaWindowMaterial.value) return 'bg-white/40 dark:bg-black/8';
  if (hasWindowMaterial.value) return 'bg-white/60 dark:bg-black/25';
  return 'bg-white dark:bg-[#1a1a1a]';
});

const dynamicBaseOpacity = computed(() => (isMicaWindowMaterial.value ? 0.14 : 0.4));
const dynamicBlobOpacity = computed(() => (isMicaWindowMaterial.value ? 0.2 : 0.6));
const dynamicNoiseOpacity = computed(() => (isMicaWindowMaterial.value ? 0.01 : 0.025));

const dynamicOverlayClass = computed(() => {
  if (isMicaWindowMaterial.value) return 'bg-white/[0.02] dark:bg-black/[0.06]';
  if (hasWindowMaterial.value) return 'bg-white/0 dark:bg-black/20';
  return 'bg-white/5 dark:bg-black/40';
});

const staticMaskClass = computed(() => {
  if (isMicaWindowMaterial.value) return 'bg-white/40 dark:bg-black/35';
  return 'bg-black/20';
});

const staticImageOpacity = computed(() => (isMicaWindowMaterial.value ? 0.35 : 1));

const materialScrimStyle = computed(() => {
  if (!hasWindowMaterial.value) {
    return null;
  }

  if (isDarkTheme.value) {
    return {
      backgroundColor: isMicaWindowMaterial.value ? 'rgba(14, 16, 18, 0.42)' : 'rgba(12, 14, 16, 0.34)',
    };
  }

  return {
    backgroundColor: isMicaWindowMaterial.value ? 'rgba(248, 249, 251, 0.62)' : 'rgba(250, 250, 252, 0.5)',
  };
});
</script>

<template>
  <div
    class="fixed inset-0 z-0 overflow-hidden pointer-events-none transition-colors duration-500"
    :class="[
      theme.mode === 'custom'
        ? 'bg-black'
        : hasWindowMaterial
          ? 'bg-transparent'
          : 'bg-[#fafafa] dark:bg-[#121212]',
    ]"
  >
    <div
      v-if="hasWindowMaterial"
      class="absolute inset-0 z-[1] transition-colors duration-500"
      :style="materialScrimStyle"
    ></div>

    <transition name="fade">
      <div
        v-if="activeBackgroundInfo?.isDynamic"
        class="absolute inset-0 overflow-hidden"
        :class="dynamicShellClass"
      >
        <div
          class="absolute inset-0 transition-colors duration-[1500ms]"
          :style="{ backgroundColor: dominantColors[0], opacity: dynamicBaseOpacity }"
        ></div>

        <div
          v-if="!reduceDynamicEffects"
          class="absolute inset-0 filter blur-[120px]"
          :style="{ opacity: dynamicBlobOpacity }"
        >
          <div
            class="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full mix-blend-multiply dark:mix-blend-screen animate-mesh-1 transition-colors duration-[1500ms]"
            :style="{ backgroundColor: dominantColors[1] }"
          ></div>
          <div
            class="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full mix-blend-multiply dark:mix-blend-screen animate-mesh-2 transition-colors duration-[1500ms]"
            :style="{ backgroundColor: dominantColors[2] || dominantColors[0] }"
          ></div>
          <div
            class="absolute top-[20%] right-[-10%] w-[70%] h-[70%] rounded-full mix-blend-multiply dark:mix-blend-screen animate-mesh-3 transition-colors duration-[1500ms]"
            :style="{ backgroundColor: dominantColors[3] || dominantColors[1] }"
          ></div>
        </div>

        <div
          v-if="!reduceDynamicEffects"
          class="absolute inset-0 pointer-events-none z-10 bg-noise"
          :style="{ opacity: dynamicNoiseOpacity }"
        ></div>

        <div class="absolute inset-0 z-20" :class="dynamicOverlayClass"></div>
      </div>
    </transition>

    <transition name="fade-fast">
      <div
        v-if="activeBackgroundInfo?.type === 'blur' && bgImageSrc"
        :key="bgImageSrc"
        class="absolute inset-0 bg-black"
        :style="{ filter: `brightness(${activeBackgroundInfo.opacity})` }"
      >
        <div class="absolute inset-0 z-10" :class="staticMaskClass"></div>
        <img
          :src="bgImageSrc"
          class="w-full h-full object-cover transition-all duration-1000 z-0"
          :style="{
            filter: `blur(${isMicaWindowMaterial ? Math.min(activeBackgroundInfo.blur, 26) : activeBackgroundInfo.blur}px)`,
            transform: `scale(${activeBackgroundInfo.scale})`,
            opacity: staticImageOpacity,
          }"
        />
      </div>
    </transition>

    <transition name="fade">
      <div v-if="activeBackgroundInfo?.type === 'custom' && bgImageSrc" class="absolute inset-0">
        <div
          v-if="activeBackgroundInfo.maskAlpha !== undefined && activeBackgroundInfo.maskAlpha > 0"
          class="absolute inset-0 z-10 transition-all duration-300"
          :style="{
            backgroundColor: activeBackgroundInfo.maskColor || '#000000',
            opacity: activeBackgroundInfo.maskAlpha,
          }"
        ></div>

        <img
          :src="bgImageSrc"
          class="w-full h-full object-cover transition-all duration-700 z-0"
          :style="{
            filter: `blur(${activeBackgroundInfo.blur}px) brightness(${activeBackgroundInfo.opacity ?? 1.0})`,
            transform: `scale(${activeBackgroundInfo.scale || 1.05})`,
          }"
        />
      </div>
    </transition>

    <div
      v-if="!activeBackgroundInfo"
      class="absolute inset-0 transition-colors duration-300"
      :class="hasWindowMaterial ? 'bg-transparent' : 'bg-white dark:bg-[#121212]'"
    ></div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 1s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-fast-enter-active,
.fade-fast-leave-active {
  transition: opacity 0.5s ease;
}

.fade-fast-enter-from,
.fade-fast-leave-to {
  opacity: 0;
}

.bg-noise {
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3%3Ffilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/feTurbulence%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
}

@keyframes mesh-1 {
  0% { transform: translate(-20%, 15%) scale(1) rotate(0deg); }
  25% { transform: translate(30%, -10%) scale(1.1) rotate(90deg); }
  50% { transform: translate(-15%, -25%) scale(0.9) rotate(180deg); }
  75% { transform: translate(25%, 20%) scale(1.05) rotate(270deg); }
  100% { transform: translate(-20%, 15%) scale(1) rotate(360deg); }
}

@keyframes mesh-2 {
  0% { transform: translate(25%, -20%) scale(1.1) rotate(0deg); }
  25% { transform: translate(-30%, -15%) scale(0.9) rotate(-90deg); }
  50% { transform: translate(20%, 25%) scale(1.2) rotate(-180deg); }
  75% { transform: translate(-25%, 10%) scale(1) rotate(-270deg); }
  100% { transform: translate(25%, -20%) scale(1.1) rotate(-360deg); }
}

@keyframes mesh-3 {
  0% { transform: translate(10%, 30%) scale(0.9) rotate(0deg); }
  25% { transform: translate(-25%, -20%) scale(1.2) rotate(90deg); }
  50% { transform: translate(30%, 15%) scale(1) rotate(180deg); }
  75% { transform: translate(-15%, -30%) scale(1.1) rotate(270deg); }
  100% { transform: translate(10%, 30%) scale(0.9) rotate(360deg); }
}

.animate-mesh-1 { animation: mesh-1 6s linear infinite; }
.animate-mesh-2 { animation: mesh-2 8s linear infinite; }
.animate-mesh-3 { animation: mesh-3 10s linear infinite; }
</style>
