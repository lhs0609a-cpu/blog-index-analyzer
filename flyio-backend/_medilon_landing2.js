const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
(async()=>{
 const r=await fetch('https://portal.brandplaton.com/',{headers:{'User-Agent':UA},signal:AbortSignal.timeout(20000)});
 const t=await r.text();
 const urls=[...t.matchAll(/(?:href|src|location(?:\.href)?\s*=|url\()\s*["'`]?(https?:\/\/[^"'`)\s<>]+|\/[^"'`)\s<>]{2,})/gi)].map(m=>m[1]);
 console.log('페이지 내 링크/이동 대상:');
 for(const u of [...new Set(urls)]) console.log('  ',u);
 console.log('\n--- 스크립트에서 이동 관련 구문');
 for(const m of t.matchAll(/[^\n]*(location|redirect|setTimeout|window\.open)[^\n]*/gi)) console.log('  ',m[0].trim().slice(0,200));
})();
