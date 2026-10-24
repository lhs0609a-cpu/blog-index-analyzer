const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method:'GET',body:null,customer_id:CID}),
  signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(700*(t+1));}return null;}
const chunk=(a,n)=>{const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;};
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const F=encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt','avgRnk']));
const T=encodeURIComponent(JSON.stringify({since:'2026-08-18',until:'2026-08-31'}));
const inv=JSON.parse(fs.readFileSync(P('_sojam_d0828_inv_hot.json'),'utf8'));
const RE=/구순|구각|입술|구내염|설염|혀갈라짐|혓바닥|입안|구강/;
const sel=inv.filter(r=>RE.test(r.kw));
(async()=>{
 const gs=chunk(sel.map(r=>r.id),40);const st={};let i=0;
 await Promise.all(Array.from({length:8},async()=>{while(i<gs.length){const g=gs[i++];
  const r=await raw(`/stats?ids=${encodeURIComponent(g.join(','))}&fields=${F}&timeRange=${T}&timeIncrement=allDays`);
  for(const d of ((r&&r.data)||[]))st[d.id]=d;}}));
 const A=sel.map(r=>({...r,...(st[r.id]||{})}));
 const byKw={};for(const r of A){const u=(byKw[r.kw]||={c:0,k:0,i:0,eff:0,el:false});
  u.c+=r.salesAmt||0;u.k+=r.clkCnt||0;u.i+=r.impCnt||0;u.eff=Math.max(u.eff,r.eff);
  if(r.st==='ELIGIBLE')u.el=true;}
 const K=Object.entries(byKw);
 const imp=K.filter(([,u])=>u.i>0).sort((a,b)=>b[1].c-a[1].c);
 console.log(`입술·구강 계열 고유 키워드 ${K.length}개 (인스턴스 ${A.length}개) · 8/18~8/31`);
 console.log(`  노출 발생 ${imp.length}개 · 클릭 ${K.reduce((s,[,u])=>s+u.k,0)}회 · 소진 ${won(K.reduce((s,[,u])=>s+u.c,0))}원`);
 console.log(`  노출 0인 것 ${K.length-imp.length}개 (그중 노출가능 상태 ${K.filter(([,u])=>u.i===0&&u.el).length}개)\n`);
 console.log('=== 노출이라도 난 것 ===');
 console.log('  키워드                  노출  클릭   소진     현재입찰가');
 for(const [k,u] of imp) console.log(`  ${k.slice(0,20).padEnd(22)}${won(u.i).padStart(6)}${String(u.k).padStart(5)}${won(u.c).padStart(8)}원${won(u.eff).padStart(9)}원${u.el?'':'  [중지]'}`);
 const zero=K.filter(([,u])=>u.i===0&&u.el).sort((a,b)=>b[1].eff-a[1].eff);
 console.log(`\n=== 노출가능인데 노출 0 — 입찰가 상위 20 ===`);
 for(const [k,u] of zero.slice(0,20)) console.log(`  ${k.slice(0,20).padEnd(22)}${won(u.eff).padStart(8)}원`);
})();
