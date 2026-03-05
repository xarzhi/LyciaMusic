import { ref, computed, reactive } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { currentSong, currentTime, AUDIO_DELAY } from './playerState';

export interface LyricLine {
  time: number;
  text: string;
  translation: string;
  romaji: string;
  words?: LyricWord[];
}

export interface LyricWord {
  text: string;
  start: number;
  end: number;
}

export type LyricsStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export const lyricsSettings = reactive({
  showTranslation: true,
  showRomaji: true,
  isAlwaysOnTop: false,
  isLocked: false,
  colorScheme: 'default' as 'default' | 'pink' | 'blue' | 'green',
});

export const showDesktopLyrics = ref(false);
const rawLyrics = ref<string>('');
const parsedLyrics = ref<LyricLine[]>([]);
const lyricsStatus = ref<LyricsStatus>('idle');

let loadRequestId = 0;

function parseTimeTag(match: RegExpMatchArray, offsetMs: number): number {
  const min = parseInt(match[1], 10);
  const sec = parseInt(match[2], 10);
  const rawMs = match[3] ? match[3].slice(0, 3).padEnd(3, '0') : '0';
  const ms = parseInt(rawMs, 10);
  return min * 60 + sec + ms / 1000 + offsetMs / 1000;
}

function sanitizeLyricText(text: string): string {
  return text.replace(/\u200b/g, '').trim();
}

function sanitizeWordText(text: string): string {
  return text.replace(/\u200b/g, '');
}

function isMetaLine(line: string): boolean {
  return /^\[(ar|ti|al|by|re|ve|au|length):.*\]$/i.test(line);
}

function parseWordTimedText(raw: string, offsetMs: number): { text: string; words?: LyricWord[] } {
  const wordTimeExp = /<(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?>/g;
  wordTimeExp.lastIndex = 0;

  const matches = Array.from(raw.matchAll(wordTimeExp));
  if (matches.length === 0) {
    return { text: sanitizeLyricText(raw) };
  }

  const words: LyricWord[] = [];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const matchStart = match.index ?? 0;
    const segmentStart = matchStart + match[0].length;
    const nextStart = i < matches.length - 1 ? (matches[i + 1].index ?? raw.length) : raw.length;
    const segment = sanitizeWordText(raw.slice(segmentStart, nextStart));
    if (!segment) continue;

    const start = parseTimeTag(match, offsetMs);
    if (!Number.isFinite(start) || start < 0) continue;

    words.push({
      text: segment,
      start,
      end: start + 0.35,
    });
  }

  if (words.length === 0) {
    return { text: sanitizeLyricText(raw.replace(wordTimeExp, '')) };
  }

  for (let i = 0; i < words.length - 1; i++) {
    words[i].end = Math.max(words[i].start + 0.04, words[i + 1].start);
  }
  words[words.length - 1].end = words[words.length - 1].start + 0.5;

  const plain = sanitizeLyricText(raw.replace(wordTimeExp, '')) || sanitizeLyricText(words.map(w => w.text).join(''));
  return { text: plain, words };
}

