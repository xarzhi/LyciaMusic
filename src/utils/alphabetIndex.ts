const ALPHABET_KEYS = ['0', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), '#'] as const;

export type AlphabetIndexKey = typeof ALPHABET_KEYS[number];

export const INDEX_KEYS = [...ALPHABET_KEYS];

const INDEX_ORDER = new Map<AlphabetIndexKey, number>(
  ALPHABET_KEYS.map((key, index) => [key, index]),
);

const PINYIN_BOUNDARIES: Array<{ key: AlphabetIndexKey; boundary: string }> = [
  { key: 'A', boundary: '阿' },
  { key: 'B', boundary: '芭' },
  { key: 'C', boundary: '擦' },
  { key: 'D', boundary: '搭' },
  { key: 'E', boundary: '蛾' },
  { key: 'F', boundary: '发' },
  { key: 'G', boundary: '噶' },
  { key: 'H', boundary: '哈' },
  { key: 'J', boundary: '击' },
  { key: 'K', boundary: '喀' },
  { key: 'L', boundary: '垃' },
  { key: 'M', boundary: '妈' },
  { key: 'N', boundary: '拿' },
  { key: 'O', boundary: '哦' },
  { key: 'P', boundary: '啪' },
  { key: 'Q', boundary: '期' },
  { key: 'R', boundary: '然' },
  { key: 'S', boundary: '撒' },
  { key: 'T', boundary: '塌' },
  { key: 'W', boundary: '挖' },
  { key: 'X', boundary: '昔' },
  { key: 'Y', boundary: '压' },
  { key: 'Z', boundary: '匝' },
];

const pinyinCollator = new Intl.Collator('zh-CN-u-co-pinyin', {
  numeric: true,
  sensitivity: 'base',
});

const isAsciiLetter = (value: string) => /^[A-Za-z]$/.test(value);
const isDigit = (value: string) => /^\d$/.test(value);
const isCjk = (value: string) =>
  /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(value);

const getLeadingChar = (value: string) => value.trimStart().charAt(0);

const getChineseInitial = (value: string): AlphabetIndexKey => {
  for (let index = PINYIN_BOUNDARIES.length - 1; index >= 0; index -= 1) {
    const item = PINYIN_BOUNDARIES[index];
    if (pinyinCollator.compare(value, item.boundary) >= 0) {
      return item.key;
    }
  }

  return '#';
};

export const getAlphabetIndexKey = (value: string | null | undefined): AlphabetIndexKey => {
  const char = getLeadingChar(value || '');

  if (!char) {
    return '#';
  }

  if (isDigit(char)) {
    return '0';
  }

  if (isAsciiLetter(char)) {
    return char.toUpperCase() as AlphabetIndexKey;
  }

  if (isCjk(char)) {
    return getChineseInitial(char);
  }

  return '#';
};

export const compareByAlphabetIndex = (left: string, right: string) => {
  const leftKey = getAlphabetIndexKey(left);
  const rightKey = getAlphabetIndexKey(right);
  const orderDiff = (INDEX_ORDER.get(leftKey) || 0) - (INDEX_ORDER.get(rightKey) || 0);

  if (orderDiff !== 0) {
    return orderDiff;
  }

  return pinyinCollator.compare(left.trim(), right.trim());
};

export const sortItemsByAlphabetIndex = <T>(
  items: T[],
  getLabel: (item: T) => string,
) => {
  return [...items].sort((left, right) =>
    compareByAlphabetIndex(getLabel(left) || '', getLabel(right) || ''),
  );
};
