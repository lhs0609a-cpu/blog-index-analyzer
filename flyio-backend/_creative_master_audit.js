// 소잠 — 소재 없는/노출불가 소재만 있는 그룹 전수조사 (2026-09-11 사용자 지시 "키워드는 등록됐는데 광고소재 안붙어서 노출안되는거 전수조사").
// 그룹별 /ncc/ads 7천 콜 대신 마스터 리포트(Campaign·Adgroup·Keyword·Ad) 4개를 받아 로컬에서 조인한다.
// 1단계(이 파일 fetch): 작업 생성 → BUILT 대기 → downloadUrl 직접 다운로드. 결과 reports/sojam-20260911/creative/master_*.tsv
const fs = require('fs'), path = require('path');
const base = 'https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=1858907';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(m, p, b) {
  for (let a = 0; a < 3; a++) {
    try { const r = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ customer_id: '1858907', method: m, path: p, body: b || null }), signal: AbortSignal.timeout(50000) });
      const d = await r.json(); if (!r.ok || !d.success) throw Error(String(d.error || '').slice(0, 200)); return d.response; }
    catch (e) { if (a === 2) throw e; await sleep(2500); }
  }
}
const D = path.join(__dirname, '../reports/sojam-20260911/creative');
fs.mkdirSync(D, { recursive: true });
(async () => {
  for (const item of process.argv.slice(2).length ? process.argv.slice(2) : ['Campaign', 'Adgroup', 'Keyword', 'Ad']) {
    const jf = path.join(D, 'job_' + item + '.json');
    let job = fs.existsSync(jf) ? JSON.parse(fs.readFileSync(jf, 'utf8')) : await api('POST', '/master-reports', { item });
    if (!job || !job.id) { console.log(item, 'job 생성 실패', JSON.stringify(job).slice(0, 200)); continue; }
    fs.writeFileSync(jf, JSON.stringify(job));
    for (let i = 0; i < 60 && job.status !== 'BUILT' && job.status !== 'ERROR' && job.status !== 'NONE'; i++) { await sleep(3000); job = await api('GET', '/master-reports/' + job.id); fs.writeFileSync(jf, JSON.stringify(job)); }
    if (job.status !== 'BUILT') { console.log(item, 'status', job.status); continue; }
    const u = new URL(job.downloadUrl);
    if (u.hostname !== 'api.searchad.naver.com') throw Error('bad host ' + u.hostname);
    const r = await fetch(u, { signal: AbortSignal.timeout(120000) });
    const t = await r.text();
    if (!r.ok) { console.log(item, '다운로드 HTTP', r.status, t.slice(0, 200)); continue; }
    fs.writeFileSync(path.join(D, 'master_' + item + '.tsv'), t);
    const lines = t.split('\n').filter(Boolean);
    console.log('\n' + item, 'rows', lines.length, 'updateTm', job.updateTm || job.registTime || '');
    for (const l of lines.slice(0, 2)) console.log('  ', l.slice(0, 400));
  }
})().catch(e => { console.error('FAIL', e.message); process.exitCode = 1; });
