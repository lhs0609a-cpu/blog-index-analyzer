const fs=require('fs'),crypto=require('crypto');const D='reports/medilon_20260921/';
const C=JSON.parse(fs.readFileSync('_medilon_creds.json','utf8'));
const BASE='https://api.searchad.naver.com',CID=String(C.customer_id);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function hdr(m,uri){const ts=String(Date.now());return {'Content-Type':'application/json; charset=UTF-8','X-Timestamp':ts,'X-API-KEY':C.api_key,'X-Customer':CID,'X-Signature':crypto.createHmac('sha256',C.secret_key).update(ts+'.'+m+'.'+uri).digest('base64')};}
async function req(ep){for(let t=0;t<5;t++){try{const r=await fetch(BASE+ep,{headers:hdr('GET',ep.split('?')[0]),signal:AbortSignal.timeout(45000)});
  const x=await r.text();if(r.status===429||r.status>=500){await sleep(2500*(t+1));continue;}
  if(!r.ok)throw new Error(r.status+' '+x.slice(0,120));return JSON.parse(x);}catch(e){if(t===4)throw e;await sleep(1800*(t+1));}}}
const F=D+(process.env.OUTF||'volumes.json');
const list=JSON.parse(fs.readFileSync(D+process.env.INF,'utf8'));
const map=fs.existsSync(F)?JSON.parse(fs.readFileSync(F,'utf8')):{};
(async()=>{
  const todo=list.map(k=>k.replace(/\s/g,'')).filter(k=>!(k.toUpperCase() in map));
  const chunks=[];for(let i=0;i<todo.length;i+=5)chunks.push(todo.slice(i,i+5));
  console.error('볼륨 조회 청크',chunks.length);
  let i=0,done=0;
  await Promise.all(Array.from({length:3},async()=>{
    while(i<chunks.length){const c=chunks[i++];
      try{const r=await req('/keywordstool?hintKeywords='+encodeURIComponent(c.join(','))+'&showDetail=1');
        for(const x of (r.keywordList||[])){const k=x.relKeyword.replace(/\s/g,'');
          map[k]={pc:x.monthlyPcQcCnt,mo:x.monthlyMobileQcCnt,comp:x.compIdx,ad:x.plAvgDepth};}
      }catch(e){}
      if(++done%100===0){fs.writeFileSync(F,JSON.stringify(map));console.error('  ',done,'/',chunks.length,'수집',Object.keys(map).length);}
      await sleep(180);}}));
  fs.writeFileSync(F,JSON.stringify(map));
  console.error('완료 · 수집',Object.keys(map).length);
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
