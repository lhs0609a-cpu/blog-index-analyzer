// 내원 의도 S·A등급 중복 어휘의 "저가 복제본"을 userLock 으로 끈다(삭제 아님, 되돌릴 수 있음).
//   근거: 같은 어휘가 (모)메인 그룹의 제값 입찰 ↔ 해울_혼합 그룹의 70~800원 복제본으로 이중 등록돼 있고,
//         이게 편두통한의원 7,000원 미노출 / 어지럼증병원 25,000원 4.5위의 유력한 원인이다.
//   방식: 라이브 재조회 → 어휘별 최고 입찰 1개만 남기고 나머지 OFF.
//   API : PUT /ncc/keywords?fields=userLock  [{nccKeywordId,nccAdgroupId,userLock}] (100개/콜)
//   되돌리기: node _haeul_20260915_dedup.js --apply --unlock
// 사용: node _haeul_20260915_dedup.js --dry | --apply [--unlock]
const fs=require('fs'),path=require('path'),assert=require('assert');
const CID=3442423;
const SRC='C:/Users/leegu/AppData/Local/Temp/claude/D--developer-blog-index-analyzer/a35fa72c-0379-4cf7-b931-65c42fdccb9e/scratchpad/visit_rows.json';
const D=path.join(__dirname,'reports','haeul_20260915');fs.mkdirSync(D,{recursive:true});
const STATE=path.join(D,'dedup_locked.json');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(m,p,b=null){for(let n=0;n<(m==='GET'?4:2);n++)try{
 const r=await fetch('https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID,
  {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:String(CID),method:m,path:p,body:b}),signal:AbortSignal.timeout(60000)});
 const d=await r.json(); if(!r.ok||!d.success)throw Error(String(d.error||'').slice(0,400)); return d.response;
}catch(e){if(n===(m==='GET'?3:1))throw e;await sleep(2500);}}

(async()=>{
 const mode=['--dry','--apply'].find(m=>process.argv.includes(m));
 assert(mode,'--dry 또는 --apply');
 const unlock=process.argv.includes('--unlock');

 if(unlock){
  assert(fs.existsSync(STATE),'복구할 기록이 없다: '+STATE);
  const rec=JSON.parse(fs.readFileSync(STATE,'utf8'));
  console.log('되돌리기 대상 '+rec.length+'개');
  if(mode==='--dry'){console.log('--dry: 아무것도 안 함');return}
  for(let i=0;i<rec.length;i+=100){
   await api('PUT','/ncc/keywords?fields=userLock',rec.slice(i,i+100).map(x=>({nccKeywordId:x.kid,nccAdgroupId:x.gid,userLock:false})));
   console.log('  재개 '+Math.min(i+100,rec.length)+'/'+rec.length);await sleep(800);
  }
  console.log('완료');return;
 }

 const rows=JSON.parse(fs.readFileSync(SRC,'utf8')).filter(x=>['S','A'].includes(x.grade));
 const by={};for(const x of rows){const k=x.kw.replace(/\s+/g,'').toLowerCase();(by[k]=by[k]||[]).push(x)}
 const cand=Object.entries(by).filter(([,v])=>v.length>1);
 const kids=[...new Set(cand.flatMap(([,v])=>v.map(x=>x.kid)))];
 console.log('중복 후보 '+cand.length+'어휘 / 키워드 '+kids.length+'개 — 라이브 재조회');
 const live={};
 for(let i=0;i<kids.length;i+=20){
  const r=await api('GET','/ncc/keywords?ids='+kids.slice(i,i+20).join(','));
  for(const k of r)live[k.nccKeywordId]=k;
  await sleep(300);
 }
 console.log('라이브 확인 '+Object.keys(live).length+'/'+kids.length+'개');

 const gname={},plan=[];
 for(const [kw,v] of cand){
  const ls=v.map(x=>live[x.kid]).filter(Boolean);
  if(ls.length<2)continue;
  ls.sort((a,b)=>b.bidAmt-a.bidAmt);
  const keep=ls[0];
  for(const x of ls.slice(1)){
   if(x.userLock)continue;
   plan.push({kw,kid:x.nccKeywordId,gid:x.nccAdgroupId,bid:x.bidAmt,keepBid:keep.bidAmt,keepGid:keep.nccAdgroupId});
  }
 }
 for(const g of [...new Set(plan.flatMap(p=>[p.gid,p.keepGid]))]){
  try{gname[g]=(await api('GET','/ncc/adgroups/'+g)).name}catch(e){gname[g]=g.slice(-8)}
  await sleep(120);
 }
 console.log('\n끌 복제본 '+plan.length+'개 (어휘 '+new Set(plan.map(p=>p.kw)).size+'개)');
 for(const p of plan.slice(0,25))
  console.log('  '+p.kw.padEnd(20)+String(p.bid).padStart(6)+'원['+(gname[p.gid]||'').slice(0,20)+'] 끔  ← 남김 '+p.keepBid+'원['+(gname[p.keepGid]||'').slice(0,20)+']');
 if(plan.length>25)console.log('  … 외 '+(plan.length-25)+'개');
 fs.writeFileSync(path.join(D,'dedup_plan.json'),JSON.stringify({plan,gname},null,1));
 if(mode==='--dry'){console.log('\n--dry: 아무것도 바꾸지 않았다.');return}

 assert(plan.every(p=>p.bid<=p.keepBid),'남길 것보다 입찰이 높은 걸 끄려 한다 — 중단');
 let n=0;
 for(let i=0;i<plan.length;i+=100){
  const part=plan.slice(i,i+100);
  await api('PUT','/ncc/keywords?fields=userLock',part.map(p=>({nccKeywordId:p.kid,nccAdgroupId:p.gid,userLock:true})));
  n+=part.length;console.log('  OFF '+n+'/'+plan.length);await sleep(900);
 }
 fs.writeFileSync(STATE,JSON.stringify(plan,null,1));
 await sleep(2000);
 let off=0,on=0;
 for(let i=0;i<plan.length;i+=20){
  const r=await api('GET','/ncc/keywords?ids='+plan.slice(i,i+20).map(p=>p.kid).join(','));
  for(const k of r)k.userLock?off++:on++;
  await sleep(250);
 }
 console.log('\n검증: OFF '+off+' / 아직 ON '+on);
 assert(on===0,'꺼지지 않은 복제본이 있다: '+on);
 console.log('기록 '+STATE+'  — 되돌리려면 --apply --unlock');
})();
