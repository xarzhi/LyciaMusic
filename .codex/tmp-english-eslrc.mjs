import { parseEslrc } from '../node_modules/@applemusic-like-lyrics/lyric/pkg/amll_lyric.js';

const src = `[ti:Children In The Dark]\n[ar:AViVA]\n[al:Children In The Dark]\n[offset:0]\n[tool:LDDC v0.9.2 https://github.com/chenmozhijin/LDDC]\n\n[00:00.000]Children[00:00.053] [00:00.106]In[00:00.159] [00:00.212]The[00:00.265] [00:00.318]Dark[00:00.371] [00:00.424]-[00:00.477] [00:00.530]AViVA[00:00.583]\n[00:00.000]QQ音乐享有本翻译作品的著作权[00:00.590]\n[00:00.597]Your [00:00.950]lies [00:01.373]la [00:01.596]la [00:01.805]la [00:02.021]la[00:02.284]\n[00:00.597]你的谎言[00:02.280]\n[00:02.284]Your [00:02.782]lies [00:03.244]la [00:03.444]la [00:03.684]la [00:03.909]la[00:04.229]\n[00:02.284]你的谎言[00:04.220]`;
const parsed = parseEslrc(src);
console.log(parsed.map(line => ({
  startTime: line.startTime,
  endTime: line.endTime,
  text: line.words.map(w => w.word).join(''),
  words: line.words.map(w => w.word)
})));
