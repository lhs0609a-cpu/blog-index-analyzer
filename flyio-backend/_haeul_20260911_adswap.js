// 해울 — /BrainFog 로 가는 소재를 전부 걷어내고 nad-a001-01-000000580336539(메인 연결, 한83947)로 바꾼다.
// 사용자 지시(2026-09-11): "브레인포그 다 없애고 이걸로 전부 바꿔, 연결 url도 메인으로, 전체캠페인".
//   --add        WEB_SITE 전 그룹에 새 소재를 붙인다(그룹당 POST 1회, 이미 있으면 3822 로 건너뜀)
//   --swap       새 소재가 APPROVED 된 그룹에서만 옛 소재를 지운다(재실행 가능 — 승인되는 대로 반복)
//   --delete-now 승인 여부와 무관하게 옛 소재를 지운다(--add 와 함께 쓰면 붙이자마자 지움)
//   --keyword    연결URL이 따로 박힌 키워드를 메인으로
//   --dry        기록만 하고 쓰지 않음
// 옛 소재 목록은 reports/haeul_20260911/inventory.json(Ad 마스터 리포트)을 쓴다. 기록은 JSONL 누적.
const fs = require('fs'), path = require('path');
const CID = 3442423, SRC = 'nad-a001-01-000000580336539', MAIN = 'https://haeulclinic.com';
const D = path.join(__dirname, 'reports', 'haeul_20260911');
const F = path.join(D, 'adswap.jsonl'), LOCK = path.join(D, 'adswap.lock');
const has = f => process.argv.includes(f), DRY = has('--dry');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(m, p, b) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch('https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=' + CID, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customer_id: String(CID), method: m, path: p, body: b === undefined ? null : b }),
        signal: AbortSignal.timeout(45000),
      });
      const d = await r.json();
      if (!r.ok || !d.success) return { __err: String(d.error || d.detail || '').slice(0, 300) };
      return d.response === undefined ? {} : d.response;
    } catch (e) { if (a === 2) return { __err: String(e).slice(0, 150) }; await sleep(3000); }
  }
}
const log = rec => fs.appendFileSync(F, JSON.stringify({ t: new Date().toISOString(), ...rec }) + '\n');
const readLog = () => fs.existsSync(F) ? fs.readFileSync(F, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean) : [];

