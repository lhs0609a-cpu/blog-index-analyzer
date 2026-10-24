const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
(async()=>{
 for(const u of ['https://portal.brandplaton.com','https://portal.brandplaton.com/','http://portal.brandplaton.com',
                 'https://blog.naver.com/goodspolice/224297040050']){
  try{
   const r=await fetch(u,{headers:{'User-Agent':UA},redirect:'follow',signal:AbortSignal.timeout(20000)});
   const t=await r.text();
   const title=(t.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'';
   console.log('\n=== '+u);
   console.log('  status',r.status,'· 최종',r.url,'· 길이',t.length);
   console.log('  title:',title.trim().slice(0,120));
   const body=t.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
   console.log('  본문 '+body.length+'자:',body.slice(0,400));
   for(const k of ['대부업','금융위','등록번호','대출','과도한 빚','신용등급','연체','중개수수료','사업자등록','상호','대표','전화','준수사항'])
     if(body.includes(k))console.log('    ['+k+'] 있음');
  }catch(e){console.log('\n=== '+u+'\n  실패',e.message);}
 }
})();
