// ▲ 버킷이 왜 노출 안 되는지 원인별 분해 — 잠금해제로 풀리는 것과 입찰가로 풀리는 것을 가른다.
const fs = require('fs'), path = require('path');
const D = __dirname, P = n => path.join(D, n);
const L = n => JSON.parse(fs.readFileSync(P(n), 'utf8'));
const core = L('_sojam_b0827_corekws.json');
const gs = {}; for (const g of L('_sojam_b0827_groups.json')) gs[g.nccAdgroupId] = g;
const camps = {}; for (const c of L('_sojam_b0827_camps_now.json')) camps[c.nccCampaignId] = c;
const rows = L('_sojam_c0827_rebalance.json');
const bucket = {}; for (const r of rows) bucket[r.id] = r.bucket;
const vol = {}; for (const r of rows) vol[r.kw] = Math.max(vol[r.kw] || 0, r.vol);

const out = {};
for (const [gid, g] of Object.entries(core)) {
  const grp = gs[gid] || {}, cmp = camps[grp.nccCampaignId] || {};
  const gOff = !!grp.userLock || !!grp.delFlag, cOff = !!cmp.userLock || !!cmp.delFlag;
  for (const k of g.kws) {
    const b = bucket[k.id];
    if (!b || !b.startsWith('▲')) continue;
    const eff = k.ugb ? (g.gbid || 0) : (k.bid || 0);
    let why;
    if (k.lock) why = '키워드 잠금(userLock)';
    else if (k.st !== 'ELIGIBLE') why = `키워드 상태 ${k.st}`;
    else if (gOff || cOff) why = '그룹/캠페인 off';
    else if (eff <= 70) why = '70원 묶임';
    else why = '노출중';
    ((out[b] ||= {})[why] ||= []).push({ kw: k.kw, vol: vol[k.kw] || 0 });
  }
}
for (const [b, byWhy] of Object.entries(out)) {
  console.log(`\n=== ${b} ===`);
  for (const [why, list] of Object.entries(byWhy).sort((a, c) => c[1].length - a[1].length)) {
    const kws = [...new Set(list.map(x => x.kw))].sort((a, c) => (vol[c] || 0) - (vol[a] || 0));
    console.log(`  ${why.padEnd(20)} 인스턴스 ${String(list.length).padStart(4)} · 키워드 ${String(kws.length).padStart(4)}`);
    console.log(`     상위: ${kws.slice(0, 10).map(k => `${k}(${vol[k] || 0})`).join(', ')}`);
  }
}
