const fs=require('fs'),path=require('path'),assert=require('assert');const {req,pool}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_bidreset_20260909');
const read=n=>JSON.parse(fs.readFileSync(path.join(D,n+'.json'),'utf8'));
const save=(n,v)=>fs.writeFileSync(path.join(D,n+'.json'),JSON.stringify(v));
const call=(m,p,b)=>req(m,p,b,441986,4);
(async()=>{
 const plan=read('plan_vol'),bids=new Map(read('alloc2').bids);
 const gids=[...new Set(plan.map(p=>p.gid))];
 const inv=await pool(gids,6,async gid=>({gid,keywords:await call('GET','/ncc/keywords?nccAdgroupId='+gid)}));
 assert(inv.every(x=>Array.isArray(x.keywords)),'키워드 조회 실패');
 fs.writeFileSync(path.join(D,'inventory_after.json'),JSON.stringify(inv));
 const km=new Map(inv.flatMap(x=>x.keywords).map(k=>[k.nccKeywordId,k]));
 const bad=[];
 for(const p of plan){const k=km.get(p.id),want=bids.get(p.id);
  if(!k||k.bidAmt!==want||k.useGroupBidAmt)bad.push({id:p.id,keyword:p.keyword,want,got:k?k.bidAmt:null,groupBid:k?k.useGroupBidAmt:null});}
 save('verification_errors',bad);
 const budgets=await call('GET','/ncc/shared-budgets');save('budgets_after',budgets);
 const camps=await call('GET','/ncc/campaigns');save('campaigns_after',camps);
 const search=budgets.find(b=>b.sharedBudgetId==='nsb-a001-01-000000000073065');
 const place=camps.find(c=>c.campaignTp==='PLACE'&&!c.userLock);
 const contents=camps.filter(c=>c.campaignTp==='POWER_CONTENTS'&&!c.userLock);
 const configured=search.dailyBudget+place.dailyBudget+contents.reduce((a,c)=>a+c.dailyBudget,0);
 const tiers={};for(const p of plan){const b=bids.get(p.id);const t=tiers[p.tier]||(tiers[p.tier]={n:0,min:Infinity,max:0,active:0});
  t.n++;if(b>70){t.active++;t.min=Math.min(t.min,b);t.max=Math.max(t.max,b);}}
 const out={at:new Date().toISOString(),keywords:plan.length,errors:bad.length,
  budgets:{검색광고_공유예산:search.dailyBudget,플레이스:place.dailyBudget,파워컨텐츠:contents.map(c=>c.dailyBudget),합계:configured},
  tiers};
 save('verification',out);
 console.log(JSON.stringify(out,null,1));
})().catch(e=>{save('verify_error',{at:new Date().toISOString(),error:String(e)});console.error(e);process.exitCode=1;});
