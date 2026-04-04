import { parseLrc, parseYrc, parseEslrc, parseLys } from '../node_modules/@applemusic-like-lyrics/lyric/pkg/amll_lyric.js';

const samples = {
  chinese_ok: `[ar:G.E.M.邓紫棋]\n[al:新的心跳]\n[ti:再见（good bye）]\n[tool:LDDC v0.9.2 https://github.com/chenmozhijin/LDDC]\n[00:07.310]爱[00:07.520]情[00:07.780]的[00:07.890]起[00:08.450]点 [00:08.650]都[00:09.030]是[00:09.290]最[00:09.520]美[00:09.760]的[00:10.030]瞬[00:10.450]间[00:11.680]`,
  english_fail: `[ti:Children In The Dark]\n[ar:AViVA]\n[al:Children In The Dark]\n[offset:0]\n[tool:LDDC v0.9.2 https://github.com/chenmozhijin/LDDC]\n\n[00:00.000]Children[00:00.053] [00:00.106]In[00:00.159] [00:00.212]The[00:00.265] [00:00.318]Dark[00:00.371] [00:00.424]-[00:00.477] [00:00.530]AViVA[00:00.583]\n[00:00.000]QQ音乐享有本翻译作品的著作权[00:00.590]\n[00:00.597]Your [00:00.950]lies [00:01.373]la [00:01.596]la [00:01.805]la [00:02.021]la[00:02.284]\n[00:00.597]你的谎言[00:02.280]\n[00:02.284]Your [00:02.782]lies [00:03.244]la [00:03.444]la [00:03.684]la [00:03.909]la[00:04.229]\n[00:02.284]你的谎言[00:04.220]`,
  single_cn_fail: `[00:26.621]电[00:26.871]影[00:27.191]院[00:27.621]里[00:28.061]你[00:28.501]的[00:28.931]背[00:29.371]影[00:29.811]还[00:30.061]是[00:30.371]那[00:30.681]么[00:31.121]纯[00:31.491]情[00:31.931]`
};

for (const [name, src] of Object.entries(samples)) {
  console.log('===', name, '===');
  for (const [parserName, parser] of Object.entries({ parseYrc, parseLys, parseEslrc, parseLrc })) {
    try {
      const lines = parser(src);
      console.log(parserName, 'lines=', lines.length);
      console.log(JSON.stringify(lines.slice(0,2), null, 2));
    } catch (e) {
      console.log(parserName, 'ERR', e?.stack || e?.message || String(e));
    }
  }
}
