// 계정 전체 그룹의 소재 전수 조사 (2026-09-16) — "소재가 없어서 안 도는 키워드" 를 찾는다.
// 네이버는 소재 0 을 keyword.statusReason 으로 알려주지 않는다 [[sojam-creative-audit]] → 그룹별로 직접 세야 한다.
// 재개 가능(그룹당 jsonl 1줄). 사용: node _sojam_20260916_ads.js sweep | report
const fs = require('fs'), path = require('path'), CID = '1858907';
const BASE = 'https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=' + CID;
const D = path.join(__dirname, '../reports/sojam-20260916/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(p, t = 4) { for (let i = 0; i < t; i++) { try { const r = await fetch(BASE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ customer_id: CID, method: 'GET', path: p, body: null }), signal: AbortSignal.timeout(90000) }); if (r.ok) { const d = await r.json(); if (d.success) return d.response; } } catch (e) { } await sleep(500 * (i + 1)); } return null; }
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k]); } })); }
const J = p => JSON.parse(fs.readFileSync(p, 'utf8'));

async function sweep() {
  const groups = J(D + 'inv/groups.json');
  const F = D + 'ads.jsonl';
  const done = new Set();
  if (fs.existsSync(F)) for (const l of fs.readFileSync(F, 'utf8').split('\n')) { if (!l.trim()) continue; try { done.add(JSON.parse(l).gid); } catch (e) { } }
  const todo = groups.filter(g => !done.has(g.id));
  console.error('소재 조회 남은 그룹', todo.length, '/', groups.length);
  const out = fs.createWriteStream(F, { flags: 'a' });
  let n = 0;
  await pool(todo, 10, async g => {
    const ads = await api('/ncc/ads?nccAdgroupId=' + g.id);
    if (ads === null) return;                                   // 실패분은 재실행에서 다시
    const list = (Array.isArray(ads) ? ads : []).filter(a => !a.delFlag);
    const ok = list.filter(a => !a.userLock && a.inspectStatus === 'APPROVED' && a.status === 'ELIGIBLE').length;
    const pending = list.filter(a => a.inspectStatus === 'UNDER_REVIEW' || a.inspectStatus === 'PENDING').length;
    const rejected = list.filter(a => a.inspectStatus === 'REJECTED').length;
    const paused = list.filter(a => a.userLock).length;
    out.write(JSON.stringify({ gid: g.id, n: list.length, ok, pending, rejected, paused }) + '\n');
    if (++n % 300 === 0) console.error('  ', n, '/', todo.length);
  });
  out.end(); await new Promise(r => out.on('finish', r));
  console.error('sweep 완료');
}

