const fs=require('fs'),path=require('path');const {req,pool,sleep}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_20260917');fs.mkdirSync(D,{recursive:true});
const CID=441986, DAY='20260916', SINCE='2026-09-16', UNTIL='2026-09-16';
const save=(n,v)=>fs.writeFileSync(path.join(D,n+'.json'),JSON.stringify(v));
const call=async p=>{const r=await req('GET',p,null,CID,4);if(r===undefined)throw Error('Missing '+p);return r;};
(async()=>{
 // 1) campaign level stats for yesterday
 const camps=await call('/ncc/campaigns');save('campaigns',camps);
 const data=[];
 for(let i=0;i<camps.length;i+=50){
  const r=await call('/stats?ids='+encodeURIComponent(camps.slice(i,i+50).map(c=>c.nccCampaignId).join(','))+'&fields='+encodeURIComponent(JSON.stringify(['salesAmt','clkCnt','impCnt','ccnt']))+'&timeRange='+encodeURIComponent(JSON.stringify({since:SINCE,until:UNTIL})));
  if(!Array.isArray(r.data))throw Error('Stats missing');data.push(...r.data);
 }
 const cm=new Map(camps.map(c=>[c.nccCampaignId,c]));
 const rows=data.map(x=>({id:x.id,name:cm.get(x.id)?.name,type:cm.get(x.id)?.campaignTp,cost:x.salesAmt||0,clicks:x.clkCnt||0,imps:x.impCnt||0})).filter(x=>x.cost>0||x.clicks>0||x.imps>0).sort((a,b)=>b.cost-a.cost);
 const tot=rows.reduce((a,x)=>({cost:a.cost+x.cost,clicks:a.clicks+x.clicks,imps:a.imps+x.imps}),{cost:0,clicks:0,imps:0});
 save('campaign_day',{day:DAY,total:tot,rows});
 console.log('DAY',DAY,JSON.stringify(tot));
 console.log(rows.slice(0,25).map(r=>`${r.cost}\t${r.clicks}\t${r.imps}\t${r.type}\t${r.name}`).join('\n'));
 // 2) stat reports
 for(const type of ['AD_DETAIL','EXPKEYWORD']){
  let job=await req('POST','/stat-reports',{reportTp:type,statDt:DAY},CID,3);
  if(!job?.reportJobId){console.log(type,'no job',JSON.stringify(job));continue;}
  for(let i=0;i<45;i++){job=await req('GET','/stat-reports/'+job.reportJobId,null,CID,4);if(job.status==='BUILT'||job.status==='NONE')break;if(job.status==='ERROR')throw Error('Report failed '+type);await sleep(2000);}
  if(job.status!=='BUILT'){console.log(type,'status',job.status);continue;}
  const u=new URL(job.downloadUrl);if(u.hostname!=='api.searchad.naver.com')throw Error('bad host');
  const content=await req('GET',u.pathname+u.search,null,CID,4);
  fs.writeFileSync(path.join(D,type+'.tsv'),content);
  console.log(type,'chars',String(content).length);
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
