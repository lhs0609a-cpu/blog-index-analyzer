const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rawFull(p,tries=3){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method:'GET',body:null,customer_id:CID}),signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(900*(t+1));}return null;}
async function pool(items,n,fn){const out=[];let i=0;await Promise.all(Array.from({length:Math.min(n,items.length)},async()=>{while(i<items.length){const k=i++;out[k]=await fn(items[k]);}}));return out;}
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const F=encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt']));
const chunk=(a,n)=>{const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;};
(async()=>{
 const camps=((await rawFull('/ncc/campaigns'))||[]).filter(c=>!c.delFlag);
 const byId={};for(const c of camps)byId[c.nccCampaignId]=c;
 const T=encodeURIComponent(JSON.stringify({since:'2026-08-28',until:'2026-08-28'}));
 const cg=chunk(camps.map(c=>c.nccCampaignId),40);
 const res=await pool(cg,4,g=>rawFull(`/stats?ids=${encodeURIComponent(g.join(','))}&fields=${F}&timeRange=${T}&timeIncrement=allDays`));
 let comp='';const rows=[];
 for(const r of res){ if(!r)continue; comp=r.compTm||comp;
  for(const d of (r.data||[])) if(d.salesAmt||d.impCnt){const c=byId[d.id]||{};
    rows.push({name:c.name||d.id,budget:c.useDailyBudget?(c.dailyBudget||0):0,cost:d.salesAmt||0,clk:d.clkCnt||0,imp:d.impCnt||0,lock:!!c.userLock,st:c.status});}}
 rows.sort((a,b)=>b.cost-a.cost);
 console.log(`데이터 기준시각 compTm=${comp}`);
 console.log(`\n=== 오늘(8/28) 소진 중인 캠페인 ===`);
 for(const r of rows.filter(r=>r.cost>0))console.log(`  ${r.name.slice(0,30).padEnd(32)} 예산 ${String(won(r.budget)).padStart(8)}원 · 소진 ${String(won(r.cost)).padStart(9)}원 (${(r.cost*100/(r.budget||1)).toFixed(0)}%) · 클릭 ${r.clk}${r.lock?' [OFF]':''}`);
 const S=rows.reduce((s,r)=>s+r.cost,0);
 console.log(`\n오늘 누적 ${won(S)}원 · 노출 ${won(rows.reduce((s,r)=>s+r.imp,0))} · 클릭 ${rows.reduce((s,r)=>s+r.clk,0)}`);
 // 파워링크 캠페인 그룹 예산
 const pl=camps.filter(c=>/^파워링크|플레이스/.test(c.name||''));
 for(const c of pl){
   const gs=(await rawFull(`/ncc/adgroups?nccCampaignId=${c.nccCampaignId}`))||[];
   const on=gs.filter(g=>!g.delFlag&&!g.userLock);
   console.log(`\n[${c.name}] 캠페인예산 ${won(c.useDailyBudget?c.dailyBudget:0)}원 · 그룹 ${gs.length}개(활성 ${on.length}) · 그룹예산합 ${won(on.reduce((s,g)=>s+(g.useDailyBudget?(g.dailyBudget||0):0),0))}원 · 무제한그룹 ${on.filter(g=>!g.useDailyBudget).length}개`);
 }
})();
