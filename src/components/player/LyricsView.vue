<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { useLyrics } from '../../composables/lyrics';
import { usePlayer } from '../../composables/player';
import { AUDIO_DELAY } from '../../composables/playerState';

const { parsedLyrics, currentLyricIndex, lyricsSettings, lyricsStatus } = useLyrics();
const { playAt, currentTime } = usePlayer();

const containerRef = ref<HTMLElement | null>(null);
const contentRef = ref<HTMLElement | null>(null);
const isUserScrolling = ref(false);
let scrollTimeout: ReturnType<typeof setTimeout> | null = null;

const CENTER_OFFSET_PERCENT = 0.5;
const RESUME_SCROLL_DELAY = 5000;
const SCROLL_BEHAVIOR_SMOOTH = 'smooth';
const SCROLL_BEHAVIOR_AUTO = 'auto';

const rowVirtualizer = useVirtualizer<HTMLElement, HTMLElement>(computed(() => ({
  count: parsedLyrics.value.length,
  getScrollElement: () => containerRef.value,
  estimateSize: () => 100,
  overscan: 8,
})));

const virtualItems = computed(() => rowVirtualizer.value.getVirtualItems());
const totalSize = computed(() => rowVirtualizer.value.getTotalSize());

const emptyStateText = computed(() => {
  if (lyricsStatus.value === 'loading') return 'Loading lyrics...';
  if (lyricsStatus.value === 'error') return 'Lyrics unavailable';
  return 'No synchronized lyrics';
});

const lyricClock = computed(() => {
  return currentTime.value - AUDIO_DELAY.value;
});

function isActiveLine(index: number): boolean {
  return index === currentLyricIndex.value;
}

function getLineWords(index: number) {
  return parsedLyrics.value[index]?.words ?? [];
}

function isWordHighlightLine(index: number): boolean {
  return isActiveLine(index) && getLineWords(index).length > 0;
}

function getWordProgress(lineIndex: number, wordIndex: number): number {
  const words = getLineWords(lineIndex);
  const currentWord = words[wordIndex];
  if (!currentWord) return 0;

  const nextWord = words[wordIndex + 1];
  const nextLine = parsedLyrics.value[lineIndex + 1];
  const fallbackEnd = nextLine && nextLine.time > currentWord.start
    ? Math.min(currentWord.start + 1.8, nextLine.time)
    : currentWord.start + 0.9;
  const end = Math.max(currentWord.start + 0.05, nextWord?.start ?? currentWord.end ?? fallbackEnd);
  const now = lyricClock.value;

  if (now <= currentWord.start) return 0;
  if (now >= end) return 1;
  return (now - currentWord.start) / (end - currentWord.start);
}

function getWordFillStyle(lineIndex: number, wordIndex: number) {
  const progress = Math.max(0, Math.min(1, getWordProgress(lineIndex, wordIndex)));
  return { '--word-fill': `${(progress * 100).toFixed(2)}%` } as Record<string, string>;
}

function measureRow(el: Element | ComponentPublicInstance | null) {
  if (el instanceof HTMLElement) {
    rowVirtualizer.value.measureElement(el);
  }
}

function getLineStyle(index: number, start: number) {
  const active = currentLyricIndex.value;

  if (active === -1) {
    return {
      transform: `translate3d(0px, ${start}px, 0px) scale(1)`,
      opacity: 0.45,
      filter: 'blur(0.8px) saturate(0.85)',
    };
  }

  const distance = Math.abs(index - active);
  const depth = Math.min(distance, 8);

  if (distance === 0) {
    return {
      transform: `translate3d(0px, ${start}px, 0px) scale(1.06)`,
      opacity: 1,
      filter: 'blur(0px) saturate(1.1)',
    };
  }

  const opacity = Math.max(0.08, 0.72 - depth * 0.11);
  const blur = Math.min(3.5, depth * 0.45);
  const scale = Math.max(0.88, 1 - depth * 0.02);
  const drift = Math.min(14, depth * 2);

  return {
    transform: `translate3d(${drift}px, ${start}px, 0px) scale(${scale})`,
    opacity,
    filter: `blur(${blur}px) saturate(0.8)`,
  };
}

