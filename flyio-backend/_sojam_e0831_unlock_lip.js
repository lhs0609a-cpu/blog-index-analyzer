const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const APPLY=process.argv.includes('--apply');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,method,body,tries=5){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method,body,customer_id:CID}),
  signal:AbortSignal.timeout(180000)});
 if(r.ok){const d=await r.json();if(d.success)return[true,d.response];
  if(/BAD_REQUEST|11001/.test(String(d.error)))return[false,d.error];}}catch(e){}
 await sleep(Math.min(1500*(t+1),10000));}return[false,'retry exhausted'];}
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const snap=JSON.parse(fs.readFileSync(P('_sojam_e0831_up_lip_ROLLBACK.json'),'utf8'));
const inv=JSON.parse(fs.readFileSync(P('_sojam_d0828_inv_hot.json'),'utf8'));
const tgt=inv.filter(r=>snap[r.id]);
(async()=>{
 const gids=[...new Set(tgt.map(r=>r.gid))];
 const live={};let i=0;
 await Promise.all(Array.from({length:20},async()=>{while(i<gids.length){const g=gids[i++];
  const [o,a]=await raw(`/ncc/keywords?nccAdgroupId=${g}`,'GET',null);
  if(o&&Array.isArray(a))for(const k of a)live[k.nccKeywordId]=k;}}));
 const stuck=tgt.filter(r=>live[r.id]&&(live[r.id].userLock||live[r.id].status!=='ELIGIBLE'));
 console.log(`잠김/비노출 인스턴스 ${stuck.length}개`);
 for(const r of stuck){const k=live[r.id];
  console.log(`  ${r.kw.slice(0,22).padEnd(24)}${won(k.bidAmt).padStart(8)}원 · ${k.status}${k.userLock?' · 잠김':''} · ${r.camp.slice(0,28)} / ${r.grp.slice(0,20)}`);}
 const un=stuck.filter(r=>live[r.id].userLock).map(r=>({nccKeywordId:r.id,nccAdgroupId:r.gid,userLock:false}));
 if(!un.length){console.log('잠금 해제할 것 없음');return;}
 if(!APPLY){console.log(`\ndry-run — 잠금해제 ${un.length}개, 적용하려면 --apply`);return;}
 let ok=0,bad=0;
 for(let j=0;j<un.length;j+=100){const b=un.slice(j,j+100);
  const [o,e]=await raw('/ncc/keywords?fields=userLock','PUT',b);
  if(o)ok+=b.length;else{bad+=b.length;console.log('  실패',String(e).slice(0,90));}await sleep(150);}
 console.log(`잠금 해제 완료 — 성공 ${ok} / 실패 ${bad}`);
})();
