// (3) 신환 역산 재료 — 순위별 실측 CTR, 효율 프론티어, 묻힌 키워드 진입가
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const A=JSON.parse(fs.readFileSync(P('_sojam_g0903_audit.json'),'utf8'));
const S=JSON.parse(fs.readFileSync(P('_sojam_g0903_kwstats.json'),'utf8'));
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,method='GET',body=null,tries=3){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method,body,customer_id:CID}),signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return d.response;}
 }catch(e){}await sleep(900*(t+1));}return null;}

(async()=>{
 // ── A. 순위별 실측 CTR (33일, 노출 200 이상인 키워드만)
 const rk=S.keywords.filter(k=>k.imp33>=200&&k.rnk33>0);
 const buck={};
 rk.forEach(k=>{const b=Math.min(6,Math.max(1,Math.round(k.rnk33)));(buck[b]||={imp:0,clk:0,cost:0,n:0});
  buck[b].imp+=k.imp33;buck[b].clk+=k.clk33;buck[b].cost+=k.cost33;buck[b].n++;});
 console.log('══ 순위별 실측 CTR (33일, 노출 200+ 키워드 '+rk.length+'개) ══');
 console.log('순위   키워드  노출        클릭    CTR      CPC');
 const CTR={};
 for(let b=1;b<=6;b++){const v=buck[b];if(!v)continue;CTR[b]=v.clk/v.imp;
  console.log(`  ${b}위 ${String(v.n).padStart(6)} ${won(v.imp).padStart(9)} ${String(v.clk).padStart(6)} ${(v.clk/v.imp*100).toFixed(2).padStart(6)}% ${won(v.clk?v.cost/v.clk:0).padStart(7)}원`);}

 // ── B. 효율 프론티어 — 내원권 키워드를 CPC 오름차순으로 월예산 채우기
 const inS=A.hit33.filter(k=>!k.v&&k.clk>0).map(k=>({...k,cpc:k.cost/k.clk,mclk:k.clk*30/33,mcost:k.cost*30/33}));
 inS.sort((a,b)=>a.cpc-b.cpc);
 const MONTH=4500000;
 let acc=0,clk=0,used=0;
 for(const k of inS){if(acc+k.mcost>MONTH)break;acc+=k.mcost;clk+=k.mclk;used++;}
 const curClk=inS.reduce((s,k)=>s+k.mclk,0),curCost=inS.reduce((s,k)=>s+k.mcost,0);
 console.log(`\n══ 효율 프론티어 (내원권 클릭 키워드 ${inS.length}개) ══`);
 console.log(`현재      월 ${won(curCost)}원 → 클릭 ${Math.round(curClk)}건 · CPC ${won(curCost/curClk)}원`);
 console.log(`저CPC순  월 ${won(acc)}원 → 클릭 ${Math.round(clk)}건 (키워드 ${used}개) · CPC ${won(acc/clk)}원`);
 console.log('\n저CPC 고클릭 내원권 키워드 상위 20 (월 예상):');
 inS.filter(k=>k.mclk>=1).slice(0,20).forEach(k=>
  console.log(`  CPC ${won(k.cpc).padStart(6)}원 · 월클릭 ${k.mclk.toFixed(1).padStart(5)} · 검색량 ${won(k.vol).padStart(7)} · 순위 ${(k.rnk||0).toFixed(1)}  ${k.kw}`));

 // ── C. 묻힌 키워드 진입가 (검색량 상위 200)
 const B=A.buried.filter(k=>!k.prod).slice(0,200);
 const lad={};
 for(const pos of [3,5]){
  for(let i=0;i<B.length;i+=100){
   const items=B.slice(i,i+100).map(k=>({key:k.kw,position:pos}));
   const r=await raw('/estimate/average-position-bid/keyword','POST',{device:'MOBILE',items});
   ((r&&r.estimate)||[]).forEach(e=>{const k=(e.keyword||'').trim();if(k)(lad[k]||={})[pos]=e.bid;});
   await sleep(400);}
  console.log(`\n[진입가] ${pos}위 조회 완료`);
 }
 // 예상: 노출 = 월검색량 × 노출점유 0.55, 클릭 = 노출 × CTR(순위), 비용 = 클릭 × 진입가
 const SHARE=0.55;
 const rows=B.map(k=>{const b3=lad[k.kw]?.[3],b5=lad[k.kw]?.[5];
  const imp=(k.vol||0)*SHARE, c3=imp*(CTR[3]||0.006), c5=imp*(CTR[5]||0.004);
  return {...k,b3,b5,c3,c5,cost3:c3*(b3||0),cost5:c5*(b5||0)};})
  .filter(k=>k.b5).sort((a,b)=>(a.cost5/Math.max(a.c5,0.01))-(b.cost5/Math.max(b.c5,0.01)));
 console.log('\n══ 묻힌 키워드 — 5위 진입 시 월 예상 (효율순 상위 30) ══');
 console.log('검색량   5위가   월클릭  월비용     3위가   월클릭  월비용   키워드');
 rows.slice(0,30).forEach(k=>console.log(
  `${won(k.vol).padStart(7)} ${won(k.b5).padStart(6)}원 ${k.c5.toFixed(1).padStart(6)} ${won(k.cost5).padStart(8)}원 ${won(k.b3).padStart(6)}원 ${k.c3.toFixed(1).padStart(6)} ${won(k.cost3).padStart(8)}원  ${k.kw}`));
 const T5=rows.reduce((s,k)=>({c:s.c+k.c5,cost:s.cost+k.cost5}),{c:0,cost:0});
 console.log(`\n묻힌 ${rows.length}개 전체 5위 진입 시: 월 클릭 +${Math.round(T5.c)}건 · 월 비용 ${won(T5.cost)}원 · CPC ${won(T5.cost/T5.c)}원`);
 fs.writeFileSync(P('_sojam_g0903_frontier.json'),JSON.stringify({CTR,frontier:{curClk,curCost,optClk:clk,optCost:acc,used},buried:rows},null,0));
 console.log('저장 → _sojam_g0903_frontier.json');
})();
