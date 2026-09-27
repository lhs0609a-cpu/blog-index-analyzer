const fs=require('fs'),P=n=>require('path').join(__dirname,n);
const A=require('./_sojam_i0907_audit_lib.js');
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,tries=5){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method:'GET',body:null,customer_id:CID}),signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(1200*(t+1));}return null;}
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const AXDEF=[['묘기증',/묘기증|피부묘기/,6000],['지루성',/지루성|두피염|비듬|두피/,5000],['아토피',/아토피|태열/,6000],['두드러기',/두드러기|담마진/,4500],['건선',/건선/,4000],['여드름',/여드름|뾰루지|화농|면포/,2500],['습진',/습진|한포진/,3500],['피부염',/피부염|접촉성|화폐상/,4000],['백반증',/백반증/,70],['다한증',/다한증|땀띠|땀많|한증/,70],['모낭염',/모낭염|종기|봉와직염|절종|옹종/,1500],['무좀',/무좀|백선|칸디다|완선/,1500],['구순염',/구순|구내염|입술|입안|혀|설염/,1500],['탈스',/탈스|스테로이드|리바운드/,1500],['가려움',/가려|간지|소양|양진/,1800]];
const ax=k=>{for(const [n,re] of AXDEF) if(re.test(k)) return n; return '기타'};
const cap=a=>a==='기타'?3000:(AXDEF.find(x=>x[0]===a)||[,,3000])[2];
const I=JSON.parse(fs.readFileSync(P('_sojam_j0907_live.json'),'utf8'));
const on=I.filter(k=>!k.lock&&!k.gLock&&!k.campLock);
const flag=on.filter(k=>(k.bid>=500&&A.verdict(k.kw))||(!A.verdict(k.kw)&&k.bid>cap(ax(k.kw))));
console.error(`적발 ${flag.length}개 조회`);
const F=encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt','avgRnk']));
const T=encodeURIComponent(JSON.stringify({since:'2026-09-01',until:'2026-09-07'}));
(async()=>{
 const acc={};const ids=flag.map(k=>k.id);const ch=[];
 for(let i=0;i<ids.length;i+=40)ch.push(ids.slice(i,i+40));
 let i=0;
 await Promise.all(Array.from({length:5},async()=>{while(i<ch.length){const c=ch[i++];
  const r=await raw(`/stats?ids=${encodeURIComponent(c.join(','))}&fields=${F}&timeRange=${T}`);
  for(const x of ((r&&r.data)||[])) acc[x.id]={i:x.impCnt||0,c:x.clkCnt||0,m:x.salesAmt||0,r:x.avgRnk||0};}}));
 fs.writeFileSync(P('_sojam_j0907_flagstats.json'),JSON.stringify(acc));
 const rows=flag.map(k=>({...k,...(acc[k.id]||{i:0,c:0,m:0,r:0}),v:A.verdict(k.kw),a:ax(k.kw)}));
 const oos=rows.filter(k=>k.v), ovr=rows.filter(k=>!k.v);
 const S=a=>a.reduce((s,k)=>({i:s.i+k.i,c:s.c+k.c,m:s.m+k.m}),{i:0,c:0,m:0});
 const so=S(oos),sv=S(ovr);
 console.log(`\n══ 9/1~9/7 실제 지출 (7일) ══`);
 console.log(`① 진료범위 밖·입찰 500원↑ ${oos.length}개 → 노출 ${won(so.i)} · 클릭 ${so.c} · 소진 ${won(so.m)}원`);
 console.log(`② 축 상한 초과 입찰      ${ovr.length}개 → 노출 ${won(sv.i)} · 클릭 ${sv.c} · 소진 ${won(sv.m)}원`);
 console.log(`\n── ① 실제로 돈 나간 범위 밖`);
 oos.filter(k=>k.m>0).sort((a,b)=>b.m-a.m).forEach(k=>console.log(`   ${won(k.m).padStart(7)}원 ${String(k.c).padStart(2)}클릭 입찰${won(k.bid).padStart(7)} ${k.kw.padEnd(18)} [${k.v}] ${(k.camp||'').slice(0,22)}`));
 console.log(`\n── ② 상한 초과 중 실제로 돈 나간 것 (CPC 순)`);
 ovr.filter(k=>k.m>0).sort((a,b)=>(b.m/b.c)-(a.m/a.c)).slice(0,20).forEach(k=>console.log(`   CPC ${won(k.m/k.c).padStart(7)} (상한 ${won(cap(k.a)).padStart(5)}) ${String(k.c).padStart(2)}클릭 ${won(k.m).padStart(7)}원 입찰${won(k.bid).padStart(7)} ${k.a.padEnd(5)} ${k.kw.padEnd(16)} ${(k.camp||'').slice(0,20)}`));
 console.log(`\n── 노출만 먹고 클릭 0 (노출 200↑)`);
 rows.filter(k=>k.i>=200&&k.c===0).sort((a,b)=>b.i-a.i).slice(0,12).forEach(k=>console.log(`   노출 ${won(k.i).padStart(6)} 순위 ${(k.r||0).toFixed(1)} 입찰${won(k.bid).padStart(7)} ${k.kw.padEnd(18)} ${(k.camp||'').slice(0,22)}`));
})();
