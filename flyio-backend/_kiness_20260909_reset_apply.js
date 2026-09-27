const fs=require('fs'),path=require('path'),assert=require('assert');const {req,pool,sleep}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_bidreset_20260909');
const read=n=>JSON.parse(fs.readFileSync(path.join(D,n+'.json'),'utf8'));
const save=(n,v)=>fs.writeFileSync(path.join(D,n+'.json'),JSON.stringify(v));
const call=async(m,p,b)=>{for(let i=0;i<4;i++){try{const r=await req(m,p,b,441986,m==='GET'?4:1);
 if(r===undefined)throw Error('Missing response '+p);return r;}catch(e){if(i===3||!String(e).includes('409'))throw e;await sleep(3000);}}};
const SEARCH_BUDGET=174000, PLACE_BUDGET=5000, CONTENTS_BUDGET=500;
(async()=>{
 const plan=read('plan_vol'),bids=new Map(read('alloc2').bids);
 const changes=plan.map(p=>({id:p.id,gid:p.gid,cid:p.cid,keyword:p.keyword,tier:p.tier,oldBid:p.oldBid,
  oldGroupBid:p.useGroupBid,bid:bids.get(p.id)})).filter(x=>x.bid!==x.oldBid||x.oldGroupBid);
 console.log('총 대상',plan.length,'변경',changes.length);
 // 1. 사전 검증: 수집 이후 계정이 바뀌지 않았는지 확인한다.
 const gids=[...new Set(plan.map(p=>p.gid))];
 const camps=await call('GET','/ncc/campaigns');save('preflight_campaigns',camps);
 const cm=new Map(camps.map(c=>[c.nccCampaignId,c]));
 const budgets=await call('GET','/ncc/shared-budgets');save('preflight_budgets',budgets);
 const inv=await pool(gids,6,async gid=>({gid,keywords:await call('GET','/ncc/keywords?nccAdgroupId='+gid)}));
 assert(inv.every(x=>Array.isArray(x.keywords)),'키워드 조회 실패');
 const km=new Map(inv.flatMap(x=>x.keywords).map(k=>[k.nccKeywordId,k]));
 const drift=[];
 for(const p of plan){const k=km.get(p.id);
  if(!k||k.userLock||k.status!=='ELIGIBLE'){drift.push(p.id);continue;}
  // 앞선 시도에서 이미 반영된 값은 표류가 아니다.
  if(k.bidAmt===bids.get(p.id)&&!k.useGroupBidAmt)continue;
  if(k.bidAmt!==p.oldBid||!!k.useGroupBidAmt!==!!p.useGroupBid)drift.push(p.id);}
 save('preflight_drift',drift);
 assert(drift.length===0,'수집 이후 변경된 키워드 '+drift.length+'건: '+drift.slice(0,3).join(','));
 assert(plan.every(p=>!cm.get(p.cid).userLock),'중지된 캠페인 포함');
 // 2. 예산을 먼저 내린다. 상위 캠페인 공유예산이 계정 검색광고 총 상한이다.
 const events=[];
 for(const id of ['nsb-a001-01-000000000073065','nsb-a001-02-000000000073066','nsb-a001-02-000000000073067']){
  const b=budgets.find(x=>x.sharedBudgetId===id);assert(b,'공유예산 없음 '+id);
  const r=await call('PUT','/ncc/shared-budgets/'+id,{sharedBudgetId:id,customerId:441986,name:b.name,
   ownerType:b.ownerType,dailyBudget:SEARCH_BUDGET,deliveryMethod:'ACCELERATED'});
  events.push({id,name:b.name,before:b.dailyBudget,after:r.dailyBudget});save('budget_events',events);
 }
 const place=camps.find(c=>c.campaignTp==='PLACE'&&!c.userLock);
 assert(place&&!place.sharedBudgetId,'플레이스 캠페인 확인 실패');
 const pr=await call('PUT','/ncc/campaigns/'+place.nccCampaignId+'?fields=budget',
  {...place,dailyBudget:PLACE_BUDGET,useDailyBudget:true});
 events.push({id:place.nccCampaignId,name:place.name,before:place.dailyBudget,after:pr.dailyBudget});
 for(const c of camps.filter(c=>c.campaignTp==='POWER_CONTENTS'&&!c.userLock)){
  if(c.dailyBudget===CONTENTS_BUDGET&&c.useDailyBudget)continue;
  const r=await call('PUT','/ncc/campaigns/'+c.nccCampaignId+'?fields=budget',{...c,dailyBudget:CONTENTS_BUDGET,useDailyBudget:true});
  events.push({id:c.nccCampaignId,name:c.name,before:c.dailyBudget,after:r.dailyBudget});
 }
 save('budget_events',events);console.log('예산 반영',JSON.stringify(events));
 // 3. 입찰가 적용.
 const state={startedAt:new Date().toISOString(),total:plan.length,changes:changes.length,applied:0};save('apply_state',state);
 for(let i=0;i<changes.length;i+=100){
  const chunk=changes.slice(i,i+100);
  const r=await call('PUT','/ncc/keywords?fields=bidAmt',chunk.map(x=>({nccKeywordId:x.id,nccAdgroupId:x.gid,bidAmt:x.bid,useGroupBidAmt:false})));
  assert(Array.isArray(r)&&r.length===chunk.length,'입찰 반영 응답 불일치');
  const rm=new Map(r.map(k=>[k.nccKeywordId,k]));
  for(const x of chunk)assert(rm.get(x.id)?.bidAmt===x.bid&&rm.get(x.id)?.useGroupBidAmt===false,'입찰 반영 실패 '+x.id);
  state.applied+=chunk.length;save('apply_state',state);
  if(i%5000===0)console.log('applied',state.applied,'/',changes.length);
 }
 state.completedAt=new Date().toISOString();save('apply_state',state);
 console.log('입찰 적용 완료',state.applied);
})().catch(e=>{save('apply_error',{at:new Date().toISOString(),error:String(e)});console.error(e);process.exitCode=1;});
