// 8/27 클릭 발생 키워드 × "최저가(70원)로 내리라고 한" 규칙 대조
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const L=n=>JSON.parse(fs.readFileSync(P(n),'utf8'));
const rows=L('_sojam_d0828_kwclk_20260827.json');
const reb=L('_sojam_c0827_rebalance.json');   // floor70이 대상으로 삼았던 인스턴스 모집단

const OUT_OF_SCOPE=['피부과','성형외과','치과','탈모','하지정맥류','여드름','기미','비립종',
 '한관종','보톡스','필러','리프팅','제모','문신','다이어트','난임','비염','축농증',
 '변비','두통','어지럼','당뇨','고혈압','암치료','검정고시','풋살','청소','창업'];
const REGION=['천안','인천','부평','부산','대구','울산','광주','대전','제주','세종','경상','경남','경북',
 '전남','전북','충남','충북','강원','창원','김해','포항','전주','청주','원주','춘천','아산','평택','수원',
 '성남','분당','용인','화성','동탄','안양','광명','부천','일산','고양','파주','김포','시흥','안산','의정부',
 '남양주','하남','과천','군포','오산','노원','강북','도봉','중랑','성북','동대문','광진','성동','용산',
 '마포','서대문','은평','종로','영등포','구로','금천','관악','동작','양천','강서','강동','송파','잠실',
 '천호','목동','신촌','홍대','여의도','왕십리','건대','익산','군산','당진','서산','논산','목포','여수'];

const bucket={}; for(const r of reb) if(!bucket[r.kw]) bucket[r.kw]=r.bucket;
const inScope=new Set(reb.map(r=>r.id));      // floor70 PUT에 실제로 실렸던 인스턴스 id
const why=kw=>
  (bucket[kw]==='▼두드러기·건선'||kw.includes('두드러기')||kw.includes('건선'))?'두드러기·건선'
 :REGION.some(t=>kw.startsWith(t))?'타지역'
 :OUT_OF_SCOPE.some(t=>kw.includes(t))?'진료범위 밖':null;

const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const hit=rows.map(r=>({...r,why:why(r.kw)})).filter(r=>r.why);
const esc=hit.filter(r=>r.bid>70).sort((a,b)=>b.salesAmt-a.salesAmt);
const ok =hit.filter(r=>r.bid<=70).sort((a,b)=>b.salesAmt-a.salesAmt);

console.log(`8/27 클릭 발생 ${rows.length}개 중 "최저가로 내려라" 규칙에 걸리는 것 ${hit.length}개\n`);
console.log(`=== ① 아직 70원이 아님 — 규칙에서 새어나간 것 ${esc.length}개 ===`);
console.log('  키워드'.padEnd(20)+'클릭 비용      CPC      현재입찰가  사유        캠페인/그룹        PUT대상');
for(const r of esc) console.log(`  ${r.kw.slice(0,16).padEnd(18)}${String(r.clkCnt).padStart(3)}${String(won(r.salesAmt)).padStart(8)}원${String(won(r.cpc)).padStart(8)}원${String(won(r.bid)).padStart(9)}원  ${r.why.padEnd(11)}${(r.camp+'/'+r.grp).slice(0,28).padEnd(30)}${inScope.has(r.id)?'O(실패/되돌아감)':'X(모집단 밖)'}`);
console.log(`  소계 — 클릭 ${esc.reduce((s,r)=>s+r.clkCnt,0)} · 비용 ${won(esc.reduce((s,r)=>s+r.salesAmt,0))}원`);

console.log(`\n=== ② 70원으로 내려갔는데도 클릭이 붙은 것 ${ok.length}개 ===`);
for(const r of ok) console.log(`  ${r.kw.slice(0,16).padEnd(18)}${String(r.clkCnt).padStart(3)}${String(won(r.salesAmt)).padStart(8)}원${String(won(r.cpc)).padStart(8)}원  순위 ${(r.avgRnk||0).toFixed(1)}  ${r.why.padEnd(11)}${r.camp}/${r.grp}`);
console.log(`  소계 — 클릭 ${ok.reduce((s,r)=>s+r.clkCnt,0)} · 비용 ${won(ok.reduce((s,r)=>s+r.salesAmt,0))}원`);

const tot=rows.reduce((s,r)=>s+r.salesAmt,0);
console.log(`\n8/27 클릭 키워드 총비용 ${won(tot)}원 중 규칙 대상 ${won(hit.reduce((s,r)=>s+r.salesAmt,0))}원 (${Math.round(hit.reduce((s,r)=>s+r.salesAmt,0)*100/tot)}%)`);
fs.writeFileSync(P('_sojam_d0828_floorcheck.json'),JSON.stringify({escaped:esc,already:ok},null,1));
