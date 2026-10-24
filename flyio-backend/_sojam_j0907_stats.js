// 신규 인벤토리 기준 9/1~9/7 키워드 실적 (누락 0 재시도)
const fs=require('fs'),P=n=>require('path').join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,tries=5){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method:'GET',body:null,customer_id:CID}),
  signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(700*(t+1));}return null;}
const INV=JSON.parse(fs.readFileSync(P('_sojam_j0907_live.json'),'utf8'));
const F=encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt','avgRnk']));
const T=encodeURIComponent(JSON.stringify({since:'2026-09-01',until:'2026-09-07'}));
(async()=>{
 const acc={},seen=new Set(); let todo=INV.map(k=>k.id);
 for(let r=1;r<=6&&todo.length;r++){
  const B=r===1?50:20,ch=[];for(let i=0;i<todo.length;i+=B)ch.push(todo.slice(i,i+B));
  let i=0,done=0;
  await Promise.all(Array.from({length:10},async()=>{while(i<ch.length){const c=ch[i++];
   const d=await raw(`/stats?ids=${encodeURIComponent(c.join(','))}&fields=${F}&timeRange=${T}`);
   if(d&&Array.isArray(d.data)){c.forEach(id=>seen.add(id));
    for(const x of d.data) if((x.impCnt||0)+(x.salesAmt||0)>0)
     acc[x.id]={i:x.impCnt||0,c:x.clkCnt||0,m:x.salesAmt||0,r:x.avgRnk||0};}
   if(++done%400===0)console.error(`  r${r} ${done}/${ch.length}`);}}));
  todo=todo.filter(id=>!seen.has(id));
  console.error(`round ${r}: 응답 ${seen.size} · 미응답 ${todo.length}`);
 }
 fs.writeFileSync(P('_sojam_j0907_stats.json'),JSON.stringify(acc));
 let m=0,c=0;for(const k in acc){m+=acc[k].m;c+=acc[k].c;}
 console.error(`활성 ${Object.keys(acc).length} · 클릭 ${c} · 소진 ${m.toLocaleString()}원`);
})();
