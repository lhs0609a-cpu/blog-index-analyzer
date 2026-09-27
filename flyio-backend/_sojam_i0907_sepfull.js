const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,tries=3){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method:'GET',body:null,customer_id:CID}),
  signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(600*(t+1));}return null;}
const S=JSON.parse(fs.readFileSync(P('_sojam_g0903_kwstats.json'),'utf8'));
const ids=S.keywords.map(k=>k.id);
const F=encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt']));
const T=encodeURIComponent(JSON.stringify({since:'2026-09-01',until:'2026-09-06'}));
const B=50,chunks=[];for(let i=0;i<ids.length;i+=B)chunks.push(ids.slice(i,i+B));
(async()=>{const acc={};let i=0,done=0;
 await Promise.all(Array.from({length:16},async()=>{while(i<chunks.length){const c=chunks[i++];
  const r=await raw(`/stats?ids=${encodeURIComponent(c.join(','))}&fields=${F}&timeRange=${T}`);
  for(const d of ((r&&r.data)||[])) if((d.impCnt||0)+(d.salesAmt||0)>0) acc[d.id]={i:d.impCnt||0,c:d.clkCnt||0,m:d.salesAmt||0};
  if(++done%200===0)console.error(`  ${done}/${chunks.length}`);}}));
 fs.writeFileSync(P('_sojam_i0907_sepfull.json'),JSON.stringify(acc));
 let m=0,c=0;for(const k in acc){m+=acc[k].m;c+=acc[k].c;}
 console.error(`활성 ${Object.keys(acc).length}개 · 클릭 ${c} · 소진 ${m.toLocaleString()}원`);})();
