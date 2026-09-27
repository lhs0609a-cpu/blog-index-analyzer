// Read-only, bounded live verification; no ad mutation methods accepted.
const fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'../..'),OUT=path.join(ROOT,'reports/sojam-20260908/execution');
const CID='1858907',BASE='https://blog-index-analyzer.fly.dev';
fs.mkdirSync(OUT,{recursive:true});
const save=(n,x)=>fs.writeFileSync(path.join(OUT,n+'.json'),JSON.stringify(x));
const enc=x=>encodeURIComponent(JSON.stringify(x));let next=0;
async function raw(p){for(let t=0;t<3;t++){
 const at=Math.max(next,Date.now());next=at+300;await new Promise(r=>setTimeout(r,Math.max(0,at-Date.now())));
 try{const r=await fetch(BASE+'/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method:'GET',body:null,customer_id:CID}),signal:AbortSignal.timeout(30000)});
 if(r.status===429){next=Math.max(next,Date.now()+60000);continue;}
 const d=await r.json();if(!r.ok||!d.success)throw Error('API '+r.status);return d.response;
 }catch(e){if(t===2)throw Error(p.split('?')[0]+' '+e.name);}}
 throw Error('rate limited');}
async function pool(xs,n,fn){const out=[];let i=0,done=0;await Promise.all(Array.from({length:n},async()=>{while(i<xs.length){const j=i++;try{out[j]=await fn(xs[j])}catch(e){out[j]={error:String(e),input:typeof xs[j]==='string'?xs[j]:xs[j].nccCampaignId||xs[j].nccAdgroupId}}if(++done%50===0)console.log('progress',done,xs.length)}}));return out;}
(async()=>{
 const start=new Date().toISOString();const campaigns=await raw('/ncc/campaigns');if(!Array.isArray(campaigns))throw Error('campaign shape');save('campaigns',{fetchedAt:start,items:campaigns});
 const parts=await pool(campaigns.filter(c=>!c.delFlag),4,async c=>({cid:c.nccCampaignId,groups:await raw('/ncc/adgroups?nccCampaignId='+c.nccCampaignId)}));save('group_parts',parts);
 const groups=parts.flatMap(p=>Array.isArray(p.groups)?p.groups:[]).filter(g=>!g.delFlag);save('groups',groups);console.log('campaigns',campaigns.length,'groups',groups.length,'failed',parts.filter(p=>p.error).length);
 const scope=JSON.parse(fs.readFileSync(path.join(OUT,'scope.json')));const primary=['cmp-a001-01-000000002808841','cmp-a001-01-000000002783671'];
 const selected=groups.filter(g=>scope[g.nccAdgroupId]||primary.includes(g.nccCampaignId));save('selected_groups',selected);console.log('selected',selected.length);
 const details=await pool(selected,4,async g=>{
  const gid=g.nccAdgroupId;
  const keywords=await raw('/ncc/keywords?nccAdgroupId='+gid);
  const ads=await raw('/ncc/ads?nccAdgroupId='+gid);
  const record={gid,fetchedAt:new Date().toISOString(),keywords,ads};
  fs.appendFileSync(path.join(OUT,'details.parts.jsonl'),JSON.stringify(record)+'\n');return record;
 });save('details',details);
 const ids=details.flatMap(d=>(Array.isArray(d.keywords)?d.keywords:[]).map(k=>k.nccKeywordId));const chunks=[];for(let i=0;i<ids.length;i+=50)chunks.push(ids.slice(i,i+50));
 const stats=await pool(chunks,4,ids=>raw('/stats?ids='+encodeURIComponent(ids.join(','))+'&fields='+enc(['impCnt','clkCnt','salesAmt','avgRnk'])+'&timeRange='+enc({since:'2026-09-01',until:'2026-09-07'})+'&breakdown=pcMblTp'));save('stats_device',stats);
 save('manifest',{startedAt:start,finishedAt:new Date().toISOString(),campaigns:campaigns.length,groups:groups.length,selectedGroups:selected.length,groupErrors:parts.filter(x=>x.error).length,detailErrors:details.filter(x=>x.error).length,keywordIds:ids.length,statsChunks:stats.length,statsErrors:stats.filter(x=>x.error).length,adWrites:0});console.log('complete',ids.length,'keywords',stats.filter(x=>x.error).length,'stats errors');
})().catch(e=>{console.error(e.message);process.exit(1)});