function parseLrc(lrc: string): LyricLine[] {
  const normalized = lrc.replace(/^\uFEFF/, '').replace(/\r/g, '');
  const lines = normalized.split('\n');
  const rawEntries: { time: number; text: string; words?: LyricWord[] }[] = [];
  const timeExp = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g;
  let offsetMs = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const offsetMatch = line.match(/^\[offset:([+-]?\d+)\]$/i);
    if (offsetMatch) {
      offsetMs = parseInt(offsetMatch[1], 10) || 0;
      continue;
    }

    if (isMetaLine(line)) continue;

    timeExp.lastIndex = 0;
    const matches = Array.from(line.matchAll(timeExp));
    if (matches.length === 0) continue;

    timeExp.lastIndex = 0;
    const textRaw = line.replace(timeExp, '');
    const parsedText = parseWordTimedText(textRaw, offsetMs);
    const text = parsedText.text;
    if (!text) continue;

    for (const match of matches) {
      const time = parseTimeTag(match, offsetMs);
      if (Number.isFinite(time) && time >= 0) {
        rawEntries.push({ time, text, words: parsedText.words });
      }
    }
  }

  rawEntries.sort((a, b) => a.time - b.time);

  const result: LyricLine[] = [];
  if (rawEntries.length === 0) return result;

  let currentGroup = { time: rawEntries[0].time, entries: [rawEntries[0]] };

  for (let i = 1; i < rawEntries.length; i++) {
    const entry = rawEntries[i];
    if (Math.abs(entry.time - currentGroup.time) < 0.05) {
      currentGroup.entries.push(entry);
    } else {
      result.push(mapGroupToLine(currentGroup));
      currentGroup = { time: entry.time, entries: [entry] };
    }
  }

  result.push(mapGroupToLine(currentGroup));
  return result;
}

function mapGroupToLine(group: { time: number; entries: { text: string; words?: LyricWord[] }[] }): LyricLine {
  const main = group.entries[0];
  const translation = group.entries[1];
  const romaji = group.entries[2];

  return {
    time: group.time,
    text: main?.text || '',
    translation: translation?.text || '',
    romaji: romaji?.text || '',
    words: main?.words,
  };
}

async function loadLyrics() {
  const requestId = ++loadRequestId;
  const song = currentSong.value;

  if (!song) {
    rawLyrics.value = '';
    parsedLyrics.value = [];
    lyricsStatus.value = 'idle';
    return;
  }

  lyricsStatus.value = 'loading';
  rawLyrics.value = '';
  parsedLyrics.value = [];

  try {
    const lrc = await invoke<string>('get_song_lyrics', { path: song.path });

    if (requestId !== loadRequestId || currentSong.value?.path !== song.path) return;

    rawLyrics.value = lrc || '';
    parsedLyrics.value = parseLrc(rawLyrics.value);
    lyricsStatus.value = parsedLyrics.value.length > 0 ? 'ready' : 'empty';
  } catch (e) {
    if (requestId !== loadRequestId || currentSong.value?.path !== song.path) return;

    rawLyrics.value = '';
    parsedLyrics.value = [];
    lyricsStatus.value = 'error';
    console.error('Failed to load lyrics:', e);
  }
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

const currentLyricIndex = computed(() => {
  if (parsedLyrics.value.length === 0) return -1;

  const targetTime = currentTime.value - AUDIO_DELAY.value;
  return findLyricIndexByTime(parsedLyrics.value, targetTime);
});

const currentLyricLine = computed(() => {
  if (lyricsStatus.value === 'loading') {
    return { text: 'Loading lyrics...', lines: ['Loading lyrics...'] };
  }

  if (lyricsStatus.value === 'error') {
    return { text: 'Lyrics unavailable', lines: ['Lyrics unavailable'] };
  }

  if (parsedLyrics.value.length === 0) {
    const fallback = rawLyrics.value.trim() ? 'No synchronized lyrics' : 'Instrumental / No lyrics';
    return { text: fallback, lines: [fallback] };
  }

  const idx = currentLyricIndex.value;

  if (idx !== -1) {
    const current = parsedLyrics.value[idx];
    const linesToShow: string[] = [current.text];
    if (lyricsSettings.showTranslation && current.translation) linesToShow.push(current.translation);
    if (lyricsSettings.showRomaji && current.romaji) linesToShow.push(current.romaji);

    return { text: current.text, lines: linesToShow };
  }

  const first = parsedLyrics.value[0];
  return { text: first.text, lines: [first.text] };
});

export function useLyrics() {
  return {
    showDesktopLyrics,
    lyricsSettings,
    lyricsStatus,
    currentLyricLine,
    currentLyricIndex,
    parsedLyrics,
    loadLyrics,
  };
}
