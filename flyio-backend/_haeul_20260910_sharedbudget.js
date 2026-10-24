// 해울 WEB_SITE 캠페인 9개를 하나의 공유예산으로 묶는다. 플레이스#1(PLACE)은 제외 — 단독 45,000원 유지.
//   생성: POST /ncc/shared-budgets  {customerId,name,ownerType:'CAMPAIGN',deliveryMethod,dailyBudget,budgetLock}
//   연결: PUT  /ncc/campaigns?fields=sharedBudget  [{...campaign, sharedBudgetId, sharedDailyBudget, sharedBudgetName}]
//   검증: GET  /ncc/campaigns/shared-budgets/{sharedBudgetId}
// 사용: node _haeul_20260910_sharedbudget.js --dry | --apply
const fs=require('fs'),path=require('path'),assert=require('assert');
const CID=3442423,NAME='해울_파워링크_공유예산',AMOUNT=135500,DELIVERY='ACCELERATED';
const D=path.join(__dirname,'reports','haeul_20260910');fs.mkdirSync(D,{recursive:true});
const save=(n,x)=>fs.writeFileSync(path.join(D,n+'.json'),JSON.stringify(x,null,1));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(method,p,body=null){
 for(let n=0;n<(method==='GET'?4:1);n++)try{
  const r=await fetch('https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID,
   {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:String(CID),method,path:p,body}),signal:AbortSignal.timeout(45000)});
  const d=await r.json();
  if(!r.ok||!d.success)throw Error(String(d.error||JSON.stringify(d)).slice(0,400));
  return d.response;
 }catch(e){if(method!=='GET'||n===3)throw e;await sleep(1500);}
}
const members=sid=>api('GET','/ncc/campaigns/shared-budgets/'+sid);
(async()=>{
 const mode=['--dry','--apply'].find(m=>process.argv.includes(m));
 assert(mode,'--dry 또는 --apply');
 const campaigns=await api('GET','/ncc/campaigns');
 assert(campaigns.length===10,'캠페인 10개가 아니다: '+campaigns.length);
 assert(campaigns.every(c=>c.customerId===CID));
 const targets=campaigns.filter(c=>c.campaignTp==='WEB_SITE');
 const outside=campaigns.filter(c=>c.campaignTp!=='WEB_SITE');
 assert(targets.length===9&&outside.length===1,'대상 구성이 예상과 다르다');
 assert(outside[0].campaignTp==='PLACE'&&outside[0].dailyBudget===45000,'플레이스 예산이 45,000원이 아니다');
 const sumBefore=targets.filter(c=>c.useDailyBudget).reduce((s,c)=>s+c.dailyBudget,0);
 console.log('WEB_SITE '+targets.length+'개 개별 일예산 합계 '+sumBefore.toLocaleString()+'원 → 공유예산 '+AMOUNT.toLocaleString()+'원');
 console.log('공유예산 밖: '+outside.map(c=>c.name+'('+c.campaignTp+', '+c.dailyBudget.toLocaleString()+'원)').join(' / '));
 for(const c of targets)console.log('  · '+c.name.padEnd(28)+String(c.dailyBudget).padStart(7)+'원  '+c.deliveryMethod+'  '+c.status+(c.sharedBudgetId?'  이미연결='+c.sharedBudgetId:''));
 assert(targets.every(c=>!c.sharedBudgetId),'이미 공유예산에 연결된 캠페인이 있다');
 save('sb_before_campaigns',campaigns);
 if(mode==='--dry'){console.log('\n--dry: 아무것도 바꾸지 않았다.');return;}

 // 공유예산 "생성" 은 API 로 안 된다 — POST /ncc/shared-budgets 는 기존 sharedBudgetId 를 요구하는 수정 전용이다.
 // 검색광고 UI(도구 > 공유예산)에서 하나 만들어 두면 이 아래가 금액 보정 + 캠페인 연결을 처리한다.
 let list=await api('GET','/ncc/shared-budgets');
 assert(list.length,'공유예산이 없다 — 검색광고 UI(도구 > 공유예산)에서 먼저 하나 만들 것. API 로는 생성 불가.');
 let sb=list.find(x=>x.name===NAME)||(list.length===1?list[0]:null);
 assert(sb,'공유예산이 여러 개다. 이름을 '+NAME+' 로 맞추거나 NAME 상수를 고칠 것: '+JSON.stringify(list.map(x=>x.name)));
 assert.equal(sb.ownerType,'CAMPAIGN');assert.equal(sb.customerId,CID);
 if(sb.dailyBudget!==AMOUNT||sb.deliveryMethod!==DELIVERY){
  console.log('공유예산 보정: '+sb.dailyBudget.toLocaleString()+'원/'+sb.deliveryMethod+' → '+AMOUNT.toLocaleString()+'원/'+DELIVERY);
  await api('PUT','/ncc/shared-budgets/'+sb.sharedBudgetId,{...sb,dailyBudget:AMOUNT,deliveryMethod:DELIVERY});
  sb=(await api('GET','/ncc/shared-budgets')).find(x=>x.sharedBudgetId===sb.sharedBudgetId);
 }
 assert.equal(sb.dailyBudget,AMOUNT);assert.equal(sb.deliveryMethod,DELIVERY);
 console.log('\n공유예산 '+sb.sharedBudgetId+' | '+sb.name+' | '+sb.dailyBudget.toLocaleString()+'원 | '+sb.deliveryMethod+' | 연결 '+sb.numberInUse+'개');
 save('sb_created',sb);

 const attached=new Set((await members(sb.sharedBudgetId)).map(c=>c.nccCampaignId));
 const pending=targets.filter(c=>!attached.has(c.nccCampaignId));
 for(let i=0;i<pending.length;i+=20){
  const part=pending.slice(i,i+20).map(c=>({...c,sharedBudgetId:sb.sharedBudgetId,sharedDailyBudget:sb.dailyBudget,sharedBudgetName:sb.name}));
  await api('PUT','/ncc/campaigns?fields=sharedBudget',part);
  console.log('연결 '+Math.min(i+20,pending.length)+'/'+pending.length);
 }
 const after=await members(sb.sharedBudgetId),afterIds=new Set(after.map(c=>c.nccCampaignId));
 const missing=targets.filter(c=>!afterIds.has(c.nccCampaignId));
 const campsAfter=await api('GET','/ncc/campaigns'),sbAfter=(await api('GET','/ncc/shared-budgets')).find(x=>x.sharedBudgetId===sb.sharedBudgetId);
 save('sb_after_campaigns',campsAfter);save('sb_after',{sharedBudget:sbAfter,members:after});
 console.log('\n연결 '+after.length+'개 / 대상 '+targets.length+'개, 누락 '+missing.length);
 if(missing.length)console.log('누락:',missing.map(c=>c.name));
 assert.equal(missing.length,0,'연결되지 않은 캠페인이 있다');
 assert.equal(after.length,9,'연결 수가 9가 아니다');
 const place=campsAfter.find(c=>c.campaignTp==='PLACE');
 assert(!place.sharedBudgetId&&place.dailyBudget===45000,'플레이스가 바뀌었다');
 console.log('공유예산 numberInUse='+sbAfter.numberInUse+' dailyBudget='+sbAfter.dailyBudget.toLocaleString()+'원 deliveryMethod='+sbAfter.deliveryMethod);
 console.log('플레이스#1 단독 유지: '+place.dailyBudget.toLocaleString()+'원, sharedBudgetId='+(place.sharedBudgetId||'없음'));
 console.log('계정 전체 일 상한 = '+(sbAfter.dailyBudget+place.dailyBudget).toLocaleString()+'원 (변경 전 '+(sumBefore+45000).toLocaleString()+'원)');
})().catch(e=>{console.error('ERR',e.message);process.exitCode=1;});
