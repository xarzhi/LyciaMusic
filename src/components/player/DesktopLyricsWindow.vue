<script setup lang="ts">
import { emitTo } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type CSSProperties } from 'vue';

import {
  DEFAULT_DESKTOP_PLAYER_ALIGNMENT,
  DEFAULT_PLAYER_FONT_PRESET,
  DEFAULT_PLAYER_FONT_SCALE,
  DEFAULT_PLAYER_LINE_GAP,
  DEFAULT_PLAYER_OFFSET_X,
  DEFAULT_PLAYER_OFFSET_Y,
  LYRICS_FONT_OPTIONS,
  MAX_PLAYER_FONT_SCALE,
  MAX_PLAYER_LINE_GAP,
  MAX_PLAYER_OFFSET_X,
  MAX_PLAYER_OFFSET_Y,
  MIN_PLAYER_FONT_SCALE,
  MIN_PLAYER_LINE_GAP,
  MIN_PLAYER_OFFSET_X,
  MIN_PLAYER_OFFSET_Y,
  getLyricsFontFamily,
  loadSystemLyricsFonts,
  normalizeLyricsFontPreset,
  systemLyricsFontOptions,
  type LyricsStatus,
  type LyricLine,
} from '../../composables/lyrics';
import {
  DESKTOP_LYRICS_ACTION_EVENT,
  DESKTOP_LYRICS_BOUNDS_EVENT,
  DESKTOP_LYRICS_PLAYBACK_EVENT,
  DESKTOP_LYRICS_REQUEST_STATE_EVENT,
  DESKTOP_LYRICS_STATE_EVENT,
  DESKTOP_LYRICS_VISIBILITY_EVENT,
  type DesktopLyricsAction,
  type DesktopLyricsPlaybackPayload,
  type DesktopLyricsSettingsPatch,
  type DesktopLyricsStatePayload,
  type DesktopLyricsWindowSettings,
  type DesktopLyricsWindowBounds,
} from '../../features/desktopLyrics/shared';
import { windowApi } from '../../services/tauri/windowApi';

const FIXED_PALETTES = {
  auto: ['#8ec5ff', '#ff8cab', '#88f3c2', '#ffe07d'],
  default: ['#EC4141', '#ff8364', '#f7b267', '#ffd166'],
  pink: ['#f472b6', '#fb7185', '#f9a8d4', '#fbcfe8'],
  blue: ['#60a5fa', '#38bdf8', '#93c5fd', '#bfdbfe'],
  green: ['#34d399', '#22c55e', '#6ee7b7', '#bbf7d0'],
} as const;

const FONT_SCALE_STEP = 0.05;
const LINE_GAP_STEP = 0.05;
const OFFSET_STEP = 1;
const FULLSCREEN_POLL_INTERVAL_MS = 300;
const ALIGNMENT_OPTIONS: Array<{ value: DesktopLyricsWindowSettings['playerAlignment']; label: string }> = [
  { value: 'left', label: '左' },
  { value: 'center', label: '中' },
  { value: 'right', label: '右' },
];

const appWindow = getCurrentWindow();
const showSettings = ref(false);
const settingsTriggerRef = ref<HTMLElement | null>(null);
const settingsMenuRef = ref<HTMLElement | null>(null);
const settingsMenuStyle = ref<Record<string, string>>({});
const playbackTime = ref(0);
const isPlaying = ref(false);
const audioDelay = ref(0);
const parsedLyrics = ref<LyricLine[]>([]);
const lyricsStatus = ref<LyricsStatus>('idle');
const fallbackText = ref('Instrumental / No lyrics');
const themeColors = ref<string[]>([]);
const settings = ref<DesktopLyricsWindowSettings>({
  showTranslation: true,
  showRomaji: false,
  isAlwaysOnTop: false,
  isLocked: false,
  persistLock: false,
  colorScheme: 'auto',
  playerFontScale: DEFAULT_PLAYER_FONT_SCALE,
  playerLineGap: DEFAULT_PLAYER_LINE_GAP,
  playerOffsetX: DEFAULT_PLAYER_OFFSET_X,
  playerOffsetY: DEFAULT_PLAYER_OFFSET_Y,
  playerAlignment: DEFAULT_DESKTOP_PLAYER_ALIGNMENT,
  playerFontPreset: DEFAULT_PLAYER_FONT_PRESET,
});

const showDragShadow = ref(false);
const isSystemHidden = ref(false);
const isHoverDimmed = ref(false);

