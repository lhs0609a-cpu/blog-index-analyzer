// 적용 후 라이브 재조회 — 규칙 대상 인스턴스 중 아직 70원 초과가 남아있나
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const {why}=require('./_sojam_d0828_rule.js');
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method:'GET',body:null,customer_id:CID}),
  signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(600*(t+1));}return null;}
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
(async()=>{
 const inv=JSON.parse(fs.readFileSync(P('_sojam_d0828_inv_hot.json'),'utf8'));
 const changed=inv.map(r=>({...r,why:why(r.kw)})).filter(r=>r.why&&r.eff>70);
 const gids=[...new Set(changed.map(r=>r.gid))];
 console.error(`검증 대상 인스턴스 ${changed.length}개 · 그룹 ${gids.length}개 재조회…`);
 const live={};let i=0,done=0;
 await Promise.all(Array.from({length:24},async()=>{while(i<gids.length){const g=gids[i++];
  const arr=await raw(`/ncc/keywords?nccAdgroupId=${g}`);
  if(Array.isArray(arr))for(const k of arr)live[k.nccKeywordId]=k;
  if(++done%200===0)console.error(`  ${done}/${gids.length}`);}}));
 let ok=0,still=0,miss=0;const bad=[];
 const gbid={};for(const r of inv)gbid[r.gid]=r.gbid;
 for(const r of changed){const k=live[r.id];
  if(!k){miss++;continue;}
  const eff=k.useGroupBidAmt?(gbid[r.gid]||0):(k.bidAmt||0);
  if(eff<=70)ok++;else{still++;bad.push({...r,now:eff});}}
 console.log(`\n적용 검증 — 70원 확인 ${won(ok)} / 아직 초과 ${won(still)} / 조회실패 ${won(miss)}`);
 if(bad.length){console.log('\n아직 70원 초과인 것 상위 20:');
  bad.sort((a,b)=>b.now-a.now).slice(0,20).forEach(r=>
   console.log(`  ${r.kw.slice(0,20).padEnd(22)}${won(r.now).padStart(8)}원  [${r.why}]  ${r.camp.slice(0,28)}`));}
 // 8/27·8/28 새어나갔던 키워드 개별 확인
 console.log('\n=== 어제·오늘 클릭으로 잡힌 누수 키워드 현재 상태 ===');
 const watch=['피부건선','건선치료제','강동구한의원','화농성여드름연고','몸두드러기','만성두드러기원인','수원아토피한의원','강남건선','강남두드러기'];
 for(const kw of watch){
  const rs=inv.filter(r=>r.kw===kw);
  const line=rs.map(r=>{const k=live[r.id];const eff=k?(k.useGroupBidAmt?(gbid[r.gid]||0):(k.bidAmt||0)):null;
    return `${r.camp.slice(0,20)}:${eff===null?'?':won(eff)+'원'}`;}).join(' · ');
  console.log(`  ${kw.padEnd(16)}${line}`);}
})();
