<script setup lang="ts">
import { computed } from 'vue';
import type { LyricLine as AmlLyricLine, LyricLineMouseEvent } from '@applemusic-like-lyrics/core';
import { useLyrics } from '../../composables/lyrics';
import { usePlayer } from '../../composables/player';
import { AUDIO_DELAY } from '../../composables/playerState';
import AmlLyricPlayer from './AmlLyricPlayer.vue';

const { parsedLyrics, lyricsSettings, lyricsStatus } = useLyrics();
const { seekTo, currentTime } = usePlayer();

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
  return Math.max(0, Math.floor((currentTime.value - AUDIO_DELAY.value) * 1000));
});

const emptyStateText = computed(() => {
  if (lyricsStatus.value === 'loading') return 'Loading lyrics...';
  if (lyricsStatus.value === 'error') return 'Lyrics unavailable';
  return 'No synchronized lyrics';
});

async function handleLineClick(event: LyricLineMouseEvent) {
  const targetSeconds = event.line.getLine().startTime / 1000;
  await seekTo(targetSeconds);
}
</script>

<template>
  <div class="relative w-full h-full min-h-0 min-w-0">
    <div
      v-if="amllLines.length > 0"
      class="lyrics-mask-shell w-full h-full min-h-0 min-w-0"
    >
      <AmlLyricPlayer
        class="amll-host w-full h-full min-h-0 min-w-0"
        :lyric-lines="amllLines"
        :current-time="amllCurrentTime"
        align-anchor="center"
        :align-position="0.5"
        :enable-spring="true"
        :enable-blur="true"
        :enable-scale="true"
        :hide-passed-lines="false"
        :word-fade-width="0.5"
        @line-click="handleLineClick"
      />
    </div>

    <div
      v-else
      class="no-lyrics flex items-center justify-center h-full text-white/30 text-2xl font-medium"
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
  --lyrics-edge-fade: 16%;
  --lyrics-edge-softness: 7%;
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
}
</style>
