const fs=require('fs');const {req}=require('./_sojam_naver');const P=n=>'_kiness_20260908_'+n+'.json';
const plan=JSON.parse(fs.readFileSync(P('plan'))),state=fs.existsSync(P('budget_applied'))?JSON.parse(fs.readFileSync(P('budget_applied'))):{events:[]};
const call=async(m,p,b)=>{for(let n=0;n<5;n++){try{return await req(m,p,b,441986,m==='POST'?1:3);}catch(e){if(m==='POST'||n===4||!String(e).includes('409'))throw e;await new Promise(r=>setTimeout(r,5000));}}},save=()=>fs.writeFileSync(P('budget_applied'),JSON.stringify(state));
async function shared(name,ownerType,dailyBudget,items){
 const list=await call('GET','/ncc/shared-budgets');let s=list.find(x=>x.name===name);
 if(!s){s=await call('POST','/ncc/shared-budgets',{name,customerId:441986,ownerType,dailyBudget,deliveryMethod:ownerType==='CAMPAIGN'?'STANDARD':'ACCELERATED',[ownerType==='CAMPAIGN'?'campaignList':'adgroupList']:items.slice(0,1)});state.events.push({type:'created',response:s});save();}
 if(!s.sharedBudgetId)throw Error('Missing sharedBudgetId '+JSON.stringify(s));
 const attached=await call('GET','/ncc/'+(ownerType==='CAMPAIGN'?'campaigns':'adgroups')+'/shared-budgets/'+s.sharedBudgetId);
 const attachedIds=new Set(attached.map(x=>ownerType==='CAMPAIGN'?x.nccCampaignId:x.nccAdgroupId));
 const pending=items.filter(x=>!attachedIds.has(ownerType==='CAMPAIGN'?x.nccCampaignId:x.nccAdgroupId));
 for(let i=0;i<pending.length;i+=20){const body=pending.slice(i,i+20).map(x=>({...x,sharedBudgetId:s.sharedBudgetId,sharedDailyBudget:dailyBudget,sharedBudgetName:name}));
  await call('PUT','/ncc/'+(ownerType==='CAMPAIGN'?'campaigns':'adgroups')+'?fields=sharedBudget',body);
  state.events.push({type:'attach',id:s.sharedBudgetId,ids:body.map(x=>x.nccCampaignId+(x.nccAdgroupId||''))});save();
 }
 const verified=await call('GET','/ncc/'+(ownerType==='CAMPAIGN'?'campaigns':'adgroups')+'/shared-budgets/'+s.sharedBudgetId);
 const verifiedIds=new Set(verified.map(x=>ownerType==='CAMPAIGN'?x.nccCampaignId:x.nccAdgroupId));
 if(items.some(x=>!verifiedIds.has(ownerType==='CAMPAIGN'?x.nccCampaignId:x.nccAdgroupId)))throw Error('Shared membership mismatch '+name);
 console.log(name,dailyBudget,'members',verified.length);return s;
}
(async()=>{
 const camps=await call('GET','/ncc/campaigns');
 state.campaignShared=await shared('키네스_문의확대_총검색예산_0908','CAMPAIGN',198000,camps.filter(c=>c.campaignTp==='WEB_SITE'));save();
 for(const c of camps.filter(c=>['POWER_CONTENTS','INFORMATION','LOCAL_AD','PLACE'].includes(c.campaignTp))){const b=['LOCAL_AD','PLACE'].includes(c.campaignTp)?1000:500;await call('PUT','/ncc/campaigns/'+c.nccCampaignId+'?fields=budget',{...c,useDailyBudget:true,dailyBudget:b});state.events.push({type:'other_budget',id:c.nccCampaignId,budget:b});save();}
 const old=JSON.parse(fs.readFileSync(P('groups'))),groups=[];
 for(const c of camps.filter(c=>c.campaignTp==='WEB_SITE'))groups.push(...await call('GET','/ncc/adgroups?nccCampaignId='+c.nccCampaignId));
 const regional=new Set(plan.groups.filter(x=>x.region).map(x=>x.gid));
 state.regionShared=await shared('키네스_지역성장클리닉_PC5_0908','ADGROUP',140000,groups.filter(g=>regional.has(g.nccAdgroupId)));save();
 const active=new Set(plan.groups.map(x=>x.gid));
 state.otherShared=await shared('키네스_브랜드상담확장_0908','ADGROUP',58000,groups.filter(g=>active.has(g.nccAdgroupId)&&!regional.has(g.nccAdgroupId)));save();
 const pause=groups.filter(g=>!active.has(g.nccAdgroupId)&&!g.userLock);
 for(let i=0;i<pause.length;i+=100){await call('PUT','/ncc/adgroups?fields=userLock',pause.slice(i,i+100).map(g=>({...g,userLock:true})));state.events.push({type:'pause_nonowner_groups',ids:pause.slice(i,i+100).map(g=>g.nccAdgroupId)});save();}
 const after=await call('GET','/ncc/campaigns');fs.writeFileSync(P('campaigns_after_budget'),JSON.stringify(after));
 delete state.error;state.complete=true;save();
 console.log('campaign types',after.reduce((a,c)=>(a[c.campaignTp]=(a[c.campaignTp]||0)+1,a),{}));
 console.log('budget configured',state.campaignShared.sharedBudgetId,state.regionShared.sharedBudgetId,state.otherShared.sharedBudgetId);
})().catch(e=>{state.error=String(e);save();console.error(e);process.exitCode=1});
