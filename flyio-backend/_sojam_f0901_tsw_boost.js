// 탈스테로이드 축 상향 + 범용어 '스테로이드' 최저가
//   node _sojam_f0901_tsw_boost.js [--apply]
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const {req,sleep}=require('./_sojam_naver');
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907',EST_CID='3808925';
const APPLY=process.argv.includes('--apply');
const G='grp-a001-01-000000072328280';
const MINBID=2000, CAP=20000;               // 탈스 축 바닥을 2,000원으로
// 의미 없는 범용어 — 최저가로
const GENERIC=['스테로이드','스테로이드주사','스테로이드연고','스테로이드없는지방분해주사','스테로이드VS한방한의원','스테로이드VS한방치료','스테로이드VS한방한방치료'];
// 탈스(전환의도) 축
const TSW=/탈스|리바운드|금단|의존|끊|중단|부작용|중독|홍조|듀피젠트|면역억제|위축/;
async function raw(p,method,body,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method,body,customer_id:CID}),
  signal:AbortSignal.timeout(150000)});
 if(r.ok){const d=await r.json();if(d.success)return[true,d.response];return[false,d.error||'']}
 }catch(e){}await sleep(1200*(t+1));}return[false,'retry'];}
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const r10=v=>Math.max(70,Math.round(v/10)*10);
(async()=>{
 const [ok,all]=await raw(`/ncc/keywords?nccAdgroupId=${G}`,'GET',null);
 const ks=(all||[]).filter(k=>!k.delFlag);
 const gen=ks.filter(k=>GENERIC.includes(k.keyword)&&k.bidAmt>70);
 const tsw=ks.filter(k=>TSW.test(k.keyword)&&!GENERIC.includes(k.keyword));
 // PC 1위 추정가 재조회
 const lad={};
 for(let i=0;i<tsw.length;i+=100){
  try{const r=await req('POST','/estimate/average-position-bid/keyword',
    {device:'PC',items:tsw.slice(i,i+100).map(k=>({key:k.keyword,position:1}))},EST_CID);
   for(const e of (r.estimate||[])){const k=(e.keyword||'').trim();if(k)lad[k]=e.bid;}
  }catch(e){console.error('추정 실패',String(e).slice(0,80));}
  await sleep(300);}
 const bidOf=k=>r10(Math.min(CAP,Math.max(MINBID,lad[k]??0)));
 const up=tsw.filter(k=>bidOf(k.keyword)>k.bidAmt);
 console.log(`절실축 그룹 ${ks.length}개 · 탈스 축 ${tsw.length}개 · 범용어 ${gen.length}개`);
 console.log(`\n[1] 범용어 → 70원`);
 gen.forEach(k=>console.log(`  ${k.keyword.padEnd(26)}${won(k.bidAmt).padStart(8)}원 → 70원`));
 console.log(`\n[2] 탈스 축 상향 ${up.length}개 (바닥 ${won(MINBID)}원 / PC 1위 추정가 중 큰 값)`);
 const bef=up.reduce((s,k)=>s+k.bidAmt,0), aft=up.reduce((s,k)=>s+bidOf(k.keyword),0);
 console.log(`  입찰가 합 ${won(bef)}원 → ${won(aft)}원 · 평균 ${won(bef/(up.length||1))}원 → ${won(aft/(up.length||1))}원`);
 console.log('\n  상위 20:');
 up.sort((a,b)=>bidOf(b.keyword)-bidOf(a.keyword)).slice(0,20)
  .forEach(k=>console.log(`  ${k.keyword.padEnd(26)}${won(k.bidAmt).padStart(8)}원 → ${won(bidOf(k.keyword)).padStart(7)}원  (1위추정 ${lad[k.keyword]==null?'없음':won(lad[k.keyword])+'원'})`));
 fs.writeFileSync(P('_sojam_f0901_tsw_boost_ROLLBACK.json'),
  JSON.stringify(Object.fromEntries([...gen,...up].map(k=>[k.nccKeywordId,{kw:k.keyword,bid:k.bidAmt}]))));
 if(!APPLY){console.log('\ndry-run — 적용하려면 --apply');return;}
 if(gen.length){
  const [o,e]=await raw('/ncc/keywords?fields=bidAmt','PUT',
   gen.map(k=>({nccKeywordId:k.nccKeywordId,nccAdgroupId:G,bidAmt:70,useGroupBidAmt:false})));
  console.log(o?`범용어 70원 — ${gen.length}개 완료`:`실패 ${String(e).slice(0,150)}`);}
 let ok2=0,bad=0;
 for(let i=0;i<up.length;i+=100){
  const b=up.slice(i,i+100).map(k=>({nccKeywordId:k.nccKeywordId,nccAdgroupId:G,bidAmt:bidOf(k.keyword),useGroupBidAmt:false}));
  const [o,e]=await raw('/ncc/keywords?fields=bidAmt','PUT',b);
  if(o)ok2+=b.length;else{bad+=b.length;console.log('  실패',String(e).slice(0,150));}
  await sleep(200);}
 console.log(`탈스 축 상향 — 성공 ${ok2} / 실패 ${bad}`);
})();
