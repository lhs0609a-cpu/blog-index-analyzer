// 소진 캠페인 54개 × "최저가(70원)" 규칙 — 실제 소진액(8/14~8/28) 붙여서 판단
//   node _sojam_d0828_floor_hot.js          (dry-run + 실적조회)
//   node _sojam_d0828_floor_hot.js --apply
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const L=n=>JSON.parse(fs.readFileSync(P(n),'utf8'));
const {why}=require('./_sojam_d0828_rule.js');
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const APPLY=process.argv.includes('--apply');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,method,body,tries=5){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method,body,customer_id:CID}),
  signal:AbortSignal.timeout(180000)});
 if(r.ok){const d=await r.json();if(d.success)return[true,d.response];
  if(/BAD_REQUEST|11001/.test(String(d.error)))return[false,d.error];}}catch(e){}
 await sleep(Math.min(1500*(t+1),10000));}return[false,'retry exhausted'];}
const chunk=(a,n)=>{const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;};
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const F=encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt']));
const T=encodeURIComponent(JSON.stringify({since:'2026-08-14',until:'2026-08-28'}));

const inv=L('_sojam_d0828_inv_hot.json');
const sel=inv.map(r=>({...r,why:why(r.kw)})).filter(r=>r.why);
const hi=sel.filter(r=>r.eff>70);

(async()=>{
 let st={};
 if(fs.existsSync(P('_sojam_d0828_floor_hot_stats.json'))) st=L('_sojam_d0828_floor_hot_stats.json');
 const need=hi.map(r=>r.id).filter(id=>!(id in st));
 if(need.length){
  console.error(`실적 조회 ${need.length}개…`);
  const gs=chunk(need,40);let i=0,done=0;
  await Promise.all(Array.from({length:6},async()=>{while(i<gs.length){const g=gs[i++];
   const[o,r]=await raw(`/stats?ids=${encodeURIComponent(g.join(','))}&fields=${F}&timeRange=${T}&timeIncrement=allDays`,'GET',null);
   if(o)for(const d of ((r&&r.data)||[]))st[d.id]=d;
   for(const id of g)if(!(id in st))st[id]={};
   if(++done%40===0)console.error(`  ${done}/${gs.length}`);}}));
  fs.writeFileSync(P('_sojam_d0828_floor_hot_stats.json'),JSON.stringify(st));
 }
 const A=hi.map(r=>({...r,cost:(st[r.id]||{}).salesAmt||0,clk:(st[r.id]||{}).clkCnt||0,imp:(st[r.id]||{}).impCnt||0}));
 const tot=A.reduce((s,r)=>s+r.cost,0), totClk=A.reduce((s,r)=>s+r.clk,0);

 console.log(`소진 캠페인 54개 · 키워드 인스턴스 ${won(inv.length)}개`);
 console.log(`규칙 대상 ${won(sel.length)}개 중 아직 70원 초과 = 내려갈 것 ${won(hi.length)}개 (고유 ${won(new Set(hi.map(r=>r.kw)).size)}개)`);
 console.log(`이것들이 8/14~8/28에 쓴 돈 ${won(tot)}원 · 클릭 ${won(totClk)}회  (계정 14일 총소진 2,571,961원의 ${Math.round(tot*100/2571961)}%)\n`);

 const byWhy={};for(const r of A)(byWhy[r.why]||=[]).push(r);
 console.log('사유           인스턴스   고유    14일 소진      클릭');
 for(const[w,a]of Object.entries(byWhy).sort((x,y)=>y[1].reduce((s,r)=>s+r.cost,0)-x[1].reduce((s,r)=>s+r.cost,0)))
  console.log(`${w.padEnd(14)}${String(a.length).padStart(6)}${String(new Set(a.map(r=>r.kw)).size).padStart(7)}${won(a.reduce((s,r)=>s+r.cost,0)).padStart(12)}원${String(a.reduce((s,r)=>s+r.clk,0)).padStart(8)}`);

 console.log(`\n=== 14일 소진 상위 30 키워드 (전부 70원으로 내려감) ===`);
 const byKw={};for(const r of A){const u=(byKw[r.kw]||={cost:0,clk:0,eff:0,why:r.why,camp:r.camp});u.cost+=r.cost;u.clk+=r.clk;u.eff=Math.max(u.eff,r.eff);}
 Object.entries(byKw).sort((a,b)=>b[1].cost-a[1].cost).slice(0,30)
  .forEach(([k,u])=>console.log(`  ${k.slice(0,20).padEnd(22)}${won(u.cost).padStart(9)}원 · 클릭 ${String(u.clk).padStart(3)} · 현재 ${won(u.eff).padStart(7)}원 → 70원  [${u.why}]  ${u.camp.slice(0,24)}`));

 const zero=A.filter(r=>r.cost===0).length;
 console.log(`\n실제로 돈이 나갔던 것 ${won(A.length-zero)}개 / 나머지 ${won(zero)}개는 14일간 소진 0원 (예방 차원)`);

 const put=sel.filter(r=>r.eff>70||r.ugb);   // 이미 70원·개별입찰인 건 PUT 불필요
 const items=put.map(r=>({nccKeywordId:r.id,nccAdgroupId:r.gid,bidAmt:70,useGroupBidAmt:false}));
 fs.writeFileSync(P('_sojam_d0828_floor_hot_ROLLBACK.json'),
  JSON.stringify(Object.fromEntries(sel.map(r=>[r.id,{gid:r.gid,bid:r.bid,ugb:r.ugb,eff:r.eff}]))));
 fs.writeFileSync(P('_sojam_d0828_floor_hot_plan.json'),JSON.stringify(A,null,1));
 console.log(`\n롤백 스냅샷 ${won(sel.length)}개 저장 · PUT 인스턴스 ${won(items.length)}개`);
 if(!APPLY){console.log('\ndry-run — 적용하려면 --apply');return;}
 let ok=0,bad=0;
 for(let i=0;i<items.length;i+=100){const b=items.slice(i,i+100);
  const[o,e]=await raw('/ncc/keywords?fields=bidAmt','PUT',b);
  if(o)ok+=b.length;else{bad+=b.length;console.log('  실패',String(e).slice(0,90));}
  if((i/100)%10===0)console.log(`  ${i+b.length}/${items.length}`);await sleep(150);}
 console.log(`완료 — 성공 ${won(ok)} / 실패 ${won(bad)}`);
})();
