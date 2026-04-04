import { parseEslrc } from '../node_modules/@applemusic-like-lyrics/lyric/pkg/amll_lyric.js';

const samples = {
  collapsed: '[00:07.545]A[00:07.722]B[00:07.853]C[00:08.022]',
  placeholder: '[00:07.545]A[00:07.721]\u2063[00:07.722]B[00:07.852]\u2063[00:07.853]C[00:08.022]',
};

for (const [name, src] of Object.entries(samples)) {
  const lines = parseEslrc(src);
  console.log('===', name, '===');
  console.log(JSON.stringify(lines.map(line => line.words.map(w => ({ w: w.word, s: w.startTime, e: w.endTime }))), null, 2));
}
