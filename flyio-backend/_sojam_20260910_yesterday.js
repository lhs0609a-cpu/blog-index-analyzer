const fs=require('fs'),path=require('path');
const {req,sleep}=require('./_sojam_naver');
const CID=1858907, DATE='20260909', ISO='2026-09-09';
const D=path.join(__dirname,'reports','sojam_yesterday_'+DATE);
fs.mkdirSync(D,{recursive:true});
const save=(n,o)=>fs.writeFileSync(path.join(D,n+'.json'),JSON.stringify(o));

async function statReport(type){
  const jf=path.join(D,'job_'+type+'.json');
  let job=fs.existsSync(jf)?JSON.parse(fs.readFileSync(jf)):await req('POST','/stat-reports',{reportTp:type,statDt:DATE},CID,3);
  if(!job?.reportJobId) throw Error('no job '+type+' '+JSON.stringify(job));
  fs.writeFileSync(jf,JSON.stringify(job));
  for(let i=0;i<60;i++){
    job=await req('GET','/stat-reports/'+job.reportJobId,null,CID,4);
    fs.writeFileSync(jf,JSON.stringify(job));
    if(job.status==='BUILT'||job.status==='NONE')break;
    if(job.status==='ERROR')throw Error('report error '+type);
    await sleep(2000);
  }
  if(job.status!=='BUILT'){console.log(type,'status',job.status);return null;}
  const u=new URL(job.downloadUrl);
  if(u.hostname!=='api.searchad.naver.com')throw Error('bad host');
  const c=await req('GET',u.pathname+u.search,null,CID,4);
  if(typeof c!=='string')throw Error('expected tsv');
  fs.writeFileSync(path.join(D,type+'.tsv'),c);
  console.log(type,'chars',c.length);
  return c;
}
async function masterReport(item){
  const jf=path.join(D,'mjob_'+item+'.json');
  let job=fs.existsSync(jf)?JSON.parse(fs.readFileSync(jf)):await req('POST','/master-reports',{item},CID,3);
  if(!job?.id)throw Error('no master job '+JSON.stringify(job));
  fs.writeFileSync(jf,JSON.stringify(job));
  for(let i=0;i<60;i++){
    job=await req('GET','/master-reports/'+job.id,null,CID,4);
    fs.writeFileSync(jf,JSON.stringify(job));
    if(job.status==='BUILT'||job.status==='ERROR'||job.status==='NONE')break;
    await sleep(2000);
  }
  if(job.status!=='BUILT'){console.log('master',item,job.status);return null;}
  const u=new URL(job.downloadUrl);
  const c=await req('GET',u.pathname+u.search,null,CID,4);
  fs.writeFileSync(path.join(D,'master_'+item+'.tsv'),c);
  console.log('master',item,'chars',c.length);
  return c;
}
(async()=>{
  // 1) 캠페인 단위 /stats 로 어제 총계 (정답지)
  const campaigns=await req('GET','/ncc/campaigns?recordSize=1000',null,CID,4);
  if(!Array.isArray(campaigns)||campaigns.length>=1000)throw Error('campaign pagination');
  save('campaigns',campaigns);
  const enc=x=>encodeURIComponent(JSON.stringify(x));
  const rows=[];
  for(let i=0;i<campaigns.length;i+=50){
    const ids=campaigns.slice(i,i+50).map(c=>c.nccCampaignId).join(',');
    const r=await req('GET','/stats?ids='+encodeURIComponent(ids)+'&fields='+enc(['impCnt','clkCnt','salesAmt'])+'&timeRange='+enc({since:ISO,until:ISO}),null,CID,4);
    rows.push(...(r.data||[]));
  }
  save('campaign_stats',rows);
  const tot=rows.reduce((a,r)=>({imp:a.imp+ +(r.impCnt||0),clk:a.clk+ +(r.clkCnt||0),cost:a.cost+ +(r.salesAmt||0)}),{imp:0,clk:0,cost:0});
  console.log('TOTAL',JSON.stringify(tot));
  // 2) 리포트
  await statReport('AD_DETAIL');
  await statReport('EXPKEYWORD');
  await masterReport('Keyword');
  await masterReport('Campaign');
  await masterReport('Adgroup');
  console.log('DONE',D);
})().catch(e=>{console.error(e);process.exitCode=1;});
