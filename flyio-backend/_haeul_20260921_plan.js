// 해울 2026-09-21 개선 계획 — 입찰 재배분.
// 원칙: 예산은 늘리지 않는다. 메인 캠페인 60,000원 안에서 '정보탐색 → 내원 의도'로 돈을 옮기고,
//       자동풀5의 미사용 14,500원/일을 내원 의도로 채운다.
// 가격은 전부 네이버 모바일 순위별 추정가 실측(estimates.json). 모바일이 계정 비용의 99.9%다.
const fs = require('fs'), path = require('path'), assert = require('assert');
const D = path.join(__dirname, 'reports', 'haeul_20260921');
const J = n => JSON.parse(fs.readFileSync(path.join(D, n), 'utf8'));
const { bucket } = require('./_haeul_20260921_intent.js');

const day = J('day.json'), est = J('estimates.json'), main = J('main_active.json');
const gm = new Map(day.adgroups.map(g => [g.id, g]));
const cm = new Map(day.campaigns.map(c => [c.id, c]));
const km = new Map(day.kw_master.map(r => [r[0], { kid: r[0], gid: r[1], kw: r[2], bid: +r[3], off: r[4] === '1' }]));
const recent = J('recent9.json');
const perf = new Map();                       // kid → 9일 실적
for (const r of recent.ad) perf.set(r[0], { imp: r[3], clk: r[4], cost: r[5], rnk: r[3] ? r[6] / r[3] : null });

const E = (kw, pos) => est['MOBILE|' + kw + '|' + pos] ?? null;
const r10 = n => Math.max(70, Math.round(n / 10) * 10);

// ── 축 상한: 2026-09-10 원장 승인값 ──
const AX = kw => /어지럼|어지러|이석증|메니에르|전정|현훈|평형/.test(kw) ? '어지럼'
  : /자율신경|미주신경|기립성|공황|불면|실신|브레인포그|화병/.test(kw) ? '자율신경' : '두통';
const CAP = { 어지럼: 25000, 두통: 10000, 자율신경: 10000 };
// 안전장치 ①: 내원 의도 1회 인상 상한 8,000원. 원장 승인 상한(25,000/10,000)보다 보수적으로 간다 —
//   현재 내원 클릭 CPC 4,234원의 2배까지만. 전환 데이터가 없는 상태에서 한 번에 시세 1위를 사지 않는다.
// 안전장치 ②: 한 번에 현재 입찰의 3배 또는 +3,000원(둘 중 큰 값) 넘게 올리지 않는다.
const MAXBID = 8000;
const stepCap = cur => Math.max(cur * 3, cur + 3000);
const raiseTo = (cur, want, axcap) => Math.min(want, axcap, MAXBID, stepCap(cur));
// 모바일 가격곡선은 계단형이다 — 4위까지가 유료 슬롯이고 5위 추정가는 70원(=슬롯 없음)으로 돌아온다.
// 따라서 '조금 깎기'는 존재하지 않는다. 2·3·4위 시장가 중에서 고르거나, 70원으로 사실상 끈다.
const INFO_PURE = /(원인|증상|이유|뜻이|뜻은|의뜻|종류|차이|구분|전조|무엇|이란|란뜻|정의|초기증세)/;   // 정보 수집 단계
const PAIN_NOW = /(아플때|아파요|아픈데|아플땐|아플땐|심할때|심하면|심한|너무아|못참|못견|죽을듯|터질|깨질|찌릿|지끈|계속아|멈추지|안멈|가라앉|응급|갑자기)/; // 지금 아프다

// 계획 한 건 = { kid, kw, from, to, why, group, campaign, bucket }
const plan = [];
const skip = [];

function addPlan(k, to, why) {
  const g = gm.get(k.gid); const c = g ? cm.get(g.cid) : null;
  const p = perf.get(k.kid) || { imp: 0, clk: 0, cost: 0, rnk: null };
  to = r10(to);
  if (to === k.bid) { skip.push({ kw: k.kw, 이유: '변경없음' }); return; }
  plan.push({
    kid: k.kid, 키워드: k.kw, 버킷: bucket(k.kw).b, 현재입찰: k.bid, 신입찰: to,
    증감: to - k.bid, 근거: why, '9일노출': p.imp, '9일클릭': p.clk, '9일비용': Math.round(p.cost),
    '9일순위': p.rnk ? +p.rnk.toFixed(1) : '', 그룹: g ? g.name : '', 캠페인: c ? c.name : '', gid: k.gid
  });
}

