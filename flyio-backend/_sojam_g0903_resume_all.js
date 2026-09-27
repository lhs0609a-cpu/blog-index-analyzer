// 9/2 전체중단 해제 — 살아있는 캠페인 137개 전부 운영중으로 (스냅샷 덮어써져 --resume 불가)
//   되돌리기: node _sojam_f0902_pause_all.js --apply
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const APPLY=process.argv.includes('--apply');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,method,body,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method,body,customer_id:CID}),
  signal:AbortSignal.timeout(150000)});
 if(r.ok){const d=await r.json();if(d.success)return[true,d.response];return[false,d.error||JSON.stringify(d).slice(0,200)];}
 }catch(e){}await sleep(1500*(t+1));}return[false,'retry exhausted'];}
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
(async()=>{
 const live=((await raw('/ncc/campaigns','GET',null))[1]||[]).filter(c=>!c.delFlag);
 const off=live.filter(c=>c.userLock);
 const bud=a=>a.reduce((s,c)=>s+(c.useDailyBudget?(c.dailyBudget||0):0),0);
 console.log(`살아있는 캠페인 ${live.length}개 · 중지 ${off.length}개 · 켜면 일예산 합 ${won(bud(live))}원`);
 fs.writeFileSync(P('_sojam_g0903_resume_ROLLBACK.json'),JSON.stringify({
  at:new Date().toISOString(),note:'해제 직전 상태 — userLock:true 였던 캠페인',
  wasOff:off.map(c=>({id:c.nccCampaignId,name:c.name}))},null,1));
 if(!APPLY){console.log('dry-run — 켜려면 --apply');return;}
 let ok=0,bad=0;
 for(const c of off){
  const [o,e]=await raw(`/ncc/campaigns/${c.nccCampaignId}?fields=userLock`,'PUT',
   {nccCampaignId:c.nccCampaignId,userLock:false});
  if(o)ok++;else{bad++;console.log('  실패',c.name,String(e).slice(0,90));}
  await sleep(200);}
 console.log(`해제 완료 — 성공 ${ok} / 실패 ${bad}`);
 const after=((await raw('/ncc/campaigns','GET',null))[1]||[]).filter(c=>!c.delFlag);
 const on=after.filter(c=>!c.userLock);
 console.log(`확인: 운영중 ${on.length}/${after.length}개 · 일예산 합 ${won(bud(on))}원`);
})();
