// 소잠 입찰가 재조정 실행 (2026-08-27 원장 지시)
//   node _sojam_c0827_exec.js region70  [--apply]   ▼ 타지역 키워드 → 70원
//   node _sojam_c0827_exec.js unlock    [--apply]   ▲ 농가진·구순염 계열 잠금 해제
//   node _sojam_c0827_exec.js snapshot                현재 입찰가·잠금상태 롤백 스냅샷
//   node _sojam_c0827_exec.js rollback  [--apply]   스냅샷으로 되돌리기
// pos3/pos10 재설정은 /estimate 프록시 개방(배포) 후 별도 스크립트.
const fs = require('fs'), path = require('path');
const D = __dirname, P = n => path.join(D, n);
const L = n => JSON.parse(fs.readFileSync(P(n), 'utf8'));
const BASE = 'https://blog-index-analyzer.fly.dev';
const CID = '1858907';
const Q = `user_id=1&customer_id=${CID}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const APPLY = process.argv.includes('--apply');
const cmd = process.argv[2];

async function raw(p, method = 'GET', body = null, tries = 5) {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?${Q}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: p, method, body, customer_id: CID }),
        signal: AbortSignal.timeout(180000),
      });
      if (r.ok) { const d = await r.json(); if (d.success) return [true, d.response];
                  if (/BAD_REQUEST|11001/.test(String(d.error))) return [false, d.error]; }
    } catch (e) { /* retry */ }
    await sleep(Math.min(2000 * (t + 1), 15000));
  }
  return [false, 'retry exhausted'];
}

const rows = L('_sojam_c0827_rebalance.json');
const pick = bs => rows.filter(r => bs.includes(r.bucket));

async function bulk(items, fields, label) {
  console.log(`${label} — 대상 ${items.length}개`);
  if (!APPLY) {
    for (const it of items.slice(0, 10)) console.log('   ', JSON.stringify(it));
    console.log('\ndry-run — 적용하려면 --apply'); return;
  }
  let ok = 0, bad = 0;
  for (let i = 0; i < items.length; i += 100) {
    const b = items.slice(i, i + 100);
    const [o, e] = await raw(`/ncc/keywords?fields=${fields}`, 'PUT', b);
    if (o) ok += b.length; else { bad += b.length; console.log('  배치 실패', String(e).slice(0, 100)); }
    if ((i / 100) % 5 === 0) console.log(`  ${i + b.length}/${items.length}`);
    await sleep(200);
  }
  console.log(`완료 — 성공 ${ok} / 실패 ${bad}`);
}

(async () => {
  if (cmd === 'region70') {
    const sel = pick(['▼타지역', '▼서울비강남']).filter(r => r.eff > 70 || r.ugb);
    const items = sel.map(r => ({ nccKeywordId: r.id, nccAdgroupId: r.gid, bidAmt: 70, useGroupBidAmt: false }));
    const live = sel.filter(r => r.st === '노출');
    console.log(`타지역 인스턴스 ${sel.length}개 (그중 현재 노출중 ${live.length}개)`);
    for (const r of live.sort((a, b) => b.eff - a.eff).slice(0, 15))
      console.log(`   ${r.kw.padEnd(18)} ${String(r.vol).padStart(6)}회  ${String(r.eff).padStart(6)}원 → 70원`);
    await bulk(items, 'bidAmt', '\n▼ 타지역 → 70원');
    return;
  }
  if (cmd === 'unlock') {
    const sel = pick(['▲농가진계열', '▲구순염계열']).filter(r => r.st === '중지·잠금');
    const items = sel.map(r => ({ nccKeywordId: r.id, nccAdgroupId: r.gid, userLock: false }));
    const byKw = {}; for (const r of sel) byKw[r.kw] = Math.max(byKw[r.kw] || 0, r.vol);
    console.log(`잠금 해제 대상 인스턴스 ${sel.length}개 / 키워드 ${Object.keys(byKw).length}개`);
    for (const [kw, v] of Object.entries(byKw).sort((a, b) => b[1] - a[1]).slice(0, 20))
      console.log(`   ${kw.padEnd(20)} ${String(v).padStart(7)}회`);
    await bulk(items, 'userLock', '\n▲ 농가진·구순염 잠금 해제');
    return;
  }
  if (cmd === 'snapshot') {
    const gids = [...new Set(rows.map(r => r.gid))];
    const snap = {};
    console.log(`그룹 ${gids.length}개 조회…`);
    for (let i = 0; i < gids.length; i++) {
      const [o, resp] = await raw(`/ncc/keywords?nccAdgroupId=${gids[i]}`);
      if (o) for (const k of resp || []) snap[k.nccKeywordId] = {
        gid: gids[i], kw: (k.keyword || '').trim(), bid: k.bidAmt,
        ugb: k.useGroupBidAmt, lock: k.userLock, st: k.status };
      else console.log(`  실패 ${gids[i]}`);
      console.log(`  ${i + 1}/${gids.length} 누적 ${Object.keys(snap).length}`);
    }
    fs.writeFileSync(P('_sojam_c0827_ROLLBACK.json'), JSON.stringify(snap), 'utf8');
    console.log(`스냅샷 ${Object.keys(snap).length}개 저장`);
    return;
  }
  if (cmd === 'rollback') {
    const snap = L('_sojam_c0827_ROLLBACK.json');
    const bids = Object.entries(snap).map(([id, v]) =>
      ({ nccKeywordId: id, nccAdgroupId: v.gid, bidAmt: v.bid || 70, useGroupBidAmt: !!v.ugb }));
    const locks = Object.entries(snap).map(([id, v]) =>
      ({ nccKeywordId: id, nccAdgroupId: v.gid, userLock: !!v.lock }));
    await bulk(bids, 'bidAmt', '롤백 — 입찰가');
    await bulk(locks, 'userLock', '롤백 — 잠금상태');
    return;
  }
  console.log('usage: region70 | unlock | snapshot | rollback   [--apply]');
})();