// ─────────── ① 메인 2개 캠페인 ───────────
const MAINC = /해울한의원 파워링크|파워링크#2/;
for (const r of main) {
  const k = km.get(r.kid); if (!k || k.off) continue;
  const b = bucket(k.kw);
  const cap = CAP[AX(k.kw)];
  const p = perf.get(k.kid) || { clk: 0 };

  if (b.visit) {
    // 내원 의도·브랜드 → 실적 있으면 2위, 없으면 3위
    const pos = p.clk > 0 ? 2 : 3;
    const e = E(k.kw, pos); if (e === null) { skip.push({ kw: k.kw, 이유: '추정가 없음' }); continue; }
    const to = Math.max(raiseTo(k.bid, e, cap), k.bid);  // 내리지 않는다
    if (to > k.bid) addPlan(k, to, '내원 의도 → 모바일 ' + pos + '위 시장가 ' + e.toLocaleString() + '원' + (to < e ? ' (인상폭 제한 적용)' : ''));
  } else if (b.b === '4_질환명단독') {
    // 질환명 한 단어 = 의도 최하인데 CPC 최고(두통 7,302 · 어지럼증 21,679). 끈다.
    if (k.bid > 70) addPlan(k, 70, '질환명 단독 — 의도 최하·CPC 최고 → 중지');
  } else if (b.b === '4_정보탐색') {
    if (INFO_PURE.test(k.kw)) {
      if (k.bid > 70) addPlan(k, 70, '정보수집 단계(원인·증상) → 중지, 예산을 내원 의도로');
    } else {
      const pos = PAIN_NOW.test(k.kw) ? 3 : 4;
      const e = E(k.kw, pos); if (e === null || e <= 70) { if (k.bid > 70) addPlan(k, 70, '정보탐색 — 모바일 ' + pos + '위 슬롯 없음 → 중지'); continue; }
      const to = Math.min(e, k.bid);                    // 올리지는 않는다
      if (to < k.bid) addPlan(k, to, '정보탐색' + (pos === 3 ? '(지금 아프다)' : '') + ' → 모바일 ' + pos + '위 시장가 ' + e.toLocaleString() + '원까지만');
    }
  } else if (b.b === '7_진료범위밖_인접(원장확인)') {
    skip.push({ kw: k.kw, 이유: '인접 축 — 원장 확인 전까지 손대지 않음' });
  } else if (k.bid > 100) {
    addPlan(k, 70, '진료범위 밖(' + b.b + ') → 최저 입찰');
  }
}

// ─────────── ② 자동풀5 실수요 그룹(미사용 14,500원/일) ───────────
const p5 = day.campaigns.find(c => /자동풀5/.test(c.name));
const g5 = new Set(day.adgroups.filter(g => g.cid === p5.id).map(g => g.id));
for (const k of km.values()) {
  if (!g5.has(k.gid) || k.off) continue;
  const b = bucket(k.kw); if (!b.visit) continue;
  const e = E(k.kw, 3); if (e === null) continue;
  const to = raiseTo(k.bid, e, CAP[AX(k.kw)]);
  if (to > k.bid) addPlan(k, to, '자동풀5 미사용 예산 활용 → 모바일 3위 시장가 ' + e.toLocaleString() + '원');
}

