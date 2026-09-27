// 소잠 — 키워드를 가진 살아있는 광고그룹 전수의 소재 유무 확인.
// statusReason 은 소재 없음을 알려주지 않는다(표본 200 중 23개가 ELIGIBLE 인데 노출가능 소재 0).
// 키워드 많은 그룹부터 돈다 — 중간에 멈춰도 노출 위험이 큰 쪽이 먼저 측정된다.
const fs = require('fs');
const base = 'https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=1858907';
async function api(m, p) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(base, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customer_id: '1858907', method: m, path: p, body: null }),
        signal: AbortSignal.timeout(45000),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw Error(String(d.error || '').slice(0, 120));
      return d.response;
    } catch (e) { if (a === 2) return null; await new Promise(s => setTimeout(s, 3000)); }
  }
}
const F = '../reports/sojam-20260910/_ad_sweep.json';
(async () => {
  const audit = JSON.parse(fs.readFileSync('../reports/sojam-20260910/_ad_audit.json', 'utf8'));
  const order = JSON.parse(fs.readFileSync('../reports/sojam-20260910/_group_kwcount.json', 'utf8'));
  const st = fs.existsSync(F) ? JSON.parse(fs.readFileSync(F, 'utf8')) : { g: {} };
  // 이미 표본에서 본 것 재사용
  for (const [gid, v] of Object.entries(audit.sample || {})) if (!st.g[gid]) st.g[gid] = v;
  const todo = order.filter(o => audit.groups[o[0]] && audit.groups[o[0]].s === 'ELIGIBLE' && !st.g[o[0]]);
  console.error('전수 대상', order.length, '남은', todo.length);
  let n = 0;
  for (const [gid, kwc] of todo) {
    const ads = await api('GET', '/ncc/ads?nccAdgroupId=' + gid);
    if (ads === null) { console.error('  skip', gid); continue; }
    const arr = Array.isArray(ads) ? ads : [];
    st.g[gid] = { ads: arr.length, kw: kwc,
      ok: arr.filter(a => !a.userLock && a.inspectStatus === 'APPROVED' && a.status === 'ELIGIBLE').length };
    if (++n % 100 === 0) {
      fs.writeFileSync(F, JSON.stringify(st));
      const v = Object.values(st.g);
      console.error('  ', n, '/', todo.length, '| 누적 소재0', v.filter(x => x.ads === 0).length,
        '| 노출가능0', v.filter(x => x.ok === 0).length);
    }
    await new Promise(s => setTimeout(s, 130));
  }
  fs.writeFileSync(F, JSON.stringify(st));
  const v = Object.values(st.g);
  const dead = v.filter(x => x.ok === 0);
  console.log('DONE 조회', v.length,
    '| 소재 0개', v.filter(x => x.ads === 0).length,
    '| 노출가능 소재 0개', dead.length,
    '| 그 안에 묶인 키워드', dead.reduce((s, x) => s + (x.kw || 0), 0));
})().catch(e => { console.error('FAIL', e.message); process.exitCode = 1; });
