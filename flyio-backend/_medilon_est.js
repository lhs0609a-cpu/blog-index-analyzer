const fs=require('fs'),crypto=require('crypto');const D='reports/medilon_20260921/';
const C=JSON.parse(fs.readFileSync('_medilon_creds.json','utf8'));
const BASE='https://api.searchad.naver.com',CID=String(C.customer_id);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function hdr(m,uri){const ts=String(Date.now());return {'Content-Type':'application/json; charset=UTF-8','X-Timestamp':ts,'X-API-KEY':C.api_key,'X-Customer':CID,'X-Signature':crypto.createHmac('sha256',C.secret_key).update(ts+'.'+m+'.'+uri).digest('base64')};}
async function req(m,ep,b){for(let t=0;t<4;t++){try{const r=await fetch(BASE+ep,{method:m,headers:hdr(m,ep),body:JSON.stringify(b),signal:AbortSignal.timeout(45000)});
  const x=await r.text();if(r.status===429||r.status>=500){await sleep(2500*(t+1));continue;}
  if(!r.ok)throw new Error(r.status+' '+x.slice(0,150));return JSON.parse(x);}catch(e){if(t===3)throw e;await sleep(1500*(t+1));}}}
(async()=>{
  const list=JSON.parse(fs.readFileSync(D+'estlist.json','utf8'));
  const F=D+'estimates.json';const est=fs.existsSync(F)?JSON.parse(fs.readFileSync(F,'utf8')):{};
  for(const dev of ['PC','MOBILE'])for(const pos of [1,3]){
    const todo=list.filter(k=>est[dev+'|'+pos+'|'+k]===undefined);
    for(let i=0;i<todo.length;i+=100){
      try{const r=await req('POST','/estimate/average-position-bid/keyword',{device:dev,items:todo.slice(i,i+100).map(k=>({key:k,position:pos}))});
        for(const e of (r&&r.estimate)||[])est[dev+'|'+pos+'|'+e.keyword]=e.bid;
      }catch(e){console.error('fail',dev,pos,i,String(e.message).slice(0,80));}
      await sleep(250);
    }
    for(const k of todo)if(est[dev+'|'+pos+'|'+k]===undefined)est[dev+'|'+pos+'|'+k]=null;
    fs.writeFileSync(F,JSON.stringify(est));console.error(dev,pos,'완료',todo.length);
  }
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
