const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method:'GET',body:null,customer_id:CID}),
  signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(700*(t+1));}return null;}
const won=n=>(n||0).toLocaleString('ko-KR');
const rows=JSON.parse(fs.readFileSync(P('_sojam_e0831_steroid.json'),'utf8'));
const byG={};for(const r of rows)(byG[r.gid]||=[]).push(r);
// 키워드 많이 든 그룹 상위
const top=Object.entries(byG).sort((a,b)=>b[1].length-a[1].length).slice(0,10);
(async()=>{
 const camps=((await raw('/ncc/campaigns'))||[]);
 const cb={};for(const c of camps)cb[c.name]={budget:c.useDailyBudget?(c.dailyBudget||0):null,lock:!!c.userLock};
 for(const [g,ks] of top){
  const a=(await raw(`/ncc/ads?nccAdgroupId=${g}`))||[];
  const ag=((await raw(`/ncc/adgroups?ids=${g}`))||[])[0]||{};
  const c=cb[ks[0].camp]||{};
  console.log(`\n■ ${ks[0].camp}  (일예산 ${c.budget===null?'무제한':won(c.budget)+'원'}${c.lock?' · 캠페인 OFF':''})`);
  console.log(`  그룹 ${ag.name||g} · 스테로이드 키워드 ${ks.length}개`);
  console.log(`  예: ${ks.slice(0,4).map(k=>k.kw).join(', ')}`);
  for(const ad of a.filter(x=>!x.delFlag)){
   const t=(ad.ad&&(ad.ad.headline||ad.ad.title))||'';
   const d=(ad.ad&&(ad.ad.description))||'';
   const u=(ad.ad&&(ad.ad.pc&&ad.ad.pc.final||ad.ad.mobile&&ad.ad.mobile.final))||'';
   console.log(`   [${ad.status}] ${t}`);
   console.log(`             ${d.slice(0,60)}`);
   console.log(`             ${u.slice(0,70)}`);
  }
 }
})();
