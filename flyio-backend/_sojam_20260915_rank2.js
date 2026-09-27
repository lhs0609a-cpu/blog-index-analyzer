// 소잠 2026-09-15 — 내원축 키워드 전수 실순위(/stats avgRnk). 대상은 로컬에서 먼저 걸러 API 호출을 줄인다.
// 입력 reports/sojam-20260915_targets.json (텍스트→{axis,ids}), 9,890 ID.
// 단계: win(9/12~9/14 실순위) → day(9/14) → meta(보고 대상만 키워드·그룹 조회) → report
const fs = require('fs'), path = require('path');
const CID = '1858907';
const BASE = 'https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=' + CID;
const D = path.join(__dirname, '../reports/sojam-20260915/');
fs.mkdirSync(D, { recursive: true });
const F = n => D + n, has = n => fs.existsSync(F(n));
const load = n => JSON.parse(fs.readFileSync(F(n), 'utf8'));
const save = (n, o) => fs.writeFileSync(F(n), JSON.stringify(o));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const enc = x => encodeURIComponent(JSON.stringify(x));
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
async function api(p, tries = 4) {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(BASE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ customer_id: CID, method: 'GET', path: p, body: null }), signal: AbortSignal.timeout(90000) });
      if (r.ok) { const d = await r.json(); if (d.success) return d.response; }
    } catch (e) { }
    await sleep(600 * (t + 1));
  }
  return null;
}
async function pool(items, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; }

const targets = JSON.parse(fs.readFileSync(path.join(__dirname, '../reports/sojam-20260915_targets.json'), 'utf8'));
const allIds = [...new Set(Object.values(targets).flatMap(t => t.ids))];

async function stats(tr, file) {
  const st = has(file) ? load(file) : {};
  const todo = allIds.filter(i => !st[i]);
  if (!todo.length) return console.error(file, '캐시 완료');
  const groups = chunk(todo, 40); let done = 0;
  console.error(file, '배치', groups.length);
  const res = await pool(groups, 6, async b => {
    const r = await api('/stats?ids=' + encodeURIComponent(b.join(',')) + '&fields=' + enc(['impCnt', 'clkCnt', 'salesAmt', 'avgRnk']) + '&timeRange=' + enc(tr));
    if (++done % 25 === 0) { console.error('  ', file, done, '/', groups.length); }
    return r;
  });
  groups.forEach((b, i) => {
    if (!res[i]) return;
    const got = new Map(((res[i].data) || []).map(x => [x.id, x]));
    for (const id of b) { const x = got.get(id) || {}; st[id] = { imp: +x.impCnt || 0, clk: +x.clkCnt || 0, cost: +x.salesAmt || 0, rank: (x.avgRnk != null && +x.impCnt > 0) ? +x.avgRnk : null }; }
  });
  save(file, st);
  console.error(file, '완료', Object.keys(st).length, '/', allIds.length);
}

async function meta(idList) {
  const kw = has('meta_kw.json') ? load('meta_kw.json') : {};
  const todo = idList.filter(i => !kw[i]);
  console.error('meta 키워드', todo.length);
  const gs = chunk(todo, 20); let done = 0;
  const res = await pool(gs, 6, async b => { const r = await api('/ncc/keywords?ids=' + encodeURIComponent(b.join(','))); if (++done % 25 === 0) console.error('   meta', done, '/', gs.length); return r; });
  for (const r of res) for (const k of (Array.isArray(r) ? r : [])) kw[k.nccKeywordId] = { k: k.keyword, gid: k.nccAdgroupId, cid: k.nccCampaignId, bid: k.bidAmt, useGrp: !!k.useGroupBidAmt, lock: !!k.userLock, st: k.status, sr: k.statusReason };
  for (const i of todo) if (!kw[i]) kw[i] = { missing: true };
  save('meta_kw.json', kw);

  const grp = has('meta_grp.json') ? load('meta_grp.json') : {};
  const gids = [...new Set(Object.values(kw).filter(k => k.gid).map(k => k.gid))].filter(g => !grp[g]);
  console.error('meta 그룹', gids.length);
  let d2 = 0;
  const gr = await pool(gids, 6, async g => { const r = await api('/ncc/adgroups/' + g); if (++d2 % 50 === 0) console.error('   grp', d2, '/', gids.length); return r; });
  gids.forEach((g, i) => { const r = gr[i]; if (r) grp[g] = { name: r.name, cid: r.nccCampaignId, bid: r.bidAmt, mw: r.mobileChannelWeight ?? r.mobileNetworkBidWeight ?? 100, pw: r.pcChannelWeight ?? r.pcNetworkBidWeight ?? 100, lock: !!r.userLock, st: r.status }; });
  save('meta_grp.json', grp);
}

(async () => {
  const stage = process.argv[2] || 'all';
  if (stage === 'win' || stage === 'all') await stats({ since: '2026-09-12', until: '2026-09-14' }, 'stats_win.json');
  if (stage === 'day' || stage === 'all') await stats({ since: '2026-09-14', until: '2026-09-14' }, 'stats_day.json');
  if (stage === 'meta' || stage === 'all') {
    const win = load('stats_win.json');
    // 보고 대상: 3일 노출 1+ 이거나, 간절도 상/중 후보 (텍스트 규칙은 report 에서 적용하므로 여기선 노출 있는 것 + 전체 상/중)
    const SIG = [/한의원|한방|병원|의원|클리닉|잘하는곳|잘하는|명의|전문|추천|어디|강남|역삼|신논현|논현|서초|교대|양재|선릉|도곡|한티|매봉|삼성동/, /만성|재발|안낫|안나|오래|몇년|수년|평생|계속|자꾸|난치|반복|지속/, /심한|심할때|심해|극심|너무|미치|미칠|죽겠|잠못|못자|밤에|밤마다|새벽|진물|피나|피가|따가|쓰라|통증|아파|괴로|고통|참을수|긁어서|터져|헐어|헐었/, /완치|낫는법|낫는방법|고치는법|근본|치료법|치료방법|치료제|치료|없애는|해결/];
    const W = [4, 3, 3, 2];
    const pick = new Set();
    for (const [k, t] of Object.entries(targets)) {
      const pts = SIG.reduce((a, r, i) => a + (r.test(k) ? W[i] : 0), 0);
      const impAny = t.ids.some(i => (win[i] || {}).imp > 0);
      if (pts >= 3 || impAny) for (const i of t.ids) pick.add(i);
    }
    console.error('meta 대상 ID', pick.size);
    await meta([...pick]);
  }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
