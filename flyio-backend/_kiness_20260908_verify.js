const fs=require('fs');const {req,pool}=require('./_sojam_naver');const P=n=>'_kiness_20260908_'+n+'.json';
const p=JSON.parse(fs.readFileSync(P('plan'))),call=(m,u,b)=>req(m,u,b,441986);
(async()=>{
 const campaigns=await call('GET','/ncc/campaigns'),shared=await call('GET','/ncc/shared-budgets');
 const gr=await pool(campaigns,3,c=>call('GET','/ncc/adgroups?nccCampaignId='+c.nccCampaignId));if(gr.some(x=>!Array.isArray(x)))throw Error('Incomplete groups');const groups=gr.flat();
 const wanted=new Set([...p.changes.map(x=>x.gid),...p.creates.map(x=>x.gid),...p.groups.map(x=>x.gid)]);
 let n=0;const inv=await pool([...wanted],4,async gid=>{const keywords=await call('GET','/ncc/keywords?nccAdgroupId='+gid);const ads=await call('GET','/ncc/ads?nccAdgroupId='+gid);if(++n%100===0)console.log('verify groups',n,'/',wanted.size);return {gid,keywords,ads};});
 if(inv.some(x=>!Array.isArray(x.keywords)||!Array.isArray(x.ads)))throw Error('Incomplete inventory');
 const km=new Map(inv.flatMap(x=>x.keywords).map(k=>[k.nccKeywordId,k])),gm=new Map(groups.map(g=>[g.nccAdgroupId,g])),cm=new Map(campaigns.map(c=>[c.nccCampaignId,c]));
 const errors=[],pending=[],created=[];
 for(const x of p.changes){const k=km.get(x.id);if(!k||k.bidAmt!==x.newBid||k.useGroupBidAmt!==false||k.userLock!==x.newLock)errors.push({type:'keyword_mismatch',kw:x.kw,id:x.id,expected:x,actual:k});}
 for(const x of p.creates){const k=inv.find(i=>i.gid===x.gid).keywords.find(k=>k.keyword===x.kw);if(!k||k.bidAmt!==x.bid||k.userLock||k.useGroupBidAmt)errors.push({type:'create_mismatch',kw:x.kw,gid:x.gid});else{created.push({...x,id:k.nccKeywordId,inspect:k.inspectStatus,status:k.status});if(k.inspectStatus!=='APPROVED')pending.push({kw:x.kw,id:k.nccKeywordId,inspect:k.inspectStatus});}}
 const estimates=JSON.parse(fs.readFileSync(P('estimates'))).data,{classify}=require('./_kiness_20260908_discover');
 const region=[];for(const [kw,o] of Object.entries(p.owners)){if(classify(kw).tier==='region_clinic')region.push({kw,id:o.id,gid:o.gid,pc5:estimates[kw]?.PC5});}
 region.push(...created.filter(x=>x.tier==='region_clinic'));
 for(const x of region){const k=km.get(x.id),g=gm.get(x.gid);if(!k||k.userLock||g.userLock||(k.useGroupBidAmt?g.bidAmt:k.bidAmt)*(g.pcNetworkBidWeight||100)/100<(x.pc5||70))errors.push({type:'region_pc5_gap',kw:x.kw,id:x.id});}
 for(const x of p.groups){const g=gm.get(x.gid),c=cm.get(g.nccCampaignId),r=inv.find(i=>i.gid===x.gid);if(g.userLock||c.userLock||!g.sharedBudgetId||!c.sharedBudgetId||!r.ads.some(a=>a.inspectStatus==='APPROVED'&&!a.userLock))errors.push({type:'serving_group_gap',gid:x.gid});}
 const active=groups.filter(g=>g.adgroupType==='WEB_SITE'&&!g.userLock&&!cm.get(g.nccCampaignId).userLock),activeIds=new Set(p.groups.map(x=>x.gid));
 for(const g of active)if(!activeIds.has(g.nccAdgroupId))errors.push({type:'unexpected_live_group',gid:g.nccAdgroupId});
 const top=shared.find(s=>s.name==='키네스_문의확대_총검색예산_0908');const nonsearch=campaigns.filter(c=>c.campaignTp!=='WEB_SITE'&&c.campaignTp!=='BRAND_SEARCH'&&!c.userLock).reduce((s,c)=>s+(c.useDailyBudget?c.dailyBudget:1e9),0);
 if(!top||top.dailyBudget+nonsearch!==200000)errors.push({type:'budget_total',search:top?.dailyBudget,nonsearch});
 const result={verifiedAt:new Date().toISOString(),errors,pending,counts:{changed:p.changes.length,created:created.length,new:created.filter(x=>!x.rehome).length,rehome:created.filter(x=>x.rehome).length,activeGroups:active.length,regionChecked:region.length},campaigns,shared,groups,created};
 fs.writeFileSync(P('verified'),JSON.stringify(result));fs.writeFileSync(P('verified_inventory'),JSON.stringify(inv));console.log(JSON.stringify({errors:errors.length,pending:pending.length,counts:result.counts,budget:top?.dailyBudget+nonsearch}));
 if(errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
