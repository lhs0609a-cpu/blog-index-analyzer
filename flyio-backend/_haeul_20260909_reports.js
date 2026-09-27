const fs=require('fs'),path=require('path');
const D=path.join(__dirname,'reports','haeul_intent_20260909'),CID=3442423;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function call(method,p,body=null){for(let t=0;t<3;t++){try{const r=await fetch('https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method,path:p,body,customer_id:String(CID)}),signal:AbortSignal.timeout(45000)});const d=await r.json();if(!r.ok||!d.success)throw Error('API '+r.status+' '+JSON.stringify(d).slice(0,200));return d.response;}catch(e){if(t===2)throw e;await sleep(2000);}}}
const save=(n,x)=>fs.writeFileSync(path.join(D,n+'.json'),JSON.stringify(x));
async function download(url){const u=new URL(url);if(u.hostname!=='api.searchad.naver.com')throw Error('Unexpected host');const r=await fetch(u,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('Direct download HTTP '+r.status);return await r.text();}
(async()=>{
 let job=fs.existsSync(path.join(D,'master_job.json'))?JSON.parse(fs.readFileSync(path.join(D,'master_job.json'))):await call('POST','/master-reports',{item:'Keyword'});save('master_job',job);console.log('MASTER',job.id,job.status);
 for(let i=0;i<40;i++){job=await call('GET','/master-reports/'+job.id);save('master_job',job);if(job.status==='BUILT'||job.status==='ERROR')break;await sleep(2000);}
 if(job.downloadUrl){try{const r=await download(job.downloadUrl);fs.writeFileSync(path.join(D,'master.tsv'),r);console.log('MASTER rows',r.split('\n').length,'sample',r.split('\n')[0].slice(0,500));}catch(e){console.log('MASTER download',String(e));}}
 for(let day=1;day<=8;day++){const statDt='202609'+String(day).padStart(2,'0');let j=await call('POST','/stat-reports',{reportTp:'EXPKEYWORD',statDt});save('search_job_'+statDt,j);for(let i=0;i<40;i++){j=await call('GET','/stat-reports/'+j.reportJobId);if(j.status==='BUILT'||j.status==='NONE'||j.status==='ERROR')break;await sleep(1500);}save('search_job_'+statDt,j);if(j.status==='BUILT'){const r=await download(j.downloadUrl);fs.writeFileSync(path.join(D,'search_'+statDt+'.tsv'),r);console.log('SEARCH',statDt,'rows',r.split('\n').length,'sample',r.split('\n')[0].slice(0,450));}else console.log('SEARCH',statDt,j.status);}
})().catch(e=>{console.error(String(e));process.exitCode=1;});
