// 진료권 키워드 1,976개 · 1/2/3/5위 진입가 실측 (MOBILE·PC)
const fs=require('fs'),P=n=>require('path').join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,method,body,tries=5){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method,body,customer_id:CID}),
  signal:AbortSignal.timeout(180000)});
 if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(1200*(t+1));}return null;}
const U=JSON.parse(fs.readFileSync(P('_sojam_k0907_universe.json'),'utf8'));
const out={};U.forEach(k=>out[k.kw]={v:k.v,live:k.live});
(async()=>{
 for(const dev of ['MOBILE','PC']){
  for(const pos of [1,2,3,5]){
   const kws=U.map(k=>k.kw); let done=0;
   for(let i=0;i<kws.length;i+=100){
    const items=kws.slice(i,i+100).map(k=>({key:k,position:pos}));
    const r=await raw('/estimate/average-position-bid/keyword','POST',{device:dev,items});
    ((r&&r.estimate)||[]).forEach(e=>{const q=(e.keyword||'').trim();
     if(q&&out[q])out[q][`${dev==='MOBILE'?'m':'p'}${pos}`]=e.bid;});
    done+=items.length; if(done%600===0)console.error(`  ${dev} ${pos}위 ${done}/${kws.length}`);
    await sleep(250);
   }
   console.error(`${dev} ${pos}위 완료`);
  }
 }
 fs.writeFileSync(P('_sojam_k0907_ladder.json'),JSON.stringify(out));
 const n=Object.values(out).filter(x=>x.m3).length;
 console.error(`저장 — 3위 진입가 확보 ${n}/${U.length}`);
})();
