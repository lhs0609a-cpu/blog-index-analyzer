const fs=require('fs'),BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,tries=3){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method:'GET',body:null,customer_id:CID}),signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(900*(t+1));}return null;}
async function pool(items,n,fn){const out=[];let i=0;await Promise.all(Array.from({length:Math.min(n,items.length)},async()=>{while(i<items.length){const k=i++;out[k]=await fn(items[k]);}}));return out;}
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const F=encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt']));
const chunk=(a,n)=>{const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;};
(async()=>{
 const camps=((await raw('/ncc/campaigns'))||[]).filter(c=>!c.delFlag);
 const byId={};for(const c of camps)byId[c.nccCampaignId]=c;
 const cg=chunk(camps.map(c=>c.nccCampaignId),40);
 const dates=[];for(let d=14;d<=28;d++)dates.push(`2026-08-${String(d).padStart(2,'0')}`);
 const jobs=[];for(const dt of dates)for(const g of cg)jobs.push({dt,g});
 const res=await pool(jobs,6,async j=>{
   const T=encodeURIComponent(JSON.stringify({since:j.dt,until:j.dt}));
   return {dt:j.dt,r:await raw(`/stats?ids=${encodeURIComponent(j.g.join(','))}&fields=${F}&timeRange=${T}&timeIncrement=allDays`)};});
 const daily={},camp={};
 for(const x of res){ if(!x||!x.r){console.error('실패',x&&x.dt);continue;}
   const u=(daily[x.dt]||={imp:0,clk:0,cost:0});
   for(const d of (x.r.data||[])){u.imp+=d.impCnt||0;u.clk+=d.clkCnt||0;u.cost+=d.salesAmt||0;
     if(d.salesAmt){const c=(camp[d.id]||={});c[x.dt]=(c[x.dt]||0)+d.salesAmt;}}}
 const budgetAll=camps.reduce((s,c)=>s+(c.useDailyBudget?(c.dailyBudget||0):0),0);
 console.log(`캠페인 ${camps.length}개 · 일예산 합계 ${won(budgetAll)}원 (무제한 ${camps.filter(c=>!c.useDailyBudget).length}개)`);
 console.log(`\n=== 일자별 계정 전체 소진 ===`);
 for(const k of Object.keys(daily).sort()){const d=daily[k];
   console.log(`  ${k}  노출 ${String(won(d.imp)).padStart(8)} · 클릭 ${String(won(d.clk)).padStart(5)} · 소진 ${String(won(d.cost)).padStart(9)}원 · CPC ${String(won(d.cost/(d.clk||1))).padStart(6)}원`);}
 const Y='2026-08-27';
 const ys=Object.entries(camp).map(([id,m])=>({name:(byId[id]||{}).name||id,cost:m[Y]||0,
   budget:(byId[id]||{}).useDailyBudget?((byId[id]||{}).dailyBudget||0):0,lock:!!(byId[id]||{}).userLock})).filter(r=>r.cost>0).sort((a,b)=>b.cost-a.cost);
 console.log(`\n=== 8/27 소진 캠페인 ${ys.length}개 ===`);
 for(const r of ys)console.log(`  ${r.name.slice(0,30).padEnd(32)} 예산 ${String(won(r.budget)).padStart(8)}원 · 소진 ${String(won(r.cost)).padStart(9)}원 (${(r.cost*100/(r.budget||1)).toFixed(0)}%)${r.lock?' [OFF]':''}`);
 console.log(`\n8/27 합계 ${won(ys.reduce((s,r)=>s+r.cost,0))}원`);
 fs.writeFileSync(__dirname+'/_sojam_d0828_daily.json',JSON.stringify({daily,camp},null,1));
})();
