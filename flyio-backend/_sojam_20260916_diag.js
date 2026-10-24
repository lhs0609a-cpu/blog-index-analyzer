// 입찰은 충분한데 노출 0인 키워드의 구조적 원인 진단 (2026-09-16).
// 입찰을 아무리 올려도 안 뜨는 경우가 있다 [[kiness-unexposed-not-bid]] — 소재 0 · 검수 미통과 · 잠금 · 타기팅.
const fs = require('fs'), path = require('path'), CID = '1858907';
const BASE = 'https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=' + CID;
const D15 = path.join(__dirname, '../reports/sojam-20260915/');
const D16 = path.join(__dirname, '../reports/sojam-20260916/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
async function api(p, t = 4) { for (let i = 0; i < t; i++) { try { const r = await fetch(BASE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ customer_id: CID, method: 'GET', path: p, body: null }), signal: AbortSignal.timeout(90000) }); if (r.ok) { const d = await r.json(); if (d.success) return d.response; } } catch (e) { } await sleep(600 * (i + 1)); } return null; }
async function pool(items, n, fn) { const o = []; let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; o[k] = await fn(items[k]); } })); return o; }
const J = p => JSON.parse(fs.readFileSync(p, 'utf8'));

(async () => {
  const pick = J(D16 + 'boost_pick.json');
  const est = J(D16 + 'boost_est.json');
  const T = J(path.join(__dirname, '../reports/sojam-20260915_targets.json'));
  const EX = J(path.join(__dirname, '../reports/sojam-20260915_excluded_axes.json'));
  const idsOf = k => ((T[k] || EX[k] || {}).ids) || [];
  // 입찰 충분 + 노출 0
  const targets = pick.filter(r => { const t = est['MOBILE|3|' + r.k]; return t != null && t <= r.bid && r.imp === 0; });
  const ids = [...new Set(targets.flatMap(r => idsOf(r.k)))];
  console.error('진단 대상 텍스트', targets.length, '| ID', ids.length);

  const kw = {};
  for (const b of chunk(ids, 20)) {
    const r = await api('/ncc/keywords?ids=' + encodeURIComponent(b.join(',')));
    for (const k of (Array.isArray(r) ? r : [])) kw[k.nccKeywordId] = { k: k.keyword, gid: k.nccAdgroupId, bid: k.bidAmt, useGrp: !!k.useGroupBidAmt, lock: !!k.userLock, st: k.status, sr: k.statusReason, ins: k.inspectStatus, qi: k.nccQi && k.nccQi.qiGrade };
    await sleep(160);
  }
  const gids = [...new Set(Object.values(kw).map(x => x.gid).filter(Boolean))];
  console.error('그룹', gids.length, '조회');
  const gl = await pool(gids, 6, async g => ({ g, grp: await api('/ncc/adgroups/' + g), ads: await api('/ncc/ads?nccAdgroupId=' + g) }));
  const grp = {};
  for (const x of gl) {
    if (!x.grp) continue;
    const okAds = (Array.isArray(x.ads) ? x.ads : []).filter(a => !a.delFlag && !a.userLock && a.inspectStatus === 'APPROVED' && a.status === 'ELIGIBLE').length;
    const tg = (x.grp.targets || []).map(t => t.targetTp);
    grp[x.g] = { name: x.grp.name, cid: x.grp.nccCampaignId, lock: !!x.grp.userLock, st: x.grp.status, sr: x.grp.statusReason, ads: (Array.isArray(x.ads) ? x.ads.length : 0), okAds, targets: tg };
  }
  const cids = [...new Set(Object.values(grp).map(g => g.cid))];
  const camp = {};
  for (const c of cids) { const r = await api('/ncc/campaigns/' + c); if (r) camp[c] = { name: r.name, lock: !!r.userLock, st: r.status }; await sleep(120); }
  fs.writeFileSync(D16 + 'diag_raw.json', JSON.stringify({ kw, grp, camp }));

  const reason = r => {
    const cands = idsOf(r.k).map(i => kw[i]).filter(Boolean);
    if (!cands.length) return '등록 없음';
    const live = cands.filter(m => { const g = grp[m.gid] || {}, c = camp[g.cid] || {}; return !m.lock && !g.lock && !c.lock && m.st !== 'PAUSED'; });
    if (!live.length) return '전부 꺼짐(키워드·그룹·캠페인 잠금)';
    if (live.every(m => m.ins !== 'APPROVED')) return '키워드 검수 미통과';
    const withAd = live.filter(m => (grp[m.gid] || {}).okAds > 0);
    if (!withAd.length) return '그룹에 승인 소재 0';
    const untargeted = withAd.filter(m => !((grp[m.gid] || {}).targets || []).some(t => /REGION|TIME|PLACE/.test(t)));
    if (!untargeted.length) return '지역·시간 타기팅에만 등록됨';
    return '구조상 이상 없음(실검색 부족 추정)';
  };
  const out = targets.map(r => ({ ...r, why: reason(r) }));
  fs.writeFileSync(D16 + 'diag.json', JSON.stringify(out));
  const by = {}; for (const r of out) { const x = by[r.why] = by[r.why] || { n: 0, vol: 0 }; x.n++; x.vol += r.vol || 0; }
  const won = n => Math.round(n || 0).toLocaleString('ko-KR');
  console.log('입찰 충분한데 노출 0 —', out.length, '개 원인별');
  for (const [k, v] of Object.entries(by).sort((a, b) => b[1].vol - a[1].vol)) console.log('  ' + k + ': ' + v.n + '개 · 월검색 합 ' + won(v.vol));
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
