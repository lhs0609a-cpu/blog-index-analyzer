// 간절 유형 4,119개 → PC 실제 3위 추정가 적용.
//   추정가: 네이버 API 직접 (배치 100, pos3 → 없으면 pos2/pos1 폴백)
//   적용:   프록시 /ncc/ PUT (레거시 인스턴스까지 커버) + 잠긴 것 해제
//   node _sojam_c0827_urgent_apply.js [--apply]
const fs = require('fs'), path = require('path');
const P = n => path.join(__dirname, n);
const L = n => JSON.parse(fs.readFileSync(P(n), 'utf8'));
const { req, sleep } = require('./_sojam_naver');
const BASE = 'https://blog-index-analyzer.fly.dev', CID = '1858907', EST_CID = '3808925';
const APPLY = process.argv.includes('--apply');
const FLOOR = 500, CAP = 20000;

async function raw(p, method, body, tries = 5) {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: p, method, body, customer_id: CID }),
        signal: AbortSignal.timeout(180000) });
      if (r.ok) { const d = await r.json(); if (d.success) return [true, d.response];
                  if (/BAD_REQUEST|11001/.test(String(d.error))) return [false, d.error]; }
    } catch (e) {}
    await sleep(Math.min(2000 * (t + 1), 12000));
  }
  return [false, 'retry exhausted'];
}

const buckets = L('_sojam_c0827_urgent.json');
const rows = L('_sojam_c0827_rebalance.json');
const snap = L('_sojam_c0827_ROLLBACK.json');
const catOf = {};
for (const [cat, arr] of Object.entries(buckets)) for (const x of arr) catOf[x.kw] = cat;
const allKws = Object.keys(catOf);

// ── 원장 기존 지시와 충돌하는 것은 보류 ──────────────────────────
const bkt = {}; for (const r of rows) bkt[r.kw] = r.bucket;
const OUT_OF_SCOPE = ['피부과', '성형외과', '치과', '탈모', '하지정맥류', '여드름', '기미', '비립종',
  '한관종', '보톡스', '필러', '리프팅', '제모', '문신', '다이어트', '난임', '비염', '축농증',
  '변비', '두통', '어지럼', '당뇨', '고혈압', '암치료', '검정고시', '풋살', '청소', '창업'];
const REGION = ['천안','인천','부평','부산','대구','울산','광주','대전','제주','세종','경상','경남','경북',
  '전남','전북','충남','충북','강원','창원','김해','포항','전주','청주','원주','춘천','아산','평택','수원',
  '성남','분당','용인','화성','동탄','안양','광명','부천','일산','고양','파주','김포','시흥','안산','의정부',
  '남양주','하남','과천','군포','오산','노원','강북','도봉','중랑','성북','동대문','광진','성동','용산',
  '마포','서대문','은평','종로','영등포','구로','금천','관악','동작','양천','강서','강동','송파','잠실',
  '천호','목동','신촌','홍대','여의도','왕십리','건대','익산','군산','당진','서산','논산','목포','여수'];
const hold = k =>
  (bkt[k] === '▼두드러기·건선' || k.includes('두드러기') || k.includes('건선')) ? '두드러기·건선(축소대상)'
  : REGION.some(t => k.startsWith(t)) ? '타지역(70원 유지)'
  : OUT_OF_SCOPE.some(t => k.includes(t)) ? '진료범위 밖'
  : null;

const GO = allKws.filter(k => !hold(k));
const HOLD = allKws.filter(k => hold(k));
console.log(`간절 키워드 ${allKws.length}개 → 적용 대상 ${GO.length}개 / 보류 ${HOLD.length}개`);
const hb = {}; for (const k of HOLD) (hb[hold(k)] ||= []).push(k);
for (const [why, arr] of Object.entries(hb)) console.log(`   보류 · ${why}: ${arr.length}개`);

const vol = {}; for (const [, arr] of Object.entries(buckets)) for (const x of arr) vol[x.kw] = x.vol;

