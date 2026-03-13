import { ref, computed, reactive, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import type {
  LyricLine as AmlLyricLine,
  LyricWord as AmlLyricWord,
} from '@applemusic-like-lyrics/lyric/pkg/amll_lyric.js';
import { currentSong, currentTime, AUDIO_DELAY } from './playerState';

export interface LyricLine {
  time: number;
  endTime: number;
  text: string;
  translation: string;
  romaji: string;
  words?: LyricWord[];
}

export interface LyricWord {
  text: string;
  start: number;
  end: number;
  romaji?: string;
}

export type LyricsStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

const LYRICS_SETTINGS_KEY = 'lyrics_settings';
export const DEFAULT_PLAYER_FONT_SCALE = 1;
export const MIN_PLAYER_FONT_SCALE = 0.5;
export const MAX_PLAYER_FONT_SCALE = 1.5;
export const DEFAULT_PLAYER_LINE_GAP = 1;
export const MIN_PLAYER_LINE_GAP = 0.5;
export const MAX_PLAYER_LINE_GAP = 1.5;

export interface LyricsSettings {
  showTranslation: boolean;
  showRomaji: boolean;
  isAlwaysOnTop: boolean;
  isLocked: boolean;
  colorScheme: 'default' | 'pink' | 'blue' | 'green';
  playerFontScale: number;
  playerLineGap: number;
}

const defaultLyricsSettings: LyricsSettings = {
  showTranslation: true,
  showRomaji: true,
  isAlwaysOnTop: false,
  isLocked: false,
  colorScheme: 'default' as 'default' | 'pink' | 'blue' | 'green',
  playerFontScale: DEFAULT_PLAYER_FONT_SCALE,
  playerLineGap: DEFAULT_PLAYER_LINE_GAP,
};

function clampPlayerFontScale(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_PLAYER_FONT_SCALE;
  return Math.min(MAX_PLAYER_FONT_SCALE, Math.max(MIN_PLAYER_FONT_SCALE, value));
}

function clampPlayerLineGap(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_PLAYER_LINE_GAP;
  return Math.min(MAX_PLAYER_LINE_GAP, Math.max(MIN_PLAYER_LINE_GAP, value));
}

export const lyricsSettings = reactive<LyricsSettings>({ ...defaultLyricsSettings });

const storedLyricsSettings = localStorage.getItem(LYRICS_SETTINGS_KEY);
if (storedLyricsSettings) {
  try {
    const parsed = JSON.parse(storedLyricsSettings) as Partial<LyricsSettings>;
    Object.assign(lyricsSettings, {
      ...defaultLyricsSettings,
      ...parsed,
      playerFontScale: clampPlayerFontScale(parsed.playerFontScale ?? DEFAULT_PLAYER_FONT_SCALE),
      playerLineGap: clampPlayerLineGap(parsed.playerLineGap ?? DEFAULT_PLAYER_LINE_GAP),
    });
  } catch (error) {
    console.error('Failed to parse lyrics settings:', error);
  }
}

watch(
  lyricsSettings,
  (nextSettings) => {
    localStorage.setItem(LYRICS_SETTINGS_KEY, JSON.stringify({
      ...nextSettings,
      playerFontScale: clampPlayerFontScale(nextSettings.playerFontScale),
      playerLineGap: clampPlayerLineGap(nextSettings.playerLineGap),
    }));
  },
  { deep: true }
);

export const showDesktopLyrics = ref(false);
const rawLyrics = ref<string>('');
const parsedLyrics = ref<LyricLine[]>([]);
const lyricsStatus = ref<LyricsStatus>('idle');

let loadRequestId = 0;
let amlModule: typeof import('@applemusic-like-lyrics/lyric/pkg/amll_lyric.js') | null = null;

async function getAmlModule() {
  if (!amlModule) {
    amlModule = await import('@applemusic-like-lyrics/lyric/pkg/amll_lyric.js');
  }
  return amlModule;
}

interface PreparedLine {
  startMs: number;
  endMs: number;
  text: string;
  translation: string;
  romaji: string;
  words: LyricWord[];
}

function sanitizeLineText(text: string): string {
  return text.replace(/\u200b/g, '').trim();
}

function sanitizeWordText(text: string): string {
  return text.replace(/\u200b/g, '');
}

function toSafeMs(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value < 0) return fallback;
  return Math.round(value);
}

function normalizeWord(word: AmlLyricWord, fallbackStartMs: number, fallbackEndMs: number): LyricWord {
  const startMs = toSafeMs(word.startTime, fallbackStartMs);
  const rawEndMs = toSafeMs(word.endTime, fallbackEndMs);
  const endMs = Math.max(startMs, rawEndMs);

  return {
    text: sanitizeWordText(word.word || ''),
    start: startMs / 1000,
    end: endMs / 1000,
    romaji: sanitizeWordText(word.romanWord || ''),
  };
}

