import { describe, expect, it, vi } from 'vitest';

vi.stubGlobal('localStorage', {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
});

describe('normalizeEslrcSource', async () => {
  const { normalizeEslrcSource } = await import('./lyrics');

  it('keeps valid inline timestamps untouched', () => {
    const input = '[00:07.310]A[00:07.520]B[00:07.780]C[00:07.890]D[00:08.450]E[00:08.650]';

    expect(normalizeEslrcSource(input)).toBe(input);
  });

  it('preserves empty timing gaps before a word with an invisible placeholder', () => {
    const input = '[00:07.545]A[00:07.721][00:07.722]B[00:07.852][00:07.853]C[00:08.022]';

    expect(normalizeEslrcSource(input)).toBe('[00:07.545]A[00:07.721]\u2063[00:07.722]B[00:07.852]\u2063[00:07.853]C[00:08.022]');
  });
});

describe('enhanced lrc parser', async () => {
  const {
    isEnhancedLrcLine,
    mergeEnhancedLinesIntoBaseLines,
    parseEnhancedLrc,
    parseEnhancedLrcLine,
    parseTimestampToMs,
  } = await import('./lyrics');

  it('parses enhanced timestamp strings to milliseconds', () => {
    expect(parseTimestampToMs('00:36.111')).toBe(36111);
    expect(parseTimestampToMs('01:02.3')).toBe(62300);
    expect(parseTimestampToMs('bad')).toBeNull();
  });

  it('detects enhanced lrc lines by angle-bracket timestamps', () => {
    expect(isEnhancedLrcLine('[00:36.111]<00:36.111>A<00:36.551>B<00:37.111>')).toBe(true);
    expect(isEnhancedLrcLine('[00:36.111]plain line')).toBe(false);
    expect(isEnhancedLrcLine('[ar:Artist]')).toBe(false);
  });

  it('parses a standard enhanced lrc line into words and line timing', () => {
    const parsed = parseEnhancedLrcLine('[00:36.111]<00:36.111>A<00:36.551>B<00:36.991>C<00:37.421>');

    expect(parsed).not.toBeNull();
    expect(parsed?.startTime).toBe(36111);
    expect(parsed?.endTime).toBe(37421);
    expect(parsed?.words.map((word) => ({
      text: word.word,
      start: word.startTime,
      end: word.endTime,
    }))).toEqual([
      { text: 'A', start: 36111, end: 36551 },
      { text: 'B', start: 36551, end: 36991 },
      { text: 'C', start: 36991, end: 37421 },
    ]);
  });

  it('allows line start time and first word time to differ', () => {
    const parsed = parseEnhancedLrcLine('[00:36.000]<00:36.111>Lead<00:36.551>In<00:36.991>');

    expect(parsed).not.toBeNull();
    expect(parsed?.startTime).toBe(36000);
    expect(parsed?.words[0].startTime).toBe(36111);
    expect(parsed?.endTime).toBe(36991);
  });

  it('supports spaces and punctuation inside enhanced word text', () => {
    const parsed = parseEnhancedLrcLine(`[00:19.960]<00:19.960>Composer:<00:21.292> Yang<00:22.624>${'\uFF1A'}<00:23.956> OK<00:25.288>!<00:26.620>`);

    expect(parsed).not.toBeNull();
    expect(parsed?.words.map((word) => word.word)).toEqual([
      'Composer:',
      ' Yang',
      '\uFF1A',
      ' OK',
      '!',
    ]);
  });

  it('falls back on malformed enhanced lines while preserving valid enhanced lines', () => {
    const parsed = parseEnhancedLrc([
      '[00:36.111]<00:36.111>A<00:36.551>B<00:36.991>',
      '[00:40.000]<00:40.000>Broken<00:40.500>Line',
      '[00:41.000]plain line',
    ].join('\n'));

    expect(parsed).toHaveLength(1);
    expect(parsed[0].startTime).toBe(36111);
  });

  it('merges enhanced lines into a plain lrc baseline without dropping ordinary lines', () => {
    const enhancedLines = parseEnhancedLrc('[00:10.000]<00:10.000>A<00:10.500>B<00:11.000>');
    const baseLines = [
      {
        words: [{
          startTime: 10000,
          endTime: 11000,
          word: '<00:10.000>A<00:10.500>B<00:11.000>',
          romanWord: '',
        }],
        translatedLyric: '',
        romanLyric: '',
        isBG: false,
        isDuet: false,
        startTime: 10000,
        endTime: 11000,
      },
      {
        words: [{
          startTime: 12000,
          endTime: 13000,
          word: 'Plain line',
          romanWord: '',
        }],
        translatedLyric: '',
        romanLyric: '',
        isBG: false,
        isDuet: false,
        startTime: 12000,
        endTime: 13000,
      },
    ];

    const merged = mergeEnhancedLinesIntoBaseLines(enhancedLines, baseLines);

    expect(merged).toHaveLength(2);
    expect(merged[0].words.map((word) => word.word)).toEqual(['A', 'B']);
    expect(merged[1].words[0]?.word).toBe('Plain line');
  });
});