function scrollToActiveLine(immediate = false) {
  const container = containerRef.value;
  const active = currentLyricIndex.value;

  if (!container || active === -1 || isUserScrolling.value) return;

  const target = rowVirtualizer.value.getOffsetForIndex(active, 'start');
  if (!target) return;

  const activeItem = virtualItems.value.find(item => item.index === active);
  const activeSize = activeItem?.size ?? 128;
  const contentPaddingTop = contentRef.value
    ? parseFloat(getComputedStyle(contentRef.value).paddingTop) || 0
    : 0;
  const targetTop = Math.max(
    0,
    contentPaddingTop + target[0] - container.clientHeight * CENTER_OFFSET_PERCENT + activeSize / 2,
  );
  container.scrollTo({
    top: targetTop,
    behavior: immediate ? SCROLL_BEHAVIOR_AUTO : SCROLL_BEHAVIOR_SMOOTH,
  });
}

function startUserInteraction() {
  isUserScrolling.value = true;
  if (scrollTimeout) clearTimeout(scrollTimeout);

  scrollTimeout = setTimeout(() => {
    isUserScrolling.value = false;
    scrollToActiveLine();
  }, RESUME_SCROLL_DELAY);
}

function resumeSync() {
  isUserScrolling.value = false;
  if (scrollTimeout) clearTimeout(scrollTimeout);
  scrollToActiveLine();
}

watch(currentLyricIndex, (newIndex) => {
  if (newIndex !== -1) nextTick(() => scrollToActiveLine());
});

watch(parsedLyrics, async () => {
  await nextTick();
  rowVirtualizer.value.measure();
  scrollToActiveLine(true);
}, { deep: true });

watch(
  () => [lyricsSettings.showTranslation, lyricsSettings.showRomaji],
  async () => {
    await nextTick();
    rowVirtualizer.value.measure();
    scrollToActiveLine(true);
  },
);

onMounted(() => {
  const container = containerRef.value;
  if (!container) return;

  container.addEventListener('wheel', startUserInteraction, { passive: true });
  container.addEventListener('touchstart', startUserInteraction, { passive: true });
  container.addEventListener('mousedown', startUserInteraction, { passive: true });

  setTimeout(() => {
    rowVirtualizer.value.measure();
    scrollToActiveLine(true);
  }, 120);
});

onUnmounted(() => {
  const container = containerRef.value;
  if (container) {
    container.removeEventListener('wheel', startUserInteraction);
    container.removeEventListener('touchstart', startUserInteraction);
    container.removeEventListener('mousedown', startUserInteraction);
  }

  if (scrollTimeout) clearTimeout(scrollTimeout);
});
</script>

