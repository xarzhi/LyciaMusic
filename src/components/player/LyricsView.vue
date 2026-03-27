<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import type { LyricLine as AmlLyricLine, LyricLineMouseEvent } from '@applemusic-like-lyrics/core';
import {
  DEFAULT_PLAYER_ALIGNMENT,
  DEFAULT_PLAYER_FONT_SCALE,
  DEFAULT_PLAYER_LINE_GAP,
  MAX_PLAYER_FONT_SCALE,
  MAX_PLAYER_LINE_GAP,
  MIN_PLAYER_FONT_SCALE,
  MIN_PLAYER_LINE_GAP,
  type LyricsPlayerAlignment,
  useLyrics,
} from '../../composables/lyrics';
import { usePlayer } from '../../composables/player';
import { useSettingsStore } from '../../features/settings/store';
import AmlLyricPlayer from './AmlLyricPlayer.vue';

const { parsedLyrics, lyricsSettings, lyricsStatus } = useLyrics();
const { seekTo, currentTime } = usePlayer();
const { audioDelay } = storeToRefs(useSettingsStore());

const FONT_SCALE_STEP = 0.05;
const LINE_GAP_STEP = 0.05;
const PLAYER_ALIGNMENT_OPTIONS: Array<{ value: LyricsPlayerAlignment; label: string }> = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

const fontPanelRef = ref<HTMLElement | null>(null);
const isFontPanelOpen = ref(false);

function toMs(seconds: number): number {
  return Math.max(0, Math.round(seconds * 1000));
}

const amllLines = computed<AmlLyricLine[]>(() => {
  const lines = parsedLyrics.value;

  return lines.map((line, lineIndex) => {
    const startTime = toMs(line.time);
    const parsedEndTime = toMs(line.endTime || line.time);
    const nextStartTime = toMs(lines[lineIndex + 1]?.time ?? line.time + 3);
    const endTime = Math.max(
      startTime + 40,
      parsedEndTime > startTime ? parsedEndTime : nextStartTime,
    );

    const sourceWords = line.words ?? [];
    const convertedWords = sourceWords.map((word, wordIndex) => {
      const wordStart = toMs(word.start);
      const nextWordStart = sourceWords[wordIndex + 1]?.start;
      const rawWordEnd = nextWordStart !== undefined
        ? toMs(nextWordStart)
        : toMs(word.end > word.start ? word.end : endTime / 1000);
      const wordEnd = Math.max(wordStart + 20, Math.min(endTime, rawWordEnd));

      return {
        word: word.text,
        startTime: wordStart,
        endTime: wordEnd,
        romanWord: word.romaji || '',
        obscene: false,
      };
    }).filter((word) => word.word.trim().length > 0);

    const words = convertedWords.length > 0
      ? convertedWords
      : [{
          word: line.text || ' ',
          startTime,
          endTime,
          romanWord: '',
          obscene: false,
        }];

    return {
      words,
      translatedLyric: lyricsSettings.showTranslation ? (line.translation || '') : '',
      romanLyric: lyricsSettings.showRomaji ? (line.romaji || '') : '',
      startTime,
      endTime,
      isBG: false,
      isDuet: false,
    };
  });
});

const amllCurrentTime = computed(() => {
  return Math.max(0, Math.floor((currentTime.value - audioDelay.value) * 1000));
});

const emptyStateText = computed(() => {
  if (lyricsStatus.value === 'loading') return 'Loading lyrics...';
  if (lyricsStatus.value === 'error') return 'Lyrics unavailable';
  return 'No synchronized lyrics';
});

const fontScalePercent = computed(() => `${Math.round(lyricsSettings.playerFontScale * 100)}%`);
const lineGapPercent = computed(() => `${Math.round(lyricsSettings.playerLineGap * 100)}%`);

const fontScaleProgress = computed(() => {
  return ((lyricsSettings.playerFontScale - MIN_PLAYER_FONT_SCALE) / (MAX_PLAYER_FONT_SCALE - MIN_PLAYER_FONT_SCALE)) * 100;
});

const lineGapProgress = computed(() => {
  return ((lyricsSettings.playerLineGap - MIN_PLAYER_LINE_GAP) / (MAX_PLAYER_LINE_GAP - MIN_PLAYER_LINE_GAP)) * 100;
});

const lyricsAlignmentClass = computed(() => `lyrics-align-${lyricsSettings.playerAlignment}`);

const lyricsPlayerStyle = computed(() => ({
  '--lyrics-font-scale': lyricsSettings.playerFontScale.toString(),
}));

function clampFontScale(value: number) {
  return Math.min(MAX_PLAYER_FONT_SCALE, Math.max(MIN_PLAYER_FONT_SCALE, value));
}

function clampLineGap(value: number) {
  return Math.min(MAX_PLAYER_LINE_GAP, Math.max(MIN_PLAYER_LINE_GAP, value));
}

function setPlayerFontScale(value: number) {
  lyricsSettings.playerFontScale = Number(clampFontScale(value).toFixed(2));
}

