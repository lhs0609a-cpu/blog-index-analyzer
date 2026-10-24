const fs=require('fs'),path=require('path');const {req,pool}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_bids_20260909');fs.mkdirSync(D,{recursive:true});
const save=(n,v)=>fs.writeFileSync(path.join(D,n+'.json'),JSON.stringify(v));
const get=async p=>{const r=await req('GET',p,null,441986,5);if(!r)throw Error('No response '+p);return r;};
(async()=>{
 const c=await get('/ncc/campaigns');save('campaigns',c);save('budgets',await get('/ncc/shared-budgets'));
 const gr=await pool(c,4,x=>get('/ncc/adgroups?nccCampaignId='+x.nccCampaignId));if(gr.some(x=>!Array.isArray(x)))throw Error('Groups incomplete');const groups=gr.flat();save('groups',groups);
 const meta={customerId:441986,startedAt:new Date().toISOString(),campaigns:c.length,groups:groups.length};save('meta',meta);
 const file=path.join(D,'inventory.jsonl'),cache=new Map(fs.existsSync(file)?fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(l=>{const x=JSON.parse(l);return [x.gid,x]}):[]);
 const todo=groups.filter(g=>g.adgroupType==='WEB_SITE'&&!cache.has(g.nccAdgroupId));let done=0;
 const rr=await pool(todo,6,async g=>{const keywords=await get('/ncc/keywords?nccAdgroupId='+g.nccAdgroupId);if(!Array.isArray(keywords))throw Error('Invalid keywords');const x={gid:g.nccAdgroupId,keywords,at:new Date().toISOString()};fs.appendFileSync(file,JSON.stringify(x)+'\n');cache.set(x.gid,x);if(++done%250===0)console.log('collected groups',cache.size);return true;});if(rr.some(x=>x!==true))throw Error('Incomplete census '+JSON.stringify(rr.filter(x=>x!==true)));
 const inv=groups.filter(g=>g.adgroupType==='WEB_SITE').map(g=>cache.get(g.nccAdgroupId));save('inventory',inv);meta.completedAt=new Date().toISOString();meta.websiteGroups=inv.length;meta.keywordInstances=inv.reduce((s,x)=>s+x.keywords.length,0);save('meta',meta);console.log('COLLECTED',JSON.stringify(meta));
})().catch(e=>{save('error',{error:String(e),at:new Date().toISOString()});console.error(e);process.exitCode=1;});
