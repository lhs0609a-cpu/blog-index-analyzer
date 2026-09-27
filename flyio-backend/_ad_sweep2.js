// 소잠 — 키워드 보유 ELIGIBLE 광고그룹 전수의 소재 유무. JSONL 누적(잘림 없음, 중단해도 이어감).
// 이전 버전은 전체 JSON 을 매번 덮어써서 인스턴스 두 개가 겹쳤을 때 파일이 0바이트로 날아갔다.
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
const F = '../reports/sojam-20260910/_ad_sweep.jsonl';
const LOCK = '../reports/sojam-20260910/_ad_sweep.lock';
(async () => {
  if (fs.existsSync(LOCK)) {
    const age = Date.now() - fs.statSync(LOCK).mtimeMs;
    if (age < 120000) { console.error('이미 실행 중 (lock ' + Math.round(age / 1000) + 's)'); return; }
  }
  fs.writeFileSync(LOCK, String(process.pid));
  const tick = setInterval(() => { try { fs.writeFileSync(LOCK, String(process.pid)); } catch (e) {} }, 30000);
  try {
    const audit = JSON.parse(fs.readFileSync('../reports/sojam-20260910/_ad_audit.json', 'utf8'));
    const order = JSON.parse(fs.readFileSync('../reports/sojam-20260910/_group_kwcount.json', 'utf8'));
    const seen = new Set();
    if (fs.existsSync(F))
      for (const line of fs.readFileSync(F, 'utf8').split('\n'))
        if (line.trim()) { try { seen.add(JSON.parse(line).gid); } catch (e) {} }
    // 표본에서 이미 본 것 재사용
    for (const [gid, v] of Object.entries(audit.sample || {}))
      if (!seen.has(gid)) { fs.appendFileSync(F, JSON.stringify({ gid, ads: v.ads, ok: v.ok }) + '\n'); seen.add(gid); }
    const todo = order.filter(o => audit.groups[o[0]] && audit.groups[o[0]].s === 'ELIGIBLE' && !seen.has(o[0]));
    console.error('전수 대상', order.length, '남은', todo.length);
    let n = 0, cursor = 0;
    const CONC = 3;   // 서버가 3GB·swap 0 이라 이 이상 올리지 않는다
    await Promise.all(Array.from({ length: CONC }, async () => {
      while (cursor < todo.length) {
        const [gid, kwc] = todo[cursor++];
        const ads = await api('GET', '/ncc/ads?nccAdgroupId=' + gid);
        if (ads !== null) {
          const arr = Array.isArray(ads) ? ads : [];
          fs.appendFileSync(F, JSON.stringify({ gid, kw: kwc, ads: arr.length,
            ok: arr.filter(a => !a.userLock && a.inspectStatus === 'APPROVED' && a.status === 'ELIGIBLE').length }) + '\n');
        }
        if (++n % 300 === 0) console.error('  ', n, '/', todo.length);
        await new Promise(s => setTimeout(s, 90));
      }
    }));
    console.log('DONE 이번 실행', n, '누적', seen.size + n);
  } finally { clearInterval(tick); try { fs.unlinkSync(LOCK); } catch (e) {} }
})().catch(e => { console.error('FAIL', e.message); process.exitCode = 1; });
