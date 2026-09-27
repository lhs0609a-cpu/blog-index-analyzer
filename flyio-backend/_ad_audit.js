// 소잠 — 계정 전체 광고그룹의 소재 유무 감사.
// 1) 137 캠페인의 그룹을 새로 떠서 status/statusReason 분포를 본다 (NO_AD 는 네이버가 statusReason 에 준다).
// 2) 키워드를 가진 살아있는 그룹에서 무작위 표본을 뽑아 /ncc/ads 로 직접 대조한다.
const fs = require('fs');
const base = 'https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=1858907';
async function api(m, p) {
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(base, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customer_id: '1858907', method: m, path: p, body: null }),
        signal: AbortSignal.timeout(50000),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw Error(String(d.error || '').slice(0, 150));
      return d.response;
    } catch (e) { if (a === 3) { console.error('  skip', p.slice(0, 50)); return null; } await new Promise(s => setTimeout(s, 2500)); }
  }
}
const F = '../reports/sojam-20260910/_ad_audit.json';
(async () => {
  const st = fs.existsSync(F) ? JSON.parse(fs.readFileSync(F, 'utf8')) : { groups: {}, doneCamps: [], sample: {} };
  const done = new Set(st.doneCamps);
  const camps = await api('GET', '/ncc/campaigns?recordSize=1000');
  console.error('캠페인', camps.length);
  for (const c of camps) {
    if (done.has(c.nccCampaignId)) continue;
    const gs = await api('GET', '/ncc/adgroups?nccCampaignId=' + c.nccCampaignId + '&recordSize=1000');
    if (Array.isArray(gs)) for (const g of gs)
      st.groups[g.nccAdgroupId] = { name: g.name, camp: c.name, cs: c.status,
        s: g.status, sr: g.statusReason, lock: g.userLock };
    st.doneCamps.push(c.nccCampaignId);
    if (st.doneCamps.length % 20 === 0) { fs.writeFileSync(F, JSON.stringify(st)); console.error(' 캠페인', st.doneCamps.length, '/', camps.length, '그룹', Object.keys(st.groups).length); }
    await new Promise(s => setTimeout(s, 150));
  }
  fs.writeFileSync(F, JSON.stringify(st));
  const cnt = {};
  for (const g of Object.values(st.groups)) { const k = g.s + '|' + g.sr; cnt[k] = (cnt[k] || 0) + 1; }
  console.log('그룹 총', Object.keys(st.groups).length, JSON.stringify(cnt));

  // 표본 직접 대조 — 키워드 보유 & 살아있는 그룹
  const withKw = JSON.parse(fs.readFileSync('../reports/sojam-20260910/_live_groups.json', 'utf8'));
  const live = withKw.filter(g => st.groups[g] && st.groups[g].s === 'ELIGIBLE');
  const pick = [];
  const seed = 20260910;
  let x = seed;
  const pool = live.slice();
  for (let i = 0; i < 200 && pool.length; i++) {
    x = (x * 1103515245 + 12345) % 2147483648;
    pick.push(pool.splice(x % pool.length, 1)[0]);
  }
  const todo = pick.filter(g => !st.sample[g]);
  console.error('표본 대조', todo.length, '/', pick.length);
  let n = 0;
  for (const g of todo) {
    const ads = await api('GET', '/ncc/ads?nccAdgroupId=' + g);
    const arr = Array.isArray(ads) ? ads : [];
    st.sample[g] = { ads: arr.length, ok: arr.filter(a => !a.userLock && a.inspectStatus === 'APPROVED' && a.status === 'ELIGIBLE').length,
      inspects: arr.map(a => a.inspectStatus) };
    if (++n % 25 === 0) { fs.writeFileSync(F, JSON.stringify(st)); console.error('  표본', n, '/', todo.length); }
    await new Promise(s => setTimeout(s, 180));
  }
  fs.writeFileSync(F, JSON.stringify(st));
  const vals = Object.values(st.sample);
  console.log('표본', vals.length, '| 소재 0개', vals.filter(v => v.ads === 0).length,
    '| 노출가능 소재 0개', vals.filter(v => v.ok === 0).length,
    '| 평균 소재수', (vals.reduce((s, v) => s + v.ads, 0) / vals.length).toFixed(1));
})().catch(e => { console.error('FAIL', e.message); process.exitCode = 1; });
