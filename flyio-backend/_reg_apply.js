// 소잠 — 미등록 가려움/만성 축 키워드 619개를 소재 승인된 그룹 2곳에 등록.
// 사용자 지시(2026-09-10): "미등록된거 전부 등록", "월검색량 20인거도 다 등록해 광고소재 붙어있는 캠페인에".
// 변경 전 백업 → 100개 배치 등록 → result.json 누적(재실행 시 이어서) → 별도 검증 스크립트로 재조회.
const fs = require('fs');
const base = 'https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=1858907';
async function api(m, p, b) {
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(base, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customer_id: '1858907', method: m, path: p, body: b === undefined ? null : b }),
        signal: AbortSignal.timeout(60000),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw Error('rej ' + String(d.error || '').slice(0, 200));
      return d.response;
    } catch (e) {
      if (a === 3) throw e;
      await new Promise(s => setTimeout(s, 2500));
    }
  }
}
const OUT = '../reports/sojam-20260910/register/';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const plan = JSON.parse(fs.readFileSync('../reports/sojam-20260910/_register_plan.json', 'utf8'));
  const inv = JSON.parse(fs.readFileSync('../reports/sojam-20260910/_group_inventory.json', 'utf8')).groups;
  const gid = {};
  for (const g of Object.values(inv))
    if (/가려움통증축_a37|절실축_난치구순가려움_a31/.test(g.name)) gid[g.name] = g.gid;
  if (Object.keys(gid).length !== 2) throw Error('타겟 그룹 확인 실패 ' + JSON.stringify(gid));
  console.error('타겟', JSON.stringify(gid));

  // 1) 변경 전 백업 + 중복 방지용 현재 키워드
  const before = {};
  for (const [name, g] of Object.entries(gid)) {
    const ks = await api('GET', '/ncc/keywords?nccAdgroupId=' + g + '&recordSize=1000');
    before[name] = { gid: g, count: (ks || []).length, keywords: (ks || []).map(k => k.keyword) };
    console.error('before', name, before[name].count);
  }
  fs.writeFileSync(OUT + 'before.json', JSON.stringify(before, null, 1));
  const exist = new Set([].concat(...Object.values(before).map(b => b.keywords)));

  // 2) 등록
  const st = fs.existsSync(OUT + 'result.json')
    ? JSON.parse(fs.readFileSync(OUT + 'result.json', 'utf8'))
    : { created: [], failed: [], skipped: [] };
  const doneKw = new Set(st.created.map(x => x.keyword));

  for (const [name, g] of Object.entries(gid)) {
    const items = plan.filter(p => p.grp === name && !doneKw.has(p.kw) && !exist.has(p.kw));
    for (const s of plan.filter(p => p.grp === name && exist.has(p.kw)))
      if (!st.skipped.includes(s.kw)) st.skipped.push(s.kw);
    console.error(name, '등록대상', items.length);
    for (let i = 0; i < items.length; i += 100) {
      const chunk = items.slice(i, i + 100);
      const body = chunk.map(x => ({ keyword: x.kw, bidAmt: x.bid, useGroupBidAmt: false, userLock: false }));
      try {
        const r = await api('POST', '/ncc/keywords?nccAdgroupId=' + g, body);
        if (!Array.isArray(r)) throw Error('배열 아님: ' + JSON.stringify(r).slice(0, 200));
        for (const k of r)
          st.created.push({ keyword: k.keyword, id: k.nccKeywordId, gid: g, bid: k.bidAmt, status: k.status, lock: k.userLock });
        if (r.length !== chunk.length) st.failed.push({ group: name, batch: i, sent: chunk.length, got: r.length });
        console.error('  +', r.length, '누적', st.created.length);
      } catch (e) {
        st.failed.push({ group: name, batch: i, sent: chunk.length, err: String(e).slice(0, 300) });
        console.error('  FAIL batch', i, String(e).slice(0, 150));
      }
      fs.writeFileSync(OUT + 'result.json', JSON.stringify(st, null, 1));
      await new Promise(s => setTimeout(s, 600));
    }
  }
  console.log('APPLIED created', st.created.length, 'failed', st.failed.length, 'skipped', st.skipped.length);
})().catch(e => { console.error('FAIL', e.message); process.exitCode = 1; });
