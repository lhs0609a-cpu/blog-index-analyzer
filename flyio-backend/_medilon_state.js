// 라이브 상태 덤프: 마스터리포트(Campaign/Adgroup/Keyword/Ad) + 비즈채널
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const C=JSON.parse(fs.readFileSync(path.join(__dirname,'_medilon_creds.json'),'utf8'));
const BASE='https://api.searchad.naver.com',CID=String(C.customer_id);
const OUT=process.env.OUT||path.join(__dirname,'reports','medilon_20260921');
fs.mkdirSync(OUT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function hdr(m,uri){const ts=String(Date.now());
  return {'Content-Type':'application/json; charset=UTF-8','X-Timestamp':ts,'X-API-KEY':C.api_key,'X-Customer':CID,
    'X-Signature':crypto.createHmac('sha256',C.secret_key).update(`${ts}.${m}.${uri}`).digest('base64')};}
async function req(m,ep,b){const r=await fetch(BASE+ep,{method:m,headers:hdr(m,ep.split('?')[0]),
  body:b==null?undefined:JSON.stringify(b),signal:AbortSignal.timeout(60000)});
  const t=await r.text();if(!r.ok)throw new Error(`HTTP ${r.status} ${t.slice(0,300)}`);
  try{return JSON.parse(t)}catch(e){return t}}
async function master(item,file){
  for(const r of (await req('GET','/master-reports')||[])) if(r.item===item){try{await req('DELETE','/master-reports/'+r.id)}catch(e){}}
  const job=await req('POST','/master-reports',{item});
  let s;for(let i=0;i<80;i++){await sleep(3000);s=await req('GET','/master-reports/'+job.id);
    if(s.status==='BUILT'||s.status==='NONE')break;}
  if(!s.downloadUrl){console.log(item,'리포트없음',s.status);return null;}
  const u=new URL(s.downloadUrl),ts=String(Date.now());
  const rr=await fetch(s.downloadUrl,{headers:{'X-Timestamp':ts,'X-API-KEY':C.api_key,'X-Customer':CID,
    'X-Signature':crypto.createHmac('sha256',C.secret_key).update(`${ts}.GET.${u.pathname}`).digest('base64')},signal:AbortSignal.timeout(300000)});
  const txt=await rr.text();fs.writeFileSync(path.join(OUT,file),txt);
  console.log(item,'행',txt.split(/\r?\n/).filter(Boolean).length,'→',file);return txt;
}
(async()=>{
  const which=(process.env.ITEMS||'Campaign,Adgroup,Keyword,Ad').split(',');
  for(const it of which) await master(it,it.toLowerCase()+'.tsv');
  const ch=await req('GET','/ncc/channels');
  fs.writeFileSync(path.join(OUT,'channels.json'),JSON.stringify(ch,null,2));
  console.log('채널',ch.map(c=>`${c.nccBusinessChannelId} ${c.channelTp} ${c.name} ${c.status||''} ${c.inspectStatus||''}`).join('\n  '));
  try{const bz=await req('GET','/billing/bizmoney');fs.writeFileSync(path.join(OUT,'bizmoney.json'),JSON.stringify(bz,null,2));console.log('비즈머니',JSON.stringify(bz));}catch(e){console.log('비즈머니 ERR',e.message)}
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
