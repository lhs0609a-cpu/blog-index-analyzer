// 계정 전수 인벤토리 (2026-09-16). 재개 가능.
// 오늘 세 번 같은 오류를 냈다 — 9/9 `_bytext_ids.json` 스냅샷으로 ID 를 잡으면 실제 돈 쓰는 등록본이 빠져
// '노출 0' · '켜진 등록 없음' 이 거짓으로 나온다. 텍스트→ID 는 이 파일로만 판정할 것.
// 사용: node _sojam_20260916_inv.js  (중단되면 다시 실행하면 이어서 한다)
const fs = require('fs'), path = require('path'), CID = '1858907';
const BASE = 'https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=' + CID;
const D = path.join(__dirname, '../reports/sojam-20260916/inv/');
fs.mkdirSync(D, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(p, t = 4) { for (let i = 0; i < t; i++) { try { const r = await fetch(BASE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ customer_id: CID, method: 'GET', path: p, body: null }), signal: AbortSignal.timeout(90000) }); if (r.ok) { const d = await r.json(); if (d.success) return d.response; } } catch (e) { } await sleep(500 * (i + 1)); } return null; }
async function pool(items, n, fn) { const o = []; let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; o[k] = await fn(items[k], k); } })); return o; }
const F = n => D + n;
const load = n => fs.existsSync(F(n)) ? JSON.parse(fs.readFileSync(F(n), 'utf8')) : null;

(async () => {
  // 1) 캠페인
  let camps = load('campaigns.json');
  if (!camps) {
    camps = ((await api('/ncc/campaigns?recordSize=1000')) || []).filter(c => !c.delFlag)
      .map(c => ({ id: c.nccCampaignId, name: c.name, lock: !!c.userLock, st: c.status, sb: c.sharedBudgetId || null, budget: c.dailyBudget || 0 }));
    if (!camps.length) throw Error('캠페인 조회 실패');
    fs.writeFileSync(F('campaigns.json'), JSON.stringify(camps));
  }
  console.error('캠페인', camps.length);

  // 2) 그룹
  let groups = load('groups.json');
  if (!groups) {
    const gl = await pool(camps, 6, c => api('/ncc/adgroups?nccCampaignId=' + c.id));
    groups = [];
    camps.forEach((c, i) => { for (const g of (gl[i] || [])) if (!g.delFlag) groups.push({ id: g.nccAdgroupId, cid: c.id, name: g.name, bid: g.bidAmt, mw: g.mobileChannelWeight ?? g.mobileNetworkBidWeight ?? 100, pw: g.pcChannelWeight ?? g.pcNetworkBidWeight ?? 100, lock: !!g.userLock, st: g.status }); });
    fs.writeFileSync(F('groups.json'), JSON.stringify(groups));
  }
  console.error('그룹', groups.length);

  // 3) 키워드 — 그룹 단위로 jsonl 에 이어붙인다(재개용)
  const doneFile = F('kw.jsonl');
  const done = new Set();
  if (fs.existsSync(doneFile)) for (const l of fs.readFileSync(doneFile, 'utf8').split('\n')) { if (!l.trim()) continue; try { done.add(JSON.parse(l).gid); } catch (e) { } }
  const todo = groups.filter(g => !done.has(g.id));
  console.error('키워드 조회 남은 그룹', todo.length, '/', groups.length);
  let n = 0;
  const out = fs.createWriteStream(doneFile, { flags: 'a' });
  await pool(todo, 10, async g => {
    const r = await api('/ncc/keywords?nccAdgroupId=' + g.id);
    if (r === null) return;
    const ks = (Array.isArray(r) ? r : []).filter(k => !k.delFlag)
      .map(k => [k.nccKeywordId, k.keyword, k.bidAmt, k.useGroupBidAmt ? 1 : 0, k.userLock ? 1 : 0, k.status, k.inspectStatus]);
    out.write(JSON.stringify({ gid: g.id, ks }) + '\n');
    if (++n % 200 === 0) console.error('  ', n, '/', todo.length);
  });
  out.end();
  await new Promise(r => out.on('finish', r));

  // 4) 텍스트 → ID 맵
  const byText = {};
  let total = 0;
  for (const l of fs.readFileSync(doneFile, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    const d = JSON.parse(l);
    for (const [id, kw, bid, ugb, lock, st, ins] of d.ks) {
      total++;
      const t = String(kw).replace(/\s+/g, '');
      (byText[t] = byText[t] || []).push({ id, gid: d.gid, bid, ugb, lock, st, ins });
    }
  }
  fs.writeFileSync(F('bytext.json'), JSON.stringify(byText));
  console.log('완료 — 키워드 등록', total, '| 고유 텍스트', Object.keys(byText).length, '| 조회된 그룹', new Set([...done, ...todo.map(g => g.id)]).size);
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