<template>
  <div class="relative w-full h-full">
    <div
      ref="containerRef"
      class="lyrics-view-container custom-scrollbar h-full overflow-y-auto"
    >
      <div ref="contentRef" class="lyrics-content py-[38vh]">
        <div
          v-if="parsedLyrics.length > 0"
          class="virtual-wrapper"
          :style="{ height: `${totalSize}px` }"
        >
          <div
            v-for="item in virtualItems"
            :key="`lyric-${item.index}-${String(item.key)}`"
            :data-index="item.index"
            :ref="measureRow"
            class="lyric-line"
            :class="{ 'is-active': isActiveLine(item.index) }"
            :style="getLineStyle(item.index, item.start)"
            @click="playAt(parsedLyrics[item.index].time)"
          >
            <div class="main-text" :class="{ 'word-main-text': isWordHighlightLine(item.index) }">
              <template v-if="isWordHighlightLine(item.index)">
                <span
                  v-for="(word, wordIndex) in getLineWords(item.index)"
                  :key="`word-${item.index}-${wordIndex}`"
                  class="word-token"
                  :style="getWordFillStyle(item.index, wordIndex)"
                >
                  {{ word.text }}
                </span>
              </template>
              <template v-else>
                {{ parsedLyrics[item.index].text }}
              </template>
            </div>
            <div
              v-if="lyricsSettings.showTranslation && parsedLyrics[item.index].translation"
              class="translation-text"
            >
              {{ parsedLyrics[item.index].translation }}
            </div>
            <div
              v-if="lyricsSettings.showRomaji && parsedLyrics[item.index].romaji"
              class="romaji-text"
            >
              {{ parsedLyrics[item.index].romaji }}
            </div>
          </div>
        </div>

        <div
          v-else
          class="no-lyrics flex items-center justify-center h-full text-white/30 text-2xl font-medium"
        >
          {{ emptyStateText }}
        </div>
      </div>
    </div>

    <transition name="fade">
      <button
        v-if="isUserScrolling"
        @click="resumeSync"
        class="absolute bottom-8 right-0 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white/85 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-2 border border-white/15 shadow-xl z-20"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
        </svg>
        Resume Sync
      </button>
    </transition>
  </div>
</template>

<style scoped>
.lyrics-view-container {
  scrollbar-width: none;
  scroll-behavior: smooth;
  contain: strict;
}

.lyrics-view-container::-webkit-scrollbar {
  display: none;
}

.virtual-wrapper {
  position: relative;
  width: 100%;
}

.lyric-line {
  position: absolute;
  top: 0;
  left: 0;
  width: 110%;
  padding: 0.8rem 24px 0.8rem 1rem;
  border-radius: 16px;
  text-align: left;
  user-select: none;
  cursor: pointer;
  transform-origin: left center;
  will-change: transform, opacity, filter;
  transition:
    transform 320ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 320ms cubic-bezier(0.22, 1, 0.36, 1),
    filter 320ms cubic-bezier(0.22, 1, 0.36, 1);
}

.main-text {
  font-size: clamp(1.5rem, 2.6vw, 2.25rem);
  line-height: 1.14;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.88);
  letter-spacing: 0.01em;
  text-wrap: wrap;
  transition:
    color 320ms cubic-bezier(0.22, 1, 0.36, 1),
    text-shadow 320ms cubic-bezier(0.22, 1, 0.36, 1),
    font-weight 320ms cubic-bezier(0.22, 1, 0.36, 1);
}

.word-main-text {
  white-space: pre-wrap;
}

.word-token {
  white-space: pre;
  color: transparent;
  background-image: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.98) var(--word-fill, 0%),
    rgba(255, 255, 255, 0.38) var(--word-fill, 0%)
  );
  -webkit-background-clip: text;
  background-clip: text;
}

.translation-text {
  margin-top: 0.5rem;
  font-size: clamp(0.95rem, 1.6vw, 1.2rem);
  line-height: 1.25;
  color: rgba(255, 255, 255, 0.52);
  transition: color 320ms cubic-bezier(0.22, 1, 0.36, 1);
}

.romaji-text {
  margin-top: 0.3rem;
  font-size: clamp(0.85rem, 1.3vw, 1rem);
  line-height: 1.25;
  color: rgba(255, 255, 255, 0.34);
  transition: color 320ms cubic-bezier(0.22, 1, 0.36, 1);
}

.lyric-line.is-active .main-text {
  color: #ffffff;
  font-weight: 700;
  text-shadow:
    0 10px 40px rgba(255, 255, 255, 0.22),
    0 0 12px rgba(255, 255, 255, 0.2);
}

.lyric-line.is-active .translation-text {
  color: rgba(255, 255, 255, 0.82);
}

.lyric-line.is-active .romaji-text {
  color: rgba(255, 255, 255, 0.62);
}

.lyric-line:not(.is-active):hover {
  filter: blur(0px) saturate(1) !important;
  opacity: 0.8 !important;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 180ms ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
