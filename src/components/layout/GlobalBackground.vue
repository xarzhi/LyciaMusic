<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
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
const flowFallbackPalette = ['hsl(220, 28%, 34%)', 'hsl(196, 58%, 56%)', 'hsl(340, 52%, 58%)', 'hsl(42, 72%, 60%)'];
const FLOW_SCENE_TRANSITION_MS = 1180;

interface FlowLayerSnapshot {
  id: number;
  signature: string;
  state: 'entering' | 'current' | 'previous';
  shellClass: string;
  colors: string[];
  baseStyle: {
    opacity: number;
    background: string;
  };
  blobOpacity: number;
  noiseOpacity: number;
  overlayClass: string;
  overlayStyle: {
    opacity: number;
  };
  motionStyle: Record<string, string>;
  reduceDynamicEffects: boolean;
}

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

const flowColorBoostFactor = computed(() => theme.value.flowColorBoost / 100);
const flowDepthFactor = computed(() => theme.value.flowDepth / 100);
const flowSpeedFactor = computed(() => theme.value.flowSpeed / 100);
const flowTextureFactor = computed(() => theme.value.flowTexture / 100);

const resolvedFlowColors = computed(() => {
  const colors = dominantColors.value.filter(color => color && color !== 'transparent');
  return colors.length >= 3 ? colors : flowFallbackPalette;
});

const dynamicBaseOpacity = computed(() => {
  const baseOpacity = 0.44 + flowColorBoostFactor.value * 0.18 - flowDepthFactor.value * 0.06;
  return isMicaWindowMaterial.value ? Math.max(0.14, baseOpacity * 0.36) : Math.max(0.34, baseOpacity);
});

const dynamicBlobOpacity = computed(() => {
  const blobOpacity = 0.58 + flowColorBoostFactor.value * 0.2;
  return isMicaWindowMaterial.value ? Math.max(0.18, blobOpacity * 0.34) : Math.min(0.86, blobOpacity);
});

const dynamicNoiseOpacity = computed(() => {
  const noiseOpacity = 0.004 + flowTextureFactor.value * 0.022;
  return isMicaWindowMaterial.value ? noiseOpacity * 0.55 : noiseOpacity;
});

const flowMotionStyle = computed(() => {
  const speedFactor = flowSpeedFactor.value;
  const duration1 = 18 - speedFactor * 8;
  const duration2 = 22 - speedFactor * 9;
  const duration3 = 26 - speedFactor * 10;

  return {
    '--mesh-duration-1': `${duration1.toFixed(2)}s`,
    '--mesh-duration-2': `${duration2.toFixed(2)}s`,
    '--mesh-duration-3': `${duration3.toFixed(2)}s`,
  };
});

const dynamicBaseStyle = computed(() => {
  const [base, accent, edge, glow] = resolvedFlowColors.value;
  const depthFactor = flowDepthFactor.value;

  return {
    opacity: dynamicBaseOpacity.value,
    background: [
      `radial-gradient(circle at 18% 18%, ${accent} 0%, transparent ${38 + depthFactor * 8}%)`,
      `radial-gradient(circle at 82% 78%, ${glow || edge || base} 0%, transparent ${42 + depthFactor * 10}%)`,
      `linear-gradient(135deg, ${base} 0%, ${edge || accent || base} 100%)`,
    ].join(', '),
  };
});

const dynamicOverlayClass = computed(() => {
  if (isMicaWindowMaterial.value) return 'bg-white/[0.02] dark:bg-black/[0.08]';
  if (hasWindowMaterial.value) return 'bg-white/[0.02] dark:bg-black/[0.16]';
  return 'bg-white/[0.03] dark:bg-black/[0.22]';
});

const dynamicOverlayStyle = computed(() => {
  const overlayOpacity = 0.88 + flowDepthFactor.value * 0.26 - flowColorBoostFactor.value * 0.1;
  return { opacity: Math.min(1.08, Math.max(0.72, overlayOpacity)) };
});

const flowScene = computed(() => {
  if (activeBackgroundInfo.value?.type !== 'flow') {
    return null;
  }

  const colors = [...resolvedFlowColors.value];
  const baseStyle = { ...dynamicBaseStyle.value };
  const overlayStyle = { ...dynamicOverlayStyle.value };
  const motionStyle = { ...flowMotionStyle.value };
  const signature = JSON.stringify({
    colors,
    shellClass: dynamicShellClass.value,
    baseStyle,
    blobOpacity: dynamicBlobOpacity.value,
    noiseOpacity: dynamicNoiseOpacity.value,
    overlayClass: dynamicOverlayClass.value,
    overlayOpacity: overlayStyle.opacity,
    motionStyle,
    reduceDynamicEffects: reduceDynamicEffects.value,
  });

  return {
    signature,
    shellClass: dynamicShellClass.value,
    colors,
    baseStyle,
    blobOpacity: dynamicBlobOpacity.value,
    noiseOpacity: dynamicNoiseOpacity.value,
    overlayClass: dynamicOverlayClass.value,
    overlayStyle,
    motionStyle,
    reduceDynamicEffects: reduceDynamicEffects.value,
  };
});

const flowLayers = ref<FlowLayerSnapshot[]>([]);

let flowLayerId = 0;
let flowTransitionTimer: ReturnType<typeof setTimeout> | null = null;
let flowEnterAnimationFrame: number | null = null;

function clearFlowTransitionTimer() {
  if (flowTransitionTimer) {
    clearTimeout(flowTransitionTimer);
    flowTransitionTimer = null;
  }
}

function clearFlowEnterAnimationFrame() {
  if (flowEnterAnimationFrame !== null) {
    cancelAnimationFrame(flowEnterAnimationFrame);
    flowEnterAnimationFrame = null;
  }
}

