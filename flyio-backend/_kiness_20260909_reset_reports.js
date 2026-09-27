const fs=require('fs'),path=require('path');const {req,sleep,pool}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_bidreset_20260909');fs.mkdirSync(D,{recursive:true});
const DAYS=['20260902','20260903','20260904','20260905','20260906','20260907','20260908'];
(async()=>{
 const out=await pool(DAYS,3,async statDt=>{
  const jf=path.join(D,'job_AD_'+statDt+'.json');
  let job=fs.existsSync(jf)?JSON.parse(fs.readFileSync(jf,'utf8')):await req('POST','/stat-reports',{reportTp:'AD',statDt},441986,3);
  if(!job?.reportJobId)throw Error('No job '+statDt+' '+JSON.stringify(job));
  fs.writeFileSync(jf,JSON.stringify(job));
  for(let i=0;i<60;i++){job=await req('GET','/stat-reports/'+job.reportJobId,null,441986,4);fs.writeFileSync(jf,JSON.stringify(job));
   if(job.status==='BUILT'||job.status==='NONE')break;if(job.status==='ERROR')throw Error('Report failed '+statDt);await sleep(2000);}
  if(job.status!=='BUILT')return {statDt,status:job.status};
  const u=new URL(job.downloadUrl);if(u.hostname!=='api.searchad.naver.com')throw Error('Unexpected host');
  const content=await req('GET',u.pathname+u.search,null,441986,4);if(typeof content!=='string')throw Error('Expected TSV '+statDt);
  fs.writeFileSync(path.join(D,'AD_'+statDt+'.tsv'),content);
  return {statDt,status:'BUILT',lines:content.split('\n').filter(Boolean).length};
 });
 fs.writeFileSync(path.join(D,'stat_report_jobs.json'),JSON.stringify(out,null,1));
 console.log(JSON.stringify(out));
})().catch(e=>{console.error(e);process.exitCode=1;});
