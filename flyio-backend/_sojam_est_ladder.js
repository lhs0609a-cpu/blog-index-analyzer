// UP 버킷(농가진·구순염 계열) 순위별 추정가 사다리 — 네이버 API 직접(배치 100).
const fs = require('fs'), path = require('path');
const P = n => path.join(__dirname, n);
const L = n => JSON.parse(fs.readFileSync(P(n), 'utf8'));
const { req, sleep } = require('./_sojam_naver');
const EST_CID = '3808925';   // 추정가는 계정 무관 시장가 — 로컬 키 계정으로 조회

const rows = L('_sojam_c0827_rebalance.json');
const JUNK = ['여드름', '렌즈삽입', '티셔츠', '두꺼워지는', '물탱크', '청소', '레이저후', '무좀'];
const kws = [...new Set(rows
  .filter(r => r.bucket === '▲농가진계열' || r.bucket === '▲구순염계열')
  .map(r => r.kw).filter(k => !JUNK.some(j => k.includes(j))))];
const vol = {}; for (const r of rows) vol[r.kw] = Math.max(vol[r.kw] || 0, r.vol);

const POS = [1, 2, 3, 5];
(async () => {
  const out = {};   // kw -> {1:..,2:..,3:..,5:..}
  for (const pos of POS) {
    for (let i = 0; i < kws.length; i += 100) {
      const batch = kws.slice(i, i + 100);
      try {
        const r = await req('POST', '/estimate/average-position-bid/keyword',
          { device: 'PC', items: batch.map(k => ({ key: k, position: pos })) }, EST_CID);
        for (const e of (r.estimate || [])) {
          const k = (e.keyword || '').trim();
          if (k) (out[k] ||= {})[pos] = e.bid;
        }
      } catch (e) { console.log(`  pos${pos} 배치 실패 ${String(e).slice(0, 90)}`); }
      await sleep(300);
    }
    console.log(`pos${pos} 완료 — ${Object.values(out).filter(v => v[pos] != null).length}/${kws.length}`);
  }
  fs.writeFileSync(P('_sojam_c0827_ladder.json'), JSON.stringify(out), 'utf8');

  const list = Object.entries(out).sort((a, b) => (vol[b[0]] || 0) - (vol[a[0]] || 0));
  console.log('\n=== 검색량 상위 30 순위별 추정가 (PC) ===');
  console.log('   키워드                 검색량     1위     2위     3위     5위');
  for (const [k, v] of list.slice(0, 30))
    console.log(`   ${k.padEnd(20)} ${String(vol[k] || 0).padStart(7)} ${String(v[1] ?? '-').padStart(7)} ${String(v[2] ?? '-').padStart(7)} ${String(v[3] ?? '-').padStart(7)} ${String(v[5] ?? '-').padStart(7)}`);

  const sum = p => list.reduce((s, [, v]) => s + (v[p] || 0), 0);
  console.log(`\n합계 입찰가 — 1위 ${sum(1).toLocaleString()}원 · 2위 ${sum(2).toLocaleString()}원 · 3위 ${sum(3).toLocaleString()}원 · 5위 ${sum(5).toLocaleString()}원 (${list.length}개)`);
  const med = p => { const a = list.map(([, v]) => v[p] || 0).sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
  console.log(`중앙값 — 1위 ${med(1)}원 · 2위 ${med(2)}원 · 3위 ${med(3)}원 · 5위 ${med(5)}원`);
})();
