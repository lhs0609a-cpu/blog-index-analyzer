// 실적이 난 그룹을 먼저 찾고, 그 안의 키워드만 키워드 단위로 다시 받는다.
const fs=require('fs'),crypto=require('crypto');const D='reports/medilon_20260921/';
const C=JSON.parse(fs.readFileSync('_medilon_creds.json','utf8'));
const BASE='https://api.searchad.naver.com',CID=String(C.customer_id);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function hdr(m,uri){const ts=String(Date.now());return {'Content-Type':'application/json; charset=UTF-8','X-Timestamp':ts,'X-API-KEY':C.api_key,'X-Customer':CID,'X-Signature':crypto.createHmac('sha256',C.secret_key).update(ts+'.'+m+'.'+uri).digest('base64')};}
async function req(ep){for(let t=0;t<5;t++){try{const r=await fetch(BASE+ep,{headers:hdr('GET',ep.split('?')[0]),signal:AbortSignal.timeout(60000)});
  const x=await r.text();if(r.status===429||r.status>=500){await sleep(2000*(t+1));continue;}
  if(!r.ok)throw new Error(r.status+' '+x.slice(0,150));return JSON.parse(x);}catch(e){if(t===4)throw e;await sleep(1500*(t+1));}}}
const F='["impCnt","clkCnt","salesAmt"]';
const TR=encodeURIComponent(JSON.stringify({since:'2026-06-23',until:'2026-09-20'}));
async function batch(ids,file,label){
  const out={};let n=0;
  for(let i=0;i<ids.length;i+=100){
    const r=await req('/stats?ids='+ids.slice(i,i+100).join('&ids=')+'&fields='+encodeURIComponent(F)+'&timeRange='+TR);
    for(const d of (r.data||[]))if(+d.impCnt||+d.clkCnt||+d.salesAmt)out[d.id]=d;
    n+=Math.min(100,ids.length-i);
    if(n%2000<100)console.error(label,n,'/',ids.length,'실적있음',Object.keys(out).length);
    await sleep(120);
  }
  fs.writeFileSync(D+file,JSON.stringify(out));
  console.error(label,'완료 · 실적 있는 항목',Object.keys(out).length);
  return out;
}
(async()=>{
  const ag=fs.readFileSync(D+'adgroup.tsv','utf8').split(/\r?\n/).filter(Boolean).map(l=>l.split('\t'));
  const gs=await batch(ag.map(r=>r[1]),'adgroup_stats.json','[그룹]');
  const live=new Set(Object.keys(gs));
  const kw=JSON.parse(fs.readFileSync(D+'kwclass.json','utf8'));
  const ids=kw.filter(k=>live.has(k.gid)).map(k=>k.id);
  console.error('실적 그룹 소속 키워드',ids.length);
  await batch(ids,'keyword_stats.json','[키워드]');
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
