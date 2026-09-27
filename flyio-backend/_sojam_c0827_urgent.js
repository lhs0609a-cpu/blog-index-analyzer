// '간절한 키워드' 분류 — 내원 직전 의도가 강한 검색어를 종류별로.
// 라이브 입찰가·노출상태를 붙여서 지금 어디가 뚫려있고 어디가 막혀있는지 본다.
const fs = require('fs'), path = require('path');
const P = n => path.join(__dirname, n);
const L = n => JSON.parse(fs.readFileSync(P(n), 'utf8'));
const BASE = 'https://blog-index-analyzer.fly.dev', CID = '1858907';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function raw(p, tries = 4) {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: p, method: 'GET', body: null, customer_id: CID }),
        signal: AbortSignal.timeout(120000) });
      if (r.ok) { const d = await r.json(); if (d.success) return d.response; }
    } catch (e) {}
    await sleep(1500 * (t + 1));
  }
  return null;
}

// ── 간절함의 종류 ──────────────────────────────────────────────
// 순서가 곧 우선순위 — 앞쪽 유형에 먼저 배정된다.
const CATS = [
  ['① 못 참겠는 고통',   ['미치겠', '못참', '못견디', '죽겠', '괴로', '극심', '심하게', '너무가려',
                        '너무간지러', '심할때', '고통', '참을수없', '견딜수없']],
  ['② 밤·잠 방해',      ['밤에', '새벽', '자다가', '잘때', '잠못', '수면', '밤마다', '자고나면', '아침에']],
  ['③ 치료 실패·전전',   ['스테로이드', '탈스테', '안들어', '안듣', '효과없', '부작용', '내성',
                        '연고안', '약안', '병원다녀', '차도가']],
  ['④ 만성·재발',       ['만성', '재발', '반복', '안낫', '낫지않', '계속', '몇년', '오래된', '수년',
                        '고질', '평생', '지속']],
  ['⑤ 급성·갑자기',      ['갑자기', '급성', '하루아침', '응급', '심해졌', '번졌', '퍼졌', '악화']],
  ['⑥ 은밀부위(수치)',   ['항문', '똥꼬', '똥구멍', '사타구니', '서혜부', '생식기', '성기', '음부',
                        '외음', '음순', '질입구', '질가려', '고환', '음낭', '귀두', '포피', '회음',
                        '유두', '젖꼭지', '음모', '치골', 'Y존', '와이존', '팬티라인', '엉덩이',
                        '겨드랑이', '허벅지안쪽']],
  ['⑦ 내원 직전(병원찾기)', ['한의원', '병원', '잘하는곳', '명의', '어디로', '어디가', '추천', '전문',
                        '진료과', '무슨과', '치료잘', '유명한', '가까운', '근처', '내주변']],
  ['⑧ 완치 열망',        ['완치', '낫는법', '치료법', '근본', '뿌리', '완치후기', '치료후기',
                        '극복', '나았', '해결']],
  ['⑨ 원인 모름·불안',    ['원인', '이유', '무슨병', '왜생', '왜나', '무슨증상', '전염', '옮', '검사',
                        '진단', '초기증상']],
];

const rows = L('_sojam_c0827_rebalance.json');
const groups = {}; for (const g of L('_sojam_b0827_groups.json')) groups[g.nccAdgroupId] = g;
const gbid = {}; for (const [gid, g] of Object.entries(L('_sojam_b0827_corekws.json'))) gbid[gid] = g.gbid || 0;
const vol = {}; for (const r of rows) vol[r.kw] = Math.max(vol[r.kw] || 0, r.vol);
const gids = [...new Set(rows.map(r => r.gid))];

(async () => {
  const live = {};
  for (let i = 0; i < gids.length; i++) {
    const resp = await raw(`/ncc/keywords?nccAdgroupId=${gids[i]}`);
    if (resp) for (const k of resp) live[k.nccKeywordId] = k;
  }
  // 키워드 단위로 접기 — 인스턴스 중 하나라도 살아있으면 노출
  const byKw = {};
  for (const r of rows) {
    const k = live[r.id]; if (!k) continue;
    const eff = k.useGroupBidAmt ? gbid[r.gid] : (k.bidAmt || 0);
    const g = groups[r.gid] || {};
    const alive = !k.userLock && k.status === 'ELIGIBLE' && !g.userLock && !g.delFlag && eff > 70;
    const u = (byKw[r.kw] ||= { vol: vol[r.kw] || 0, bid: 0, alive: false });
    if (alive) { u.alive = true; u.bid = Math.max(u.bid, eff); }
  }
  const cat = k => (CATS.find(([, toks]) => toks.some(t => k.includes(t))) || [null])[0];
  const buckets = {};
  for (const [kw, u] of Object.entries(byKw)) {
    const c = cat(kw); if (!c) continue;
    (buckets[c] ||= []).push({ kw, ...u });
  }
  const won = n => (n || 0).toLocaleString('ko-KR');
  console.log(`계정 고유 키워드 ${Object.keys(byKw).length}개 · 간절 유형 매칭 ${Object.values(buckets).reduce((s, a) => s + a.length, 0)}개\n`);
  console.log('=== 유형별 요약 ===');
  for (const [name] of CATS) {
    const a = buckets[name] || [];
    const alive = a.filter(x => x.alive);
    const v = a.reduce((s, x) => s + x.vol, 0);
    const bids = alive.map(x => x.bid).sort((x, y) => x - y);
    console.log(`${name.padEnd(18)} 키워드 ${String(a.length).padStart(4)} · 검색량합 ${String(won(v)).padStart(9)}`
      + ` · 노출 ${String(alive.length).padStart(4)} (${String(Math.round(alive.length * 100 / (a.length || 1))).padStart(3)}%)`
      + ` · 입찰 중앙 ${String(won(bids.length ? bids[Math.floor(bids.length / 2)] : 0)).padStart(6)}원`);
  }
  for (const [name] of CATS) {
    const a = (buckets[name] || []).sort((x, y) => y.vol - x.vol);
    console.log(`\n=== ${name} — ${a.length}개 (검색량 상위 20) ===`);
    for (const x of a.slice(0, 20))
      console.log(`   ${x.kw.padEnd(20)} ${String(won(x.vol)).padStart(8)}회  ${String(won(x.bid)).padStart(6)}원  ${x.alive ? '노출' : '막힘'}`);
    const dead = a.filter(x => !x.alive && x.vol >= 500);
    if (dead.length) console.log(`   ▸ 검색량 500+ 인데 막힌 것 ${dead.length}개: ${dead.slice(0, 12).map(x => `${x.kw}(${won(x.vol)})`).join(', ')}`);
  }
  fs.writeFileSync(P('_sojam_c0827_urgent.json'), JSON.stringify(buckets), 'utf8');
})();
