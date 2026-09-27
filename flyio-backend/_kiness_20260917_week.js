const fs=require('fs'),path=require('path');const {req,sleep}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_20260917','days');fs.mkdirSync(D,{recursive:true});const CID=441986;
(async()=>{
 for(const day of ['20260910','20260911','20260912','20260913','20260914','20260915']){
  const f=path.join(D,'AD_DETAIL_'+day+'.tsv');if(fs.existsSync(f))continue;
  let job=await req('POST','/stat-reports',{reportTp:'AD_DETAIL',statDt:day},CID,3);
  if(!job?.reportJobId){console.log(day,'no job');continue;}
  for(let i=0;i<60;i++){job=await req('GET','/stat-reports/'+job.reportJobId,null,CID,4);if(job.status==='BUILT'||job.status==='NONE')break;if(job.status==='ERROR')break;await sleep(2000);}
  if(job.status!=='BUILT'){console.log(day,job.status);continue;}
  const u=new URL(job.downloadUrl);const c=await req('GET',u.pathname+u.search,null,CID,4);
  fs.writeFileSync(f,c);console.log(day,'ok',String(c).length);
 }
})().catch(e=>{console.error(e);process.exitCode=1});
