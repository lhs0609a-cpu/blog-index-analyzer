const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method:'GET',body:null,customer_id:CID}),
  signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(700*(t+1));}return null;}
const won=n=>(n||0).toLocaleString('ko-KR');
const inv=require('./_sojam_d0828_inv_hot.json');
const WANT=['유명한한의원','강남한의원','논현동한의원','강남역한의원','압구정한의원','논현한의원','서초동한의원',
 '신사동한의원','강남구한의원','역삼동한의원','서초한의원','양재한의원','대치동한의원','강남한의원추천',
 '도곡한의원','청담동한의원','압구정동한의원','역삼한의원','청학동한의원','대치한의원'];
const tgt=inv.filter(r=>WANT.includes(r.kw));
(async()=>{
 const gids=[...new Set(tgt.map(r=>r.gid))];
 const live={},gb={};for(const r of inv)gb[r.gid]=r.gbid;
 let i=0;await Promise.all(Array.from({length:16},async()=>{while(i<gids.length){const g=gids[i++];
  const a=await raw(`/ncc/keywords?nccAdgroupId=${g}`);if(Array.isArray(a))for(const k of a)live[k.nccKeywordId]=k;}}));
 const m={};
 for(const r of tgt){const k=live[r.id];if(!k)continue;
  const eff=k.useGroupBidAmt?(gb[r.gid]||0):(k.bidAmt||0);
  (m[r.kw]||=[]).push(eff);}
 let ok=0,ng=0;
 for(const kw of WANT){const a=m[kw]||[];
  const bad=a.filter(v=>v>70);
  if(!a.length){console.log(`  ${kw.padEnd(16)} 조회실패`);continue;}
  if(bad.length){ng++;console.log(`  ${kw.padEnd(16)} ▲아직 ${won(Math.max(...bad))}원 (인스턴스 ${a.length})`);}
  else{ok++;console.log(`  ${kw.padEnd(16)} 70원 ✓ (인스턴스 ${a.length})`);}}
 console.log(`\n확인 ${ok}/${WANT.length} · 미완 ${ng}`);
})();