function prepareLine(line: AmlLyricLine): PreparedLine | null {
  const fallbackStartMs = toSafeMs(line.startTime, 0);
  const fallbackEndMs = Math.max(fallbackStartMs + 80, toSafeMs(line.endTime, fallbackStartMs + 500));

  const words = (line.words || [])
    .map((word) => normalizeWord(word, fallbackStartMs, fallbackEndMs))
    .filter((word) => word.text.length > 0)
    .sort((a, b) => a.start - b.start);

  const wordsText = sanitizeLineText((line.words || []).map((word) => word.word || '').join(''));
  const text = wordsText || sanitizeLineText(words.map((word) => word.text).join(''));
  const translation = sanitizeLineText(line.translatedLyric || '');
  const romaji = sanitizeLineText(line.romanLyric || '');

  const firstWordStartMs = words.length > 0 ? Math.round(words[0].start * 1000) : fallbackStartMs;
  const lastWordEndMs = words.length > 0 ? Math.round(words[words.length - 1].end * 1000) : fallbackEndMs;

  const startMs = toSafeMs(line.startTime, firstWordStartMs);
  const endMs = Math.max(startMs, toSafeMs(line.endTime, lastWordEndMs));

  if (!text && !translation && !romaji && words.length === 0) return null;

  return {
    startMs,
    endMs,
    text,
    translation,
    romaji,
    words,
  };
}

function mergePreparedLines(lines: PreparedLine[]): LyricLine[] {
  if (lines.length === 0) return [];

  const sorted = [...lines].sort((a, b) => (a.startMs - b.startMs) || (a.endMs - b.endMs));
  const groups: PreparedLine[][] = [];

  for (const line of sorted) {
    const currentGroup = groups[groups.length - 1];
    if (!currentGroup) {
      groups.push([line]);
      continue;
    }

    if (Math.abs(currentGroup[0].startMs - line.startMs) <= 1) {
      currentGroup.push(line);
    } else {
      groups.push([line]);
    }
  }

  return groups.map((group) => {
    const main = group.find((line) => line.text.length > 0) ?? group[0];
    const extras = group.filter((line) => line !== main && line.text.length > 0);

    const translation = main.translation || extras[0]?.text || '';
    const romaji = main.romaji || extras[1]?.text || '';

    const endMs = Math.max(...group.map((line) => line.endMs), main.startMs + 80);

    const words = main.words.length > 0
      ? main.words
      : [{
        text: main.text || translation || romaji || ' ',
        start: main.startMs / 1000,
        end: endMs / 1000,
        romaji: '',
      }];

    return {
      time: main.startMs / 1000,
      endTime: endMs / 1000,
      text: main.text || words[0].text,
      translation,
      romaji,
      words,
    };
  }).filter((line) => line.text.length > 0 || line.translation.length > 0 || line.romaji.length > 0);
}

function scoreParsedLines(lines: AmlLyricLine[]): number {
  return lines.reduce((score, line) => {
    const hasWords = (line.words || []).some((word) => sanitizeWordText(word.word || '').length > 0);
    const hasTranslation = sanitizeLineText(line.translatedLyric || '').length > 0;
    const hasRomaji = sanitizeLineText(line.romanLyric || '').length > 0;

    return score + (hasWords ? 2 : 0) + (hasTranslation ? 1 : 0) + (hasRomaji ? 1 : 0);
  }, 0);
}

async function parseWithAml(raw: string): Promise<AmlLyricLine[]> {
  const {
    decryptQrcHex,
    parseEslrc,
    parseLrc,
    parseLys,
    parseQrc,
    parseTTML,
    parseYrc,
  } = await getAmlModule();
  const source = raw.replace(/^\uFEFF/, '').replace(/\r/g, '');
  const candidates: AmlLyricLine[][] = [];

  const collect = (parser: () => AmlLyricLine[]) => {
    try {
      const lines = parser();
      if (Array.isArray(lines) && lines.length > 0) candidates.push(lines);
    } catch {
      // Try next parser.
    }
  };

  if (/<tt[\s>]/i.test(source)) {
    collect(() => parseTTML(source).lines);
  }

  const compactHex = source.replace(/\s+/g, '');
  if (/^[0-9a-fA-F]+$/.test(compactHex) && compactHex.length > 64 && compactHex.length % 2 === 0) {
    collect(() => parseQrc(decryptQrcHex(compactHex)));
  }

  collect(() => parseYrc(source));
  collect(() => parseQrc(source));
  collect(() => parseLys(source));
  collect(() => parseEslrc(source));
  collect(() => parseLrc(source));

  if (candidates.length === 0) return [];

  candidates.sort((a, b) => {
    const scoreDiff = scoreParsedLines(b) - scoreParsedLines(a);
    if (scoreDiff !== 0) return scoreDiff;
    return b.length - a.length;
  });

  return candidates[0];
}

async function parseLyrics(raw: string): Promise<LyricLine[]> {
  const parsed = await parseWithAml(raw);
  if (parsed.length === 0) return [];

  const prepared = parsed
    .map((line) => prepareLine(line))
    .filter((line): line is PreparedLine => line !== null);

  return mergePreparedLines(prepared);
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
    const parsed = await parseLyrics(rawLyrics.value);
    if (requestId !== loadRequestId || currentSong.value?.path !== song.path) return;

    parsedLyrics.value = parsed;
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
