// 진료권 키워드 실적으로 검색량→노출→클릭 관계 보정
const fs=require('fs'),P=n=>require('path').join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,tries=5){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method:'GET',body:null,customer_id:CID}),signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(1200*(t+1));}return null;}
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const I=JSON.parse(fs.readFileSync(P('_sojam_j0907_live.json'),'utf8'));
const L=JSON.parse(fs.readFileSync(P('_sojam_k0907_ladder.json'),'utf8'));
const ids=I.filter(k=>L[k.kw]).map(k=>k.id);
console.error(`조회 대상 ${ids.length}개`);
const F=encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt','avgRnk']));
const T=encodeURIComponent(JSON.stringify({since:'2026-08-08',until:'2026-09-07'}));  // 최근 31일
(async()=>{
 const acc={};const ch=[];for(let i=0;i<ids.length;i+=40)ch.push(ids.slice(i,i+40));
 let i=0,seen=new Set();
 for(let r=1;r<=4&&i<ch.length;r++){
  i=0;const rem=ch.filter((c,idx)=>!c.every(id=>seen.has(id)));
  await Promise.all(Array.from({length:6},async()=>{while(i<rem.length){const c=rem[i++];
   const d=await raw(`/stats?ids=${encodeURIComponent(c.join(','))}&fields=${F}&timeRange=${T}`);
   if(d&&Array.isArray(d.data)){c.forEach(x=>seen.add(x));
    for(const x of d.data) if((x.impCnt||0)>0) acc[x.id]={i:x.impCnt,c:x.clkCnt||0,m:x.salesAmt||0,r:x.avgRnk||0};}}}));
  if(seen.size>=ids.length)break;
 }
 // 키워드 단위 집계
 const K={};
 I.filter(k=>L[k.kw]).forEach(k=>{const d=acc[k.id];if(!d)return;
  (K[k.kw]||={v:L[k.kw].v,i:0,c:0,m:0,rw:0});const e=K[k.kw];
  e.i+=d.i;e.c+=d.c;e.m+=d.m;e.rw+=d.r*d.i;});
 const rows=Object.entries(K).map(([kw,x])=>({kw,...x,r:x.i?x.rw/x.i:0}));
 fs.writeFileSync(P('_sojam_k0907_calib.json'),JSON.stringify(rows));
 const act=rows.filter(r=>r.i>0);
 const T2=act.reduce((s,r)=>({v:s.v+r.v,i:s.i+r.i,c:s.c+r.c,m:s.m+r.m}),{v:0,i:0,c:0,m:0});
 console.log(`\n══ 최근 31일 (8/8~9/7) 진료권 키워드 실적 ══`);
 console.log(`노출 발생 ${act.length}개 · 검색량 ${won(T2.v)} · 노출 ${won(T2.i)} · 클릭 ${T2.c} · 소진 ${won(T2.m)}원`);
 console.log(`노출/검색량 = ${(T2.i/T2.v*100).toFixed(1)}%  · CTR ${(T2.c/T2.i*100).toFixed(3)}% · CPC ${won(T2.m/T2.c)}원`);
 console.log(`\n── 평균순위 구간별 (노출 500회 이상)`);
 const B=[[1,1.5],[1.5,2.5],[2.5,3.5],[3.5,5],[5,99]];
 B.forEach(([lo,hi])=>{const g=act.filter(r=>r.i>=500&&r.r>=lo&&r.r<hi);
  if(!g.length)return;const t=g.reduce((s,r)=>({v:s.v+r.v,i:s.i+r.i,c:s.c+r.c,m:s.m+r.m}),{v:0,i:0,c:0,m:0});
  console.log(`  순위 ${lo}~${hi}  키워드 ${String(g.length).padStart(3)} · 노출/검색량 ${(t.i/t.v*100).toFixed(1).padStart(5)}% · CTR ${(t.c/t.i*100).toFixed(3)}% · CPC ${won(t.c?t.m/t.c:0).padStart(6)}원 · 클릭 ${t.c}`);});
})();
