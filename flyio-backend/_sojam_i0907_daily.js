const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method:'GET',body:null,customer_id:CID}),signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(900*(t+1));}return null;}
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
(async()=>{
 const camps=((await raw('/ncc/campaigns'))||[]).filter(c=>!c.delFlag);
 if(!camps.length){console.log('캠페인 조회 실패');return;}
 const F=encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt']));
 const days=[];const d0=new Date('2026-08-15T00:00:00Z');
 for(let i=0;i<23;i++){const d=new Date(d0.getTime()+i*86400000);days.push(d.toISOString().slice(0,10));}
 for(const day of days){
  const T=encodeURIComponent(JSON.stringify({since:day,until:day}));
  let i=0;const acc={i:0,c:0,m:0};
  await Promise.all(Array.from({length:8},async()=>{while(i<camps.length){const c=camps[i++];
   const r=await raw(`/stats?ids=${encodeURIComponent(c.nccCampaignId)}&fields=${F}&timeRange=${T}`);
   const d=(r&&r.data&&r.data[0])||{};acc.i+=d.impCnt||0;acc.c+=d.clkCnt||0;acc.m+=d.salesAmt||0;}}));
  console.log(`${day}  노출 ${won(acc.i).padStart(8)} · 클릭 ${String(acc.c).padStart(4)} · 소진 ${won(acc.m).padStart(9)}원 · CPC ${won(acc.c?acc.m/acc.c:0).padStart(6)}원`);
 }
})();
