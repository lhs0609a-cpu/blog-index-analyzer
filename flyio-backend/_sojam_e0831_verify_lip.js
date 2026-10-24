const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method:'GET',body:null,customer_id:CID}),
  signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(700*(t+1));}return null;}
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const plan=JSON.parse(fs.readFileSync(P('_sojam_e0831_up_lip_plan.json'),'utf8'));
const snap=JSON.parse(fs.readFileSync(P('_sojam_e0831_up_lip_ROLLBACK.json'),'utf8'));
const want={};for(const [id,s] of Object.entries(snap))want[id]=s;
const inv=JSON.parse(fs.readFileSync(P('_sojam_d0828_inv_hot.json'),'utf8'));
const tgt=new Map();for(const r of inv)if(want[r.id])tgt.set(r.id,r);
const byKw={};for(const p of plan)byKw[p.kw]=p.nb;
(async()=>{
 const gids=[...new Set([...tgt.values()].map(r=>r.gid))];
 console.error(`그룹 ${gids.length}개 재조회…`);
 const live={};let i=0;
 await Promise.all(Array.from({length:20},async()=>{while(i<gids.length){const g=gids[i++];
  const a=await raw(`/ncc/keywords?nccAdgroupId=${g}`);if(Array.isArray(a))for(const k of a)live[k.nccKeywordId]=k;}}));
 let ok=0,ng=0,lock=0;const bad=[];
 for(const p of plan){}
 const planById={};
 for(const r of tgt.values()){const nb=byKw[r.kw];if(nb==null)continue;
  const k=live[r.id];if(!k){ng++;continue;}
  const eff=k.useGroupBidAmt?0:(k.bidAmt||0);
  if(eff>=nb)ok++;else{ng++;bad.push({kw:r.kw,want:nb,got:eff});}
  if(k.userLock)lock++;}
 console.log(`\n적용 검증 — 목표가 이상 확인 ${won(ok)} / 미달 ${won(ng)} · 아직 잠김 ${won(lock)}`);
 if(bad.length)bad.slice(0,15).forEach(b=>console.log(`  ${b.kw.padEnd(22)}목표 ${won(b.want)}원 · 현재 ${won(b.got)}원`));
 const el=[...tgt.values()].filter(r=>live[r.id]&&live[r.id].status==='ELIGIBLE').length;
 console.log(`노출가능(ELIGIBLE) 인스턴스 ${won(el)} / ${won(tgt.size)}`);
})();
