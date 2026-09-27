// 발굴 신규 키워드 등록 (2026-09-16). 소재 승인된 · 타기팅 없는 · 여유 있는 그룹에만 넣는다.
// 네이버 함정: adgroupType 필수 아님(기존 그룹에 넣으므로), 입찰 10원 단위, 1그룹 1,000개 한도 [[naver-ad-api-create-traps]]
// 사용: node _sojam_20260916_reg.js groups | est | plan | apply | verify
const fs = require('fs'), path = require('path'), CID = '1858907';
const BASE = 'https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=' + CID;
const { req, sleep: s2 } = require('./_sojam_naver');
const D16 = path.join(__dirname, '../reports/sojam-20260916/');
const J = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const W = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 1));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
async function api(m, p, b) { for (let t = 0; t < 3; t++) { try { const r = await fetch(BASE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ customer_id: CID, method: m, path: p, body: b === undefined ? null : b }), signal: AbortSignal.timeout(60000) }); const d = await r.json(); if (!r.ok || !d.success) throw Error('rej ' + String(d.error || '').slice(0, 200)); return d.response; } catch (e) { if (t === 2 || m !== 'GET') throw e; await sleep(2000); } } }
async function pool(items, n, fn) { const o = []; let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; o[k] = await fn(items[k]); } })); return o; }

async function groups() {
  // 후보: 어제·오늘 입찰을 올린 그룹들(소재 검증 완료) 중 키워드 여유가 큰 곳
  const pf15 = J(path.join(__dirname, '../reports/sojam-20260915/preflight.json'));
  const pf16 = J(D16 + 'final_preflight.json');
  const cand = { ...pf15, ...pf16 };
  const counts = {};
  for (const l of fs.readFileSync(D16 + 'inv/kw.jsonl', 'utf8').split('\n')) { if (!l.trim()) continue; const d = JSON.parse(l); counts[d.gid] = d.ks.length; }
  const rows = [];
  for (const [gid, v] of Object.entries(cand)) {
    if (!v.adsOk || v.grpLock || v.campLock) continue;
    const g = await api('GET', '/ncc/adgroups/' + gid);
    const tg = (g.targets || []).map(t => t.targetTp).filter(t => /REGION|TIME|PLACE/.test(t));
    rows.push({ gid, name: v.name, camp: v.campName, ads: v.adsOk, n: counts[gid] || 0, room: 1000 - (counts[gid] || 0), targets: tg });
    await sleep(150);
  }
  rows.sort((a, b) => b.room - a.room);
  W(D16 + 'reg_groups.json', rows);
  for (const r of rows.slice(0, 12)) console.log((r.targets.length ? '[타기팅]' : '[무제한]') + ' ' + r.name.padEnd(26) + ' 키워드 ' + String(r.n).padStart(4) + ' · 여유 ' + String(r.room).padStart(4) + ' · 소재 ' + r.ads + ' · ' + r.camp);
}

async function est() {
  const rows = J(D16 + 'register_pool.json');
  const F = D16 + 'reg_est.json';
  const est = fs.existsSync(F) ? J(F) : {};
  const todo = rows.map(r => r.k).filter(t => est['MOBILE|3|' + t] === undefined);
  console.error('추정가 남은', todo.length);
  for (let i = 0; i < todo.length; i += 100) {
    try {
      const r = await req('POST', '/estimate/average-position-bid/keyword', { device: 'MOBILE', items: todo.slice(i, i + 100).map(k => ({ key: k, position: 3 })) }, 3808925, 3);
      for (const e of (r && r.estimate) || []) est['MOBILE|3|' + e.keyword] = e.bid;
    } catch (e) { }
    await s2(250);
  }
  for (const t of todo) if (est['MOBILE|3|' + t] === undefined) est['MOBILE|3|' + t] = null;
  W(F, est); console.error('완료');
}