function report() {
  const groups = new Map(J(D + 'inv/groups.json').map(g => [g.id, g]));
  const camps = new Map(J(D + 'inv/campaigns.json').map(c => [c.id, c]));
  const ads = new Map();
  for (const l of fs.readFileSync(D + 'ads.jsonl', 'utf8').split('\n')) { if (!l.trim()) continue; const d = JSON.parse(l); ads.set(d.gid, d); }
  // 볼륨 (알려진 것만)
  const vol = {};
  const addVol = (o, f) => { for (const [k, v] of Object.entries(o)) { if (!v) continue; const t = f ? f(v) : (v.pc || 0) + (v.mo || 0); if (t > 0 && !vol[k]) vol[k] = t; } };
  try { addVol(J(D + 'mine/vol_all.json')); } catch (e) { }
  try { addVol(J(path.join(__dirname, '../reports/sojam-20260915/vol_today.json'))); } catch (e) { }
  try { addVol(J(path.join(__dirname, '../reports/sojam-20260915/exax_vol.json'))); } catch (e) { }

  const rows = [];
  let noSweep = 0;
  for (const l of fs.readFileSync(D + 'inv/kw.jsonl', 'utf8').split('\n')) {
    if (!l.trim()) continue;
    const d = JSON.parse(l);
    const g = groups.get(d.gid); if (!g) continue;
    const c = camps.get(g.cid) || {};
    const a = ads.get(d.gid);
    if (!a) { noSweep++; continue; }
    if (a.ok > 0) continue;                                     // 소재 정상
    for (const [id, kw, bid, ugb, lock, st, ins] of d.ks) {
      const liveKw = !lock && st !== 'PAUSED';
      if (!liveKw || g.lock || c.lock) continue;                // 소재 말고 다른 이유로 꺼진 것은 제외
      const eff = Math.round((ugb ? (g.bid || 0) : (bid || 0)) * (g.mw ?? 100) / 100);
      const t = String(kw).replace(/\s+/g, '');
      rows.push({ k: t, id, gid: d.gid, grp: g.name, camp: c.name, eff, ins, vol: vol[t] ?? null, adState: a.n === 0 ? '소재 0개' : a.rejected ? '소재 반려' : a.pending ? '소재 검수중' : a.paused ? '소재 꺼짐' : '노출불가 소재' });
    }
  }
  fs.writeFileSync(D + 'noads.json', JSON.stringify(rows));
  const won = n => Math.round(n || 0).toLocaleString('ko-KR');
  const grpAff = new Set(rows.map(r => r.gid));
  console.log('소재 스윕 안 된 그룹', noSweep > 0 ? '(키워드 ' + noSweep + '건 판단 보류)' : '없음');
  console.log('★ 승인 소재가 없어 못 도는 키워드 등록 ' + rows.length + '건 · 그룹 ' + grpAff.size + '곳');
  const known = rows.filter(r => r.vol != null);
  console.log('   그중 검색량 아는 것 ' + known.length + '건 · 월검색 합 ' + won(known.reduce((a, r) => a + r.vol, 0)));
  const by = {}; for (const r of rows) { const x = by[r.adState] = by[r.adState] || { n: 0, g: new Set(), vol: 0 }; x.n++; x.g.add(r.gid); x.vol += r.vol || 0; }
  for (const [k, v] of Object.entries(by).sort((a, b) => b[1].n - a[1].n)) console.log('   ' + k + ': 키워드 ' + v.n + '건 · 그룹 ' + v.g.size + '곳 · 월검색(아는것) ' + won(v.vol));
  // 입찰이 실제로 들어가 있는 것 = 돈 나갈 뻔한 것
  const bidded = rows.filter(r => r.eff > 100);
  console.log('   그중 입찰 100원 초과(소재만 있으면 바로 돌 것): ' + bidded.length + '건 · 월검색 ' + won(bidded.filter(r => r.vol).reduce((a, r) => a + r.vol, 0)));
  console.log('');
  const top = rows.filter(r => r.vol).sort((a, b) => b.vol - a.vol).slice(0, 40);
  console.log('   검색량 큰 순 40:');
  for (const r of top) console.log('     ' + r.k.padEnd(20) + ('월' + won(r.vol)).padStart(9) + '  입찰 ' + String(won(r.eff)).padStart(6) + '  ' + r.adState + '  @' + (r.grp || '').slice(0, 22));
  // 그룹 단위 요약
  const gsum = {};
  for (const r of rows) { const x = gsum[r.gid] = gsum[r.gid] || { grp: r.grp, camp: r.camp, n: 0, vol: 0, state: r.adState }; x.n++; x.vol += r.vol || 0; }
  const gtop = Object.values(gsum).sort((a, b) => b.vol - a.vol || b.n - a.n).slice(0, 20);
  console.log('');
  console.log('   영향 큰 그룹 20:');
  for (const g of gtop) console.log('     ' + (g.grp || '').padEnd(26) + ' 키워드 ' + String(g.n).padStart(4) + ' · 월검색 ' + won(g.vol).padStart(9) + ' · ' + g.state + ' · ' + (g.camp || '').slice(0, 24));
}

const m = process.argv[2];
({ sweep, report: async () => report() }[m] || (async () => console.log('sweep|report')))().catch(e => { console.error(e.stack); process.exitCode = 1; });
