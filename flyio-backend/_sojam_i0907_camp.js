const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method:'GET',body:null,customer_id:CID}),
  signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(800*(t+1));}return null;}
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const WIN={jul:['2026-07-01','2026-07-31'],aug:['2026-08-01','2026-08-31'],sep:['2026-09-01','2026-09-06']};
const F=encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt']));
(async()=>{
 const camps=((await raw('/ncc/campaigns'))||[]).filter(c=>!c.delFlag);
 const out={};
 for(const [w,[s,u]] of Object.entries(WIN)){
  const T=encodeURIComponent(JSON.stringify({since:s,until:u}));
  const acc={};let i=0;
  await Promise.all(Array.from({length:6},async()=>{while(i<camps.length){const c=camps[i++];
   const r=await raw(`/stats?ids=${encodeURIComponent(c.nccCampaignId)}&fields=${F}&timeRange=${T}`);
   const d=(r&&r.data&&r.data[0])||{};
   acc[c.nccCampaignId]={name:c.name||'',tp:c.campaignTp,i:d.impCnt||0,c:d.clkCnt||0,m:d.salesAmt||0};}}));
  out[w]=acc;
  const byTp={};let T2=0;
  for(const id in acc){const a=acc[id];(byTp[a.tp]||={i:0,c:0,m:0});byTp[a.tp].i+=a.i;byTp[a.tp].c+=a.c;byTp[a.tp].m+=a.m;T2+=a.m;}
  console.log(`\n══ ${w} ${s}~${u} · 총 ${won(T2)}원 ══`);
  Object.entries(byTp).sort((a,b)=>b[1].m-a[1].m).forEach(([t,v])=>
   console.log(`  ${t.padEnd(22)} 노출 ${won(v.i).padStart(10)} · 클릭 ${won(v.c).padStart(6)} · ${won(v.m).padStart(10)}원 (${(v.m/T2*100).toFixed(1)}%)`));
  // 자동생성 캠페인(소잠_ 접두 + liveAD) vs 수기 캠페인
  const grp={'파워링크/대표/플레이스(수기)':0,'자동생성(소잠_*)':0,'liveAD':0,'기타':0};
  for(const id in acc){const a=acc[id];
   const k=/^소잠_/.test(a.name)?'자동생성(소잠_*)':/liveAD/.test(a.name)?'liveAD':
     /^(파워링크|플레이스|파워컨텐츠|브랜드검색)/.test(a.name)?'파워링크/대표/플레이스(수기)':'기타';
   grp[k]+=a.m;}
  console.log('  ── 운영주체별');
  Object.entries(grp).forEach(([k,v])=>console.log(`     ${k.padEnd(26)} ${won(v).padStart(10)}원 (${(v/T2*100).toFixed(1)}%)`));
 }
 fs.writeFileSync(P('_sojam_i0907_camp.json'),JSON.stringify(out));
})();
