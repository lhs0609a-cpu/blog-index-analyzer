// 전 키워드 기간 통계 — 응답 없는 id 는 끝까지 재시도 (누락 0 보장)
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,tries=5){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method:'GET',body:null,customer_id:CID}),
  signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(700*(t+1));}return null;}
const S=JSON.parse(fs.readFileSync(P('_sojam_g0903_kwstats.json'),'utf8'));
const F=encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt']));
const [since,until,out]=process.argv.slice(2);
const T=encodeURIComponent(JSON.stringify({since,until}));
(async()=>{
 const acc={},seen=new Set();
 let todo=S.keywords.map(k=>k.id);
 for(let round=1;round<=6&&todo.length;round++){
  const B=round===1?50:20,chunks=[];for(let i=0;i<todo.length;i+=B)chunks.push(todo.slice(i,i+B));
  let i=0,done=0;
  await Promise.all(Array.from({length:10},async()=>{while(i<chunks.length){const c=chunks[i++];
   const r=await raw(`/stats?ids=${encodeURIComponent(c.join(','))}&fields=${F}&timeRange=${T}`);
   if(r&&Array.isArray(r.data)){c.forEach(id=>seen.add(id));
    for(const d of r.data) if((d.impCnt||0)+(d.salesAmt||0)>0) acc[d.id]={i:d.impCnt||0,c:d.clkCnt||0,m:d.salesAmt||0};}
   if(++done%400===0)console.error(`  r${round} ${done}/${chunks.length}`);}}));
  todo=todo.filter(id=>!seen.has(id));
  console.error(`round ${round}: 응답 ${seen.size} · 미응답 ${todo.length}`);
 }
 fs.writeFileSync(P(out),JSON.stringify(acc));
 let m=0,c=0,im=0;for(const k in acc){m+=acc[k].m;c+=acc[k].c;im+=acc[k].i;}
 console.error(`${since}~${until}: 응답 ${seen.size}/${S.keywords.length} · 활성 ${Object.keys(acc).length} · 노출 ${im.toLocaleString()} · 클릭 ${c} · 소진 ${m.toLocaleString()}원`);})();