function plan() {
  const rows = J(D16 + 'register_pool.json');
  const est = J(D16 + 'reg_est.json');
  const grps = J(D16 + 'reg_groups.json').filter(g => !g.targets.length && g.room > 250);
  if (!grps.length) throw Error('무타기팅·여유 그룹 없음');
  const CAP = 3000;
  const items = rows.map(r => {
    const e = est['MOBILE|3|' + r.k];
    const bid = Math.max(70, Math.min(CAP, Math.round((e || 1000) / 10) * 10));
    return { k: r.k, axis: r.axis, vol: r.vol, est3: e, bid };
  });
  // 그룹에 라운드로빈 배치
  let gi = 0; const used = {};
  for (const it of items) {
    let tries = 0;
    while (tries < grps.length && (used[grps[gi].gid] || 0) >= grps[gi].room) { gi = (gi + 1) % grps.length; tries++; }
    it.gid = grps[gi].gid; it.grp = grps[gi].name;
    used[it.gid] = (used[it.gid] || 0) + 1;
    gi = (gi + 1) % grps.length;
  }
  W(D16 + 'reg_plan.json', items);
  const won = n => Math.round(n || 0).toLocaleString('ko-KR');
  console.log('등록 계획', items.length, '개 · 월검색 합', won(items.reduce((a, r) => a + r.vol, 0)));
  console.log('입찰 분포: 70원', items.filter(i => i.bid <= 70).length, '· ~1,000원', items.filter(i => i.bid > 70 && i.bid <= 1000).length, '· ~3,000원', items.filter(i => i.bid > 1000).length, '| 평균', won(items.reduce((a, i) => a + i.bid, 0) / items.length));
  const g = {}; for (const i of items) g[i.grp] = (g[i.grp] || 0) + 1;
  console.log('그룹 배치:', Object.entries(g).map(([k, v]) => k + ' ' + v + '개').join(' · '));
}

async function apply() {
  const items = J(D16 + 'reg_plan.json');
  const st = fs.existsSync(D16 + 'reg_result.json') ? J(D16 + 'reg_result.json') : { created: [], rejected: [], skip: [], fail: [] };
  const done = new Set([...st.created, ...st.rejected, ...st.skip].map(x => x.k + '|' + x.gid));
  const byGid = {};
  for (const it of items) if (!done.has(it.k + '|' + it.gid)) (byGid[it.gid] = byGid[it.gid] || []).push(it);
  for (const [gid, list] of Object.entries(byGid)) {
    const exist = new Set(((await api('GET', '/ncc/keywords?nccAdgroupId=' + gid)) || []).map(k => String(k.keyword).replace(/\s+/g, '')));
    const go = list.filter(x => { if (exist.has(x.k)) { st.skip.push({ k: x.k, gid, why: '이미 있음' }); return false; } return true; });
    for (const part of chunk(go, 40)) {
      try {
        const r = await api('POST', '/ncc/keywords?nccAdgroupId=' + gid, part.map(x => ({ keyword: x.k, bidAmt: x.bid, useGroupBidAmt: false, userLock: false })));
        for (const c of part) {
          const k = (Array.isArray(r) ? r : []).find(x => x && String(x.keyword).replace(/\s+/g, '') === c.k) || {};
          if (k.nccKeywordId) st.created.push({ k: c.k, gid, id: k.nccKeywordId, bid: k.bidAmt, st: k.status, sr: k.statusReason, ins: k.inspectStatus });
          else st.rejected.push({ k: c.k, gid, res: k.resultStatus || null });
        }
      } catch (e) { st.fail.push({ gid, kws: part.map(x => x.k), err: String(e).slice(0, 200) }); }
      W(D16 + 'reg_result.json', st);
      console.error('  등록', st.created.length, '거절', st.rejected.length, '실패', st.fail.length);
      await sleep(1200);
    }
  }
  console.log(JSON.stringify({ 등록: st.created.length, 거절: st.rejected.length, 건너뜀: st.skip.length, 실패: st.fail.length }));
}

async function verify() {
  const st = J(D16 + 'reg_result.json');
  const ids = st.created.map(x => x.id);
  let ok = 0, bad = 0; const byIns = {};
  for (const b of chunk(ids, 20)) {
    const r = await api('GET', '/ncc/keywords?ids=' + encodeURIComponent(b.join(',')));
    for (const k of (Array.isArray(r) ? r : [])) { byIns[k.inspectStatus] = (byIns[k.inspectStatus] || 0) + 1; if (k.nccKeywordId) ok++; else bad++; }
    await sleep(200);
  }
  console.log('검증 — 조회됨', ok, '| 누락', ids.length - ok, '| 검수상태', JSON.stringify(byIns));
}

const m = process.argv[2];
({ groups, est, plan: async () => plan(), apply, verify }[m] || (async () => console.log('groups|est|plan|apply|verify')))().catch(e => { console.error(e.stack); process.exitCode = 1; });
