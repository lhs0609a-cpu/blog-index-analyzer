// 개선안 입력: 대상 키워드의 순위별 시장가(추정입찰가)를 실측한다.
// 로컬 .env 키(cid 3808925) 직접 호출 — 추정가는 키워드+기기+순위의 시장값이라 조회 계정이 달라도 같다.
const fs = require('fs'), path = require('path');
const { req } = require('../flyio-backend/_sojam_naver');
const D = path.join(__dirname, 'reports', 'haeul_20260921');
const OUT = path.join(D, 'estimates.json');
const rd = n => {
  const L = fs.readFileSync(path.join(D, n), 'utf8').split('\r\n').filter(x => x);
  const H = L[0].replace(/^﻿/, '').slice(1, -1).split('","');
  return L.slice(1).map(l => { const v = l.slice(1, -1).split('","'); const o = {}; H.forEach((h, i) => o[h] = v[i]); return o; });
};
const POS = [1, 2, 3, 5];
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const clicked = rd('①_클릭키워드_30일_20260920.csv').filter(r => r.키워드 && !/^\(/.test(r.키워드) && /해울한의원 파워링크|파워링크#2/.test(r.캠페인));
  const never = rd('②_내원_완전미노출_20260920.csv');
  const stalled = rd('②_내원_최근30일_노출0_20260920.csv');
  const all = rd('②_내원_전수_상태_20260920.csv');
  const fading = all.filter(r => +r['30일노출'] > 0 && r.최근노출 < '20260918' && +r['90일클릭'] > 0);

  const set = new Map();
  const add = (kw, tag) => { if (!kw) return; const t = set.get(kw) || new Set(); t.add(tag); set.set(kw, t); };
  clicked.forEach(r => add(r.키워드, r.내원 === '1' ? 'A_현행내원' : 'C_현행저의도'));
  never.filter(r => +r.월검색 >= 50).forEach(r => add(r.키워드, 'B_미노출'));
  stalled.forEach(r => add(r.키워드, 'B_끊김'));
  fading.forEach(r => add(r.키워드, 'B_최근끊김'));
  // 내원 의도인데 등록 안 된 실검색어
  rd('③_내원의도_미등록검색어_30일_20260920.csv').forEach(r => add(r.검색어, 'D_미등록'));

  const keys = [...set.keys()];
  console.log('추정가 대상', keys.length, '키워드 ×', POS.length, '순위 × 2기기');
  let done = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  for (const device of ['PC', 'MOBILE']) {
    const todo = keys.filter(k => !(device + '|' + k + '|1' in done));
    for (let i = 0; i < todo.length; i += 25) {
      const chunk = todo.slice(i, i + 25);
      const items = chunk.flatMap(k => POS.map(p => ({ key: k, position: p })));
      let r;
      for (let t = 0; t < 4; t++) {
        try { r = await req('POST', '/estimate/average-position-bid/keyword', { device, items }, 3808925, 3); break; }
        catch (e) { if (t === 3) throw e; await sleep(3000); }
      }
      if (!r || !Array.isArray(r.estimate)) throw Error('estimate shape ' + JSON.stringify(r).slice(0, 200));
      for (const k of chunk) for (const p of POS) done[device + '|' + k + '|' + p] = null;   // 응답 없으면 null 로 남긴다
      for (const e of r.estimate) done[device + '|' + e.keyword + '|' + e.position] = e.bid;
      fs.writeFileSync(OUT, JSON.stringify(done));
      if ((i / 25) % 8 === 0) console.log(' ', device, i + chunk.length, '/', todo.length);
      await sleep(350);
    }
  }
  fs.writeFileSync(path.join(D, 'estimate_tags.json'), JSON.stringify(Object.fromEntries([...set].map(([k, v]) => [k, [...v]]))));
  const got = Object.values(done).filter(v => v !== null).length;
  console.log('완료 — 응답', got, '/', Object.keys(done).length);
})().catch(e => { console.error('ERR', String(e).slice(0, 500)); process.exitCode = 1; });
