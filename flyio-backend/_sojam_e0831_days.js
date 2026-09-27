const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method:'GET',body:null,customer_id:CID}),
  signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(700*(t+1));}return null;}
const chunk=(a,n)=>{const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;};
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const F=encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt']));
const T=encodeURIComponent(JSON.stringify({since:'2026-08-24',until:'2026-08-31'}));
(async()=>{
 const camps=((await raw('/ncc/campaigns'))||[]).filter(c=>!c.delFlag);
 const day={};
 for(const g of chunk(camps.map(c=>c.nccCampaignId),40)){
  const r=await raw(`/stats?ids=${encodeURIComponent(g.join(','))}&fields=${F}&timeRange=${T}&timeIncrement=allDays&breakdown=day`);
  for(const d of ((r&&r.data)||[])){const k=d.dateStart||d.day||d.date||'?';
   const u=(day[k]||={c:0,k:0,i:0});u.c+=d.salesAmt||0;u.k+=d.clkCnt||0;u.i+=d.impCnt||0;}}
 console.log('=== 일자별 계정 전체 ===');
 Object.entries(day).sort().forEach(([d,u])=>
  console.log(`  ${d}  노출 ${won(u.i).padStart(7)} · 클릭 ${String(u.k).padStart(4)} · 소진 ${won(u.c).padStart(9)}원`));
})();
