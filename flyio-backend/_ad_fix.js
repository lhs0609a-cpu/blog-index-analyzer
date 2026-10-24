// 소잠 — 키워드 보유 ELIGIBLE 그룹을 돌며 소재가 0개면 승인된 MEDICAL_AD 를 복사해 붙인다.
// 사용자 지시(2026-09-10): "소재 0인거 전부 소재 붙여".
// 감사와 적용을 한 패스로 합쳤다 — 중간에 끊겨도 그때까지의 그룹은 실제로 고쳐져 있다.
// 기록은 JSONL 누적(잘림 없음). 키워드 많은 그룹부터.
const fs = require('fs');
const base = 'https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=1858907';
async function api(m, p, b) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(base, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customer_id: '1858907', method: m, path: p, body: b === undefined ? null : b }),
        signal: AbortSignal.timeout(45000),
      });
      const d = await r.json();
      if (!r.ok || !d.success) return { __err: String(d.error || '').slice(0, 200) };
      return d.response;
    } catch (e) { if (a === 2) return { __err: String(e).slice(0, 150) }; await new Promise(s => setTimeout(s, 3000)); }
  }
}
const F = '../reports/sojam-20260910/_ad_fix.jsonl';
const LOCK = '../reports/sojam-20260910/_ad_fix.lock';
const DRY = process.argv.includes('--dry');
(async () => {
  if (fs.existsSync(LOCK) && Date.now() - fs.statSync(LOCK).mtimeMs < 120000) { console.error('이미 실행 중'); return; }
  fs.writeFileSync(LOCK, String(process.pid));
  const tick = setInterval(() => { try { fs.writeFileSync(LOCK, String(process.pid)); } catch (e) {} }, 30000);
  try {
    const src = JSON.parse(fs.readFileSync('../reports/sojam-20260910/_source_ad.json', 'utf8'))[0];
    const basic = src.ad.basic;
    if (!basic || !basic.medicalNo) throw Error('원본 소재 basic/medicalNo 없음');
    const order = JSON.parse(fs.readFileSync('../reports/sojam-20260910/_group_kwcount_rest.json', 'utf8'));
    // 드라이런 기록(would_add)은 아직 실제로 안 붙인 것이므로 완료로 치지 않는다.
    const seen = new Set();
    if (fs.existsSync(F))
      for (const line of fs.readFileSync(F, 'utf8').split('\n'))
        if (line.trim()) {
          try { const d = JSON.parse(line); if (d.act !== 'would_add') seen.add(d.gid); } catch (e) {}
        }
    const todo = order.filter(o => !seen.has(o[0]));
    console.error((DRY ? '[DRY] ' : '') + '대상', order.length, '남은', todo.length, '| 심의번호', basic.medicalNo);
    let n = 0, cursor = 0, added = 0, had = 0, failed = 0;
    const CONC = 3;
    await Promise.all(Array.from({ length: CONC }, async () => {
      while (cursor < todo.length) {
        const [gid, kwc] = todo[cursor++];
        const ads = await api('GET', '/ncc/ads?nccAdgroupId=' + gid);
        if (ads && ads.__err) { failed++; await new Promise(s => setTimeout(s, 90)); continue; }
        const arr = Array.isArray(ads) ? ads : [];
        const rec = { gid, kw: kwc, ads: arr.length,
          ok: arr.filter(a => !a.userLock && a.inspectStatus === 'APPROVED' && a.status === 'ELIGIBLE').length };
        if (arr.length === 0) {
          if (DRY) { rec.act = 'would_add'; }
          else {
            const r = await api('POST', '/ncc/ads?nccAdgroupId=' + gid,
              { nccAdgroupId: gid, type: 'MEDICAL_AD', ad: { basic } });
            if (r && r.nccAdId) { rec.act = 'added'; rec.adId = r.nccAdId; rec.inspect = r.inspectStatus; added++; }
            else { rec.act = 'add_failed'; rec.err = (r && r.__err) || JSON.stringify(r).slice(0, 200); failed++; }
          }
        } else { rec.act = 'has_ad'; had++; }
        fs.appendFileSync(F, JSON.stringify(rec) + '\n');
        if (++n % 200 === 0) console.error('  ', n, '/', todo.length, '| 붙임', added, '| 이미있음', had, '| 실패', failed);
        await new Promise(s => setTimeout(s, 90));
      }
    }));
    console.log('DONE 이번 실행', n, '| 소재 붙임', added, '| 이미 있음', had, '| 실패', failed);
  } finally { clearInterval(tick); try { fs.unlinkSync(LOCK); } catch (e) {} }
})().catch(e => { console.error('FAIL', e.message); process.exitCode = 1; });
