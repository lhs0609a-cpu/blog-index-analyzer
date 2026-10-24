const fs=require('fs'),crypto=require('crypto');
const C=JSON.parse(fs.readFileSync('_medilon_creds.json','utf8'));
const BASE='https://api.searchad.naver.com',CID=String(C.customer_id);
function hdr(m,uri){const ts=String(Date.now());return {'Content-Type':'application/json; charset=UTF-8','X-Timestamp':ts,'X-API-KEY':C.api_key,'X-Customer':CID,'X-Signature':crypto.createHmac('sha256',C.secret_key).update(ts+'.'+m+'.'+uri).digest('base64')};}
async function req(m,ep){const r=await fetch(BASE+ep,{headers:hdr(m,ep.split('?')[0]),signal:AbortSignal.timeout(30000)});
 const t=await r.text();if(!r.ok)throw new Error(r.status+' '+t.slice(0,200));return JSON.parse(t);}
(async()=>{
 const gid=JSON.parse(fs.readFileSync('reports/medilon_20260921/apply_ckpt.json','utf8')).regGroup;
 const g=await req('GET','/ncc/adgroups/'+gid);
 console.log('그룹',g.name,'| status',g.status,'| reason',g.statusReason,'| bid',g.bidAmt,'| userLock',g.userLock);
 const ads=await req('GET','/ncc/ads?nccAdgroupId='+gid);
 for(const a of ads)console.log('  소재',a.nccAdId,'| inspect',a.inspectStatus,'| status',a.status,'|',a.ad.headline,'/',a.ad.description);
 const kws=await req('GET','/ncc/keywords?nccAdgroupId='+gid);
 console.log('  키워드',kws.length,'· 입찰 범위',Math.min(...kws.map(k=>k.bidAmt)),'~',Math.max(...kws.map(k=>k.bidAmt)));
 const st={};for(const k of kws)st[k.status]=(st[k.status]||0)+1;console.log('  상태',st);
})().catch(e=>console.error('ERR',e.message));
