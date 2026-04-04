import { emitTo } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { computed, onMounted, onUnmounted, ref, watch, type CSSProperties, type Ref } from 'vue';

import { loadSystemLyricsFonts } from './lyrics';
import {
  DESKTOP_LYRICS_BOUNDS_EVENT,
  DESKTOP_LYRICS_PLAYBACK_EVENT,
  DESKTOP_LYRICS_REQUEST_STATE_EVENT,
  DESKTOP_LYRICS_STATE_EVENT,
  DESKTOP_LYRICS_VISIBILITY_EVENT,
  type DesktopLyricsPlaybackPayload,
  type DesktopLyricsStatePayload,
  type DesktopLyricsWindowBounds,
  type DesktopLyricsWindowSettings,
} from '../features/desktopLyrics/shared';
import { windowApi } from '../services/tauri/windowApi';

const FULLSCREEN_POLL_INTERVAL_MS = 300;

export function useDesktopLyricsWindowController(options: {
  showDragShadow: Ref<boolean>;
  settings: Ref<DesktopLyricsWindowSettings>;
  playbackTime: Ref<number>;
  isPlaying: Ref<boolean>;
  handlePayload: (payload: DesktopLyricsStatePayload) => void;
  handlePlaybackPayload: (payload: DesktopLyricsPlaybackPayload) => void;
  toolbarMenuVisible: Ref<boolean>;
}) {
  const {
    showDragShadow,
    settings,
    playbackTime,
    isPlaying,
    handlePayload,
    handlePlaybackPayload,
    toolbarMenuVisible,
  } = options;

  const appWindow = getCurrentWindow();
  const isSystemHidden = ref(false);
  const isHoverDimmed = ref(false);

  let hoverDimTimer: ReturnType<typeof setTimeout> | null = null;
  let autoHideTimer: ReturnType<typeof setInterval> | null = null;
  let frameId = 0;
  let dragShadowTimer: ReturnType<typeof setTimeout> | null = null;
  let unlistenState: (() => void) | null = null;
  let unlistenPlayback: (() => void) | null = null;
  let unlistenCloseRequested: (() => void) | null = null;
  let unlistenMoved: (() => void) | null = null;
  let unlistenResized: (() => void) | null = null;

  function startPlaybackClock() {
    stopPlaybackClock();

    let lastTime = performance.now();
    const tick = (now: number) => {
      if (isPlaying.value) {
        playbackTime.value += (now - lastTime) / 1000;
      }

      lastTime = now;
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
  }

  function stopPlaybackClock() {
    if (frameId !== 0) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }
  }

  function startAutoHideLoop() {
    stopAutoHideLoop();

    const pollForegroundFullscreen = async () => {
      if (!settings.value.autoHideWhenFullscreen) {
        isSystemHidden.value = false;
        return;
      }

      try {
        const state = await windowApi.getForegroundFullscreenState();
        isSystemHidden.value = state.isFullscreen;
      } catch {
        isSystemHidden.value = false;
      }
    };

    autoHideTimer = setInterval(async () => {
      await pollForegroundFullscreen();
    }, FULLSCREEN_POLL_INTERVAL_MS);

    void pollForegroundFullscreen();
  }

  function stopAutoHideLoop() {
    if (autoHideTimer) {
      clearInterval(autoHideTimer);
      autoHideTimer = null;
    }
  }

  async function applyTransientWindowFlags() {
    const shouldIgnoreCursor = settings.value.isLocked || isSystemHidden.value;
    await appWindow.setIgnoreCursorEvents(shouldIgnoreCursor);
    await appWindow.setFocusable(!shouldIgnoreCursor);
  }

  function clearHoverDimTimer() {
    if (hoverDimTimer) {
      clearTimeout(hoverDimTimer);
      hoverDimTimer = null;
    }
  }

  function queueHoverDim() {
    clearHoverDimTimer();

    if (settings.value.isLocked || toolbarMenuVisible.value || isSystemHidden.value) {
      return;
    }

    hoverDimTimer = setTimeout(() => {
      isHoverDimmed.value = true;
    }, 850);
  }

  function handlePointerEnter() {
    isHoverDimmed.value = false;
    queueHoverDim();
  }

  function handlePointerMove() {
    if (settings.value.isLocked) {
      return;
    }

    isHoverDimmed.value = false;
    queueHoverDim();
  }

  function handlePointerLeave() {
    clearHoverDimTimer();
    isHoverDimmed.value = false;
  }

  async function startWindowDrag(event: MouseEvent) {
    if (settings.value.isLocked || isSystemHidden.value) return;
    if ((event.target as HTMLElement).closest('button, .settings-menu')) return;

    await appWindow.startDragging();
  }

  async function emitWindowBounds(bounds: DesktopLyricsWindowBounds) {
    await emitTo<DesktopLyricsWindowBounds>('main', DESKTOP_LYRICS_BOUNDS_EVENT, bounds);
  }

  const widgetShellStyle = computed<CSSProperties>(() => ({
    opacity: isSystemHidden.value ? '0' : (isHoverDimmed.value ? '0.34' : '1'),
    transform: isSystemHidden.value ? 'scale(0.96)' : 'scale(1)',
    pointerEvents: isSystemHidden.value ? 'none' : 'auto',
  }));

  onMounted(async () => {
    startPlaybackClock();
    startAutoHideLoop();
    void loadSystemLyricsFonts();

    try {
      await appWindow.setBackgroundColor([0, 0, 0, 0]);
    } catch (error) {
      console.warn('Failed to force transparent background for desktop lyrics window:', error);
    }

    unlistenState = await appWindow.listen<DesktopLyricsStatePayload>(DESKTOP_LYRICS_STATE_EVENT, (event) => {
      handlePayload(event.payload);
    });

    unlistenPlayback = await appWindow.listen<DesktopLyricsPlaybackPayload>(DESKTOP_LYRICS_PLAYBACK_EVENT, (event) => {
      handlePlaybackPayload(event.payload);
    });

    unlistenCloseRequested = await appWindow.onCloseRequested(async (event) => {
      event.preventDefault();
      await appWindow.hide();
      await emitTo('main', DESKTOP_LYRICS_VISIBILITY_EVENT, { visible: false });
    });

    unlistenMoved = await appWindow.onMoved(async ({ payload }) => {
      showDragShadow.value = true;
      if (dragShadowTimer) clearTimeout(dragShadowTimer);
      dragShadowTimer = setTimeout(() => {
        showDragShadow.value = false;
      }, 1200);

      const size = await appWindow.outerSize();
      await emitWindowBounds({
        x: payload.x,
        y: payload.y,
        width: size.width,
        height: size.height,
      });
    });

    unlistenResized = await appWindow.onResized(async ({ payload }) => {
      const position = await appWindow.outerPosition();
      await emitWindowBounds({
        x: position.x,
        y: position.y,
        width: payload.width,
        height: payload.height,
      });
    });

    await emitTo('main', DESKTOP_LYRICS_REQUEST_STATE_EVENT);
  });

  onUnmounted(() => {
    stopPlaybackClock();
    stopAutoHideLoop();
    clearHoverDimTimer();
    unlistenState?.();
    unlistenPlayback?.();
    unlistenCloseRequested?.();
    unlistenMoved?.();
    unlistenResized?.();

    if (dragShadowTimer) {
      clearTimeout(dragShadowTimer);
      dragShadowTimer = null;
    }
  });

  watch(
    () => [settings.value.isLocked, isSystemHidden.value],
    () => {
      void applyTransientWindowFlags();
    },
    { immediate: true },
  );

  watch(
    () => settings.value.autoHideWhenFullscreen,
    (enabled) => {
      if (!enabled) {
        isSystemHidden.value = false;
      }
    },
  );

  watch(toolbarMenuVisible, (visible) => {
    if (visible) {
      clearHoverDimTimer();
      isHoverDimmed.value = false;
      return;
    }

    queueHoverDim();
  });

  return {
    showDragShadow,
    isSystemHidden,
    widgetShellStyle,
    handlePointerEnter,
    handlePointerMove,
    handlePointerLeave,
    startWindowDrag,
  };
}
