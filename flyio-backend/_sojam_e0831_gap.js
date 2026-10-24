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
const F=encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt']));
const T=encodeURIComponent(JSON.stringify({since:'2026-08-25',until:'2026-08-31'}));
(async()=>{
 const camps=((await raw('/ncc/campaigns'))||[]).filter(c=>!c.delFlag);
 if(!camps.length){console.error('캠페인 조회 실패');process.exit(1);}
 const m={};for(const g of chunk(camps.map(c=>c.nccCampaignId),40)){
  const r=await raw(`/stats?ids=${encodeURIComponent(g.join(','))}&fields=${F}&timeRange=${T}&timeIncrement=allDays`);
  for(const d of ((r&&r.data)||[]))m[d.id]=d;}
 const rows=JSON.parse(fs.readFileSync(P('_sojam_e0831_week_20260825_20260831.json'),'utf8'));
 const kw={};for(const r of rows){const u=(kw[r.camp]||={c:0,k:0});u.c+=r.salesAmt;u.k+=r.clkCnt;}
 const out=camps.map(c=>({name:c.name,tp:c.campaignTp,...(m[c.nccCampaignId]||{}),
   kc:(kw[c.name]||{c:0}).c,kk:(kw[c.name]||{k:0}).k})).filter(r=>(r.salesAmt||0)>0)
  .sort((a,b)=>b.salesAmt-a.salesAmt);
 console.log('=== 8/25~8/31 캠페인 소진 vs 키워드로 설명되는 금액 ===');
 console.log('  캠페인'.padEnd(42)+'  소진      클릭   키워드로설명   차액(미귀속)');
 let g1=0,g2=0;
 for(const r of out){const d=(r.salesAmt||0)-r.kc;g1+=r.salesAmt;g2+=d;
  console.log('  '+r.name.slice(0,38).padEnd(40)+won(r.salesAmt).padStart(9)+'원'+String(r.clkCnt||0).padStart(6)+won(r.kc).padStart(11)+'원'+(d?won(d).padStart(11)+'원':''.padStart(12))+'  '+(r.tp||''));}
 console.log('  '+'합계'.padEnd(40)+won(g1).padStart(9)+'원'+''.padStart(6)+won(g1-g2).padStart(11)+'원'+won(g2).padStart(11)+'원');
})();
