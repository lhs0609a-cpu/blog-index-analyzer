// Today-only entry point. The existing monitor records signed-API results to JSON.
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
if(today==='2026-09-09'){
 process.chdir(__dirname);
 if(!process.argv.includes('--apply'))process.argv.push('--apply');
 require('./_kiness_20260908_monitor');
 const fs=require('fs'),path=require('path'),{req}=require('./_sojam_naver');
 const auditDir=path.join(__dirname,'reports/kiness_budget450_delivery_20260909');
 const created=path.join(auditDir,'content_restore_created.json');
 if(fs.existsSync(created))(async()=>{
  const ids=JSON.parse(fs.readFileSync(created,'utf8')),rows=[];
  for(const a of ids){const data=await req('GET','/ncc/ads?nccAdgroupId='+a.nccAdgroupId,null,441986);if(!Array.isArray(data))throw Error('Content review query failed');const live=data.find(x=>x.nccAdId===a.nccAdId);if(!live)throw Error('Content creative missing');rows.push({id:live.nccAdId,gid:live.nccAdgroupId,status:live.status,statusReason:live.statusReason,inspectStatus:live.inspectStatus});}
  fs.writeFileSync(path.join(auditDir,'content_review_latest.json'),JSON.stringify({at:new Date().toISOString(),rows}));
 })().catch(e=>{fs.writeFileSync(path.join(auditDir,'content_review_error.json'),JSON.stringify({at:new Date().toISOString(),error:String(e)}));process.exitCode=1;});
}
