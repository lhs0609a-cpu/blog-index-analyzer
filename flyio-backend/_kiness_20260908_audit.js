const fs=require('fs'),path=require('path');
const {req,pool}=require('./_sojam_naver');
const P=n=>path.join(__dirname,'_kiness_20260908_'+n+'.json');
const save=(n,x)=>fs.writeFileSync(P(n),JSON.stringify(x));
const E=encodeURIComponent,CID=441986;
const get=p=>req('GET',p,null,CID);
async function stats(ids,since,until,extra=''){
 const chunks=[];for(let i=0;i<ids.length;i+=50)chunks.push(ids.slice(i,i+50));
 const results=await pool(chunks,3,c=>get('/stats?ids='+E(c.join(','))+'&fields='+E(JSON.stringify(['impCnt','clkCnt','salesAmt','ccnt','convAmt','avgRnk']))+'&timeRange='+E(JSON.stringify({since,until}))+extra));
 if(results.some(x=>!x||x.__err))throw Error('Incomplete stats: '+JSON.stringify(results.filter(x=>!x||x.__err)));
 return results.flatMap(x=>x.data||[]);
}
(async()=>{
 const camps=await get('/ncc/campaigns');save('campaigns',camps);
 const gr=await pool(camps,3,c=>get('/ncc/adgroups?nccCampaignId='+c.nccCampaignId));
 if(gr.some(x=>!Array.isArray(x)))throw Error('Group fetch failed');
 const groups=[...new Map(gr.flat().map(g=>[g.nccAdgroupId,g])).values()];save('groups',groups);
 console.log('campaigns',camps.length,'groups',groups.length);
 for(const [label,s,u] of [['week','2026-09-01','2026-09-07'],['month','2026-08-09','2026-09-07']]){
  if(fs.existsSync(P('group_'+label)))continue;
  const cs=await stats(camps.map(c=>c.nccCampaignId),s,u);save('campaign_'+label,cs);
  const gs=await stats(groups.map(g=>g.nccAdgroupId),s,u);save('group_'+label,gs);
  console.log(label,cs.reduce((a,x)=>({spend:a.spend+x.salesAmt,clicks:a.clicks+x.clkCnt,conversions:a.conversions+x.ccnt}),{spend:0,clicks:0,conversions:0}));
 }
 const daily={};for(let d=1;d<=8;d++){const date='2026-09-'+String(d).padStart(2,'0');daily[date]=await stats(camps.map(c=>c.nccCampaignId),date,date);}save('daily',daily);
 let done=0;const dump=await pool(groups,4,async g=>{
  const keywords=await get('/ncc/keywords?nccAdgroupId='+g.nccAdgroupId);
  const ads=await get('/ncc/ads?nccAdgroupId='+g.nccAdgroupId);
  if(!Array.isArray(keywords)||!Array.isArray(ads))throw Error('Bad group response');
  const x={gid:g.nccAdgroupId,keywords,ads};
  fs.appendFileSync(path.join(__dirname,'_kiness_20260908_parts.jsonl'),JSON.stringify(x)+'\n');
  if(++done%100===0)console.log('groups collected',done,'/',groups.length);
  return x;
 });save('inventory',dump);
 console.log('inventory',dump.length,'errors',dump.filter(x=>x.__err).length,'keywords',dump.reduce((s,x)=>s+(x.keywords||[]).length,0));
})().catch(e=>{console.error(e);process.exitCode=1});
module.exports={stats};
