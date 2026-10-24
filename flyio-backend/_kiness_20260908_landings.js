const fs=require('fs');const {pool}=require('./_sojam_naver');
(async()=>{
 const rows=fs.readFileSync('_kiness_20260908_parts.jsonl','utf8').trim().split('\n').map(JSON.parse);
 const urls=[...new Set(rows.flatMap(x=>x.ads.filter(a=>a.inspectStatus==='APPROVED'&&!a.userLock).flatMap(a=>[a.ad.pc?.final,a.ad.mobile?.final]).filter(Boolean)))];
 fs.writeFileSync('_kiness_20260908_landing_urls.json',JSON.stringify(urls));
 const candidates=[...new Set([...urls.filter(u=>!u.includes('utm_')).slice(0,20),...urls.slice(0,8),'https://www.kiness.co.kr/'])];
 const results=await pool(candidates,3,async u=>{try{
  const r=await fetch(u,{signal:AbortSignal.timeout(15000)}),t=await r.text();
  return {url:u,status:r.status,final:r.url,title:t.match(/<title[^>]*>(.*?)<\/title>/is)?.[1],form:/<form/i.test(t),wcs:/wcslog|wcs\.nasa/.test(t),bytes:t.length};
 }catch(e){return {url:u,error:e.message};}});
 fs.writeFileSync('_kiness_20260908_landing_probe.json',JSON.stringify(results));console.log(JSON.stringify(results));
 const t=await (await fetch('https://www.kiness.co.kr/html/online01')).text();
 fs.writeFileSync('_kiness_20260908_landing_source.html',t);
 console.log('script sources',[...t.matchAll(/<script[^>]*src=["']([^"']+)/g)].map(m=>m[1]));
})().catch(console.error);
