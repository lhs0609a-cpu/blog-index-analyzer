const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const paths=['/finance','/loan','/about','/company','/terms','/privacy','/medical','/contact','/main','/index.html','/sitemap.xml','/robots.txt'];
(async()=>{
 for(const p of paths){
  try{const r=await fetch('https://portal.brandplaton.com'+p,{headers:{'User-Agent':UA},signal:AbortSignal.timeout(12000)});
   const t=await r.text();
   const body=t.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
   console.log(String(r.status).padStart(3),p.padEnd(14),'본문'+String(body.length).padStart(6)+'자 ',body.slice(0,110));
  }catch(e){console.log('ERR',p,e.message.slice(0,40));}
 }
 // 네이버 심사자가 본 캡처
 for(const h of ['https://searchad-phinf.pstatic.net','https://ssl.pstatic.net','https://saeditor-phinf.pstatic.net']){
  try{const r=await fetch(h+'/preview_img/ncc_image_capture/202606/a417d875-6ee4-4f0c-a518-c75195e4148e.jpg',{headers:{'User-Agent':UA},signal:AbortSignal.timeout(12000)});
   console.log('캡처',h,r.status,r.headers.get('content-length'));}catch(e){console.log('캡처',h,'실패');}
 }
})();