function setPlayerLineGap(value: number) {
  lyricsSettings.playerLineGap = Number(clampLineGap(value).toFixed(2));
}

function setPlayerAlignment(value: LyricsPlayerAlignment) {
  lyricsSettings.playerAlignment = value;
}

function adjustPlayerFontScale(delta: number) {
  setPlayerFontScale(lyricsSettings.playerFontScale + delta);
}

function resetPlayerFontScale() {
  setPlayerFontScale(DEFAULT_PLAYER_FONT_SCALE);
}

function resetPlayerLineGap() {
  setPlayerLineGap(DEFAULT_PLAYER_LINE_GAP);
}

function resetPlayerAlignment() {
  setPlayerAlignment(DEFAULT_PLAYER_ALIGNMENT);
}

function handleFontScaleInput(event: Event) {
  const target = event.target as HTMLInputElement | null;
  if (!target) return;

  setPlayerFontScale(Number(target.value));
}

function handleLineGapInput(event: Event) {
  const target = event.target as HTMLInputElement | null;
  if (!target) return;

  setPlayerLineGap(Number(target.value));
}

function toggleFontPanel() {
  isFontPanelOpen.value = !isFontPanelOpen.value;
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as Node | null;
  if (!target) return;
  if (fontPanelRef.value?.contains(target)) return;
  isFontPanelOpen.value = false;
}

async function handleLineClick(event: LyricLineMouseEvent) {
  const targetSeconds = event.line.getLine().startTime / 1000;
  await seekTo(targetSeconds);
}

onMounted(() => {
  window.addEventListener('mousedown', handleClickOutside);
});

onUnmounted(() => {
  window.removeEventListener('mousedown', handleClickOutside);
});
</script>

