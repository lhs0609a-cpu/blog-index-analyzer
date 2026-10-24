const fs=require('fs'),path=require('path');
const P=n=>path.join(__dirname,n), CID='1858907';
const save=(n,d)=>fs.writeFileSync(P('_sojam_0908_'+n+'.json'),JSON.stringify(d));
let next=0;
async function raw(p){for(let t=0;t<4;t++){try{
 const at=Math.max(Date.now(),next);next=at+250;await new Promise(r=>setTimeout(r,Math.max(0,at-Date.now())));
 const r=await fetch('https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method:'GET',body:null,customer_id:CID}),signal:AbortSignal.timeout(45000)});
 if(r.status===429){next=Math.max(next,Date.now()+60000);continue;}
 const d=await r.json();if(!r.ok||!d.success)throw Error('API read failed '+r.status+' '+JSON.stringify(d).slice(0,120));return d.response;
 }catch(e){if(t===3)throw Error('Read failed: '+p.split('?')[0]+' '+e.name);}}throw Error('Rate limit retry exhausted');}
async function pool(a,n,fn){let i=0,done=0;const out=[];await Promise.all(Array.from({length:n},async()=>{while(i<a.length){const j=i++;try{out[j]=await fn(a[j]);}catch(e){out[j]={error:String(e),input:a[j].nccAdgroupId||a[j]};}if(++done%500===0)console.log('progress',done,a.length);}}));return out;}
const enc=x=>encodeURIComponent(JSON.stringify(x));
(async()=>{
 if(process.argv.includes('--probe')){const r=await fetch('https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:'/ncc/adgroups?nccCampaignId=cmp-a001-01-000000002808841',method:'GET',body:null,customer_id:CID}),signal:AbortSignal.timeout(20000)});const d=await r.json();console.log('probe',r.status,d.success,Array.isArray(d.response)?d.response.length:d.detail||d.error);if(d.success)save('probe_groups',d.response);return;}
 const camps=JSON.parse(fs.readFileSync(P('_sojam_0908_campaigns.json'),'utf8')).response.filter(c=>!c.delFlag);
 const groupParts=await pool(camps,8,c=>raw('/ncc/adgroups?nccCampaignId='+c.nccCampaignId));save('group_parts',groupParts);if(groupParts.some(x=>!Array.isArray(x)))throw Error('incomplete group fetch');
 let groups=[...new Map(groupParts.flat().filter(g=>!g.delFlag).map(g=>[g.nccAdgroupId,g])).values()];save('groups',groups);
 console.log('campaigns',camps.length,'groups',groups.length,'group sample',JSON.stringify(groups[0]));
 const periods={aug:['2026-08-01','2026-08-31'],sep:['2026-09-01','2026-09-07']};const cs={};
 for(const [n,[since,until]]of Object.entries(periods)){
 const chunks=[];for(let i=0;i<camps.length;i+=30)chunks.push(camps.slice(i,i+30).map(c=>c.nccCampaignId));
 cs[n]=await pool(chunks,3,ids=>raw('/stats?ids='+encodeURIComponent(ids.join(','))+'&fields='+enc(['impCnt','clkCnt','salesAmt','avgRnk'])+'&timeRange='+enc({since,until})));
 }save('campaign_stats',cs);
 const rows=await pool(groups,12,async g=>{const k=await raw('/ncc/keywords?nccAdgroupId='+g.nccAdgroupId);if(!Array.isArray(k))throw Error('keywords not array');return {gid:g.nccAdgroupId,fetchedAt:new Date().toISOString(),kws:k.filter(x=>!x.delFlag)};});save('keywords',rows);
 console.log('keywords complete',rows.reduce((s,x)=>s+(x.kws||[]).length,0),'failed groups',rows.filter(x=>x.error).length);
 const active=groups.filter(g=>!g.userLock&&camps.some(c=>c.nccCampaignId===g.nccCampaignId&&!c.userLock));
 const ads=await pool(active,10,async g=>({gid:g.nccAdgroupId,ads:await raw('/ncc/ads?nccAdgroupId='+g.nccAdgroupId)}));save('ads',ads);console.log('ads complete',ads.length);
 const ids=rows.flatMap(r=>(r.kws||[]).map(k=>k.nccKeywordId));const chunks=[];for(let i=0;i<ids.length;i+=50)chunks.push(ids.slice(i,i+50));
 const stats=await pool(chunks,10,ids=>raw('/stats?ids='+encodeURIComponent(ids.join(','))+'&fields='+enc(['impCnt','clkCnt','salesAmt','avgRnk'])+'&timeRange='+enc({since:'2026-09-01',until:'2026-09-07'})+'&breakdown=pcMblTp'));save('keyword_stats_device',stats);
 console.log('DONE stats chunks',stats.length,'errors',stats.filter(s=>s.error).length);
})().catch(e=>{console.error(e);process.exit(1)});
