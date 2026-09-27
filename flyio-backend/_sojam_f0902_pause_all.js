// 오늘 예산(150,000원) 도달 — 운영중 캠페인 전체 일시중지
//   복구: node _sojam_f0902_pause_all.js --resume
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const RESUME=process.argv.includes('--resume');
const APPLY=process.argv.includes('--apply')||RESUME;
const SNAP=P('_sojam_f0902_pause_SNAPSHOT.json');
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
 if(RESUME){
  if(!fs.existsSync(SNAP)){console.log('스냅샷 없음 — 복구 불가');return;}
  const snap=JSON.parse(fs.readFileSync(SNAP,'utf8'));
  const want=new Set(snap.wasOn);
  const tgt=live.filter(c=>want.has(c.nccCampaignId)&&c.userLock);
  console.log(`복구 대상 ${tgt.length}개 (중단 당시 운영중이던 ${snap.wasOn.length}개 중)`);
  let ok=0,bad=0;
  for(const c of tgt){
   const [o,e]=await raw(`/ncc/campaigns/${c.nccCampaignId}?fields=userLock`,'PUT',
    {nccCampaignId:c.nccCampaignId,userLock:false});
   if(o)ok++;else{bad++;console.log('  실패',c.name,String(e).slice(0,90));}
   await sleep(250);}
  console.log(`복구 완료 — 성공 ${ok} / 실패 ${bad}`);
  return;
 }
 const on=live.filter(c=>!c.userLock);
 const budget=on.reduce((s,c)=>s+(c.useDailyBudget?(c.dailyBudget||0):0),0);
 console.log(`운영중 캠페인 ${on.length}개 · 일예산 합 ${won(budget)}원`);
 console.log(`\n중단 대상 상위 10:`);
 on.map(c=>({n:c.name,b:c.useDailyBudget?c.dailyBudget:0})).sort((a,b)=>b.b-a.b).slice(0,10)
  .forEach(r=>console.log(`  ${r.n.slice(0,42).padEnd(44)}${won(r.b).padStart(9)}원`));
 fs.writeFileSync(SNAP,JSON.stringify({
  pausedAt:new Date().toISOString(),
  note:'복구: node _sojam_f0902_pause_all.js --resume',
  wasOn:on.map(c=>c.nccCampaignId),
  names:on.map(c=>c.name)},null,1));
 console.log(`\n스냅샷 저장 — 운영중이던 ${on.length}개 (_sojam_f0902_pause_SNAPSHOT.json)`);
 if(!APPLY){console.log('\ndry-run — 중단하려면 --apply');return;}
 let ok=0,bad=0;
 for(const c of on){
  const [o,e]=await raw(`/ncc/campaigns/${c.nccCampaignId}?fields=userLock`,'PUT',
   {nccCampaignId:c.nccCampaignId,userLock:true});
  if(o)ok++;else{bad++;console.log('  실패',c.name,String(e).slice(0,90));}
  await sleep(200);}
 console.log(`중단 완료 — 성공 ${ok} / 실패 ${bad}`);
})();
