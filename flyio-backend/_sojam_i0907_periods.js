// 소잠 — 기간별 키워드 성과 수집 (7월/8월전반/8월후반/9월) → _sojam_i0907_periods.json
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,tries=3){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method:'GET',body:null,customer_id:CID}),
  signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(600*(t+1));}return null;}

const S=JSON.parse(fs.readFileSync(P('_sojam_g0903_kwstats.json'),'utf8'));
const ids=S.keywords.filter(k=>k.imp33>0).map(k=>k.id);
const WIN={ jul:['2026-07-01','2026-07-31'], aug1:['2026-08-01','2026-08-26'],
            aug2:['2026-08-27','2026-08-31'], sep:['2026-09-01','2026-09-06'] };
const F=encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt','avgRnk']));
const B=50, out={};
(async()=>{
 for(const [w,[s,u]] of Object.entries(WIN)){
  const T=encodeURIComponent(JSON.stringify({since:s,until:u}));
  const chunks=[];for(let i=0;i<ids.length;i+=B)chunks.push(ids.slice(i,i+B));
  const acc={};let i=0,done=0;
  await Promise.all(Array.from({length:14},async()=>{while(i<chunks.length){const c=chunks[i++];
   const r=await raw(`/stats?ids=${encodeURIComponent(c.join(','))}&fields=${F}&timeRange=${T}`);
   for(const d of ((r&&r.data)||[])) acc[d.id]={i:d.impCnt||0,c:d.clkCnt||0,m:d.salesAmt||0,r:d.avgRnk||0};
   if(++done%50===0)console.error(`  ${w} ${done}/${chunks.length}`);}}));
  out[w]=acc;console.error(`${w}: ${Object.keys(acc).length}개`);
 }
 fs.writeFileSync(P('_sojam_i0907_periods.json'),JSON.stringify(out));
})();