function buildFlowLayerSnapshot(scene: NonNullable<typeof flowScene.value>): FlowLayerSnapshot {
  return {
    id: ++flowLayerId,
    signature: scene.signature,
    state: 'entering',
    shellClass: scene.shellClass,
    colors: scene.colors,
    baseStyle: scene.baseStyle,
    blobOpacity: scene.blobOpacity,
    noiseOpacity: scene.noiseOpacity,
    overlayClass: scene.overlayClass,
    overlayStyle: scene.overlayStyle,
    motionStyle: scene.motionStyle,
    reduceDynamicEffects: scene.reduceDynamicEffects,
  };
}

watch(flowScene, nextScene => {
  if (!nextScene) {
    clearFlowTransitionTimer();
    clearFlowEnterAnimationFrame();
    flowLayers.value = [];
    return;
  }

  const currentLayer = flowLayers.value.find(layer => layer.state === 'current');
  if (!currentLayer) {
    const initialLayer = buildFlowLayerSnapshot(nextScene);
    flowLayers.value = [initialLayer];
    void nextTick(() => {
      clearFlowEnterAnimationFrame();
      flowEnterAnimationFrame = requestAnimationFrame(() => {
        flowLayers.value = flowLayers.value.map(layer => (
          layer.id === initialLayer.id
            ? { ...layer, state: 'current' }
            : layer
        ));
        flowEnterAnimationFrame = null;
      });
    });
    return;
  }

  if (currentLayer.signature === nextScene.signature) {
    return;
  }

  const nextLayer = buildFlowLayerSnapshot(nextScene);
  flowLayers.value = [
    {
      ...currentLayer,
      state: 'previous',
    },
    nextLayer,
  ];

  void nextTick(() => {
    clearFlowEnterAnimationFrame();
    flowEnterAnimationFrame = requestAnimationFrame(() => {
      flowLayers.value = flowLayers.value.map(layer => (
        layer.id === nextLayer.id
          ? { ...layer, state: 'current' }
          : layer
      ));
      flowEnterAnimationFrame = null;
    });
  });

  clearFlowTransitionTimer();
  flowTransitionTimer = setTimeout(() => {
    flowLayers.value = flowLayers.value.filter(layer => layer.state === 'current');
    flowTransitionTimer = null;
  }, FLOW_SCENE_TRANSITION_MS);
}, { immediate: true });

onBeforeUnmount(() => {
  clearFlowTransitionTimer();
  clearFlowEnterAnimationFrame();
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
        v-if="activeBackgroundInfo?.isDynamic && flowLayers.length > 0"
        class="absolute inset-0 overflow-hidden"
      >
        <div
          v-for="layer in flowLayers"
          :key="layer.id"
          class="flow-layer absolute inset-0 overflow-hidden"
          :class="[
            layer.shellClass,
            layer.state === 'previous'
              ? 'flow-layer-previous'
              : layer.state === 'entering'
                ? 'flow-layer-entering'
                : 'flow-layer-current',
          ]"
          :style="layer.motionStyle"
        >
          <div
            class="absolute inset-0 transition-colors duration-[1500ms]"
            :style="layer.baseStyle"
          ></div>

          <div
            v-if="!layer.reduceDynamicEffects"
            class="absolute inset-0 filter blur-[120px]"
            :style="{ opacity: layer.blobOpacity }"
          >
            <div
              class="absolute top-[-10%] left-[-10%] h-[60%] w-[60%] rounded-full mix-blend-multiply transition-colors duration-[1500ms] dark:mix-blend-screen animate-mesh-1"
              :style="{ backgroundColor: layer.colors[1] }"
            ></div>
            <div
              class="absolute bottom-[-10%] right-[-10%] h-[60%] w-[60%] rounded-full mix-blend-multiply transition-colors duration-[1500ms] dark:mix-blend-screen animate-mesh-2"
              :style="{ backgroundColor: layer.colors[2] || layer.colors[0] }"
            ></div>
            <div
              class="absolute top-[20%] right-[-10%] h-[70%] w-[70%] rounded-full mix-blend-multiply transition-colors duration-[1500ms] dark:mix-blend-screen animate-mesh-3"
              :style="{ backgroundColor: layer.colors[3] || layer.colors[1] }"
            ></div>
          </div>

          <div
            v-if="!layer.reduceDynamicEffects"
            class="absolute inset-0 z-10 bg-noise pointer-events-none"
            :style="{ opacity: layer.noiseOpacity }"
          ></div>

          <div
            class="absolute inset-0 z-20"
            :class="layer.overlayClass"
            :style="layer.overlayStyle"
          ></div>
        </div>
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

.flow-layer {
  will-change: opacity, transform, filter;
  transition:
    opacity 920ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 920ms cubic-bezier(0.22, 1, 0.36, 1),
    filter 920ms cubic-bezier(0.22, 1, 0.36, 1);
}

.flow-layer-current {
  opacity: 1;
  transform: scale(1);
  filter: blur(0);
}

.flow-layer-entering {
  opacity: 0;
  transform: scale(1.028);
  filter: blur(10px);
}

.flow-layer-previous {
  opacity: 0;
  transform: scale(1.048);
  filter: blur(16px);
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

.animate-mesh-1 { animation: mesh-1 var(--mesh-duration-1, 14s) ease-in-out infinite; }
.animate-mesh-2 { animation: mesh-2 var(--mesh-duration-2, 18s) ease-in-out infinite; }
.animate-mesh-3 { animation: mesh-3 var(--mesh-duration-3, 22s) ease-in-out infinite; }
</style>