// ─────────── ③ 0914_* 그룹의 미노출 내원어(메인 캠페인, 그룹입찰 70원은 유지) ───────────
const rd = n => {
  const L = fs.readFileSync(path.join(D, n), 'utf8').split('\r\n').filter(x => x);
  const H = L[0].replace(/^﻿/, '').slice(1, -1).split('","');
  return L.slice(1).map(l => { const v = l.slice(1, -1).split('","'); const o = {}; H.forEach((h, i) => o[h] = v[i]); return o; });
};
const byText = new Map();
for (const k of km.values()) { const n = k.kw.replace(/\s+/g, '').toLowerCase(); if (!byText.has(n)) byText.set(n, []); byText.get(n).push(k); }
const already = new Set(plan.map(p => p.kid));
const never = rd('②_내원_완전미노출_20260920.csv').concat(rd('②_내원_최근30일_노출0_20260920.csv'));
for (const row of never) {
  if (+row.월검색 < 10) continue;
  if (/심의반려|검수중|userLock/.test(row.원인)) { skip.push({ kw: row.키워드, 이유: row.원인 }); continue; }
  const inst = (byText.get(row.키워드.replace(/\s+/g, '').toLowerCase()) || []).filter(k => !k.off);
  for (const k of inst) {
    if (already.has(k.kid)) continue;
    const g = gm.get(k.gid); const c = g ? cm.get(g.cid) : null; if (!c) continue;
    if (!MAINC.test(c.name) && !g5.has(k.gid)) { skip.push({ kw: k.kw, 이유: '저예산 자동풀 소속(' + c.name + ' 일예산 ' + c.budget + '원) — 입찰을 올려도 캠페인이 못 태운다' }); continue; }
    const e = E(k.kw, 3); if (e === null) continue;
    const to = raiseTo(k.bid, e, CAP[AX(k.kw)]);
    if (to > k.bid) addPlan(k, to, '미노출 내원어(월 ' + row.월검색 + '회) → 모바일 3위 시장가 ' + e.toLocaleString() + '원');
  }
}

// ─────────── 요약 ───────────
const up = plan.filter(p => p.증감 > 0), down = plan.filter(p => p.증감 < 0);
console.log('=== 입찰 변경 계획', plan.length, '건 (인상', up.length, '/ 인하', down.length, ') ===');
const byC = {};
for (const p of plan) { const k = p.캠페인 + ' / ' + (p.증감 > 0 ? '인상' : '인하'); byC[k] = byC[k] || { 구분: k, 건수: 0, '9일비용': 0 }; byC[k].건수++; byC[k]['9일비용'] += p['9일비용']; }
console.table(Object.values(byC).sort((a, b) => b['9일비용'] - a['9일비용']));

console.log('\n=== 인하: 9일 비용 상위 25 ===');
console.table(down.sort((a, b) => b['9일비용'] - a['9일비용']).slice(0, 25).map(({ kid, gid, 그룹, ...r }) => r));
console.log('\n=== 인상: 9일 비용/실적 상위 25 ===');
console.table(up.slice().sort((a, b) => b['9일비용'] - a['9일비용'] || b['9일노출'] - a['9일노출']).slice(0, 25).map(({ kid, gid, 그룹, ...r }) => r));

const freed = down.reduce((s, p) => s + p['9일비용'] * (1 - p.신입찰 / p.현재입찰), 0);
console.log('\n인하로 풀리는 예산(9일 비용 × 입찰 감소율 근사):', Math.round(freed).toLocaleString(), '원 / 9일 =', Math.round(freed / 9).toLocaleString(), '원/일');
console.log('인하 대상의 9일 비용 총액:', down.reduce((s, p) => s + p['9일비용'], 0).toLocaleString(), '원');
console.log('인상 대상의 9일 비용 총액:', up.reduce((s, p) => s + p['9일비용'], 0).toLocaleString(), '원');

fs.writeFileSync(path.join(D, 'bid_plan.json'), JSON.stringify(plan));
fs.writeFileSync(path.join(D, 'bid_skip.json'), JSON.stringify(skip));
const csv = (n, a) => { if (!a.length) return; const c = Object.keys(a[0]); fs.writeFileSync(path.join(D, n + '.csv'), '﻿' + [c, ...a.map(r => c.map(x => r[x] ?? ''))].map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\r\n')); console.log('CSV', n + '.csv', a.length + '행'); };
csv('개선_입찰계획_20260921', plan.slice().sort((a, b) => b['9일비용'] - a['9일비용']));
const sk = {}; for (const s of skip) sk[s.이유] = (sk[s.이유] || 0) + 1;
console.log('\n제외 사유:', JSON.stringify(sk, null, 0).slice(0, 600));