<template>
  <div class="group/lyrics-view relative h-full min-h-0 w-full min-w-0">
    <div
      v-if="amllLines.length > 0"
      ref="fontPanelRef"
      class="pointer-events-none absolute right-4 top-4 z-20 flex flex-col items-end gap-2"
    >
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-2 text-white/80 shadow-[0_18px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-all duration-300 hover:border-white/20 hover:bg-black/35 hover:text-white"
        :class="isFontPanelOpen ? 'pointer-events-auto translate-y-0 opacity-100' : 'pointer-events-none translate-y-1 opacity-0 group-hover/lyrics-view:pointer-events-auto group-hover/lyrics-view:translate-y-0 group-hover/lyrics-view:opacity-100'"
        @click.stop="toggleFontPanel"
      >
        <span class="text-[11px] font-semibold tracking-[0.24em] text-white/70">Aa</span>
        <span class="text-[11px] font-medium tabular-nums text-white/55">{{ fontScalePercent }}</span>
      </button>

      <transition name="font-panel">
        <div
          v-if="isFontPanelOpen"
          class="pointer-events-auto w-[286px] rounded-3xl border border-white/10 bg-black/30 p-4 text-white shadow-[0_28px_70px_rgba(0,0,0,0.36)] backdrop-blur-2xl"
          @click.stop
          @mousedown.stop
        >
          <div class="mb-3">
            <div class="text-[9px] font-semibold uppercase tracking-[0.3em] text-white/30">Lyrics</div>
            <div class="mt-1.5 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-[13px] font-medium text-white/85">字体大小</span>
                <button
                  v-if="lyricsSettings.playerFontScale !== DEFAULT_PLAYER_FONT_SCALE"
                  type="button"
                  class="flex h-5 w-5 items-center justify-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white"
                  @click="resetPlayerFontScale"
                  title="重置"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                </button>
              </div>
              <span class="text-xs font-medium tabular-nums text-white/60">{{ fontScalePercent }}</span>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-full text-xs font-light text-white/60 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
              :disabled="lyricsSettings.playerFontScale <= MIN_PLAYER_FONT_SCALE"
              @click="adjustPlayerFontScale(-FONT_SCALE_STEP)"
            >
              A-
            </button>

            <input
              class="font-size-slider h-1 flex-1 cursor-pointer appearance-none rounded-full"
              :style="{ background: `linear-gradient(to right, rgba(255,255,255,0.85) ${fontScaleProgress}%, rgba(255,255,255,0.12) ${fontScaleProgress}%)` }"
              type="range"
              :min="MIN_PLAYER_FONT_SCALE"
              :max="MAX_PLAYER_FONT_SCALE"
              :step="FONT_SCALE_STEP"
              :value="lyricsSettings.playerFontScale"
              @input="handleFontScaleInput"
            />

            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-full text-xs font-light text-white/60 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
              :disabled="lyricsSettings.playerFontScale >= MAX_PLAYER_FONT_SCALE"
              @click="adjustPlayerFontScale(FONT_SCALE_STEP)"
            >
              A+
            </button>
          </div>

          <div class="mt-6 mb-3">
            <div class="text-[9px] font-semibold uppercase tracking-[0.3em] text-white/30">Spacing</div>
            <div class="mt-1.5 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-[13px] font-medium text-white/85">歌词间距</span>
                <button
                  v-if="lyricsSettings.playerLineGap !== DEFAULT_PLAYER_LINE_GAP"
                  type="button"
                  class="flex h-5 w-5 items-center justify-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white"
                  @click="resetPlayerLineGap"
                  title="重置"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                </button>
              </div>
              <span class="text-xs font-medium tabular-nums text-white/60">{{ lineGapPercent }}</span>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-full text-base font-light text-white/60 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
              :disabled="lyricsSettings.playerLineGap <= MIN_PLAYER_LINE_GAP"
              @click="setPlayerLineGap(lyricsSettings.playerLineGap - LINE_GAP_STEP)"
            >
              -
            </button>

            <input
              class="font-size-slider h-1 flex-1 cursor-pointer appearance-none rounded-full"
              :style="{ background: `linear-gradient(to right, rgba(255,255,255,0.85) ${lineGapProgress}%, rgba(255,255,255,0.12) ${lineGapProgress}%)` }"
              type="range"
              :min="MIN_PLAYER_LINE_GAP"
              :max="MAX_PLAYER_LINE_GAP"
              :step="LINE_GAP_STEP"
              :value="lyricsSettings.playerLineGap"
              @input="handleLineGapInput"
            />

            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-full text-base font-light text-white/60 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
              :disabled="lyricsSettings.playerLineGap >= MAX_PLAYER_LINE_GAP"
              @click="setPlayerLineGap(lyricsSettings.playerLineGap + LINE_GAP_STEP)"
            >
              +
            </button>
          </div>

          <div class="mt-6 mb-3">
            <div class="text-[9px] font-semibold uppercase tracking-[0.3em] text-white/30">Alignment</div>
            <div class="mt-1.5 flex items-center justify-between gap-3">
              <span class="text-[13px] font-medium text-white/85">Lyrics Position</span>
              <button
                v-if="lyricsSettings.playerAlignment !== DEFAULT_PLAYER_ALIGNMENT"
                type="button"
                class="flex h-5 w-5 items-center justify-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white"
                @click="resetPlayerAlignment"
                title="Reset"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
              </button>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="option in PLAYER_ALIGNMENT_OPTIONS"
              :key="option.value"
              type="button"
              class="flex h-9 items-center justify-center rounded-2xl border px-3 text-xs font-medium transition"
              :class="lyricsSettings.playerAlignment === option.value
                ? 'border-white/25 bg-white/14 text-white shadow-[0_10px_30px_rgba(0,0,0,0.18)]'
                : 'border-white/10 bg-white/[0.03] text-white/60 hover:border-white/20 hover:bg-white/[0.06] hover:text-white'"
              @click="setPlayerAlignment(option.value)"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
      </transition>
    </div>

    <div
      v-if="amllLines.length > 0"
      class="lyrics-mask-shell h-full min-h-0 w-full min-w-0"
      :class="lyricsAlignmentClass"
      :style="lyricsPlayerStyle"
    >
      <AmlLyricPlayer
        class="amll-host h-full min-h-0 w-full min-w-0"
        :lyric-lines="amllLines"
        :current-time="amllCurrentTime"
        align-anchor="center"
        :align-position="0.42"
        :enable-spring="true"
        :enable-blur="true"
        :enable-scale="true"
        :hide-passed-lines="false"
        :word-fade-width="0.5"
        :line-gap="lyricsSettings.playerLineGap"
        @line-click="handleLineClick"
      />
    </div>

    <div
      v-else
      class="no-lyrics flex h-full items-center justify-center text-2xl font-medium text-white/30"
    >
      {{ emptyStateText }}
    </div>
  </div>
</template>

<style scoped>
.lyrics-mask-shell {
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

.amll-host {
  min-width: 0;
  min-height: 0;
}

.amll-host :deep(.amll-lyric-player) {
  --amll-lp-color: rgba(255, 255, 255, 0.95);
  --amll-lp-bg-color: transparent;
  --amll-lp-font-size: calc(max(max(5vh, 2.5vw), 12px) * var(--lyrics-font-scale, 1));
}

.amll-host :deep(.amll-lyric-player [class*="_lyricLine_"]) {
  text-align: var(--lyrics-text-align, left);
  transform-origin: var(--lyrics-line-transform-origin, 0%) center;
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

@media screen and (max-width: 768px) {
  .amll-host :deep(.amll-lyric-player) {
    --amll-lp-font-size: calc(max(8vw, 12px) * var(--lyrics-font-scale, 1));
  }
}

.font-panel-enter-active,
.font-panel-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.font-panel-enter-from,
.font-panel-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}

.font-size-slider::-webkit-slider-thumb {
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 9999px;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0,0,0,0.05);
}

.font-size-slider::-moz-range-thumb {
  appearance: none;
  width: 12px;
  height: 12px;
  border: 0;
  border-radius: 9999px;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0,0,0,0.05);
}

.font-size-slider::-moz-range-track {
  height: 4px;
  border-radius: 9999px;
  background: transparent;
}
</style>
