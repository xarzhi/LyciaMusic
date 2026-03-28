import { ref, computed, reactive, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { usePlaybackStore } from '../features/playback/store';
import type {
  LyricLine as AmlLyricLine,
  LyricWord as AmlLyricWord,
} from '@applemusic-like-lyrics/lyric/pkg/amll_lyric.js';
import { useSettingsStore } from '../features/settings/store';

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

export interface CurrentLyricDisplayLine {
  kind: 'main' | 'romaji' | 'translation';
  text: string;
  words?: LyricWord[];
}

export interface CurrentLyricDisplayState {
  text: string;
  lines: string[];
  displayLines: CurrentLyricDisplayLine[];
}

export type LyricsStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

const LYRICS_SETTINGS_KEY = 'lyrics_settings';
export const DEFAULT_PLAYER_FONT_SCALE = 1;
export const MIN_PLAYER_FONT_SCALE = 0.5;
export const MAX_PLAYER_FONT_SCALE = 1.5;
export const DEFAULT_PLAYER_LINE_GAP = 1;
export const MIN_PLAYER_LINE_GAP = 0.5;
export const MAX_PLAYER_LINE_GAP = 1.5;
export type LyricsPlayerAlignment = 'left' | 'center' | 'right';
export const DEFAULT_PLAYER_ALIGNMENT: LyricsPlayerAlignment = 'left';
export type LyricsFontPreset =
  | 'system'
  | 'yahei'
  | 'dengxian'
  | 'songti'
  | 'heiti'
  | 'kaiti'
  | 'arial'
  | 'georgia'
  | 'mono';
export const DEFAULT_PLAYER_FONT_PRESET: LyricsFontPreset = 'system';
export const LYRICS_FONT_OPTIONS = [
  {
    value: 'system',
    label: '跟随系统默认',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  {
    value: 'yahei',
    label: '微软雅黑',
    fontFamily: '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif',
  },
  {
    value: 'dengxian',
    label: '等线',
    fontFamily: '"DengXian", "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif',
  },
  {
    value: 'songti',
    label: '宋体',
    fontFamily: '"SimSun", "Songti SC", "STSong", serif',
  },
  {
    value: 'heiti',
    label: '黑体',
    fontFamily: '"SimHei", "Heiti SC", "Microsoft YaHei", sans-serif',
  },
  {
    value: 'kaiti',
    label: '楷体',
    fontFamily: '"KaiTi", "Kaiti SC", "STKaiti", serif',
  },
  {
    value: 'arial',
    label: 'Arial',
    fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
  },
  {
    value: 'georgia',
    label: 'Georgia',
    fontFamily: 'Georgia, "Times New Roman", serif',
  },
  {
    value: 'mono',
    label: '等宽字体',
    fontFamily: '"Cascadia Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
  },
] as const satisfies ReadonlyArray<{
  value: LyricsFontPreset;
  label: string;
  fontFamily: string;
}>;

export interface LyricsSettings {
  showTranslation: boolean;
  showRomaji: boolean;
  isAlwaysOnTop: boolean;
  isLocked: boolean;
  colorScheme: 'default' | 'pink' | 'blue' | 'green';
  playerFontScale: number;
  playerLineGap: number;
  playerAlignment: LyricsPlayerAlignment;
  playerFontPreset: LyricsFontPreset;
}

const defaultLyricsSettings: LyricsSettings = {
  showTranslation: true,
  showRomaji: false,
  isAlwaysOnTop: false,
  isLocked: false,
  colorScheme: 'default' as 'default' | 'pink' | 'blue' | 'green',
  playerFontScale: DEFAULT_PLAYER_FONT_SCALE,
  playerLineGap: DEFAULT_PLAYER_LINE_GAP,
  playerAlignment: DEFAULT_PLAYER_ALIGNMENT,
  playerFontPreset: DEFAULT_PLAYER_FONT_PRESET,
};

const TIMESTAMP_BLOCK_PATTERN = /\[(\d{1,}:\d{2}(?:\.\d+)?)\]/g;
const ADJACENT_TIMESTAMPS_BEFORE_TEXT_PATTERN = /(?:\[(?:\d{1,}:\d{2}(?:\.\d+)?)\])+(?=[^\[\]\r\n])/g;
const ESLRC_GAP_PLACEHOLDER = '\u2063';
const ENHANCED_TIMESTAMP_PATTERN = /<(\d{1,}:\d{2}(?:\.\d+)?)>/g;
const ENHANCED_TIMESTAMP_TEXT_PATTERN = /<\d{1,}:\d{2}(?:\.\d+)?>/;
const LRC_LINE_TIMESTAMP_PATTERN = /^\[(\d{1,}:\d{2}(?:\.\d+)?)\](.*)$/;

type ParserSource = 'enhanced' | 'yrc' | 'qrc' | 'lys' | 'eslrc' | 'lrc';

interface ParserCandidate {
  source: ParserSource;
  lines: AmlLyricLine[];
}

const PARSER_PRIORITIES: Record<ParserSource, number> = {
  enhanced: 5,
  yrc: 4,
  qrc: 3,
  lys: 2,
  eslrc: 1,
  lrc: 0,
};

function clampPlayerFontScale(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_PLAYER_FONT_SCALE;
  return Math.min(MAX_PLAYER_FONT_SCALE, Math.max(MIN_PLAYER_FONT_SCALE, value));
}

function clampPlayerLineGap(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_PLAYER_LINE_GAP;
  return Math.min(MAX_PLAYER_LINE_GAP, Math.max(MIN_PLAYER_LINE_GAP, value));
}

function normalizePlayerAlignment(value: unknown): LyricsPlayerAlignment {
  return value === 'center' || value === 'right' ? value : DEFAULT_PLAYER_ALIGNMENT;
}

export function normalizeLyricsFontPreset(value: unknown): LyricsFontPreset {
  return LYRICS_FONT_OPTIONS.some((option) => option.value === value)
    ? value as LyricsFontPreset
    : DEFAULT_PLAYER_FONT_PRESET;
}

export function getLyricsFontFamily(preset: LyricsFontPreset): string {
  return LYRICS_FONT_OPTIONS.find((option) => option.value === preset)?.fontFamily
    ?? LYRICS_FONT_OPTIONS[0].fontFamily;
}

export const lyricsSettings = reactive<LyricsSettings>({ ...defaultLyricsSettings });

const storage = typeof localStorage === 'undefined' ? null : localStorage;
const storedLyricsSettings = storage?.getItem(LYRICS_SETTINGS_KEY);
if (storedLyricsSettings) {
  try {
    const parsed = JSON.parse(storedLyricsSettings) as Partial<LyricsSettings>;
    Object.assign(lyricsSettings, {
      ...defaultLyricsSettings,
      ...parsed,
      playerFontScale: clampPlayerFontScale(parsed.playerFontScale ?? DEFAULT_PLAYER_FONT_SCALE),
      playerLineGap: clampPlayerLineGap(parsed.playerLineGap ?? DEFAULT_PLAYER_LINE_GAP),
      playerAlignment: normalizePlayerAlignment(parsed.playerAlignment),
      playerFontPreset: normalizeLyricsFontPreset(parsed.playerFontPreset),
    });
  } catch (error) {
    console.error('Failed to parse lyrics settings:', error);
  }
}

watch(
  lyricsSettings,
  (nextSettings) => {
    storage?.setItem(LYRICS_SETTINGS_KEY, JSON.stringify({
      ...nextSettings,
      playerFontScale: clampPlayerFontScale(nextSettings.playerFontScale),
      playerLineGap: clampPlayerLineGap(nextSettings.playerLineGap),
      playerAlignment: normalizePlayerAlignment(nextSettings.playerAlignment),
      playerFontPreset: normalizeLyricsFontPreset(nextSettings.playerFontPreset),
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
  sourceIndex: number;
}

interface LineScriptProfile {
  latinCount: number;
  kanaCount: number;
  hanCount: number;
}

interface ClassifiedGroupLines {
  main: PreparedLine;
  translationLine: PreparedLine | null;
  romajiLine: PreparedLine | null;
}

function sanitizeLineText(text: string): string {
  return text.replace(/\u200b/g, '').trim();
}

function sanitizeWordText(text: string): string {
  return text.replace(/[\u200b\u2063]/g, '');
}

export function normalizeEslrcSource(source: string): string {
  return source.replace(ADJACENT_TIMESTAMPS_BEFORE_TEXT_PATTERN, (match) => {
    const timestamps = [...match.matchAll(TIMESTAMP_BLOCK_PATTERN)];
    if (timestamps.length <= 1) return match;

    return timestamps
      .map((timestamp, index) => (index === timestamps.length - 1
        ? timestamp[0]
        : `${timestamp[0]}${ESLRC_GAP_PLACEHOLDER}`))
      .join('');
  });
}

export function parseTimestampToMs(raw: string): number | null {
  const match = /^(\d+):(\d{2})(?:\.(\d{1,3}))?$/.exec(raw.trim());
  if (!match) return null;

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const milliseconds = Number((match[3] ?? '').padEnd(3, '0').slice(0, 3) || '0');

  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || !Number.isFinite(milliseconds)) {
    return null;
  }
  if (seconds >= 60) return null;

  return (minutes * 60 * 1000) + (seconds * 1000) + milliseconds;
}

export function isEnhancedLrcLine(line: string): boolean {
  const match = LRC_LINE_TIMESTAMP_PATTERN.exec(line);
  if (!match) return false;

  return ENHANCED_TIMESTAMP_TEXT_PATTERN.test(match[2]);
}

export function parseEnhancedLrcLine(line: string): AmlLyricLine | null {
  const lineMatch = LRC_LINE_TIMESTAMP_PATTERN.exec(line);
  if (!lineMatch) return null;

  const lineStartTime = parseTimestampToMs(lineMatch[1]);
  if (lineStartTime === null) return null;

  const body = lineMatch[2];
  const markers = [...body.matchAll(ENHANCED_TIMESTAMP_PATTERN)];
  if (markers.length < 2) return null;

  const leadingText = body.slice(0, markers[0].index ?? 0);
  if (leadingText.trim().length > 0) return null;

  const words: AmlLyricWord[] = [];
  let explicitEndTime: number | null = null;

  for (let index = 0; index < markers.length; index += 1) {
    const currentMarker = markers[index];
    const nextMarker = markers[index + 1];
    const currentStart = parseTimestampToMs(currentMarker[1]);
    if (currentStart === null) return null;

    const currentMarkerEnd = (currentMarker.index ?? 0) + currentMarker[0].length;
    const nextMarkerIndex = nextMarker?.index ?? body.length;
    const text = body.slice(currentMarkerEnd, nextMarkerIndex);

    if (!nextMarker) {
      if (text.length > 0) return null;
      explicitEndTime = currentStart;
      continue;
    }

    const nextStart = parseTimestampToMs(nextMarker[1]);
    if (nextStart === null || nextStart < currentStart) return null;
    if (text.length === 0) return null;

    words.push({
      startTime: currentStart,
      endTime: nextStart,
      word: text,
      romanWord: '',
    });
  }

  if (words.length === 0) return null;

  const endTime = explicitEndTime ?? words[words.length - 1].endTime;
  if (endTime < lineStartTime) return null;

  return {
    words,
    translatedLyric: '',
    romanLyric: '',
    isBG: false,
    isDuet: false,
    startTime: lineStartTime,
    endTime,
  };
}

export function parseEnhancedLrc(source: string): AmlLyricLine[] {
  const lines: AmlLyricLine[] = [];

  for (const rawLine of source.split('\n')) {
    if (!isEnhancedLrcLine(rawLine)) continue;

    const parsedLine = parseEnhancedLrcLine(rawLine);
    if (parsedLine) lines.push(parsedLine);
  }

  return lines;
}

function lineContainsEnhancedMarkup(line: AmlLyricLine): boolean {
  if (ENHANCED_TIMESTAMP_TEXT_PATTERN.test(line.translatedLyric || '')) return true;
  if (ENHANCED_TIMESTAMP_TEXT_PATTERN.test(line.romanLyric || '')) return true;

  return (line.words || []).some((word) => ENHANCED_TIMESTAMP_TEXT_PATTERN.test(word.word || ''));
}

export function mergeEnhancedLinesIntoBaseLines(
  enhancedLines: AmlLyricLine[],
  baseLines: AmlLyricLine[],
): AmlLyricLine[] {
  if (enhancedLines.length === 0) return baseLines;
  if (baseLines.length === 0) return enhancedLines;

  const enhancedGroups = new Map<number, AmlLyricLine[]>();
  for (const line of enhancedLines) {
    const existingGroup = enhancedGroups.get(line.startTime);
    if (existingGroup) {
      existingGroup.push(line);
    } else {
      enhancedGroups.set(line.startTime, [line]);
    }
  }

  const baseGroups = new Map<number, AmlLyricLine[]>();
  for (const line of baseLines) {
    const existingGroup = baseGroups.get(line.startTime);
    if (existingGroup) {
      existingGroup.push(line);
    } else {
      baseGroups.set(line.startTime, [line]);
    }
  }

  const times = new Set<number>([
    ...enhancedGroups.keys(),
    ...baseGroups.keys(),
  ]);

  return [...times]
    .sort((a, b) => a - b)
    .flatMap((startTime) => {
      const mergedGroup: AmlLyricLine[] = [];
      const enhancedGroup = enhancedGroups.get(startTime) ?? [];
      const baseGroup = baseGroups.get(startTime) ?? [];

      if (enhancedGroup.length > 0) {
        mergedGroup.push(...enhancedGroup);
        mergedGroup.push(...baseGroup.filter((line) => !lineContainsEnhancedMarkup(line)));
      } else {
        mergedGroup.push(...baseGroup);
      }

      return mergedGroup;
    });
}

function compareParserCandidates(left: ParserCandidate, right: ParserCandidate): number {
  const scoreDiff = scoreParsedLines(right.lines) - scoreParsedLines(left.lines);
  if (scoreDiff !== 0) return scoreDiff;

  const lineCountDiff = right.lines.length - left.lines.length;
  if (lineCountDiff !== 0) return lineCountDiff;

  return PARSER_PRIORITIES[right.source] - PARSER_PRIORITIES[left.source];
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

function prepareLine(line: AmlLyricLine, sourceIndex: number): PreparedLine | null {
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
    sourceIndex,
  };
}

export function mergePreparedLines(lines: PreparedLine[]): LyricLine[] {
  if (lines.length === 0) return [];

  const sorted = [...lines].sort((a, b) => (
    (a.startMs - b.startMs)
    || (a.sourceIndex - b.sourceIndex)
    || (a.endMs - b.endMs)
  ));
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
    const { main, translationLine, romajiLine } = classifyGroupLines(group);
    const translation = translationLine?.text || '';
    const romaji = romajiLine?.text || '';

    const endMs = Math.max(...group.map((line) => line.endMs), main.startMs + 80);

    const words = main.words.length > 0
      ? mergeRomajiWords(main.words, romajiLine?.words ?? [])
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
      translation: main.translation || translation,
      romaji: main.romaji || romaji,
      words,
    };
  }).filter((line) => line.text.length > 0 || line.translation.length > 0 || line.romaji.length > 0);
}

function getLineScriptProfile(text: string): LineScriptProfile {
  const profile: LineScriptProfile = {
    latinCount: 0,
    kanaCount: 0,
    hanCount: 0,
  };

  for (const char of text) {
    if (/\p{Script=Latin}/u.test(char)) {
      profile.latinCount += 1;
      continue;
    }
    if (/[\u3040-\u30ff\u31f0-\u31ff\uff66-\uff9f]/u.test(char)) {
      profile.kanaCount += 1;
      continue;
    }
    if (/\p{Script=Han}/u.test(char)) {
      profile.hanCount += 1;
    }
  }

  return profile;
}

function approxSameWordTiming(left: LyricWord, right: LyricWord, toleranceMs = 80): boolean {
  const leftStart = Math.round(left.start * 1000);
  const rightStart = Math.round(right.start * 1000);
  const leftEnd = Math.round(left.end * 1000);
  const rightEnd = Math.round(right.end * 1000);

  return Math.abs(leftStart - rightStart) <= toleranceMs && Math.abs(leftEnd - rightEnd) <= toleranceMs;
}

function mergeRomajiWords(mainWords: LyricWord[], romajiWords: LyricWord[]): LyricWord[] {
  if (mainWords.length === 0 || romajiWords.length === 0) return mainWords;
  if (mainWords.length !== romajiWords.length) return mainWords;

  const allAligned = mainWords.every((word, index) => approxSameWordTiming(word, romajiWords[index]));
  if (!allAligned) return mainWords;

  return mainWords.map((word, index) => ({
    ...word,
    romaji: romajiWords[index].text || word.romaji || '',
  }));
}

function hasExplicitSecondaryContent(line: PreparedLine): boolean {
  return line.translation.length > 0 || line.romaji.length > 0;
}

function isRomajiCandidate(line: PreparedLine): boolean {
  const profile = getLineScriptProfile(line.text);
  return profile.latinCount > 0 && profile.kanaCount === 0 && profile.hanCount === 0;
}

function isJapaneseCandidate(line: PreparedLine): boolean {
  const profile = getLineScriptProfile(line.text);
  return profile.kanaCount > 0;
}

function isHanOnlyCandidate(line: PreparedLine): boolean {
  const profile = getLineScriptProfile(line.text);
  return profile.hanCount > 0 && profile.kanaCount === 0 && profile.latinCount === 0;
}

function classifyGroupLines(group: PreparedLine[]): ClassifiedGroupLines {
  const textLines = group.filter((line) => line.text.length > 0);
  const explicitMain = textLines.find((line) => hasExplicitSecondaryContent(line));
  const japaneseCandidates = textLines.filter((line) => isJapaneseCandidate(line));
  const hasJapaneseMain = japaneseCandidates.length > 0;
  const romajiCandidates = hasJapaneseMain
    ? textLines.filter((line) => !isJapaneseCandidate(line) && isRomajiCandidate(line))
    : [];
  const translationCandidates = hasJapaneseMain
    ? textLines.filter((line) => !japaneseCandidates.includes(line) && !romajiCandidates.includes(line))
    : [];

  const main = explicitMain
    ?? japaneseCandidates[0]
    ?? textLines[0]
    ?? group[0];

  const translationLine = main.translation
    ? null
    : translationCandidates.find((line) => line !== main)
      ?? (hasJapaneseMain
        ? textLines.find((line) => line !== main && !romajiCandidates.includes(line) && isHanOnlyCandidate(line))
        : textLines.find((line) => line !== main));

  const romajiLine = main.romaji
    ? null
    : romajiCandidates.find((line) => line !== main)
      ?? (translationLine
        ? textLines.find((line) => line !== main && line !== translationLine)
        : textLines.find((line) => line !== main));

  return {
    main,
    translationLine: translationLine ?? null,
    romajiLine: romajiLine ?? null,
  };
}

function getOrderedSecondaryLyrics(line: Pick<LyricLine, 'translation' | 'romaji'>, showTranslation: boolean, showRomaji: boolean) {
  const orderedLines: string[] = [];
  if (showRomaji && line.romaji) orderedLines.push(line.romaji);
  if (showTranslation && line.translation) orderedLines.push(line.translation);
  return orderedLines;
}

export function getCurrentLyricDisplayLines(
  line: LyricLine,
  showTranslation: boolean,
  showRomaji: boolean,
): CurrentLyricDisplayLine[] {
  const displayLines: CurrentLyricDisplayLine[] = [{
    kind: 'main',
    text: line.text,
  }];

  if (showRomaji && line.romaji) {
    const romajiWords = (line.words ?? [])
      .filter((word) => (word.romaji || '').length > 0)
      .map((word) => ({
        text: word.romaji || '',
        start: word.start,
        end: word.end,
      }));

    displayLines.push({
      kind: 'romaji',
      text: line.romaji,
      words: romajiWords.length > 0 ? romajiWords : undefined,
    });
  }

  if (showTranslation && line.translation) {
    displayLines.push({
      kind: 'translation',
      text: line.translation,
    });
  }

  return displayLines;
}

export function getDisplaySubtitles(
  line: Pick<LyricLine, 'translation' | 'romaji'>,
  showTranslation: boolean,
  showRomaji: boolean,
) {
  const orderedLines = getOrderedSecondaryLyrics(line, showTranslation, showRomaji);
  return {
    upper: orderedLines[0] || '',
    lower: orderedLines[1] || '',
  };
}

function scoreParsedLines(lines: AmlLyricLine[]): number {
  return lines.reduce((score, line) => {
    const hasWords = (line.words || []).some((word) => sanitizeWordText(word.word || '').length > 0);
    const hasTranslation = sanitizeLineText(line.translatedLyric || '').length > 0;
    const hasRomaji = sanitizeLineText(line.romanLyric || '').length > 0;

    return score + (hasWords ? 2 : 0) + (hasTranslation ? 1 : 0) + (hasRomaji ? 1 : 0);
  }, 0);
}

export async function parseWithAml(raw: string): Promise<AmlLyricLine[]> {
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
  const normalizedEslrcSource = normalizeEslrcSource(source);
  const candidates: ParserCandidate[] = [];

  const collect = (candidateSource: ParserSource, parser: () => AmlLyricLine[]) => {
    try {
      const lines = parser();
      if (Array.isArray(lines) && lines.length > 0) {
        candidates.push({
          source: candidateSource,
          lines,
        });
      }
    } catch {
      // Try next parser.
    }
  };

  if (/<tt[\s>]/i.test(source)) {
    collect('lrc', () => parseTTML(source).lines);
  }

  const compactHex = source.replace(/\s+/g, '');
  if (/^[0-9a-fA-F]+$/.test(compactHex) && compactHex.length > 64 && compactHex.length % 2 === 0) {
    collect('qrc', () => parseQrc(decryptQrcHex(compactHex)));
  }

  collect('yrc', () => parseYrc(source));
  collect('qrc', () => parseQrc(source));
  collect('lys', () => parseLys(source));
  collect('eslrc', () => parseEslrc(normalizedEslrcSource));
  collect('lrc', () => parseLrc(source));

  const enhancedLines = parseEnhancedLrc(source);
  if (enhancedLines.length > 0) {
    const baselineCandidate = [...candidates]
      .filter((candidate) => candidate.source !== 'enhanced')
      .sort(compareParserCandidates)[0];

    candidates.push({
      source: 'enhanced',
      lines: baselineCandidate
        ? mergeEnhancedLinesIntoBaseLines(enhancedLines, baselineCandidate.lines)
        : enhancedLines,
    });
  }

  if (candidates.length === 0) return [];

  candidates.sort(compareParserCandidates);

  return candidates[0].lines;
}

async function parseLyrics(raw: string): Promise<LyricLine[]> {
  const parsed = await parseWithAml(raw);
  if (parsed.length === 0) return [];

  const prepared = parsed
    .map((line, index) => prepareLine(line, index))
    .filter((line): line is PreparedLine => line !== null);

  return mergePreparedLines(prepared);
}

async function loadLyrics() {
  const requestId = ++loadRequestId;
  const playbackStore = usePlaybackStore();
  const song = playbackStore.currentSong;

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

    if (requestId !== loadRequestId || playbackStore.currentSong?.path !== song.path) return;

    rawLyrics.value = lrc || '';
    const parsed = await parseLyrics(rawLyrics.value);
    if (requestId !== loadRequestId || playbackStore.currentSong?.path !== song.path) return;

    parsedLyrics.value = parsed;
    lyricsStatus.value = parsedLyrics.value.length > 0 ? 'ready' : 'empty';
  } catch (e) {
    if (requestId !== loadRequestId || playbackStore.currentSong?.path !== song.path) return;

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

  const targetTime = usePlaybackStore().currentTime - useSettingsStore().audioDelay;
  return findLyricIndexByTime(parsedLyrics.value, targetTime);
});

const currentLyricLine = computed<CurrentLyricDisplayState>(() => {
  if (lyricsStatus.value === 'loading') {
    return {
      text: 'Loading lyrics...',
      lines: ['Loading lyrics...'],
      displayLines: [{ kind: 'main', text: 'Loading lyrics...' }],
    };
  }

  if (lyricsStatus.value === 'error') {
    return {
      text: 'Lyrics unavailable',
      lines: ['Lyrics unavailable'],
      displayLines: [{ kind: 'main', text: 'Lyrics unavailable' }],
    };
  }

  if (parsedLyrics.value.length === 0) {
    const fallback = rawLyrics.value.trim() ? 'No synchronized lyrics' : 'Instrumental / No lyrics';
    return {
      text: fallback,
      lines: [fallback],
      displayLines: [{ kind: 'main', text: fallback }],
    };
  }

  const idx = currentLyricIndex.value;

  if (idx !== -1) {
    const current = parsedLyrics.value[idx];
    const displayLines = getCurrentLyricDisplayLines(
      current,
      lyricsSettings.showTranslation,
      lyricsSettings.showRomaji,
    );

    return {
      text: current.text,
      lines: displayLines.map((line) => line.text),
      displayLines,
    };
  }

  const first = parsedLyrics.value[0];
  return {
    text: first.text,
    lines: [first.text],
    displayLines: [{ kind: 'main', text: first.text }],
  };
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