(async () => {
  if (fs.existsSync(LOCK) && Date.now() - fs.statSync(LOCK).mtimeMs < 120000) { console.error('이미 실행 중'); return; }
  fs.writeFileSync(LOCK, String(process.pid));
  const tick = setInterval(() => { try { fs.writeFileSync(LOCK, String(process.pid)); } catch (e) {} }, 30000);
  try {
    const src = await api('GET', '/ncc/ads/' + SRC);
    const basic = src && src.ad && src.ad.basic;
    if (!basic || !basic.medicalNo || basic.pc.final !== MAIN || basic.mobile.final !== MAIN) throw Error('원본 소재 이상 ' + JSON.stringify(src).slice(0, 300));
    console.error('원본', SRC, src.inspectStatus, basic.medicalNo, basic.pc.final);

    // 옛 소재: 마스터 리포트의 TEXT 소재 전부(원본 소재 제외). 그룹 → [adId]
    const inv = JSON.parse(fs.readFileSync(path.join(D, 'inventory.json'), 'utf8'));
    const oldByGroup = new Map();
    for (const r of inv.Ad.all) if (r[2] !== SRC) (oldByGroup.get(r[1]) || oldByGroup.set(r[1], []).get(r[1])).push({ id: r[2], url: r[6] });

    const done = readLog();
    const added = new Map(done.filter(x => x.act === 'added' || x.act === 'exists').map(x => [x.gid, x]));
    const deleted = new Set(done.filter(x => x.act === 'deleted').map(x => x.adId));

    if (has('--add')) {
      const camps = (await api('GET', '/ncc/campaigns')).filter(c => c.campaignTp === 'WEB_SITE');
      // 메인 캠페인부터
      camps.sort((a, b) => (/자동풀|auto/.test(a.name) ? 1 : 0) - (/자동풀|auto/.test(b.name) ? 1 : 0));
      // 그룹 목록은 한 번 받으면 캐시한다 — 프록시가 느릴 때 캠페인 하나 타임아웃으로 전체가 멈췄다
      const GF = path.join(D, 'groups.json');
      let groups = fs.existsSync(GF) ? JSON.parse(fs.readFileSync(GF, 'utf8')) : null;
      if (!groups) {
        groups = [];
        for (const c of camps) {
          let gs;
          for (let t = 0; t < 4 && !Array.isArray(gs); t++) { if (t) await sleep(10000 * t); gs = await api('GET', '/ncc/adgroups?nccCampaignId=' + c.nccCampaignId); }
          if (!Array.isArray(gs)) throw Error('그룹 조회 실패 ' + c.name + ' ' + JSON.stringify(gs).slice(0, 200));
          for (const g of gs) groups.push({ gid: g.nccAdgroupId, cname: c.name, gname: g.name });
        }
        fs.writeFileSync(GF, JSON.stringify(groups));
      }
      const todo = groups.filter(g => g.gid !== src.nccAdgroupId && !added.has(g.gid));
      console.error((DRY ? '[DRY] ' : '') + 'WEB_SITE 그룹', groups.length, '남은', todo.length);
      let n = 0, ok = 0, fail = 0;
      for (const g of todo) {
        const olds = oldByGroup.get(g.gid) || [];
        if (DRY) { log({ act: 'would_add', ...g, olds: olds.length }); n++; continue; }
        const r = await api('POST', '/ncc/ads?nccAdgroupId=' + g.gid, { nccAdgroupId: g.gid, type: 'MEDICAL_AD', ad: { basic } });
        if (r && r.nccAdId) { log({ act: 'added', ...g, adId: r.nccAdId, inspect: r.inspectStatus }); ok++; added.set(g.gid, { adId: r.nccAdId }); }
        else if (r && /3822/.test(r.__err || '')) { log({ act: 'exists', ...g }); ok++; added.set(g.gid, {}); }
        else { log({ act: 'add_failed', ...g, err: (r && r.__err) || JSON.stringify(r).slice(0, 200) }); fail++; }
        if (has('--delete-now')) for (const o of olds) if (!deleted.has(o.id)) {
          const d = await api('DELETE', '/ncc/ads/' + o.id);
          if (d && d.__err) log({ act: 'delete_failed', gid: g.gid, adId: o.id, err: d.__err }); else { log({ act: 'deleted', gid: g.gid, adId: o.id, url: o.url }); deleted.add(o.id); }
        }
        if (++n % 100 === 0) console.error('  ', n, '/', todo.length, '| 붙임', ok, '| 실패', fail);
        await sleep(120);
      }
      console.log('ADD 이번 실행', n, '| 붙임/이미있음', ok, '| 실패', fail);
    }

    if (has('--swap')) {
      // 새 소재 상태는 그룹별로 직접 본다 — 승인된 그룹만 옛 소재 삭제
      const gids = [...new Set([...added.keys(), src.nccAdgroupId])];
      let appr = 0, wait = 0, rej = 0, del = 0;
      for (const gid of gids) {
        const olds = (oldByGroup.get(gid) || []).filter(o => !deleted.has(o.id));
        if (!olds.length) continue;
        const ads = await api('GET', '/ncc/ads?nccAdgroupId=' + gid);
        if (!Array.isArray(ads)) { log({ act: 'swap_read_failed', gid, err: ads && ads.__err }); continue; }
        const mine = ads.find(a => a.type === 'MEDICAL_AD' && a.ad && a.ad.basic && a.ad.basic.medicalNo === basic.medicalNo && a.ad.basic.pc.final === MAIN);
        const st = mine ? mine.inspectStatus : 'MISSING';
        if (st === 'APPROVED') appr++; else if (st === 'UNDER_REVIEW') wait++; else rej++;
        if (st !== 'APPROVED' && !has('--delete-now')) { await sleep(80); continue; }
        for (const o of olds) {
          if (DRY) { log({ act: 'would_delete', gid, adId: o.id, newStatus: st }); continue; }
          const d = await api('DELETE', '/ncc/ads/' + o.id);
          if (d && d.__err) log({ act: 'delete_failed', gid, adId: o.id, err: d.__err }); else { log({ act: 'deleted', gid, adId: o.id, url: o.url, newStatus: st }); deleted.add(o.id); del++; }
        }
        await sleep(120);
      }
      console.log('SWAP 새소재 승인', appr, '| 검수중', wait, '| 반려/없음', rej, '| 옛소재 삭제', del);
    }

    if (has('--keyword')) {
      for (const r of inv.Keyword.linked) {
        const kid = r[2], url = r[5];
        if (url.replace(/\/$/, '') === MAIN) continue;
        const before = await api('GET', '/ncc/keywords/' + kid);
        if (!before || before.__err) { log({ act: 'kw_read_failed', kid, err: before && before.__err }); continue; }
        const links = { pc: { final: MAIN }, mobile: { final: MAIN } };
        if (DRY) { log({ act: 'would_relink', kid, keyword: before.keyword, from: url }); continue; }
        const u = await api('PUT', '/ncc/keywords/' + kid + '?fields=links', { ...before, links });
        const after = await api('GET', '/ncc/keywords/' + kid);
        log({ act: u && u.__err ? 'kw_failed' : 'kw_relinked', kid, keyword: before.keyword, from: url, to: after && after.links, inspect: after && after.inspectStatus, err: u && u.__err });
        console.log('KEYWORD', before.keyword, url, '→', JSON.stringify(after && after.links), after && after.inspectStatus);
      }
    }
  } finally { clearInterval(tick); try { fs.unlinkSync(LOCK); } catch (e) {} }
})().catch(e => { console.error('FAIL', e.message); process.exitCode = 1; });
