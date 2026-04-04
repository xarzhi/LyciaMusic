import { parseEslrc, parseLrc } from '../node_modules/@applemusic-like-lyrics/lyric/pkg/amll_lyric.js';

const src = `[ti:再见]\n[ar:G.E.M. 邓紫棋]\n[al:新的心跳]\n[by:v_kezhzhang]\n[offset:0]\n[tool:LDDC v0.9.2 https://github.com/chenmozhijin/LDDC]\n\n[00:00.000]再[00:00.001]见 [00:00.002]- [00:00.003]G.E.M. [00:00.103]邓[00:00.233]紫[00:00.381][00:00.382]棋[00:00.534]\n[00:00.534]词：[00:00.667][00:00.668]G.E.M. [00:00.822]邓[00:00.950][00:00.951]紫[00:01.085][00:01.086]棋[00:01.232]\n[00:01.233]曲：[00:01.383]G.E.M. [00:01.528][00:01.529]邓[00:01.661]紫[00:01.807][00:01.808]棋[00:01.929]\n[00:01.930]编[00:02.079]曲：[00:02.214]Lupo [00:02.364][00:02.365]Groinig[00:02.515]\n[00:02.515]OP：[00:02.662][00:02.663]蜂[00:02.809][00:02.810]鸟[00:02.962]音[00:03.106]乐[00:03.251]\n[00:03.251]SP：[00:03.397][00:03.398]百[00:03.542][00:03.543]纳[00:03.675][00:03.676]娱[00:03.822]乐[00:06.174]\n[00:07.545]爱[00:07.721][00:07.722]情[00:07.852][00:07.853]的[00:08.022]起[00:08.375]点[00:08.718]\n[00:08.719]都[00:08.940]是[00:09.136][00:09.137]最[00:09.401]美[00:09.684][00:09.685]的[00:10.135][00:10.136]瞬[00:10.446]间[00:12.817]`;

for (const [name, parser] of Object.entries({ parseEslrc, parseLrc })) {
  const lines = parser(src);
  console.log('===', name, '===');
  console.log('lines', lines.length);
  for (const line of lines.slice(0, 8)) {
    console.log(JSON.stringify({
      startTime: line.startTime,
      endTime: line.endTime,
      text: line.words.map(w => w.word).join(''),
      words: line.words.map(w => ({ w: w.word, s: w.startTime, e: w.endTime }))
    }, null, 2));
  }
}
