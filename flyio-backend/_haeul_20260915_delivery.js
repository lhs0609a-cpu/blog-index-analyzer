// 해울 캠페인 게재방식을 전부 STANDARD(예산 균등배분)로 바꾼다. (2026-09-15 사용자 지시 "균등배분으로 전부 바꿔줘")
//   조회: GET /ncc/campaigns
//   변경: PUT /ncc/campaigns/{id}?fields=budget  {...campaign, deliveryMethod:'STANDARD'}
//   검증: GET /ncc/campaigns 재조회
// 사용: node _haeul_20260915_delivery.js --dry | --apply [--to ACCELERATED]   (--to 로 되돌리기)
const fs=require('fs'),path=require('path'),assert=require('assert');
const CID=3442423;
const D=path.join(__dirname,'reports','haeul_20260915');fs.mkdirSync(D,{recursive:true});
const save=(n,x)=>fs.writeFileSync(path.join(D,n+'.json'),JSON.stringify(x,null,1));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(method,p,body=null){
 for(let n=0;n<(method==='GET'?4:2);n++)try{
  const r=await fetch('https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID,
   {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:String(CID),method,path:p,body}),signal:AbortSignal.timeout(45000)});
  const d=await r.json();
  if(!r.ok||!d.success)throw Error(String(d.error||JSON.stringify(d)).slice(0,400));
  return d.response;
 }catch(e){if(n===(method==='GET'?3:1))throw e;await sleep(2000);}
}
(async()=>{
 const mode=['--dry','--apply'].find(m=>process.argv.includes(m));
 assert(mode,'--dry 또는 --apply');
 const i=process.argv.indexOf('--to');
 const TO=i>=0?process.argv[i+1]:'STANDARD';
 assert(['STANDARD','ACCELERATED'].includes(TO),'--to 는 STANDARD 또는 ACCELERATED');

 const before=await api('GET','/ncc/campaigns');
 assert(before.length&&before.every(c=>c.customerId===CID),'캠페인 조회가 이상하다');
 save('delivery_before',before);
 const targets=before.filter(c=>c.deliveryMethod!==TO);
 console.log('캠페인 '+before.length+'개 / 바꿀 대상 '+targets.length+'개 → '+TO);
 for(const c of before)console.log('  '+(c.deliveryMethod===TO?'   ':' * ')+c.name.padEnd(24)+String(c.dailyBudget).padStart(7)+'원  '+c.deliveryMethod.padEnd(12)+c.status+(c.sharedBudgetId?'  SB='+c.sharedBudgetId:''));
 assert(targets.every(c=>!c.sharedBudgetId),'공유예산에 묶인 캠페인이 있다 — 게재방식은 공유예산 쪽에서 바꿔야 한다');
 if(!targets.length){console.log('이미 전부 '+TO+' 다.');return;}
 if(mode==='--dry'){console.log('\n--dry: 아무것도 바꾸지 않았다.');return;}

 const events=[];
 for(const c of targets){
  const r=await api('PUT','/ncc/campaigns/'+c.nccCampaignId+'?fields=budget',{...c,deliveryMethod:TO});
  events.push({id:c.nccCampaignId,name:c.name,before:c.deliveryMethod,after:r.deliveryMethod,dailyBudget:r.dailyBudget,useDailyBudget:r.useDailyBudget});
  console.log('  변경 '+c.name+': '+c.deliveryMethod+' → '+r.deliveryMethod+' (일예산 '+r.dailyBudget.toLocaleString()+'원, useDailyBudget='+r.useDailyBudget+')');
  save('delivery_events',events);
  await sleep(600);
 }
 await sleep(1500);
 const after=await api('GET','/ncc/campaigns');
 save('delivery_after',after);
 const bad=after.filter(c=>c.deliveryMethod!==TO);
 const budgetMoved=after.filter(c=>{const b=before.find(x=>x.nccCampaignId===c.nccCampaignId);return b&&(b.dailyBudget!==c.dailyBudget||b.useDailyBudget!==c.useDailyBudget||b.status!==c.status);});
 console.log('\n검증: '+(after.length-bad.length)+'/'+after.length+' 캠페인이 '+TO);
 if(budgetMoved.length)console.log('⚠️ 예산/상태가 같이 변한 캠페인: '+budgetMoved.map(c=>c.name+'('+c.dailyBudget+'원,'+c.status+')').join(' / '));
 else console.log('일예산·useDailyBudget·status 전부 그대로.');
 assert(!bad.length,'STANDARD 로 안 바뀐 캠페인: '+bad.map(c=>c.name).join(', '));
})();
