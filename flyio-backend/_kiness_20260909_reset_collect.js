const fs=require('fs'),path=require('path');const {req,pool}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_bidreset_20260909');fs.mkdirSync(D,{recursive:true});
const save=(n,v)=>fs.writeFileSync(path.join(D,n+'.json'),JSON.stringify(v));
const call=async p=>{const r=await req('GET',p,null,441986,4);if(r===undefined)throw Error('Missing '+p);return r;};
(async()=>{
 const camps=await call('/ncc/campaigns');save('campaigns',camps);
 const shared=await call('/ncc/shared-budgets');save('shared_budgets',shared);
 const cm=new Map(camps.map(c=>[c.nccCampaignId,c]));
 const gb=await pool(camps,6,c=>call('/ncc/adgroups?nccCampaignId='+c.nccCampaignId));
 if(gb.some(x=>!Array.isArray(x)))throw Error('Incomplete groups');
 const groups=gb.flat();save('groups',groups);
 const active=groups.filter(g=>!g.userLock&&!cm.get(g.nccCampaignId).userLock&&g.adgroupType==='WEB_SITE');
 const inv=await pool(active,6,async g=>({gid:g.nccAdgroupId,keywords:await call('/ncc/keywords?nccAdgroupId='+g.nccAdgroupId)}));
 if(inv.some(x=>!Array.isArray(x.keywords)))throw Error('Incomplete inventory');
 fs.writeFileSync(path.join(D,'inventory.json'),JSON.stringify(inv));
 const ads=await pool(active,6,async g=>({gid:g.nccAdgroupId,ads:await call('/ncc/ads?nccAdgroupId='+g.nccAdgroupId)}));
 if(ads.some(x=>!Array.isArray(x.ads)))throw Error('Incomplete ads');
 save('ads',ads.map(x=>({gid:x.gid,serving:x.ads.filter(a=>!a.userLock&&a.status==='ELIGIBLE').length,total:x.ads.length,states:[...new Set(x.ads.map(a=>a.status+'/'+(a.userLock?'lock':'on')))]})));
 const stats={};
 for(const [name,since,until] of [['today','2026-09-09','2026-09-09'],['week','2026-09-02','2026-09-08']]){
  const data=[];for(let i=0;i<camps.length;i+=50){
   const r=await call('/stats?ids='+encodeURIComponent(camps.slice(i,i+50).map(c=>c.nccCampaignId).join(','))+'&fields='+encodeURIComponent(JSON.stringify(['salesAmt','clkCnt','impCnt']))+'&timeRange='+encodeURIComponent(JSON.stringify({since,until})));
   if(!Array.isArray(r.data))throw Error('Stats missing');data.push(...r.data);}
  save('stats_'+name,data);
  stats[name]=data.reduce((a,x)=>({cost:a.cost+(x.salesAmt||0),clicks:a.clicks+(x.clkCnt||0),imps:a.imps+(x.impCnt||0)}),{cost:0,clicks:0,imps:0});
 }
 save('collect_done',{at:new Date().toISOString(),campaigns:camps.length,groups:groups.length,activeGroups:active.length,keywords:inv.reduce((a,x)=>a+x.keywords.length,0),stats});
 console.log(JSON.stringify({campaigns:camps.length,groups:groups.length,active:active.length,keywords:inv.reduce((a,x)=>a+x.keywords.length,0),stats}));
})().catch(e=>{save('collect_error',{at:new Date().toISOString(),error:String(e)});console.error(e);process.exitCode=1;});
