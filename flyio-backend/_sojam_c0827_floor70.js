// ▼ 최저가(70원) 일괄 — 두드러기·건선 계열 전체 + 진료범위 밖 + 타지역.
//   node _sojam_c0827_floor70.js [--apply]
const fs = require('fs'), path = require('path');
const P = n => path.join(__dirname, n);
const L = n => JSON.parse(fs.readFileSync(P(n), 'utf8'));
const BASE = 'https://blog-index-analyzer.fly.dev', CID = '1858907';
const APPLY = process.argv.includes('--apply');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function raw(p, method, body, tries = 5) {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: p, method, body, customer_id: CID }),
        signal: AbortSignal.timeout(180000) });
      if (r.ok) { const d = await r.json(); if (d.success) return [true, d.response];
                  if (/BAD_REQUEST|11001/.test(String(d.error))) return [false, d.error]; }
    } catch (e) {}
    await sleep(Math.min(2000 * (t + 1), 12000));
  }
  return [false, 'retry exhausted'];
}

const rows = L('_sojam_c0827_rebalance.json');
const OUT_OF_SCOPE = ['피부과', '성형외과', '치과', '탈모', '하지정맥류', '여드름', '기미', '비립종',
  '한관종', '보톡스', '필러', '리프팅', '제모', '문신', '다이어트', '난임', '비염', '축농증',
  '변비', '두통', '어지럼', '당뇨', '고혈압', '암치료', '검정고시', '풋살', '청소', '창업'];
const REGION = ['천안','인천','부평','부산','대구','울산','광주','대전','제주','세종','경상','경남','경북',
  '전남','전북','충남','충북','강원','창원','김해','포항','전주','청주','원주','춘천','아산','평택','수원',
  '성남','분당','용인','화성','동탄','안양','광명','부천','일산','고양','파주','김포','시흥','안산','의정부',
  '남양주','하남','과천','군포','오산','노원','강북','도봉','중랑','성북','동대문','광진','성동','용산',
  '마포','서대문','은평','종로','영등포','구로','금천','관악','동작','양천','강서','강동','송파','잠실',
  '천호','목동','신촌','홍대','여의도','왕십리','건대','익산','군산','당진','서산','논산','목포','여수'];

const why = r =>
  (r.bucket === '▼두드러기·건선' || r.kw.includes('두드러기') || r.kw.includes('건선')) ? '두드러기·건선'
  : REGION.some(t => r.kw.startsWith(t)) ? '타지역'
  : OUT_OF_SCOPE.some(t => r.kw.includes(t)) ? '진료범위 밖'
  : null;

const sel = rows.map(r => ({ ...r, why: why(r) })).filter(r => r.why);
const byWhy = {};
for (const r of sel) (byWhy[r.why] ||= []).push(r);
console.log(`최저가(70원) 대상 인스턴스 ${sel.length}개 / 키워드 ${new Set(sel.map(r => r.kw)).size}개\n`);
for (const [w, arr] of Object.entries(byWhy)) {
  const kws = new Set(arr.map(r => r.kw));
  const hi = arr.filter(r => r.eff > 70);
  console.log(`${w.padEnd(12)} 키워드 ${String(kws.size).padStart(5)} · 인스턴스 ${String(arr.length).padStart(5)} · 70원 초과였던 것 ${String(hi.length).padStart(4)}개`);
}
console.log('\n=== 실제로 내려가는 것 (현재 70원 초과, 입찰가 상위 25) ===');
const drop = sel.filter(r => r.eff > 70).sort((a, b) => b.eff - a.eff);
const seen = new Set();
for (const r of drop) {
  if (seen.has(r.kw)) continue; seen.add(r.kw);
  if (seen.size > 25) break;
  console.log(`   ${r.kw.padEnd(20)} ${String((r.vol || 0).toLocaleString()).padStart(8)}회  ${String(r.eff.toLocaleString()).padStart(7)}원 → 70원  [${r.why}]`);
}
const items = sel.map(r => ({ nccKeywordId: r.id, nccAdgroupId: r.gid, bidAmt: 70, useGroupBidAmt: false }));
console.log(`\n내려가는 인스턴스 ${drop.length}개 (나머지 ${sel.length - drop.length}개는 이미 70원 — useGroupBidAmt 해제 목적으로 같이 씀)`);

if (!APPLY) { console.log('\ndry-run — 적용하려면 --apply'); process.exit(0); }
(async () => {
  let ok = 0, bad = 0;
  for (let i = 0; i < items.length; i += 100) {
    const b = items.slice(i, i + 100);
    const [o, e] = await raw('/ncc/keywords?fields=bidAmt', 'PUT', b);
    if (o) ok += b.length; else { bad += b.length; console.log('  실패', String(e).slice(0, 90)); }
    if ((i / 100) % 10 === 0) console.log(`  ${i + b.length}/${items.length}`);
    await sleep(200);
  }
  console.log(`완료 — 성공 ${ok} / 실패 ${bad}`);
})();