let closeTimer: ReturnType<typeof setTimeout> | null = null;
let dragShadowTimer: ReturnType<typeof setTimeout> | null = null;
let hoverDimTimer: ReturnType<typeof setTimeout> | null = null;
let autoHideTimer: ReturnType<typeof setInterval> | null = null;
let frameId = 0;
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

function syncPlaybackClock(nextTime: number, nextIsPlaying: boolean, nextSyncedAt: number) {
  const elapsed = nextIsPlaying ? Math.max(0, (Date.now() - nextSyncedAt) / 1000) : 0;
  playbackTime.value = Math.max(0, nextTime + elapsed);
  isPlaying.value = nextIsPlaying;
}

function startAutoHideLoop() {
  stopAutoHideLoop();

  const pollForegroundFullscreen = async () => {
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

async function emitAction(action: DesktopLyricsAction) {
  await emitTo<DesktopLyricsAction>('main', DESKTOP_LYRICS_ACTION_EVENT, action);
}

function patchSettings(patch: DesktopLyricsSettingsPatch) {
  const normalizedPatch: DesktopLyricsSettingsPatch = { ...patch };

  if (typeof normalizedPatch.playerFontScale === 'number') {
    normalizedPatch.playerFontScale = Number(
      Math.min(MAX_PLAYER_FONT_SCALE, Math.max(MIN_PLAYER_FONT_SCALE, normalizedPatch.playerFontScale)).toFixed(2),
    );
  }

  if (typeof normalizedPatch.playerLineGap === 'number') {
    normalizedPatch.playerLineGap = Number(
      Math.min(MAX_PLAYER_LINE_GAP, Math.max(MIN_PLAYER_LINE_GAP, normalizedPatch.playerLineGap)).toFixed(2),
    );
  }

  if (typeof normalizedPatch.playerOffsetX === 'number') {
    normalizedPatch.playerOffsetX = Number(
      Math.min(MAX_PLAYER_OFFSET_X, Math.max(MIN_PLAYER_OFFSET_X, normalizedPatch.playerOffsetX)).toFixed(0),
    );
  }

  if (typeof normalizedPatch.playerOffsetY === 'number') {
    normalizedPatch.playerOffsetY = Number(
      Math.min(MAX_PLAYER_OFFSET_Y, Math.max(MIN_PLAYER_OFFSET_Y, normalizedPatch.playerOffsetY)).toFixed(0),
    );
  }

  if (typeof normalizedPatch.playerFontPreset === 'string') {
    normalizedPatch.playerFontPreset = normalizeLyricsFontPreset(normalizedPatch.playerFontPreset);
  }

  settings.value = {
    ...settings.value,
    ...normalizedPatch,
  };

  void emitAction({
    type: 'update-settings',
    patch: normalizedPatch,
  });
}

function openSettings() {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
  showSettings.value = true;
  void nextTick(updateSettingsMenuPosition);
}

function closeSettings() {
  if (closeTimer) {
    clearTimeout(closeTimer);
  }

  closeTimer = setTimeout(() => {
    showSettings.value = false;
  }, 220);
}

function keepSettingsOpen() {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
}

function updateSettingsMenuPosition() {
  const trigger = settingsTriggerRef.value;
  if (!trigger) return;

  const rect = trigger.getBoundingClientRect();
  const menuWidth = 320;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  let left = rect.left + rect.width / 2 - menuWidth / 2;
  left = Math.max(12, Math.min(left, viewportWidth - menuWidth - 12));

  const top = rect.bottom + 12;
  const maxHeight = Math.max(180, viewportHeight - top - 12);

  settingsMenuStyle.value = {
    position: 'fixed',
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
    width: `${menuWidth}px`,
    maxHeight: `${Math.round(maxHeight)}px`,
    zIndex: '140',
  };
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as Node | null;
  if (!target) return;
  if (settingsTriggerRef.value?.contains(target)) return;
  if (settingsMenuRef.value?.contains(target)) return;

  showSettings.value = false;
}

function clearHoverDimTimer() {
  if (hoverDimTimer) {
    clearTimeout(hoverDimTimer);
    hoverDimTimer = null;
  }
}

function queueHoverDim() {
  clearHoverDimTimer();

  if (settings.value.isLocked || showSettings.value || isSystemHidden.value) {
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

function handlePayload(payload: DesktopLyricsStatePayload) {
  parsedLyrics.value = payload.parsedLyrics;
  lyricsStatus.value = payload.lyricsStatus;
  fallbackText.value = payload.fallbackText;
  audioDelay.value = payload.audioDelay;
  themeColors.value = [...payload.themeColors];
  settings.value = { ...payload.settings };
  syncPlaybackClock(payload.playbackTime, payload.isPlaying, payload.syncedAt);
}

function handlePlaybackPayload(payload: DesktopLyricsPlaybackPayload) {
  audioDelay.value = payload.audioDelay;
  syncPlaybackClock(payload.playbackTime, payload.isPlaying, payload.syncedAt);
}

function normalizeThemeColors(colors: string[]) {
  const normalized = colors.filter((color) => color && color !== 'transparent');
  if (normalized.length === 0) {
    return [...FIXED_PALETTES.auto];
  }

  const palette = [...normalized];
  while (palette.length < 4) {
    palette.push(palette[palette.length - 1] || FIXED_PALETTES.auto[palette.length]);
  }

  return palette.slice(0, 4);
}

function findLyricIndexByTime(lines: LyricLine[], targetTime: number): number {
  let left = 0;
  let right = lines.length - 1;
  let answer = -1;

  while (left <= right) {
    const mid = (left + right) >> 1;
    if (lines[mid].time <= targetTime) {
      answer = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return answer;
}

const syncedCurrentTime = computed(() => Math.max(0, playbackTime.value - audioDelay.value));
const lyricsAlignmentClass = computed(() => `lyrics-align-${settings.value.playerAlignment}`);
const availableFontOptions = computed(() => [
  ...LYRICS_FONT_OPTIONS,
  ...systemLyricsFontOptions.value,
]);
const offsetLabel = computed(() => {
  const offsetMs = Math.round(audioDelay.value * 1000);
  if (offsetMs === 0) return '0 ms';
  return `${offsetMs > 0 ? '+' : ''}${offsetMs} ms`;
});
const fontScaleLabel = computed(() => `${Math.round(settings.value.playerFontScale * 100)}%`);
const lineGapLabel = computed(() => `${Math.round(settings.value.playerLineGap * 100)}%`);
const offsetXLabel = computed(() => formatOffset(settings.value.playerOffsetX));
const offsetYLabel = computed(() => formatOffset(settings.value.playerOffsetY));
const selectedFontLabel = computed(() => {
  return availableFontOptions.value.find((option) => option.value === settings.value.playerFontPreset)?.label
    ?? normalizeLyricsFontPreset(settings.value.playerFontPreset);
});

const fallbackStateText = computed(() => {
  if (lyricsStatus.value === 'loading') return 'Loading lyrics...';
  if (lyricsStatus.value === 'error') return 'Lyrics unavailable';
  return fallbackText.value;
});

const lyricsPlayerStyle = computed(() => ({
  '--desktop-font-scale': settings.value.playerFontScale.toString(),
  '--lyrics-font-family': getLyricsFontFamily(settings.value.playerFontPreset),
  '--lyrics-offset-x': `${settings.value.playerOffsetX}%`,
  '--lyrics-offset-y': `${settings.value.playerOffsetY}%`,
}));

const resolvedPalette = computed(() => {
  if (settings.value.colorScheme === 'auto') {
    return normalizeThemeColors(themeColors.value);
  }

  return [...FIXED_PALETTES[settings.value.colorScheme]];
});

const widgetStyle = computed(() => {
  const [accentA, accentB, accentC, accentD] = resolvedPalette.value;

  return {
    '--desktop-accent-a': accentA,
    '--desktop-accent-b': accentB,
    '--desktop-accent-c': accentC,
    '--desktop-accent-d': accentD,
    background: [
      'linear-gradient(135deg, rgba(14, 18, 32, 0.74), rgba(14, 18, 32, 0.48))',
      `radial-gradient(circle at 12% 18%, ${accentA}55 0%, transparent 34%)`,
      `radial-gradient(circle at 88% 14%, ${accentB}48 0%, transparent 36%)`,
      `radial-gradient(circle at 24% 100%, ${accentC}42 0%, transparent 34%)`,
      `radial-gradient(circle at 100% 80%, ${accentD}35 0%, transparent 38%)`,
    ].join(', '),
    borderColor: `${accentA}44`,
    boxShadow: showDragShadow.value
      ? `0 28px 54px rgba(6, 10, 22, 0.48), 0 0 0 1px ${accentB}22 inset`
      : `0 20px 46px rgba(6, 10, 22, 0.38), 0 0 0 1px ${accentB}18 inset`,
  } as Record<string, string>;
});

const widgetShellStyle = computed<CSSProperties>(() => ({
  opacity: isSystemHidden.value ? '0' : (isHoverDimmed.value ? '0.34' : '1'),
  transform: isSystemHidden.value ? 'scale(0.96)' : 'scale(1)',
  pointerEvents: isSystemHidden.value ? 'none' : 'auto',
}));

const activeLyricIndex = computed(() => {
  if (parsedLyrics.value.length === 0) return -1;
  return findLyricIndexByTime(parsedLyrics.value, syncedCurrentTime.value);
});

const activeLyricLine = computed<LyricLine | null>(() => {
  if (parsedLyrics.value.length === 0) {
    return null;
  }

  if (activeLyricIndex.value >= 0) {
    return parsedLyrics.value[activeLyricIndex.value] ?? null;
  }

  return parsedLyrics.value[0] ?? null;
});

const blockTransitionKey = computed(() => {
  const line = activeLyricLine.value;
  if (!line) return `${lyricsStatus.value}:${fallbackText.value}`;
  return `${line.time}:${line.text}:${line.translation}:${line.romaji}`;
});

const visibleSecondaryLines = computed(() => {
  const line = activeLyricLine.value;
  if (!line) return [];

  const secondary: Array<{ kind: 'romaji' | 'translation'; text: string }> = [];
  if (settings.value.showRomaji && line.romaji) {
    secondary.push({ kind: 'romaji', text: line.romaji });
  }
  if (settings.value.showTranslation && line.translation) {
    secondary.push({ kind: 'translation', text: line.translation });
  }
  return secondary;
});

const blockStyle = computed(() => ({
  '--desktop-line-gap': settings.value.playerLineGap.toString(),
}));

function formatOffset(value: number) {
  return `${value > 0 ? '+' : ''}${Math.round(value)}%`;
}

function adjustFontScale(delta: number) {
  patchSettings({
    playerFontScale: settings.value.playerFontScale + delta,
  });
}

function resetFontScale() {
  patchSettings({ playerFontScale: DEFAULT_PLAYER_FONT_SCALE });
}

function adjustLineGap(delta: number) {
  patchSettings({
    playerLineGap: settings.value.playerLineGap + delta,
  });
}

function resetLineGap() {
  patchSettings({ playerLineGap: DEFAULT_PLAYER_LINE_GAP });
}

function adjustOffsetX(delta: number) {
  patchSettings({
    playerOffsetX: settings.value.playerOffsetX + delta,
  });
}

function resetOffsetX() {
  patchSettings({ playerOffsetX: DEFAULT_PLAYER_OFFSET_X });
}

function adjustOffsetY(delta: number) {
  patchSettings({
    playerOffsetY: settings.value.playerOffsetY + delta,
  });
}

function resetOffsetY() {
  patchSettings({ playerOffsetY: DEFAULT_PLAYER_OFFSET_Y });
}

function resetFontPreset() {
  patchSettings({ playerFontPreset: DEFAULT_PLAYER_FONT_PRESET });
}

function updateFontPreset(event: Event) {
  const target = event.target as HTMLSelectElement | null;
  if (!target) return;

  patchSettings({
    playerFontPreset: target.value,
  });
}

async function emitWindowBounds(bounds: DesktopLyricsWindowBounds) {
  await emitTo<DesktopLyricsWindowBounds>('main', DESKTOP_LYRICS_BOUNDS_EVENT, bounds);
}

function getWordHighlightProgress(start: number, end: number) {
  const duration = Math.max(0.001, end - start);
  return Math.min(1, Math.max(0, (syncedCurrentTime.value - start) / duration));
}

function getWordStyle(start: number, end: number) {
  const progress = getWordHighlightProgress(start, end);
  const fillPercent = `${(progress * 100).toFixed(2)}%`;
  const [accentA, , accentC] = resolvedPalette.value;

  return {
    backgroundImage: `linear-gradient(90deg, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.98) ${fillPercent}, rgba(255,255,255,0.26) ${fillPercent}, rgba(255,255,255,0.26) 100%), linear-gradient(90deg, ${accentA} 0%, ${accentC} 100%)`,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
  };
}

onMounted(async () => {
  startPlaybackClock();
  startAutoHideLoop();
  window.addEventListener('mousedown', handleClickOutside);
  window.addEventListener('resize', updateSettingsMenuPosition);
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
    const bounds: DesktopLyricsWindowBounds = {
      x: payload.x,
      y: payload.y,
      width: size.width,
      height: size.height,
    };
    await emitWindowBounds(bounds);
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
  window.removeEventListener('mousedown', handleClickOutside);
  window.removeEventListener('resize', updateSettingsMenuPosition);
  unlistenState?.();
  unlistenPlayback?.();
  unlistenCloseRequested?.();
  unlistenMoved?.();
  unlistenResized?.();

  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }

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
  () => showSettings.value,
  (visible) => {
    if (visible) {
      clearHoverDimTimer();
      isHoverDimmed.value = false;
      void nextTick(updateSettingsMenuPosition);
      return;
    }

    queueHoverDim();
  },
);
</script>

<template>
  <div class="desktop-lyrics-window h-screen w-screen overflow-hidden bg-transparent">
    <div class="flex h-full w-full items-center justify-center p-0">
      <div
        class="desktop-widget-shell relative h-full w-full transition-all duration-300"
        :style="widgetShellStyle"
      >
        <div
          class="desktop-widget relative h-full w-full select-none overflow-hidden"
          :class="[lyricsAlignmentClass, { 'desktop-widget--dragging': showDragShadow }]"
          :style="widgetStyle"
          @mouseenter="handlePointerEnter"
          @mousemove="handlePointerMove"
          @mouseleave="handlePointerLeave"
          @mousedown="startWindowDrag"
        >
          <div class="desktop-toolbar" @mousedown.stop>
            <span class="desktop-toolbar-note" title="桌面歌词">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 18V6.75L18 5v10.25" />
                <circle cx="7.5" cy="18.5" r="2.5" />
                <circle cx="16.5" cy="16.5" r="2.5" />
              </svg>
            </span>

            <button class="desktop-toolbar-button desktop-toolbar-button--text" :title="`歌词提前 0.5s（当前 ${offsetLabel}）`" @click="emitAction({ type: 'adjust-offset', delta: -0.5 })">
              -0.5s
            </button>
            <button class="desktop-toolbar-button desktop-toolbar-button--text" :title="`歌词延后 0.5s（当前 ${offsetLabel}）`" @click="emitAction({ type: 'adjust-offset', delta: 0.5 })">
              +0.5s
            </button>
            <span class="desktop-toolbar-offset">{{ offsetLabel }}</span>

            <button class="desktop-toolbar-button" title="上一首" @click="emitAction({ type: 'prev-song' })">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path stroke-linecap="round" stroke-linejoin="round" d="M7 6v12M17 7 9.5 12 17 17V7Z" />
              </svg>
            </button>
            <button class="desktop-toolbar-button" :title="isPlaying ? '暂停' : '播放'" @click="emitAction({ type: 'toggle-play' })">
              <svg v-if="isPlaying" xmlns="http://www.w3.org/2000/svg" class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8 6v12M16 6v12" />
              </svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8 6v12l9-6-9-6Z" />
              </svg>
            </button>
            <button class="desktop-toolbar-button" title="下一首" @click="emitAction({ type: 'next-song' })">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path stroke-linecap="round" stroke-linejoin="round" d="M17 6v12M7 7l7.5 5L7 17V7Z" />
              </svg>
            </button>

            <div class="relative" @mouseenter="openSettings" @mouseleave="closeSettings">
              <button ref="settingsTriggerRef" class="desktop-toolbar-button" title="设置">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.36 6.36-2.12-2.12M8.76 8.76 5.64 5.64m12.72 0-2.12 2.12M8.76 15.24l-3.12 3.12" />
                  <circle cx="12" cy="12" r="3.25" />
                </svg>
              </button>

              <div
                v-show="showSettings"
                ref="settingsMenuRef"
                class="settings-menu settings-menu-panel absolute left-1/2 top-full z-50 mt-3 -translate-x-1/2 rounded-[12px] text-xs text-white/80"
                :style="settingsMenuStyle"
                @mouseenter="keepSettingsOpen"
              >
                <div class="settings-menu-scroll">
                  <div class="settings-section">
                    <div class="settings-section-title">显示</div>
                    <button type="button" class="settings-item" @click="patchSettings({ isAlwaysOnTop: !settings.isAlwaysOnTop })">
                      <span>窗口置顶</span>
                      <span>{{ settings.isAlwaysOnTop ? 'ON' : 'OFF' }}</span>
                    </button>
                    <button type="button" class="settings-item" @click="patchSettings({ showTranslation: !settings.showTranslation })">
                      <span>翻译</span>
                      <span>{{ settings.showTranslation ? 'ON' : 'OFF' }}</span>
                    </button>
                    <button type="button" class="settings-item" @click="patchSettings({ showRomaji: !settings.showRomaji })">
                      <span>罗马音</span>
                      <span>{{ settings.showRomaji ? 'ON' : 'OFF' }}</span>
                    </button>
                    <button type="button" class="settings-item" @click="patchSettings({ persistLock: !settings.persistLock })">
                      <span>记住锁定</span>
                      <span>{{ settings.persistLock ? 'ON' : 'OFF' }}</span>
                    </button>
                  </div>

                  <div class="settings-section">
                    <div class="settings-section-title">版式</div>
                    <div class="settings-control-row">
                      <span>字号</span>
                      <div class="settings-stepper">
                        <button type="button" class="settings-mini-button" @click="adjustFontScale(-FONT_SCALE_STEP)">-</button>
                        <button type="button" class="settings-value-button" @click="resetFontScale">{{ fontScaleLabel }}</button>
                        <button type="button" class="settings-mini-button" @click="adjustFontScale(FONT_SCALE_STEP)">+</button>
                      </div>
                    </div>

                    <div class="settings-control-row">
                      <span>行距</span>
                      <div class="settings-stepper">
                        <button type="button" class="settings-mini-button" @click="adjustLineGap(-LINE_GAP_STEP)">-</button>
                        <button type="button" class="settings-value-button" @click="resetLineGap">{{ lineGapLabel }}</button>
                        <button type="button" class="settings-mini-button" @click="adjustLineGap(LINE_GAP_STEP)">+</button>
                      </div>
                    </div>

                    <div class="settings-control-row">
                      <span>横向偏移</span>
                      <div class="settings-stepper">
                        <button type="button" class="settings-mini-button" @click="adjustOffsetX(-OFFSET_STEP)">-</button>
                        <button type="button" class="settings-value-button" @click="resetOffsetX">{{ offsetXLabel }}</button>
                        <button type="button" class="settings-mini-button" @click="adjustOffsetX(OFFSET_STEP)">+</button>
                      </div>
                    </div>

                    <div class="settings-control-row">
                      <span>纵向偏移</span>
                      <div class="settings-stepper">
                        <button type="button" class="settings-mini-button" @click="adjustOffsetY(-OFFSET_STEP)">-</button>
                        <button type="button" class="settings-value-button" @click="resetOffsetY">{{ offsetYLabel }}</button>
                        <button type="button" class="settings-mini-button" @click="adjustOffsetY(OFFSET_STEP)">+</button>
                      </div>
                    </div>

                    <div class="settings-control-stack">
                      <span>对齐</span>
                      <div class="settings-chip-group">
                        <button
                          v-for="option in ALIGNMENT_OPTIONS"
                          :key="option.value"
                          type="button"
                          class="settings-chip"
                          :class="{ 'settings-chip--active': settings.playerAlignment === option.value }"
                          @click="patchSettings({ playerAlignment: option.value })"
                        >
                          {{ option.label }}
                        </button>
                      </div>
                    </div>

                    <div class="settings-control-stack">
                      <div class="settings-control-header">
                        <span>字体</span>
                        <button type="button" class="settings-link-button" @click="resetFontPreset">重置</button>
                      </div>
                      <select class="settings-select" :value="settings.playerFontPreset" @change="updateFontPreset">
                        <option v-for="option in availableFontOptions" :key="option.value" :value="option.value">
                          {{ option.label }}
                        </option>
                      </select>
                      <div class="settings-hint">{{ selectedFontLabel }}</div>
                    </div>
                  </div>

                  <div class="settings-section">
                    <div class="settings-section-title">配色</div>
                    <div class="settings-chip-group">
                      <button type="button" class="settings-chip" :class="{ 'settings-chip--active': settings.colorScheme === 'auto' }" @click="patchSettings({ colorScheme: 'auto' })">封面</button>
                      <button type="button" class="settings-chip" :class="{ 'settings-chip--active': settings.colorScheme === 'default' }" @click="patchSettings({ colorScheme: 'default' })">经典</button>
                      <button type="button" class="settings-chip" :class="{ 'settings-chip--active': settings.colorScheme === 'pink' }" @click="patchSettings({ colorScheme: 'pink' })">粉</button>
                      <button type="button" class="settings-chip" :class="{ 'settings-chip--active': settings.colorScheme === 'blue' }" @click="patchSettings({ colorScheme: 'blue' })">蓝</button>
                      <button type="button" class="settings-chip" :class="{ 'settings-chip--active': settings.colorScheme === 'green' }" @click="patchSettings({ colorScheme: 'green' })">绿</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <button
              class="desktop-toolbar-button"
              :title="settings.isLocked ? '已锁定并启用鼠标穿透' : '锁定位置并启用鼠标穿透'"
              @click="patchSettings({ isLocked: !settings.isLocked })"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8 10V7.5a4 4 0 1 1 8 0V10m-9 0h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" />
                <path v-if="!settings.isLocked" stroke-linecap="round" stroke-linejoin="round" d="M12 14v3" />
              </svg>
            </button>

            <button class="desktop-toolbar-button" title="关闭桌面歌词" @click="emitAction({ type: 'close' })">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>

          <div class="desktop-lyrics-body" :style="lyricsPlayerStyle">
            <div class="desktop-lyrics-host h-full min-h-0 w-full min-w-0" :class="lyricsAlignmentClass">
              <div class="desktop-lyrics-mask-shell h-full min-h-0 w-full min-w-0">
                <div class="desktop-lyrics-position-frame h-full min-h-0 w-full min-w-0">
                  <transition name="desktop-block" mode="out-in">
                    <div
                      v-if="activeLyricLine"
                      :key="blockTransitionKey"
                      class="desktop-lyric-block"
                      :style="blockStyle"
                    >
                      <div class="desktop-lyric-main">
                        <template v-if="activeLyricLine.words?.length">
                          <span
                            v-for="(word, index) in activeLyricLine.words"
                            :key="`${word.start}-${word.end}-${index}`"
                            class="desktop-lyric-word"
                            :style="getWordStyle(word.start, word.end)"
                          >
                            {{ word.text }}
                          </span>
                        </template>
                        <template v-else>
                          {{ activeLyricLine.text }}
                        </template>
                      </div>

                      <div
                        v-for="secondaryLine in visibleSecondaryLines"
                        :key="`${blockTransitionKey}:${secondaryLine.kind}`"
                        class="desktop-lyric-sub"
                        :class="`desktop-lyric-sub--${secondaryLine.kind}`"
                      >
                        {{ secondaryLine.text }}
                      </div>
                    </div>

                    <div
                      v-else
                      :key="blockTransitionKey"
                      class="desktop-empty-state flex h-full items-center justify-center text-center"
                    >
                      {{ fallbackStateText }}
                    </div>
                  </transition>
                </div>
              </div>
            </div>
          </div>

          <div v-if="isSystemHidden" class="desktop-system-hide-indicator">
            Fullscreen app detected
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.desktop-lyrics-window {
  background: transparent;
}

.desktop-widget-shell {
  will-change: opacity, transform;
}

.desktop-widget {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
}

.desktop-widget::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.18), transparent 26%),
    linear-gradient(180deg, transparent 58%, rgba(255, 255, 255, 0.08));
  pointer-events: none;
}

.desktop-widget--dragging {
  backdrop-filter: blur(26px);
  -webkit-backdrop-filter: blur(26px);
}

.desktop-toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 14px 18px 10px;
  color: rgba(255, 255, 255, 0.9);
}

.desktop-toolbar-note,
.desktop-toolbar-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.desktop-toolbar-note {
  color: rgba(255, 255, 255, 0.92);
}

.desktop-toolbar-button {
  min-width: 24px;
  height: 24px;
  color: rgba(255, 255, 255, 0.86);
  transition: color 160ms ease, opacity 160ms ease;
}

.desktop-toolbar-button:hover {
  color: #ffffff;
}

.desktop-toolbar-button--text {
  min-width: 42px;
  font-size: 0.95rem;
  font-weight: 500;
  letter-spacing: 0.01em;
}

.desktop-toolbar-offset {
  min-width: 56px;
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
  text-align: center;
}

.desktop-lyrics-body {
  height: calc(100% - 50px);
  min-height: 0;
  padding: 2px 24px 16px;
}

.desktop-lyrics-mask-shell {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  --lyrics-edge-fade: 12%;
  --lyrics-edge-softness: 8%;
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent 0%,
    rgba(0, 0, 0, 0.24) var(--lyrics-edge-softness),
    black var(--lyrics-edge-fade),
    black calc(100% - var(--lyrics-edge-fade)),
    rgba(0, 0, 0, 0.24) calc(100% - var(--lyrics-edge-softness)),
    transparent 100%
  );
  mask-image: linear-gradient(
    to bottom,
    transparent 0%,
    rgba(0, 0, 0, 0.24) var(--lyrics-edge-softness),
    black var(--lyrics-edge-fade),
    black calc(100% - var(--lyrics-edge-fade)),
    rgba(0, 0, 0, 0.24) calc(100% - var(--lyrics-edge-softness)),
    transparent 100%
  );
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
}

.desktop-lyrics-position-frame {
  transform: translate3d(var(--lyrics-offset-x, 0%), var(--lyrics-offset-y, 0%), 0);
  transition: transform 180ms ease;
  will-change: transform;
  display: flex;
  align-items: center;
  justify-content: center;
}

.desktop-lyric-block {
  width: min(100%, 1180px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: calc(0.22rem * var(--desktop-line-gap, 1));
  text-align: var(--lyrics-text-align, center);
  font-family: var(--lyrics-font-family, system-ui, sans-serif);
  transform-origin: var(--lyrics-line-transform-origin, 50%) center;
}

.desktop-lyric-main {
  width: 100%;
  font-size: calc(max(26px, min(4.8vw, 6vh)) * var(--desktop-font-scale, 1));
  font-weight: 700;
  line-height: 1.18;
  letter-spacing: 0.01em;
  color: rgba(255, 255, 255, 0.96);
  text-shadow: 0 3px 24px rgba(0, 0, 0, 0.38);
  word-break: break-word;
}

.desktop-lyric-word {
  display: inline-block;
  white-space: pre-wrap;
  text-shadow: 0 3px 24px rgba(0, 0, 0, 0.38);
}

.desktop-lyric-sub {
  width: 100%;
  font-size: calc(max(14px, min(2.25vw, 2.75vh)) * var(--desktop-font-scale, 1));
  line-height: 1.36;
  letter-spacing: 0.03em;
  text-shadow: 0 2px 16px rgba(0, 0, 0, 0.3);
  word-break: break-word;
}

.desktop-lyric-sub--romaji {
  color: rgba(255, 255, 255, 0.82);
}

.desktop-lyric-sub--translation {
  color: rgba(255, 255, 255, 0.68);
}

.lyrics-align-left {
  --lyrics-text-align: left;
  --lyrics-line-transform-origin: 0%;
}

.lyrics-align-center {
  --lyrics-text-align: center;
  --lyrics-line-transform-origin: 50%;
}

.lyrics-align-right {
  --lyrics-text-align: right;
  --lyrics-line-transform-origin: 100%;
}

.desktop-empty-state {
  color: rgba(255, 255, 255, 0.78);
  font-size: 1.1rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-shadow: 0 2px 14px rgba(0, 0, 0, 0.34);
}

.desktop-block-enter-active,
.desktop-block-leave-active {
  transition: opacity 180ms ease, transform 220ms ease, filter 220ms ease;
}

.desktop-block-enter-from,
.desktop-block-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.985);
  filter: blur(8px);
}

