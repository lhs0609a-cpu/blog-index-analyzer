const fs=require('fs'),path=require('path');const {req,sleep}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_20260921');const CID=441986;
(async()=>{
 const camps=JSON.parse(fs.readFileSync(path.join(D,'campaigns.json')));
 // 오늘 소진
 let tot={c:0,k:0,i:0};
 for(let i=0;i<camps.length;i+=50){
  const r=await req('GET','/stats?ids='+encodeURIComponent(camps.slice(i,i+50).map(c=>c.nccCampaignId).join(','))+'&fields='+encodeURIComponent(JSON.stringify(['salesAmt','clkCnt','impCnt']))+'&timeRange='+encodeURIComponent(JSON.stringify({since:'2026-09-21',until:'2026-09-21'})),null,CID,4);
  for(const x of r.data||[]){tot.c+=x.salesAmt||0;tot.k+=x.clkCnt||0;tot.i+=x.impCnt||0;}
 }
 console.log('오늘(09-21) 현재까지',tot.c+'원',tot.k+'클릭',tot.i+'노출','/ 예산 200,000 =',(tot.c/2000).toFixed(1)+'%');
 // 지난 4일 시간대별 소진 패턴 (STANDARD 전환 효과)
 for(const day of ['20260917','20260918','20260919','20260920']){
  const f=path.join(D,'days','AD_DETAIL_'+day+'.tsv');
  if(!fs.existsSync(f)){
   fs.mkdirSync(path.join(D,'days'),{recursive:true});
   let job=await req('POST','/stat-reports',{reportTp:'AD_DETAIL',statDt:day},CID,3);
   if(!job?.reportJobId){console.log(day,'no job');continue;}
   for(let i=0;i<60;i++){job=await req('GET','/stat-reports/'+job.reportJobId,null,CID,4);if(job.status==='BUILT'||job.status==='NONE'||job.status==='ERROR')break;await sleep(2000);}
   if(job.status!=='BUILT'){console.log(day,job.status);continue;}
   const u=new URL(job.downloadUrl);fs.writeFileSync(f,await req('GET',u.pathname+u.search,null,CID,4));
  }
  const hr={};let sum=0;
  for(const l of fs.readFileSync(f,'utf8').split('\n')){if(!l.trim())continue;const g=l.split('\t');hr[+g[7]]=(hr[+g[7]]||0)+(+g[13]);sum+=+g[13];}
  let cum=0,hit=null,h50=null;
  for(let h=0;h<24;h++){cum+=hr[h]||0;if(!h50&&cum>=sum*0.5)h50=h;if(!hit&&cum>=190000)hit=h;}
  console.log(day,'총'+sum+'원','50%도달 '+h50+'시','19만도달',hit===null?'없음(끝까지 살아있음)':hit+'시');
 }
})().catch(e=>{console.error(e);process.exitCode=1});
