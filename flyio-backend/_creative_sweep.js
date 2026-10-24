// 소잠 — 키워드는 켜져 있는데 노출 가능한 소재가 없는 그룹 전수조사 (2026-09-11 사용자 지시).
// 네이버는 소재 0개 그룹도 statusReason=ELIGIBLE 로 준다 → 그룹마다 /ncc/ads 로 직접 본다(메모리 sojam-creative-audit).
// 마스터 리포트 다운로드는 서명 필요 + 프록시 경로 제한으로 막혀 있어 그룹 단위 조회로 간다.
// 단계 A 그룹 재수집(캠페인별) → B 키워드 보유 그룹 소재 조회 → C 노출불가 그룹의 키워드·잠금 확인. 전부 JSONL 누적·재실행 이어감.
// 프록시 서버 3GB·swap 0 → 동시 2, 150ms 간격. 잠금파일로 중복 실행 방지.
const fs = require('fs'), path = require('path');
const base = 'https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=1858907';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(p) {
  for (let a = 0; a < 3; a++) {
    try { const r = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ customer_id: '1858907', method: 'GET', path: p, body: null }), signal: AbortSignal.timeout(45000) });
      const d = await r.json(); if (!r.ok || !d.success) throw Error(String(d.error || '').slice(0, 150)); return d.response; }
    catch (e) { if (a === 2) return null; await sleep(3000); }
  }
}
const D = path.join(__dirname, '../reports/sojam-20260911/creative');
fs.mkdirSync(D, { recursive: true });
const F = n => path.join(D, n);
const readL = f => fs.existsSync(F(f)) ? fs.readFileSync(F(f), 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean) : [];
const LOCK = F('_sweep.lock');
// 노출 가능한 소재: 켜짐 + 검수 승인 + ELIGIBLE
const okAd = a => !a.lock && a.ins === 'APPROVED' && a.st === 'ELIGIBLE';

async function pool(items, n, fn) { let i = 0, done = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const x = items[i++]; await fn(x); if (++done % 300 === 0) console.error('   ', done, '/', items.length); await sleep(150); } })); }

(async () => {
  if (fs.existsSync(LOCK) && Date.now() - fs.statSync(LOCK).mtimeMs < 120000) { console.error('이미 실행 중'); return; }
  fs.writeFileSync(LOCK, String(process.pid));
  const tick = setInterval(() => { try { fs.writeFileSync(LOCK, String(process.pid)); } catch (e) {} }, 30000);
  try {
    // A) 그룹 재수집
    const camps = await api('/ncc/campaigns?recordSize=1000');
    if (!Array.isArray(camps)) throw Error('캠페인 조회 실패');
    fs.writeFileSync(F('campaigns.json'), JSON.stringify(camps.map(c => ({ id: c.nccCampaignId, name: c.name, lock: c.userLock, st: c.status, sr: c.statusReason, tp: c.campaignTp }))));
    const invDone = new Set(readL('inv.jsonl').map(x => x.cid));
    const todoC = camps.filter(c => !invDone.has(c.nccCampaignId));
    console.error('A 캠페인', camps.length, '남은', todoC.length);
    await pool(todoC, 2, async c => {
      const gs = await api('/ncc/adgroups?nccCampaignId=' + c.nccCampaignId + '&recordSize=1000');
      if (!Array.isArray(gs)) return;
      fs.appendFileSync(F('inv.jsonl'), JSON.stringify({ cid: c.nccCampaignId, groups: gs.map(g => ({ id: g.nccAdgroupId, name: g.name, lock: g.userLock, st: g.status, sr: g.statusReason })) }) + '\n');
    });
    const inv = new Map();
    for (const r of readL('inv.jsonl')) for (const g of r.groups) inv.set(g.id, { ...g, cid: r.cid });
    console.error('  그룹', inv.size);

    // B) 키워드 보유 그룹 + 9/10 이후 새로 생긴 그룹의 소재 조회
    const R10 = path.join(__dirname, '../reports/sojam-20260910/');
    const kwc = new Map(JSON.parse(fs.readFileSync(R10 + '_group_kwcount.json', 'utf8')));
    const old = new Set(Object.keys(JSON.parse(fs.readFileSync(R10 + '_ad_audit.json', 'utf8')).groups));
    const adsDone = new Set(readL('ads.jsonl').map(x => x.gid));
    const todoG = [...inv.keys()].filter(g => (kwc.get(g) > 0 || !old.has(g)) && !adsDone.has(g));
    console.error('B 소재 조회 대상 남은', todoG.length);
    await pool(todoG, 2, async gid => {
      const ads = await api('/ncc/ads?nccAdgroupId=' + gid);
      if (ads === null) return; // 실패는 기록하지 않아 재실행 때 다시 본다
      const arr = (Array.isArray(ads) ? ads : []).map(a => ({ id: a.nccAdId, lock: a.userLock, ins: a.inspectStatus, st: a.status, sr: a.statusReason, tp: a.type }));
      fs.appendFileSync(F('ads.jsonl'), JSON.stringify({ gid, kw910: kwc.get(gid) || 0, ads: arr }) + '\n');
    });

    // C) 노출 가능한 소재가 없는 그룹 → 실제 키워드(켜진 것) 수 확인
    const adRows = readL('ads.jsonl');
    const bad = adRows.filter(r => !r.ads.some(okAd));
    const kwDone = new Set(readL('kw.jsonl').map(x => x.gid));
    const todoK = bad.map(r => r.gid).filter(g => !kwDone.has(g));
    console.error('C 노출불가 그룹', bad.length, '키워드 조회 남은', todoK.length);
    await pool(todoK, 2, async gid => {
      const ks = await api('/ncc/keywords?nccAdgroupId=' + gid);
      if (ks === null) return;
      const arr = Array.isArray(ks) ? ks : [];
      fs.appendFileSync(F('kw.jsonl'), JSON.stringify({ gid, total: arr.length, on: arr.filter(k => !k.userLock).length,
        onKw: arr.filter(k => !k.userLock).map(k => k.keyword).slice(0, 2000) }) + '\n');
    });
    console.log('SWEEP DONE 그룹', inv.size, '| 소재조회', readL('ads.jsonl').length, '| 노출불가', bad.length, '| 키워드조회', readL('kw.jsonl').length);
  } finally { clearInterval(tick); try { fs.unlinkSync(LOCK); } catch (e) {} }
})().catch(e => { console.error('FAIL', e.message); process.exitCode = 1; });
