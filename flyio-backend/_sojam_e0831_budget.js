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
const T=encodeURIComponent(JSON.stringify({since:'2026-08-25',until:'2026-08-31'}));
(async()=>{
 const camps=((await raw('/ncc/campaigns'))||[]).filter(c=>!c.delFlag);
 if(!camps.length){console.error('조회 실패');process.exit(1);}
 const st={};
 for(const g of chunk(camps.map(c=>c.nccCampaignId),40)){
  const r=await raw(`/stats?ids=${encodeURIComponent(g.join(','))}&fields=${F}&timeRange=${T}&timeIncrement=allDays`);
  for(const d of ((r&&r.data)||[]))st[d.id]=d;}
 const rows=camps.map(c=>({id:c.nccCampaignId,name:c.name,tp:c.campaignTp,lock:!!c.userLock,
   budget:c.useDailyBudget?(c.dailyBudget||0):null, ...(st[c.nccCampaignId]||{})}))
  .sort((a,b)=>(b.budget===null?1e12:b.budget)-(a.budget===null?1e12:a.budget));
 const on=rows.filter(r=>!r.lock), off=rows.filter(r=>r.lock);
 const sum=rows.filter(r=>!r.lock&&r.budget!==null).reduce((s,r)=>s+r.budget,0);
 console.log(`캠페인 ${rows.length}개 — 운영중 ${on.length} · OFF ${off.length}`);
 console.log(`운영중 일예산 합계 ${won(sum)}원 (무제한 ${on.filter(r=>r.budget===null).length}개)\n`);
 console.log('=== 운영중 캠페인 일예산 순 ===');
 console.log('  캠페인                                        일예산     7일소진   클릭');
 for(const r of on) console.log(`  ${r.name.slice(0,42).padEnd(44)}${(r.budget===null?'무제한':won(r.budget)+'원').padStart(10)}${won(r.salesAmt).padStart(10)}원${String(r.clkCnt||0).padStart(6)}`);
 if(off.length){console.log(`\n=== OFF 캠페인 ${off.length}개 (일예산 합 ${won(off.reduce((s,r)=>s+(r.budget||0),0))}원) ===`);
  for(const r of off) console.log(`  ${r.name.slice(0,42).padEnd(44)}${(r.budget===null?'무제한':won(r.budget)+'원').padStart(10)}`);}
 fs.writeFileSync(P('_sojam_e0831_budget.json'),JSON.stringify(rows,null,1));
})();