.settings-menu,
.settings-submenu {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(22, 24, 34, 0.9);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  box-shadow: 0 18px 42px rgba(2, 6, 23, 0.34);
}

.settings-menu-panel {
  padding: 12px;
}

.settings-menu-scroll {
  display: flex;
  max-height: inherit;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  padding-right: 4px;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settings-section-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.42);
}

.settings-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  transition: background-color 160ms ease;
}

.settings-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.settings-control-row,
.settings-control-stack {
  display: flex;
  gap: 10px;
}

.settings-control-row {
  align-items: center;
  justify-content: space-between;
}

.settings-control-stack {
  flex-direction: column;
}

.settings-control-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.settings-stepper {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.settings-mini-button,
.settings-value-button,
.settings-link-button,
.settings-chip,
.settings-select {
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.84);
}

.settings-mini-button,
.settings-value-button,
.settings-link-button,
.settings-chip {
  background: rgba(255, 255, 255, 0.04);
  transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease;
}

.settings-mini-button:hover,
.settings-value-button:hover,
.settings-link-button:hover,
.settings-chip:hover {
  border-color: rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.settings-mini-button,
.settings-value-button {
  min-width: 28px;
  height: 28px;
  border-radius: 999px;
  font-size: 12px;
}

.settings-value-button {
  min-width: 64px;
  padding: 0 10px;
}

.settings-link-button {
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 11px;
}

.settings-chip-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.settings-chip {
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 11px;
}

.settings-chip--active {
  border-color: rgba(255, 255, 255, 0.24);
  background: rgba(255, 255, 255, 0.16);
  color: #ffffff;
}

.settings-select {
  width: 100%;
  border-radius: 10px;
  background: rgba(9, 12, 20, 0.88);
  padding: 8px 10px;
  outline: none;
}

.settings-hint {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.56);
}

.desktop-system-hide-indicator {
  position: absolute;
  right: 16px;
  bottom: 12px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.55);
  pointer-events: none;
}
</style>
