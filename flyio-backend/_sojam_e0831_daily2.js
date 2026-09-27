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
(async()=>{
 const camps=((await raw('/ncc/campaigns'))||[]).filter(c=>!c.delFlag);
 const ids=camps.map(c=>c.nccCampaignId);
 console.log('=== 일자별 계정 전체 ===');
 for(const d of ['2026-08-24','2026-08-25','2026-08-26','2026-08-27','2026-08-28','2026-08-29','2026-08-30','2026-08-31']){
  const T=encodeURIComponent(JSON.stringify({since:d,until:d}));
  let c=0,k=0,i=0;
  for(const g of chunk(ids,40)){
   const r=await raw(`/stats?ids=${encodeURIComponent(g.join(','))}&fields=${F}&timeRange=${T}&timeIncrement=allDays`);
   for(const x of ((r&&r.data)||[])){c+=x.salesAmt||0;k+=x.clkCnt||0;i+=x.impCnt||0;}}
  console.log(`  ${d}  노출 ${won(i).padStart(7)} · 클릭 ${String(k).padStart(4)} · 소진 ${won(c).padStart(9)}원${k?' · CPC '+won(c/k)+'원':''}`);
 }
})();
