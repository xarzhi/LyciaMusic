<script setup lang="ts">
import { watch, computed, defineAsyncComponent, nextTick } from 'vue';
import { getCurrentWindow, currentMonitor } from '@tauri-apps/api/window';
import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi';
import { invoke } from '@tauri-apps/api/core';
import { usePlayer } from './composables/player';
import { useWindowMaterial } from './composables/windowMaterial';
import Sidebar from './components/layout/Sidebar.vue';
import TitleBar from './components/layout/TitleBar.vue';
import PlayerFooter from './components/layout/PlayerFooter.vue';
import GlobalBackground from './components/layout/GlobalBackground.vue';

const PlayQueueSidebar = defineAsyncComponent(() => import('./components/player/PlayQueueSidebar.vue'));
const PlayerDetail = defineAsyncComponent(() => import('./components/player/PlayerDetail.vue'));
const AddToPlaylistModal = defineAsyncComponent(() => import('./components/overlays/AddToPlaylistModal.vue'));
const Toast = defineAsyncComponent(() => import('./components/common/Toast.vue'));
const MiniPlayer = defineAsyncComponent(() => import('./components/layout/MiniPlayer.vue'));

const {
  init,
  showAddToPlaylistModal,
  playlistAddTargetSongs,
  addSongsToPlaylist,
  settings,
  playQueue,
  currentViewMode,
  filterCondition,
  isMiniMode,
  showPlayerDetail,
  showMiniPlaylist,
  showPlaylist,
  closeMiniPlaylist,
  showVolumePopover
} = usePlayer();
const { activeWindowMaterial, applyWindowMaterial, loadWindowMaterialCapabilities } = useWindowMaterial();

init();

const isFooterVisible = computed(() => playQueue.value.length > 0);
const hasWindowMaterial = computed(() => activeWindowMaterial.value !== 'none');
const isMicaWindowMaterial = computed(() => activeWindowMaterial.value === 'mica');

