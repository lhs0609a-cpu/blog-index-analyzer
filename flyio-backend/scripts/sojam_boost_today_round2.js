const fs=require('fs'),path=require('path'),assert=require('assert');
const dir=path.resolve(__dirname,'../../reports/sojam-20260909/afternoon-boost-2');fs.mkdirSync(dir,{recursive:true});
const url='https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=1858907';
const save=(n,x)=>fs.writeFileSync(path.join(dir,n),JSON.stringify(x,null,2));
const read=n=>JSON.parse(fs.readFileSync(path.join(dir,n),'utf8'));
async function api(method,p,body=null){
 for(let n=0;n<(method==='GET'?3:1);n++)try{
  const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:'1858907',method,path:p,body}),signal:AbortSignal.timeout(30000)});
  const d=await r.json();if(!r.ok||!d.success)throw Error('API rejected '+r.status);return d.response;
 }catch(e){if(method!=='GET'||n===2)throw e;}
}
async function parallel(items,fn){let i=0;const out=[];await Promise.all(Array.from({length:4},async()=>{while(i<items.length){const j=i++;out[j]=await fn(items[j]);}}));return out;}
const ids=rs=>'/ncc/keywords?ids='+encodeURIComponent(rs.map(x=>x.keyword_id||x.nccKeywordId).join(','));
async function main(){
 if(process.argv.includes('--prepare')){
  assert(!fs.existsSync(path.join(dir,'result.json')));
  const candidates=JSON.parse(fs.readFileSync(path.join(dir,'../boost-candidates.json'),'utf8')).filter(r=>Number(r.effective_bid_cap)>=3500);
  const campaigns=await api('GET','/ncc/campaigns?recordSize=1000');assert(Array.isArray(campaigns)&&campaigns.length<1000);
  const gids=[...new Set(candidates.map(r=>r.group_id))];
  const gs=await parallel(gids,async id=>({group:await api('GET','/ncc/adgroups/'+id),ads:await api('GET','/ncc/ads?nccAdgroupId='+id)}));
  const groups=Object.fromEntries(gs.map(x=>[x.group.nccAdgroupId,x]));
  const parts=[];for(let i=0;i<candidates.length;i+=100)parts.push(candidates.slice(i,i+100));
  const all=(await parallel(parts,p=>api('GET',ids(p)))).flat();assert(all.length===candidates.length);
  const keywords=Object.fromEntries(all.map(k=>[k.nccKeywordId,k]));const actions=[],skipped=[];
  for(const r of candidates){const k=keywords[r.keyword_id],{group:g,ads}=groups[r.group_id],c=campaigns.find(c=>c.nccCampaignId===r.campaign_id);
   assert(k.keyword===r.keyword&&k.nccAdgroupId===r.group_id&&g.nccCampaignId===r.campaign_id&&k.customerId===1858907);
   if(k.userLock||g.userLock||c.userLock||k.status!=='ELIGIBLE'||!ads.some(a=>!a.userLock&&a.inspectStatus==='APPROVED'&&a.status==='ELIGIBLE')){skipped.push({keyword:k.keyword,reason:'inactive or unapproved',status:k.status});continue;}
   const old=k.useGroupBidAmt?g.bidAmt:k.bidAmt;
   const weight=Math.max(g.pcNetworkBidWeight||100,g.mobileNetworkBidWeight||100)/100;
   const cap=r.grade==='S'?15000:10500;
   const bid=Math.floor(Math.min(old*(r.grade==='S'?2:1.5),cap/weight)/10)*10;
   if(bid<=old){skipped.push({keyword:k.keyword,reason:'at ceiling'});continue;}
   actions.push({keyword_id:k.nccKeywordId,keyword:k.keyword,group_id:r.group_id,campaign_id:r.campaign_id,grade:r.grade,before_base:old,after_base:bid,pc_weight:g.pcNetworkBidWeight,mobile_weight:g.mobileNetworkBidWeight,pc_before:old*g.pcNetworkBidWeight/100,pc_after:bid*g.pcNetworkBidWeight/100,mobile_before:old*g.mobileNetworkBidWeight/100,mobile_after:bid*g.mobileNetworkBidWeight/100});
  }
  const budgets=[['cmp-a001-01-000000002808841',160000],['cmp-a001-01-000000002783671',40000]].map(([id,after])=>{const c=campaigns.find(c=>c.nccCampaignId===id);assert(c&&!c.userLock&&c.useDailyBudget);return {id,name:c.name,before:c.dailyBudget,after};});
  actions.sort((a,b)=>(a.grade==='S'?0:1)-(b.grade==='S'?0:1));
  const before={at:new Date().toISOString(),campaigns,groups,keywords};save('before.json',before);
  const total=campaigns.filter(c=>c.useDailyBudget).reduce((s,c)=>s+c.dailyBudget,0);
  const plan={at:before.at,target_actual_spend:150000,budget_total_before:total,budget_total_after:total+budgets.reduce((s,b)=>s+b.after-b.before,0),actions,budgets,skipped};save('plan.json',plan);
  console.log(JSON.stringify({count:actions.length,budgets,total_after:plan.budget_total_after,skipped:skipped.length,groups:gs.map(x=>({name:x.group.name,status:x.group.status,budget:x.group.dailyBudget,useDailyBudget:x.group.useDailyBudget})),examples:actions.filter(a=>['습진치료','아토피치료','지루성피부염한의원','피부가려움증병원'].includes(a.keyword))}));return;
 }
 assert(process.argv.includes('--apply'));assert(!fs.existsSync(path.join(dir,'result.json')));
 const before=read('before.json'),plan=read('plan.json');assert(Date.now()-Date.parse(before.at)<1800000);
 const result={started:new Date().toISOString(),keywords:[],budgets:[],complete:false};save('result.json',result);
 for(const gid of new Set(plan.actions.map(r=>r.group_id))){const g=await api('GET','/ncc/adgroups/'+gid),old=before.groups[gid].group;assert(g.editTm===old.editTm&&!g.userLock);}
 for(const b of plan.budgets){const c=await api('GET','/ncc/campaigns/'+b.id),old=before.campaigns.find(c=>c.nccCampaignId===b.id);assert(c.editTm===old.editTm&&!c.userLock);}
 for(let i=0;i<plan.actions.length;i+=50){const part=plan.actions.slice(i,i+50),fresh=await api('GET',ids(part));assert(fresh.length===part.length);
  const body=part.map(r=>{const k=fresh.find(k=>k.nccKeywordId===r.keyword_id),old=before.keywords[r.keyword_id];assert(k.editTm===old.editTm&&k.bidAmt===old.bidAmt&&k.userLock===false&&k.useGroupBidAmt===old.useGroupBidAmt);return {...k,bidAmt:r.after_base,useGroupBidAmt:false};});
  try{await api('PUT','/ncc/keywords?fields=bidAmt',body);}catch(e){result.writeError=String(e.message);}
  const after=await api('GET',ids(part));
  for(const r of part){const k=after.find(k=>k.nccKeywordId===r.keyword_id);result.keywords.push({...r,verified:!!k&&k.bidAmt===r.after_base&&!k.useGroupBidAmt&&!k.userLock});}
  save('result.json',result);assert(result.keywords.every(k=>k.verified));console.log('verified keywords',result.keywords.length);
 }
 for(const b of plan.budgets){const old=before.campaigns.find(c=>c.nccCampaignId===b.id),fresh=await api('GET','/ncc/campaigns/'+b.id);assert(fresh.editTm===old.editTm&&fresh.dailyBudget===b.before&&!fresh.userLock);
  try{await api('PUT','/ncc/campaigns/'+b.id+'?fields=budget',{...fresh,dailyBudget:b.after,useDailyBudget:true});}catch(e){result.writeError=String(e.message);}
  const c=await api('GET','/ncc/campaigns/'+b.id);result.budgets.push({...b,verified:c.dailyBudget===b.after&&c.useDailyBudget&&!c.userLock});save('result.json',result);assert(result.budgets.every(b=>b.verified));
 }
 const campaigns=await api('GET','/ncc/campaigns?recordSize=1000');save('campaigns_after.json',campaigns);result.total_after=campaigns.filter(c=>c.useDailyBudget).reduce((s,c)=>s+c.dailyBudget,0);assert(result.total_after===plan.budget_total_after);
 result.finished=new Date().toISOString();result.complete=true;save('result.json',result);console.log('COMPLETE',result.keywords.length,result.budgets.length,result.total_after);
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