(async () => {
  // ── 1. 추정가 수집 (pos3 → 폴백 pos2 → pos1) ────────────────
  const CACHE = P('_sojam_c0827_urgent_est.json');
  const est = fs.existsSync(CACHE) ? L('_sojam_c0827_urgent_est.json') : {};
  const need = [...new Set([...GO, ...HOLD])].filter(k => !est[k]);
  console.log(`\n추정가 조회 — 전체 ${allKws.length} / 남은 ${need.length}`);
  for (const pos of [3, 2, 1]) {
    const todo = need.filter(k => !est[k] || est[k].bid == null);
    if (!todo.length) break;
    for (let i = 0; i < todo.length; i += 100) {
      const batch = todo.slice(i, i + 100);
      try {
        const r = await req('POST', '/estimate/average-position-bid/keyword',
          { device: 'PC', items: batch.map(k => ({ key: k, position: pos })) }, EST_CID);
        for (const e of (r.estimate || [])) {
          const k = (e.keyword || '').trim();
          if (k && e.bid != null && !(est[k] && est[k].bid != null)) est[k] = { bid: e.bid, pos };
        }
      } catch (e) { console.log(`  pos${pos} 배치 실패 ${String(e).slice(0, 80)}`); }
      await sleep(250);
      if ((i / 100) % 10 === 0) { fs.writeFileSync(CACHE, JSON.stringify(est), 'utf8'); console.log(`  pos${pos} ${i + batch.length}/${todo.length}`); }
    }
    fs.writeFileSync(CACHE, JSON.stringify(est), 'utf8');
    console.log(`  pos${pos} 완료 — 확보 ${Object.keys(est).length}/${allKws.length}`);
  }

  // ── 2. 적용 계획 ──────────────────────────────────────────
  const r10 = v => Math.max(70, Math.round(v / 10) * 10);
  const target = {};
  for (const k of GO) { const e = est[k]; if (e && e.bid != null) target[k] = r10(Math.min(CAP, Math.max(FLOOR, e.bid))); }
  const items = [], unlock = [];
  for (const r of rows) {
    const nb = target[r.kw]; if (!nb) continue;
    items.push({ nccKeywordId: r.id, nccAdgroupId: r.gid, bidAmt: nb, useGroupBidAmt: false });
    if (snap[r.id] && snap[r.id].lock) unlock.push({ nccKeywordId: r.id, nccAdgroupId: r.gid, userLock: false });
  }
  const tk = Object.entries(target).sort((a, b) => (vol[b[0]] || 0) - (vol[a[0]] || 0));
  console.log(`\n적용 — 키워드 ${tk.length}개 / 인스턴스 ${items.length}개 / 잠금해제 ${unlock.length}개`);
  const bids = tk.map(([, b]) => b).sort((a, b) => a - b);
  console.log(`입찰가 중앙 ${bids[Math.floor(bids.length / 2)]}원 · 최고 ${bids[bids.length - 1]}원 · 상한도달 ${bids.filter(b => b >= CAP).length}개`);
  console.log('\n=== 검색량 상위 25 ===');
  for (const [k, b] of tk.slice(0, 25))
    console.log(`   ${k.padEnd(20)} ${String((vol[k] || 0).toLocaleString()).padStart(8)}회  ${String(b.toLocaleString()).padStart(7)}원  [${(catOf[k] || '').slice(0, 12)}]`);

  console.log('\n=== 보류분 추정가 (원장 판단용, 검색량 상위 20) ===');
  for (const k of HOLD.sort((a, b) => (vol[b] || 0) - (vol[a] || 0)).slice(0, 20)) {
    const e = est[k];
    console.log(`   ${k.padEnd(20)} ${String((vol[k] || 0).toLocaleString()).padStart(8)}회  3위가 ${String(e && e.bid != null ? e.bid.toLocaleString() : '-').padStart(7)}원  · ${hold(k)}`);
  }
  fs.writeFileSync(P('_sojam_c0827_urgent_plan.json'), JSON.stringify({ target, hold: HOLD.map(k => ({ kw: k, vol: vol[k], est: est[k], why: hold(k) })) }), 'utf8');

  if (!APPLY) { console.log('\ndry-run — 적용하려면 --apply'); return; }
  for (const [label, arr, fields] of [['잠금 해제', unlock, 'userLock'], ['입찰가', items, 'bidAmt']]) {
    if (!arr.length) continue;
    let ok = 0, bad = 0;
    for (let i = 0; i < arr.length; i += 100) {
      const b = arr.slice(i, i + 100);
      const [o, e] = await raw(`/ncc/keywords?fields=${fields}`, 'PUT', b);
      if (o) ok += b.length; else { bad += b.length; console.log(`  ${label} 실패`, String(e).slice(0, 90)); }
      if ((i / 100) % 10 === 0) console.log(`  ${label} ${i + b.length}/${arr.length}`);
      await sleep(200);
    }
    console.log(`${label} 완료 — 성공 ${ok} / 실패 ${bad}`);
  }
})();
