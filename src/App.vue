<script setup lang="ts">
import { watch, computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { listen } from '@tauri-apps/api/event';
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
  isMiniMode,
  showPlayerDetail,
  showMiniPlaylist,
  showPlaylist,
  closeMiniPlaylist,
  showVolumePopover,
  handleExternalPaths,
  libraryScanProgress
} = usePlayer();
const { activeWindowMaterial, applyWindowMaterial, loadWindowMaterialCapabilities } = useWindowMaterial();

init();

const isExternalDragActive = ref(false);
let externalPathTask: Promise<void> = Promise.resolve();
let libraryScanHideTimer: ReturnType<typeof setTimeout> | null = null;

interface LibraryScanProgressPayload {
  phase: 'collecting' | 'parsing' | 'writing' | 'complete' | 'error';
  current: number;
  total: number;
  folder_path: string;
  folder_index: number;
  folder_total: number;
  message?: string | null;
  done: boolean;
  failed: boolean;
}

const clearLibraryScanHideTimer = () => {
  if (libraryScanHideTimer) {
    clearTimeout(libraryScanHideTimer);
    libraryScanHideTimer = null;
  }
};

const scheduleLibraryScanHide = (delayMs: number) => {
  clearLibraryScanHideTimer();
  libraryScanHideTimer = setTimeout(() => {
    libraryScanProgress.value = null;
    libraryScanHideTimer = null;
  }, delayMs);
};

const applyLibraryScanProgress = (payload: LibraryScanProgressPayload) => {
  clearLibraryScanHideTimer();
  libraryScanProgress.value = {
    ...payload,
    message: payload.message ?? null,
  };

  if (payload.done) {
    scheduleLibraryScanHide(payload.failed ? 2600 : 1400);
  }
};

const enqueueExternalPaths = (paths: string[], source: 'drop' | 'open') => {
  externalPathTask = externalPathTask
    .then(() => handleExternalPaths(paths, { source }))
    .catch((error) => {
      console.error('Failed to process external paths:', error);
    });

  return externalPathTask;
};

const consumePendingOpenPaths = async () => {
  const paths = await invoke<string[]>('consume_pending_open_paths');
  if (paths.length > 0) {
    await enqueueExternalPaths(paths, 'open');
  }
};

const isFooterVisible = computed(() => playQueue.value.length > 0);
const hasWindowMaterial = computed(() => activeWindowMaterial.value !== 'none');
const isMicaWindowMaterial = computed(() => activeWindowMaterial.value === 'mica');
const libraryScanPercent = computed(() => {
  if (!libraryScanProgress.value) return 0;
  if (libraryScanProgress.value.total <= 0) return 8;
  const percent = (libraryScanProgress.value.current / libraryScanProgress.value.total) * 100;
  return Math.min(100, Math.max(6, percent));
});
const libraryScanPhaseLabel = computed(() => {
  switch (libraryScanProgress.value?.phase) {
    case 'collecting':
      return '扫描文件';
    case 'parsing':
      return '解析元数据';
    case 'writing':
      return '写入音乐库';
    case 'complete':
      return '扫描完成';
    case 'error':
      return '扫描失败';
    default:
      return '扫描音乐库';
  }
});
const libraryScanFolderLabel = computed(() => {
  if (!libraryScanProgress.value || libraryScanProgress.value.folder_total <= 1) {
    return '';
  }

  return `文件夹 ${libraryScanProgress.value.folder_index}/${libraryScanProgress.value.folder_total}`;
});

