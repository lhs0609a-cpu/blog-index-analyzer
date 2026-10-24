const fs=require('fs'),path=require('path');const {req,sleep,pool}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_bidreset_20260909');
const DAYS=['20260904','20260905','20260906','20260907','20260908'];
(async()=>{
 const out=await pool(DAYS,3,async statDt=>{
  const jf=path.join(D,'job_EXP_'+statDt+'.json');
  let job=fs.existsSync(jf)?JSON.parse(fs.readFileSync(jf,'utf8')):await req('POST','/stat-reports',{reportTp:'EXPKEYWORD',statDt},441986,3);
  if(!job?.reportJobId)throw Error('No job '+statDt);fs.writeFileSync(jf,JSON.stringify(job));
  for(let i=0;i<60;i++){job=await req('GET','/stat-reports/'+job.reportJobId,null,441986,4);fs.writeFileSync(jf,JSON.stringify(job));
   if(job.status==='BUILT'||job.status==='NONE')break;if(job.status==='ERROR')throw Error('fail '+statDt);await sleep(2000);}
  if(job.status!=='BUILT')return {statDt,status:job.status};
  const u=new URL(job.downloadUrl);if(u.hostname!=='api.searchad.naver.com')throw Error('host');
  const c=await req('GET',u.pathname+u.search,null,441986,4);if(typeof c!=='string')throw Error('tsv');
  fs.writeFileSync(path.join(D,'EXP_'+statDt+'.tsv'),c);return {statDt,status:'BUILT',lines:c.split('\n').filter(Boolean).length};
 });
 console.log(JSON.stringify(out));
})().catch(e=>{console.error(e);process.exitCode=1;});
