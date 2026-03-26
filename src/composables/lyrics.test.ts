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
