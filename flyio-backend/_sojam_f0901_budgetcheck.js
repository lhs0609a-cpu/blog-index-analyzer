const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
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
 if(!camps.length){console.error('조회 실패');process.exit(1);}
 const ids=camps.map(c=>c.nccCampaignId);
 const day={};
 for(const d of ['2026-08-29','2026-08-30','2026-08-31']){
  const T=encodeURIComponent(JSON.stringify({since:d,until:d}));
  const m={};
  for(const g of chunk(ids,40)){
   const r=await raw(`/stats?ids=${encodeURIComponent(g.join(','))}&fields=${F}&timeRange=${T}&timeIncrement=allDays`);
   for(const x of ((r&&r.data)||[]))m[x.id]=x;}
  day[d]=m;}
 const rows=camps.map(c=>{const b=c.useDailyBudget?(c.dailyBudget||0):null;
  const s31=(day['2026-08-31'][c.nccCampaignId]||{}).salesAmt||0;
  const s30=(day['2026-08-30'][c.nccCampaignId]||{}).salesAmt||0;
  const s29=(day['2026-08-29'][c.nccCampaignId]||{}).salesAmt||0;
  return {name:c.name,id:c.nccCampaignId,lock:!!c.userLock,b,s31,s30,s29,
    pct:b?Math.round(s31*100/b):null, max3:Math.max(s29,s30,s31)};})
  .sort((a,b)=>b.s31-a.s31);
 const act=rows.filter(r=>r.max3>0);
 console.log('일예산 합계 '+won(rows.filter(r=>!r.lock&&r.b).reduce((s,r)=>s+r.b,0))+'원 · 8/31 소진 '+won(rows.reduce((s,r)=>s+r.s31,0))+'원');
 console.log('\n=== 최근 3일 소진 있는 캠페인 ===');
 console.log('  캠페인                                     일예산     8/29     8/30     8/31   소진율(8/31)');
 for(const r of act) console.log('  '+r.name.slice(0,38).padEnd(40)+won(r.b).padStart(8)+'원'+won(r.s29).padStart(9)+won(r.s30).padStart(9)+won(r.s31).padStart(9)+String(r.pct===null?'-':r.pct+'%').padStart(9)+(r.pct>=90?'  ★예산소진':''));
 fs.writeFileSync(P('_sojam_f0901_budget.json'),JSON.stringify(rows,null,1));
})();
