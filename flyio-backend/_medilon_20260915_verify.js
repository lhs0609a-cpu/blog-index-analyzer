// 스크립트 카운터는 믿지 않는다. 마스터리포트로 라이브 상태를 다시 받아 대조한다.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const C=JSON.parse(fs.readFileSync(path.join(__dirname,'_medilon_creds.json'),'utf8'));
const BASE='https://api.searchad.naver.com',CID=String(C.customer_id);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function hdr(m,uri){const ts=String(Date.now());
  return {'Content-Type':'application/json; charset=UTF-8','X-Timestamp':ts,'X-API-KEY':C.api_key,'X-Customer':CID,
    'X-Signature':crypto.createHmac('sha256',C.secret_key).update(`${ts}.${m}.${uri}`).digest('base64')};}
async function req(m,ep,b){const r=await fetch(BASE+ep,{method:m,headers:hdr(m,ep.split('?')[0]),
  body:b==null?undefined:JSON.stringify(b),signal:AbortSignal.timeout(60000)});
  const t=await r.text();if(!r.ok)throw new Error(`HTTP ${r.status} ${t.slice(0,200)}`);
  try{return JSON.parse(t)}catch(e){return t}}
(async()=>{
  for(const r of (await req('GET','/master-reports')||[]))
    if(r.item==='Keyword'){try{await req('DELETE','/master-reports/'+r.id)}catch(e){}}
  const job=await req('POST','/master-reports',{item:'Keyword'});
  let s;for(let i=0;i<60;i++){await sleep(3000);s=await req('GET','/master-reports/'+job.id);
    if(s.status==='BUILT'||s.status==='NONE')break;}
  if(!s.downloadUrl){console.log('리포트 없음',s.status);return;}
  const u=new URL(s.downloadUrl),ts=String(Date.now());
  const rr=await fetch(s.downloadUrl,{headers:{'X-Timestamp':ts,'X-API-KEY':C.api_key,'X-Customer':CID,
    'X-Signature':crypto.createHmac('sha256',C.secret_key).update(`${ts}.GET.${u.pathname}`).digest('base64')},
    signal:AbortSignal.timeout(180000)});
  const txt=await rr.text();
  const rows=txt.split(/\r?\n/).filter(Boolean).map(l=>l.split('\t'));
  const live=new Set(rows.map(r=>r[3].toLowerCase()));   // 라틴 문자는 대문자로 저장되므로 소문자 비교
  console.log('라이브 키워드 총계',rows.length,'/ 한도 100,000');
  const add=JSON.parse(fs.readFileSync(path.join(__dirname,'_medilon_20260915_add.json'),'utf8'));
  const got=add.filter(a=>live.has(a.kw.toLowerCase()));
  console.log('등록 계획',add.length,'→ 라이브 확인',got.length,'/ 누락',add.length-got.length);
  const del=JSON.parse(fs.readFileSync(path.join(__dirname,'_medilon_20260915_delete.json'),'utf8'));
  const still=del.filter(d=>live.has(d.kw.toLowerCase()));
  console.log('삭제 계획',del.length,'→ 아직 남음',still.length);
  const miss=add.filter(a=>!live.has(a.kw.toLowerCase())).map(a=>a.kw);
  fs.writeFileSync(path.join(__dirname,'reports','medilon_20260915','missing.txt'),miss.join('\n'));
  console.log('누락 목록: reports/medilon_20260915/missing.txt');
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
