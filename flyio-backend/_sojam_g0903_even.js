// 전체 캠페인 예산 균등배분(STANDARD) 통일 — ACCELERATED(빠른소진)인 것만 전환
//   되돌리기: _sojam_g0903_even_ROLLBACK.json 의 값으로 PUT
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const APPLY=process.argv.includes('--apply');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,method,body,tries=3){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method,body,customer_id:CID}),
  signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return[true,d.response];return[false,String(d.error||'').slice(0,160)];}
 }catch(e){}await sleep(1200*(t+1));}return[false,'retry exhausted'];}
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
(async()=>{
 const [okc,camps]=await raw('/ncc/campaigns','GET',null);
 if(!okc||!Array.isArray(camps)){console.log('캠페인 조회 실패:',camps);process.exit(1);}
 const live=camps.filter(c=>!c.delFlag);
 const dm={};live.forEach(c=>dm[c.deliveryMethod]=(dm[c.deliveryMethod]||0)+1);
 console.log(`캠페인 ${live.length}개 · 배분방식 ${JSON.stringify(dm)}`);
 const tgt=live.filter(c=>c.deliveryMethod!=='STANDARD');
 if(!tgt.length){console.log('전부 균등배분(STANDARD) — 바꿀 것 없음');return;}
 console.log('\n전환 대상:');
 // 소진 이력 확인
 const F=encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt']));
 const T=encodeURIComponent(JSON.stringify({since:'2026-08-27',until:'2026-09-02'}));
 for(const c of tgt){
  const [ok,r]=await raw(`/stats?ids=${encodeURIComponent(c.nccCampaignId)}&fields=${F}&timeRange=${T}`,'GET',null);
  const d=(ok&&r&&r.data&&r.data[0])||{};
  console.log(`  ${c.name} · 유형 ${c.campaignTp} · 예산 ${c.useDailyBudget?won(c.dailyBudget)+'원':'미사용'} · 7일 노출 ${won(d.impCnt)} 소진 ${won(d.salesAmt)}원`);
 }
 fs.writeFileSync(P('_sojam_g0903_even_ROLLBACK.json'),JSON.stringify({
  at:new Date().toISOString(),note:'전환 직전 deliveryMethod',
  before:tgt.map(c=>({id:c.nccCampaignId,name:c.name,deliveryMethod:c.deliveryMethod}))},null,1));
 if(!APPLY){console.log('\ndry-run — 적용하려면 --apply');return;}
 let ok=0,bad=0;
 for(const c of tgt){
  const [o,e]=await raw(`/ncc/campaigns/${c.nccCampaignId}?fields=deliveryMethod`,'PUT',
   {nccCampaignId:c.nccCampaignId,deliveryMethod:'STANDARD'});
  if(o)ok++;else{bad++;console.log('  실패',c.name,'→',String(e).slice(0,140));}
  await sleep(300);}
 console.log(`\n전환 완료 — 성공 ${ok} / 실패 ${bad}`);
 const [oka,ac]=await raw('/ncc/campaigns','GET',null);
 const after=Array.isArray(ac)?ac.filter(c=>!c.delFlag):[];
 const dm2={};after.forEach(c=>dm2[c.deliveryMethod]=(dm2[c.deliveryMethod]||0)+1);
 console.log('확인:',JSON.stringify(dm2));
})();
