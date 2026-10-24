// 개선 대상 전체의 모바일 순위별 시장가. 모바일만 — 계정 비용의 99.9%가 모바일이다.
const fs = require('fs'), path = require('path');
const { req } = require('../flyio-backend/_sojam_naver');
const D = path.join(__dirname, 'reports', 'haeul_20260921');
const OUT = path.join(D, 'estimates.json');
const { bucket } = require('./_haeul_20260921_intent.js');
const POS = [1, 2, 3, 5];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rd = n => {
  const L = fs.readFileSync(path.join(D, n), 'utf8').split('\r\n').filter(x => x);
  const H = L[0].replace(/^﻿/, '').slice(1, -1).split('","');
  return L.slice(1).map(l => { const v = l.slice(1, -1).split('","'); const o = {}; H.forEach((h, i) => o[h] = v[i]); return o; });
};

(async () => {
  const main = JSON.parse(fs.readFileSync(path.join(D, 'main_active.json'), 'utf8'));
  const day = JSON.parse(fs.readFileSync(path.join(D, 'day.json'), 'utf8'));
  const gm = new Map(day.adgroups.map(g => [g.id, g]));
  const cm = new Map(day.campaigns.map(c => [c.id, c]));

  const set = new Set();
  // 메인에서 실제로 돈을 쓰거나 내원 의도인 것
  main.forEach(r => { if (r.비용 > 0 || r.내원 === 1) set.add(r.키워드); });
  // 자동풀5 실수요 그룹의 내원 의도 키워드
  const p5 = day.campaigns.find(c => /자동풀5/.test(c.name));
  const g5 = new Set(day.adgroups.filter(g => g.cid === p5.id).map(g => g.id));
  for (const r of day.kw_master) if (g5.has(r[1]) && bucket(r[2]).visit) set.add(r[2]);
  // 미노출·끊김 내원어(월검색 10 이상)
  rd('②_내원_완전미노출_20260920.csv').forEach(r => { if (+r.월검색 >= 10) set.add(r.키워드); });
  rd('②_내원_최근30일_노출0_20260920.csv').forEach(r => set.add(r.키워드));

  const keys = [...set].filter(k => k && k.length <= 40);
  let done = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  const todo = keys.filter(k => !('MOBILE|' + k + '|1' in done));
  console.log('대상', keys.length, '| 이미 있음', keys.length - todo.length, '| 조회', todo.length);
  for (let i = 0; i < todo.length; i += 25) {
    const chunk = todo.slice(i, i + 25);
    const items = chunk.flatMap(k => POS.map(p => ({ key: k, position: p })));
    let r;
    for (let t = 0; t < 4; t++) {
      try { r = await req('POST', '/estimate/average-position-bid/keyword', { device: 'MOBILE', items }, 3808925, 3); break; }
      catch (e) { if (t === 3) throw e; await sleep(3000); }
    }
    if (!r || !Array.isArray(r.estimate)) throw Error('estimate shape ' + JSON.stringify(r).slice(0, 200));
    for (const k of chunk) for (const p of POS) done['MOBILE|' + k + '|' + p] = null;
    for (const e of r.estimate) done['MOBILE|' + e.keyword + '|' + e.position] = e.bid;
    fs.writeFileSync(OUT, JSON.stringify(done));
    if ((i / 25) % 10 === 0) console.log('  ', i + chunk.length, '/', todo.length);
    await sleep(350);
  }
  const mob = Object.entries(done).filter(([k]) => k.startsWith('MOBILE|'));
  console.log('완료 — 모바일 추정 항목', mob.length, '| 응답 있음', mob.filter(([, v]) => v !== null).length);
})().catch(e => { console.error('ERR', String(e).slice(0, 500)); process.exitCode = 1; });