const applyTheme = async () => {
  const theme = settings.value.theme;
  const isDarkSystem = window.matchMedia('(prefers-color-scheme: dark)').matches;
  let isDarkMode = false;

  if (theme.mode === 'custom') {
    const style = theme.customBackground.foregroundStyle || 'auto';
    if (style === 'light') {
      isDarkMode = true;
    } else if (style === 'dark') {
      isDarkMode = false;
    } else if (isDarkSystem) {
      isDarkMode = true;
    } else {
      isDarkMode = false;
    }
  } else if (theme.mode === 'dark') {
    isDarkMode = true;
  } else {
    isDarkMode = false;
  }

  if (isDarkMode) {
    document.documentElement.classList.add('dark');
    try { await getCurrentWindow().setTheme('dark'); } catch (e) { console.warn('Failed to set window theme:', e); }
  } else {
    document.documentElement.classList.remove('dark');
    try { await getCurrentWindow().setTheme('light'); } catch (e) { console.warn('Failed to set window theme:', e); }
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

let unlistenDragDrop: (() => void) | null = null;
let unlistenDragOver: (() => void) | null = null;
let unlistenDragLeave: (() => void) | null = null;
let unlistenOpenPaths: (() => void) | null = null;
let unlistenLibraryScanProgress: (() => void) | null = null;

onMounted(async () => {
  unlistenDragDrop = await listen<{ paths: string[] }>('tauri://drag-drop', async (event) => {
    isExternalDragActive.value = false;
    await enqueueExternalPaths(event.payload?.paths ?? [], 'drop');
  });

  unlistenDragOver = await listen('tauri://drag-over', () => {
    isExternalDragActive.value = true;
  });

  unlistenDragLeave = await listen('tauri://drag-leave', () => {
    isExternalDragActive.value = false;
  });

  unlistenOpenPaths = await listen('app:open-paths', async () => {
    await consumePendingOpenPaths();
  });

  unlistenLibraryScanProgress = await listen<LibraryScanProgressPayload>('library-scan-progress', (event) => {
    applyLibraryScanProgress(event.payload);
  });

  await consumePendingOpenPaths();
  
  // 🟢 在所有初次资源或状态加载完毕后，平滑显示主窗口
  try {
    const window = getCurrentWindow();
    await window.show();
    await window.setFocus();
  } catch (error) {
    console.error('Failed to show window on startup:', error);
  }
});

onUnmounted(() => {
  unlistenDragDrop?.();
  unlistenDragOver?.();
  unlistenDragLeave?.();
  unlistenOpenPaths?.();
  unlistenLibraryScanProgress?.();
  clearLibraryScanHideTimer();
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

    <transition name="drop-overlay">
      <div
        v-if="isExternalDragActive && !isMiniMode"
        class="absolute inset-0 z-[140] pointer-events-none flex items-center justify-center bg-black/15 backdrop-blur-sm"
      >
        <div class="rounded-[28px] border border-white/35 bg-white/75 px-8 py-6 text-center shadow-[0_24px_60px_rgba(0,0,0,0.2)] dark:border-white/10 dark:bg-black/65">
          <div class="text-lg font-semibold text-gray-900 dark:text-white">松开即可导入或播放</div>
          <div class="mt-2 text-sm text-gray-600 dark:text-white/70">音频文件将直接播放，文件夹将导入音乐库</div>
        </div>
      </div>
    </transition>

    <transition name="scan-progress">
      <div
        v-if="libraryScanProgress && !isMiniMode"
        class="absolute right-4 top-14 z-[145] w-[320px] overflow-hidden rounded-[22px] border border-white/45 bg-white/82 p-4 shadow-[0_24px_60px_rgba(15,23,42,0.18)] backdrop-blur-2xl dark:border-white/10 dark:bg-black/70"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-[13px] font-semibold uppercase tracking-[0.18em] text-[#ec4141]/80">
              {{ libraryScanPhaseLabel }}
            </div>
            <div class="mt-1 text-sm font-medium text-gray-900 dark:text-white">
              {{ libraryScanProgress.message || '正在处理音乐库' }}
            </div>
            <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500 dark:text-white/55">
              <span v-if="libraryScanFolderLabel">{{ libraryScanFolderLabel }}</span>
              <span v-if="libraryScanProgress.total > 0">
                {{ libraryScanProgress.current }}/{{ libraryScanProgress.total }}
              </span>
              <span class="truncate max-w-[220px]" :title="libraryScanProgress.folder_path">
                {{ libraryScanProgress.folder_path }}
              </span>
            </div>
          </div>
          <div
            class="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
            :class="libraryScanProgress.failed ? 'bg-rose-500' : libraryScanProgress.done ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'"
          ></div>
        </div>

        <div class="mt-3 h-2 overflow-hidden rounded-full bg-black/8 dark:bg-white/10">
          <div
            class="h-full rounded-full bg-gradient-to-r from-[#ec4141] via-[#ff8364] to-[#f7b267] transition-[width] duration-300 ease-out"
            :class="{ 'scan-progress-bar-indeterminate': libraryScanProgress.total <= 0 && !libraryScanProgress.done }"
            :style="{ width: `${libraryScanPercent}%` }"
          ></div>
        </div>
      </div>
    </transition>

    <MiniPlayer v-if="isMiniMode" />

    <transition name="window-restore">
      <div
        v-if="!isMiniMode"
        class="flex-1 flex overflow-hidden relative z-10 transition-colors duration-500"
        :class="[
          settings.theme.mode === 'custom' || hasWindowMaterial
            ? 'bg-transparent'
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
                <component
                  v-if="!route.meta.keepAlive"
                  :is="Component"
                  :key="route.path"
                />
                <KeepAlive v-else include="Home">
                  <component
                    :is="Component"
                    :key="String(route.name ?? route.path)"
                  />
                </KeepAlive>
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

.drop-overlay-enter-active,
.drop-overlay-leave-active {
  transition: opacity 0.18s ease;
}

.drop-overlay-enter-from,
.drop-overlay-leave-to {
  opacity: 0;
}

.scan-progress-enter-active,
.scan-progress-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.scan-progress-enter-from,
.scan-progress-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.98);
}

.scan-progress-bar-indeterminate {
  min-width: 28%;
  animation: scan-progress-indeterminate 1.1s ease-in-out infinite alternate;
}

@keyframes scan-progress-indeterminate {
  from {
    transform: translateX(-14%);
  }

  to {
    transform: translateX(14%);
  }
}
</style>
