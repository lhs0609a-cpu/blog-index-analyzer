const fs=require('fs'),crypto=require('crypto');
const C=JSON.parse(fs.readFileSync('_medilon_creds.json','utf8'));
const BASE='https://api.searchad.naver.com',CID=String(C.customer_id);
function hdr(m,uri){const ts=String(Date.now());return {'Content-Type':'application/json; charset=UTF-8','X-Timestamp':ts,'X-API-KEY':C.api_key,'X-Customer':CID,'X-Signature':crypto.createHmac('sha256',C.secret_key).update(ts+'.'+m+'.'+uri).digest('base64')};}
async function req(m,ep){const r=await fetch(BASE+ep,{headers:hdr(m,ep.split('?')[0]),signal:AbortSignal.timeout(30000)});
 const t=await r.text();return {status:r.status,body:t};}
(async()=>{
 for(const ep of ['/ncc/channels/bsn-a001-00-000000014233110','/ncc/channels/bsn-a001-00-000000014233110?recordId=bsn-a001-00-000000014233110',
                  '/customers','/billing/bizmoney/charges?searchStartDt=2026-08-01&searchEndDt=2026-09-21']){
  const r=await req('GET',ep);
  console.log('\n=== '+ep+'  ['+r.status+']');
  console.log('  '+r.body.slice(0,700));
 }
})();
