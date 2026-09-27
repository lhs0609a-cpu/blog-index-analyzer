// 스테로이드/탈스테로이드 계열 키워드 전수 + 라이브 입찰가 + 최근 실적
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
const T=encodeURIComponent(JSON.stringify({since:'2026-08-17',until:'2026-08-31'}));
const RE=/스테로이드|탈스|리바운드|금단|의존증|듀피젠트|면역억제|스테로이드제|호르몬연고|부신피질|TSW|tsw/;
const inv=JSON.parse(fs.readFileSync(P('_sojam_d0828_inv_hot.json'),'utf8'));
const sel=inv.filter(r=>RE.test(r.kw));
(async()=>{
 const gids=[...new Set(sel.map(r=>r.gid))];
 console.error(`인스턴스 ${sel.length}개 · 그룹 ${gids.length}개 라이브 조회…`);
 const live={},gb={};for(const r of inv)gb[r.gid]=r.gbid;
 let i=0;await Promise.all(Array.from({length:20},async()=>{while(i<gids.length){const g=gids[i++];
  const a=await raw(`/ncc/keywords?nccAdgroupId=${g}`);if(Array.isArray(a))for(const k of a)live[k.nccKeywordId]=k;}}));
 const st={};const gs=chunk(sel.map(r=>r.id),40);let j=0;
 await Promise.all(Array.from({length:8},async()=>{while(j<gs.length){const g=gs[j++];
  const r=await raw(`/stats?ids=${encodeURIComponent(g.join(','))}&fields=${F}&timeRange=${T}&timeIncrement=allDays`);
  for(const d of ((r&&r.data)||[]))st[d.id]=d;}}));
 const rows=sel.map(r=>{const k=live[r.id],s=st[r.id]||{};
  return {...r, eff:k?(k.useGroupBidAmt?(gb[r.gid]||0):(k.bidAmt||0)):r.eff,
   status:k?k.status:r.st, lock:k?!!k.userLock:r.lock, found:!!k,
   imp:s.impCnt||0, clk:s.clkCnt||0, cost:s.salesAmt||0};});
 const byKw={};
 for(const r of rows){const u=(byKw[r.kw]||={eff:0,imp:0,clk:0,cost:0,n:0,el:false,lock:false,camps:new Set()});
  u.eff=Math.max(u.eff,r.eff);u.imp+=r.imp;u.clk+=r.clk;u.cost+=r.cost;u.n++;
  if(r.status==='ELIGIBLE')u.el=true; if(r.lock)u.lock=true; u.camps.add(r.camp);}
 const L=Object.entries(byKw).sort((a,b)=>b[1].eff-a[1].eff||b[1].imp-a[1].imp);
 console.log(`\n=== 스테로이드 계열 키워드 ${L.length}종 (인스턴스 ${rows.length}개) · 실적 8/17~8/31 ===`);
 console.log('  키워드                          현재입찰가  인스턴스 노출 클릭  소진   상태');
 for(const [k,u] of L)
  console.log(`  ${k.slice(0,28).padEnd(30)}${won(u.eff).padStart(8)}원${String(u.n).padStart(5)}${won(u.imp).padStart(6)}${String(u.clk).padStart(5)}${won(u.cost).padStart(7)}원  ${u.el?'노출가능':'중지'}${u.lock?'·잠김':''}`);
 const S=L.reduce((s,[,u])=>({i:s.i+u.imp,k:s.k+u.clk,c:s.c+u.cost}),{i:0,k:0,c:0});
 console.log(`\n합계 — 노출 ${won(S.i)} · 클릭 ${S.k} · 소진 ${won(S.c)}원`);
 console.log(`70원 초과 ${L.filter(([,u])=>u.eff>70).length}종 · 70원 ${L.filter(([,u])=>u.eff<=70).length}종 · 노출가능 ${L.filter(([,u])=>u.el).length}종 · 잠김 ${L.filter(([,u])=>u.lock).length}종`);
 fs.writeFileSync(P('_sojam_e0831_steroid.json'),JSON.stringify(rows,null,1));
})();
