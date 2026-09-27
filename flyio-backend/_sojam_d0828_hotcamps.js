// 최근 14일 소진 있는 캠페인 → 그 캠페인들의 그룹만 크롤 대상으로
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method:'GET',body:null,customer_id:CID}),
  signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(600*(t+1));}return null;}
const F=encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt']));
const T=encodeURIComponent(JSON.stringify({since:'2026-08-14',until:'2026-08-28'}));
const chunk=(a,n)=>{const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;};
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
(async()=>{
 const camps=((await raw('/ncc/campaigns'))||[]).filter(c=>!c.delFlag);
 const m={};
 for(const g of chunk(camps.map(c=>c.nccCampaignId),40)){
  const r=await raw(`/stats?ids=${encodeURIComponent(g.join(','))}&fields=${F}&timeRange=${T}&timeIncrement=allDays`);
  for(const d of ((r&&r.data)||[]))m[d.id]=d;}
 const rows=camps.map(c=>({id:c.nccCampaignId,name:c.name,lock:!!c.userLock,
   budget:c.useDailyBudget?(c.dailyBudget||0):0,...(m[c.nccCampaignId]||{})}))
  .sort((a,b)=>(b.salesAmt||0)-(a.salesAmt||0));
 const hot=rows.filter(r=>(r.salesAmt||0)>0);
 console.log(`캠페인 ${camps.length}개 · 8/14~8/28 소진 있는 것 ${hot.length}개`);
 console.log(`소진 합계 ${won(rows.reduce((s,r)=>s+(r.salesAmt||0),0))}원\n`);
 for(const r of hot)console.log(`  ${r.name.slice(0,44).padEnd(46)}${won(r.salesAmt).padStart(10)}원 · 클릭 ${String(r.clkCnt||0).padStart(4)} · 노출 ${won(r.impCnt).padStart(8)}${r.lock?' [잠금]':''}`);
 fs.writeFileSync(P('_sojam_d0828_hotcamps.json'),JSON.stringify(hot,null,1));
})();
