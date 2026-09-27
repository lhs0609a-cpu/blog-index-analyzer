// ▲ 농가진·구순염 계열 → 3위 상당가. 명시 키워드 모드(정확 매칭, 오탐 없음).
//   dry_run=false 는 BackgroundTasks 로 돌아 즉시 응답 → 서버를 물지 않는다.
//   node _sojam_c0827_up.js [--apply]
const fs = require('fs'), path = require('path');
const D = __dirname, P = n => path.join(D, n);
const L = n => JSON.parse(fs.readFileSync(P(n), 'utf8'));
const BASE = 'https://blog-index-analyzer.fly.dev', CID = '1858907';
const APPLY = process.argv.includes('--apply');

const rows = L('_sojam_c0827_rebalance.json');
// 버킷은 rebalance.js 가 이미 지역·여드름 오탐을 걸러 만든 것 — 여기에 추가 컷만 얹는다.
const JUNK = ['여드름', '렌즈삽입', '티셔츠', '두꺼워지는', '물탱크', '청소', '레이저후', '무좀'];
const kws = [...new Set(rows
  .filter(r => r.bucket === '▲농가진계열' || r.bucket === '▲구순염계열')
  .map(r => r.kw)
  .filter(k => !JUNK.some(j => k.includes(j))))];

const vol = {}; for (const r of rows) vol[r.kw] = Math.max(vol[r.kw] || 0, r.vol);
console.log(`대상 키워드 ${kws.length}개 (검색량 상위 20)`);
for (const k of kws.slice().sort((a, b) => (vol[b] || 0) - (vol[a] || 0)).slice(0, 20))
  console.log(`   ${k.padEnd(20)} ${String(vol[k] || 0).padStart(7)}회`);

if (!APPLY) { console.log('\ndry-run — 적용하려면 --apply'); process.exit(0); }

(async () => {
  const body = { keywords: kws, device: 'PC', target_position: 3,
                 dry_run: false, bid_cap: 20000, max_keywords: 150000 };
  const r = await fetch(`${BASE}/api/naver-ad/keyword-pool/bid/core-min-exposure?user_id=1&customer_id=${CID}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(300000) });
  console.log(`\nHTTP ${r.status}`, (await r.text()).slice(0, 400));
})();
