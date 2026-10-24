const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,tries=6){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method:'GET',body:null,customer_id:CID}),signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(2000*(t+1));}return null;}
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
(async()=>{
 const camps=((await raw('/ncc/campaigns'))||[]).filter(c=>!c.delFlag);
 if(!camps.length){console.log('캠페인 조회 실패(혼잡) — 나중에 재시도');return;}
 const on=camps.filter(c=>!c.userLock);
 console.log(`캠페인 ${camps.length} · 켜짐 ${on.length} · 켜진 것 일예산 합 ${won(on.reduce((s,c)=>s+(c.useDailyBudget?(c.dailyBudget||0):0),0))}원\n`);
 const ids=camps.map(c=>c.nccCampaignId);
 const F=encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt']));
 console.log('날짜         노출     클릭      소진      목표대비');
 for(let d=1;d<=7;d++){
  const day=`2026-09-0${d}`;
  const T=encodeURIComponent(JSON.stringify({since:day,until:day}));
  let i=0;const acc={i:0,c:0,m:0};
  const ch=[];for(let j=0;j<ids.length;j+=40)ch.push(ids.slice(j,j+40));
  await Promise.all(Array.from({length:4},async()=>{while(i<ch.length){const c=ch[i++];
   const r=await raw(`/stats?ids=${encodeURIComponent(c.join(','))}&fields=${F}&timeRange=${T}`);
   for(const x of ((r&&r.data)||[])){acc.i+=x.impCnt||0;acc.c+=x.clkCnt||0;acc.m+=x.salesAmt||0;}}}));
  const pct=acc.m/150000*100;
  console.log(`${day}  ${won(acc.i).padStart(8)} ${String(acc.c).padStart(5)} ${won(acc.m).padStart(10)}원  ${pct.toFixed(0).padStart(4)}%  ${pct<80?'← 미소진':pct>110?'← 초과':''}`);
 }
})();
