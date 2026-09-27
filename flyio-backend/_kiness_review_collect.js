// Read-only inventory and actual expenditure census. Does not call mutation endpoints.
const fs=require('fs'),path=require('path');const {req,pool}=require('./_sojam_naver');
const DIR=path.join(__dirname,'reports','kiness_review_20260908');fs.mkdirSync(DIR,{recursive:true});
const P=n=>path.join(DIR,n+'.json'),save=(n,x)=>fs.writeFileSync(P(n),JSON.stringify(x));
const get=async p=>{const r=await req('GET',p,null,441986,5);if(r===undefined)throw Error('No response '+p);return r;};
const chunks=(a,n)=>Array.from({length:Math.ceil(a.length/n)},(_,i)=>a.slice(i*n,i*n+n));
async function stats(ids,since,until){const rs=await pool(chunks(ids,50),3,c=>get('/stats?ids='+encodeURIComponent(c.join(','))+'&fields='+encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt','ccnt','avgRnk']))+'&timeRange='+encodeURIComponent(JSON.stringify({since,until}))));if(rs.some(r=>!Array.isArray(r.data)))throw Error('Stats request failure '+JSON.stringify(rs.filter(r=>!Array.isArray(r.data)).slice(0,2)));return rs.flatMap(r=>r.data);}
(async()=>{
 const now=new Date(),today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const shift=n=>{const x=new Date(today+'T00:00:00+09:00');x.setUTCDate(x.getUTCDate()+n);return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(x);};
 const windows={month:[shift(-30),shift(-1)],week:[shift(-7),shift(-1)],today:[today,today]};
 const c=await get('/ncc/campaigns');save('campaigns',c);save('shared_budgets',await get('/ncc/shared-budgets'));
 const gr=await pool(c,3,c=>get('/ncc/adgroups?nccCampaignId='+c.nccCampaignId));if(gr.some(x=>!Array.isArray(x)))throw Error('Incomplete groups');
 const g=gr.flat();save('groups',g);save('meta',{customerId:441986,startedAt:now.toISOString(),today,windows,campaigns:c.length,groups:g.length});console.log('snapshot',c.length,'campaigns',g.length,'groups',windows);
 const parts=path.join(DIR,'inventory.jsonl'),cache=new Map(fs.existsSync(parts)?fs.readFileSync(parts,'utf8').trim().split('\n').filter(Boolean).map(x=>{const r=JSON.parse(x);return[r.gid,r]}):[]);
 let done=0;const results=await pool(g.filter(x=>!cache.has(x.nccAdgroupId)),4,async x=>{
  const k=await get('/ncc/keywords?nccAdgroupId='+x.nccAdgroupId);if(!Array.isArray(k))throw Error('Invalid keywords');
  const ads=k.length?await get('/ncc/ads?nccAdgroupId='+x.nccAdgroupId):[];if(!Array.isArray(ads))throw Error('Invalid ads');
  const row={gid:x.nccAdgroupId,keywords:k,ads,collectedAt:new Date().toISOString()};fs.appendFileSync(parts,JSON.stringify(row)+'\n');cache.set(x.nccAdgroupId,row);if(++done%250===0)console.log('inventory groups',cache.size,'/',g.length);return row;
 });if(results.some(x=>x.__err))throw Error('Inventory failures '+JSON.stringify(results.filter(x=>x.__err)));
 const inventory=g.map(x=>cache.get(x.nccAdgroupId));save('inventory',inventory);
 console.log('complete inventory',inventory.reduce((s,x)=>s+x.keywords.length,0));
 const webGroups=new Set(g.filter(x=>x.adgroupType==='WEB_SITE').map(x=>x.nccAdgroupId));
 for(const [label,[s,u]] of Object.entries(windows)){
  save('campaign_'+label,await stats(c.map(c=>c.nccCampaignId),s,u));
  const gs=await stats(g.map(g=>g.nccAdgroupId),s,u);save('group_'+label,gs);
  const active=new Set(gs.filter(x=>x.impCnt>0||x.salesAmt>0||x.ccnt>0).map(x=>x.id));
  const eligible=inventory.filter(x=>webGroups.has(x.gid)&&active.has(x.gid));
  const file=path.join(DIR,'keyword_'+label+'.jsonl'),cached=new Map(fs.existsSync(file)?fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(x=>{const r=JSON.parse(x);return[r.gid,r]}):[]);
  let count=0;const rr=await pool(eligible.filter(x=>!cached.has(x.gid)),3,async x=>{const data=await stats(x.keywords.map(k=>k.nccKeywordId),s,u);const r={gid:x.gid,queried:x.keywords.length,data:data.filter(k=>k.impCnt>0||k.salesAmt>0||k.ccnt>0)};cached.set(x.gid,r);fs.appendFileSync(file,JSON.stringify(r)+'\n');if(++count%50===0)console.log(label,'stats groups',cached.size,'/',eligible.length);return r;});
  if(rr.some(x=>x.__err))throw Error('Keyword stats failures '+JSON.stringify(rr.filter(x=>x.__err).slice(0,2)));
  save('keyword_'+label,{since:s,until:u,data:[...cached.values()].flatMap(x=>x.data),queriedGroups:eligible.map(x=>x.gid),zeroGroups:gs.filter(x=>webGroups.has(x.id)&&!active.has(x.id)).map(x=>x.id),queriedIds:eligible.flatMap(x=>x.keywords.map(k=>k.nccKeywordId))});
  console.log('stats complete',label,'with activity',[...cached.values()].reduce((s,x)=>s+x.data.length,0));
 }
 const daily={};for(let i=7;i>=0;i--){const d=shift(-i);daily[d]=await stats(c.map(c=>c.nccCampaignId),d,d);}save('daily',daily);
 const meta=JSON.parse(fs.readFileSync(P('meta')));meta.completedAt=new Date().toISOString();save('meta',meta);console.log('READ ONLY CENSUS COMPLETE',DIR);
})().catch(e=>{save('error',{at:new Date().toISOString(),error:String(e)});console.error(e);process.exitCode=1});
