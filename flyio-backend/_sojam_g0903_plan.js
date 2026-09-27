const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const A=JSON.parse(fs.readFileSync(P('_sojam_g0903_audit.json'),'utf8'));
const F=JSON.parse(fs.readFileSync(P('_sojam_g0903_frontier.json'),'utf8'));
const S=JSON.parse(fs.readFileSync(P('_sojam_g0903_kwstats.json'),'utf8'));
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const M=30/33; // 33일 → 월 환산

// 1) 낭비 분해
const waste=A.hit33.filter(k=>k.v);
const byV={};waste.forEach(k=>{(byV[k.v]||={c:0,n:0,clk:0});byV[k.v].c+=k.cost;byV[k.v].n++;byV[k.v].clk+=k.clk;});
const wasteTot=waste.reduce((s,k)=>s+k.cost,0);
console.log('══ 낭비 (33일 → 월 환산) ══');
Object.entries(byV).sort((a,b)=>b[1].c-a[1].c).forEach(([k,v])=>
 console.log(`  ${k.padEnd(12)} 월 ${won(v.c*M).padStart(8)}원 · 클릭 ${Math.round(v.clk*M)}건 · 키워드 ${v.n}개`));
console.log(`  ${'합계'.padEnd(12)} 월 ${won(wasteTot*M)}원`);

// 2) 키워드 밖 소진
const kwCost=A.hit33.reduce((s,k)=>s+k.cost,0);
const CAMP=5702150; // 캠페인 합계 8/1~9/2 (측정치)
console.log(`\n══ 소진 귀속 (33일) ══`);
console.log(`  캠페인 합계   ${won(CAMP)}원`);
console.log(`  키워드 귀속   ${won(kwCost)}원 (${(kwCost/CAMP*100).toFixed(1)}%)`);
console.log(`  키워드 밖     ${won(CAMP-kwCost)}원 (${((CAMP-kwCost)/CAMP*100).toFixed(1)}%) ← 확장검색어·콘텐츠·플레이스·브랜드검색`);

// 3) 묻힌 키워드 3위 시나리오
const B=F.buried;
const t3=B.reduce((s,k)=>({c:s.c+k.c3,cost:s.cost+k.cost3}),{c:0,cost:0});
const t5=B.reduce((s,k)=>({c:s.c+k.c5,cost:s.cost+k.cost5}),{c:0,cost:0});
console.log(`\n══ 묻힌 키워드 ${B.length}개 진입 시나리오 (월) ══`);
console.log(`  5위 진입: 클릭 +${Math.round(t5.c)}건 · 비용 ${won(t5.cost)}원 · CPC ${won(t5.cost/t5.c)}원  ← CTR 0.02%라 무의미`);
console.log(`  3위 진입: 클릭 +${Math.round(t3.c)}건 · 비용 ${won(t3.cost)}원 · CPC ${won(t3.cost/t3.c)}원`);
// 3위 중 CPC 효율 좋은 것만 (CPC <= 3000)
const good=B.filter(k=>k.c3>0&&k.cost3/k.c3<=3000).sort((a,b)=>b.c3-a.c3);
const g3=good.reduce((s,k)=>({c:s.c+k.c3,cost:s.cost+k.cost3}),{c:0,cost:0});
console.log(`  3위 진입(CPC 3천원 이하만 ${good.length}개): 클릭 +${Math.round(g3.c)}건 · 비용 ${won(g3.cost)}원 · CPC ${won(g3.cost/g3.c)}원`);
console.log('\n  효율 좋은 묻힌 키워드 상위 15 (3위 기준):');
good.slice(0,15).forEach(k=>console.log(`    검색량 ${won(k.vol).padStart(7)} · 3위가 ${won(k.b3).padStart(6)}원 · 월클릭 ${k.c3.toFixed(1).padStart(5)} · 월비용 ${won(k.cost3).padStart(8)}원  ${k.kw}`));

// 4) 현재 상태 + 신환 역산
const curClk=F.frontier.curClk, curCost=F.frontier.curCost;
console.log(`\n══ 신환 역산 ══`);
console.log(`  현재 월 내원권 클릭 ${Math.round(curClk)}건 · 월 ${won(curCost)}원 · CPC ${won(curCost/curClk)}원`);
console.log('  전환율     필요클릭(120명)   현재대비    필요월예산(CPC 2,613원)');
[0.02,0.03,0.04,0.05,0.06,0.09].forEach(r=>{
 const need=120/r, gap=need-curClk, bud=need*(curCost/curClk);
 console.log(`   ${(r*100).toFixed(0).padStart(2)}%      ${Math.round(need).toString().padStart(6)}건      ${(gap>0?'+':'')+Math.round(gap)}건    ${won(bud).padStart(11)}원`);});
console.log(`\n  낭비제거(+${Math.round(wasteTot*M/2613)}클릭) + 묻힌키워드3위(+${Math.round(g3.c)}클릭) = 월 클릭 ${Math.round(curClk+wasteTot*M/2613+g3.c)}건`);