const applyTheme = () => {
  const theme = settings.value.theme;
  const isDarkSystem = window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (theme.mode === 'custom') {
    const style = theme.customBackground.foregroundStyle || 'auto';
    if (style === 'light') {
      document.documentElement.classList.add('dark');
    } else if (style === 'dark') {
      document.documentElement.classList.remove('dark');
    } else if (isDarkSystem) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } else if (theme.mode === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
};

const syncWindowMaterial = async () => {
  await nextTick();
  await applyWindowMaterial(
    settings.value.theme.windowMaterial,
    document.documentElement.classList.contains('dark'),
  );
};

void loadWindowMaterialCapabilities();

watch(settings, async () => {
  applyTheme();
  await syncWindowMaterial();
}, { deep: true, immediate: true });

const handleGlobalAdd = (playlistId: string) => {
  addSongsToPlaylist(playlistId, playlistAddTargetSongs.value);
  showAddToPlaylistModal.value = false;
};

const mainBlurStyle = computed(() => {
  if (showPlayerDetail.value) {
    return 'none';
  }

  const { dynamicBgType, mode, customBackground } = settings.value.theme;

  if (isMicaWindowMaterial.value) {
    if (dynamicBgType === 'flow') {
      return 'none';
    }

    if (dynamicBgType === 'blur') {
      return 'blur(6px)';
    }

    if (mode === 'custom') {
      return customBackground.blur <= 0 ? 'none' : `blur(${Math.min(customBackground.blur, 8)}px)`;
    }
  }

  if (dynamicBgType === 'flow' || dynamicBgType === 'blur') {
    return hasWindowMaterial.value ? 'blur(20px)' : 'blur(40px)';
  }

  if (mode === 'custom') {
    const b = hasWindowMaterial.value ? Math.min(customBackground.blur, 16) : customBackground.blur;
    return b <= 0 ? 'none' : `blur(${b}px)`;
  }

  return 'none';
});

const MINI_WIDTH = 300;
const MINI_BASE_HEIGHT = 75;
const MINI_EXPANDED_HEIGHT = 420;

const appWindow = getCurrentWindow();
let normalSize = { width: 960, height: 600 };
let normalPosition: { x: number; y: number } | null = null;
let miniPosition: { x: number; y: number } | null = null;
let wasMaximized = false;
let isResizing = false;

const getWindowLogicalPosition = async () => {
  const factor = await appWindow.scaleFactor();
  const physicalPosition = await appWindow.outerPosition();
  const logicalPosition = physicalPosition.toLogical(factor);
  return { x: logicalPosition.x, y: logicalPosition.y };
};

const setWindowLogicalPosition = async (position: { x: number; y: number }) => {
  await appWindow.setPosition(new LogicalPosition(position.x, position.y));
};

const getCurrentMonitorLogicalBounds = async () => {
  const monitor = await currentMonitor();
  if (!monitor) return null;

  const scaleFactor = monitor.scaleFactor || await appWindow.scaleFactor();
  const monitorPosition = monitor.position.toLogical(scaleFactor);
  const monitorSize = monitor.size.toLogical(scaleFactor);

  return {
    left: monitorPosition.x,
    top: monitorPosition.y,
    right: monitorPosition.x + monitorSize.width,
    bottom: monitorPosition.y + monitorSize.height,
    width: monitorSize.width,
    height: monitorSize.height
  };
};

const applyMiniWindowHeight = async (height: number) => {
  const monitorBounds = await getCurrentMonitorLogicalBounds();
  const width = monitorBounds ? Math.min(MINI_WIDTH, monitorBounds.width) : MINI_WIDTH;
  const clampedHeight = monitorBounds ? Math.min(height, monitorBounds.height) : height;

  await appWindow.setMinSize(new LogicalSize(width, clampedHeight));
  await appWindow.setMaxSize(new LogicalSize(width, clampedHeight));
  await appWindow.setSize(new LogicalSize(width, clampedHeight));
};

watch([isMiniMode, showMiniPlaylist, showVolumePopover], async ([miniMode, miniQueueVisible, volumeVisible], [prevMiniMode]) => {
  if (isResizing) return;
  if (!miniMode && !prevMiniMode) return;

  isResizing = true;
  try {
    if (miniMode) {
      if (!prevMiniMode) {
        await appWindow.hide(); // 隐藏窗口，避免过度帧闪现

        wasMaximized = await appWindow.isMaximized();
        if (wasMaximized) await appWindow.unmaximize();

        const factor = await appWindow.scaleFactor();
        const size = await appWindow.innerSize();
        if (size.width / factor > 600) {
          normalSize = { width: size.width / factor, height: size.height / factor };
        }
        normalPosition = await getWindowLogicalPosition();

        showPlaylist.value = false;
        await appWindow.setResizable(false);
        await appWindow.setAlwaysOnTop(true);
        if (appWindow.setShadow) await appWindow.setShadow(false);

        document.body.classList.add('mini-mode-active');
        document.documentElement.classList.add('mini-mode-active');
        const appEl = document.getElementById('app');
        if (appEl) appEl.classList.add('mini-mode-active');

        await invoke('set_mini_boundary_enabled', { enabled: true });
      }

      let height = MINI_BASE_HEIGHT;
      if (miniQueueVisible) {
        height = MINI_EXPANDED_HEIGHT;
      } else if (volumeVisible) {
        height = MINI_BASE_HEIGHT + 60; // 容纳音量弹窗的高度
      }
      
      await applyMiniWindowHeight(height);
      if (!prevMiniMode && miniPosition) {
        await setWindowLogicalPosition(miniPosition);
      }

      if (!prevMiniMode) {
        await appWindow.show();
      }
    } else {
      await appWindow.hide(); // 隐藏窗口，避免过度帧闪现
      
      miniPosition = await getWindowLogicalPosition();
      closeMiniPlaylist();
      await invoke('set_mini_boundary_enabled', { enabled: false });
      await appWindow.setResizable(true);
      await appWindow.setMaxSize(null);
      await appWindow.setMinSize(new LogicalSize(960, 600));
      await appWindow.setSize(new LogicalSize(normalSize.width, normalSize.height));
      if (normalPosition) {
        await setWindowLogicalPosition(normalPosition);
      }
      await appWindow.setAlwaysOnTop(false);
      if (appWindow.setShadow) await appWindow.setShadow(true);

      document.body.classList.remove('mini-mode-active');
      document.documentElement.classList.remove('mini-mode-active');
      const appEl = document.getElementById('app');
      if (appEl) appEl.classList.remove('mini-mode-active');

      if (wasMaximized) await appWindow.maximize();
      
      await appWindow.show();
      await syncWindowMaterial();
    }
  } catch (error: any) {
    console.error('Mini Mode Resize Error:', error);
  } finally {
    isResizing = false;
  }
});


</script>

<template>
  <div
    class="flex flex-col h-screen w-full text-gray-800 dark:text-gray-200 relative overflow-hidden font-sans"
    :class="{ 'bg-transparent border-0': isMiniMode }"
    :style="{ backgroundColor: isMiniMode ? 'transparent' : '' }"
  >
    <transition name="window-restore">
      <GlobalBackground v-if="!isMiniMode" />
    </transition>

    <MiniPlayer v-if="isMiniMode" />

    <transition name="window-restore">
      <div
        v-if="!isMiniMode"
        class="flex-1 flex overflow-hidden relative z-10 transition-colors duration-500"
        :class="[
          settings.theme.mode === 'custom'
            ? 'bg-transparent'
            : isMicaWindowMaterial
              ? 'bg-white/[0.03] dark:bg-black/[0.06]'
              : hasWindowMaterial
              ? 'bg-white/10 dark:bg-black/20'
              : 'bg-white/30 dark:bg-black/60'
        ]"
        :style="{ backdropFilter: mainBlurStyle }"
      >
        <Sidebar />

        <div class="flex-1 flex flex-col min-w-0">
          <TitleBar />
          <main class="flex-1 overflow-hidden relative min-h-0">
            <router-view v-slot="{ Component, route }">
              <transition name="page-fade" mode="out-in">
                <component :is="Component" :key="route.path === '/' ? `/${currentViewMode}/${filterCondition}` : route.path" />
              </transition>
            </router-view>
          </main>
        </div>
      </div>
    </transition>

    <div v-if="!isMiniMode && isFooterVisible" class="relative z-[60]">
      <!-- Player Detail (垫底滑动层) -->
      <PlayerDetail />
      
      <!-- Player Footer (悬浮覆盖层) -->
      <transition name="footer-slide">
        <PlayerFooter />
      </transition>
    </div>

    <PlayQueueSidebar v-if="!isMiniMode" />

    <AddToPlaylistModal
      v-if="!isMiniMode"
      :visible="showAddToPlaylistModal"
      :selectedCount="playlistAddTargetSongs.length"
      @close="showAddToPlaylistModal = false"
      @add="handleGlobalAdd"
    />

    <Toast />
  </div>
</template>

<style>
body.mini-mode-active,
html.mini-mode-active,
#app.mini-mode-active {
  background-color: transparent !important;
  background: transparent !important;
  border-width: 0 !important;
  outline: none !important;
  border-style: none !important;
  box-shadow: none !important;
}

.mini-mode-active * {
  border-color: transparent !important;
  box-shadow: none !important;
}


.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.page-fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.page-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.footer-slide-enter-active,
.footer-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.footer-slide-enter-from,
.footer-slide-leave-to {
  transform: translateY(100%);
  max-height: 0 !important;
  opacity: 0;
}

.footer-slide-enter-to,
.footer-slide-leave-from {
  transform: translateY(0);
  max-height: 80px !important;
  opacity: 1;
}

/* 窗口还原过渡动画 */
.window-restore-enter-active {
  transition: opacity 0.4s ease-out, transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.window-restore-leave-active {
  transition: none;
}

.window-restore-enter-from {
  opacity: 0;
  transform: scale(0.95);
}

.window-restore-leave-to {
  opacity: 0;
}
</style>
