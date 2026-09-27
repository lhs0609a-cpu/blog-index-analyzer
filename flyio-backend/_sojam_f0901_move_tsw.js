// 탈스 164종을 승인 소재 보유 그룹으로 이동 + 검수중 전용그룹은 잠금
//   node _sojam_f0901_move_tsw.js [--apply]
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const APPLY=process.argv.includes('--apply');
const CAMP='cmp-a001-01-000000002808841';
const SRC_GRP='grp-a001-01-000000072615084';   // 소잠_탈스테로이드_전용 (검수중)
const DST_NAME='소잠_절실축_난치구순가려움_a31';
const FLOOR=500,CAP=20000;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,method,body,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method,body,customer_id:CID}),
  signal:AbortSignal.timeout(180000)});
 if(r.ok){const d=await r.json();if(d.success)return[true,d.response];return[false,d.error||JSON.stringify(d).slice(0,250)];}
 }catch(e){}await sleep(1500*(t+1));}return[false,'retry exhausted'];}
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const r10=v=>Math.max(70,Math.round(v/10)*10);
const lad=JSON.parse(fs.readFileSync(P('_sojam_e0831_steroid_ladder.json'),'utf8'));
const kws=JSON.parse(fs.readFileSync(P('_sojam_e0831_tsw_group.json'),'utf8')).kws;
const bidOf=k=>{const l=lad[k]||{};const e=l[1]??l[2];return e==null?FLOOR:r10(Math.min(CAP,Math.max(FLOOR,e)));};
(async()=>{
 const gs=((await raw(`/ncc/adgroups?nccCampaignId=${CAMP}`,'GET',null))[1]||[]).filter(g=>!g.delFlag);
 const dst=gs.find(g=>g.name===DST_NAME);
 if(!dst){console.log('대상 그룹 없음');return;}
 const [oa,ads]=await raw(`/ncc/ads?nccAdgroupId=${dst.nccAdgroupId}`,'GET',null);
 const ap=(ads||[]).filter(a=>!a.delFlag&&a.inspectStatus==='APPROVED'&&a.status==='ELIGIBLE');
 console.log(`대상 그룹 ${dst.name} (${dst.nccAdgroupId}) · ${dst.status}`);
 console.log(`  승인 소재 ${ap.length}개 — ${ap.map(a=>((a.ad&&a.ad.basic)||{}).headline).join(' / ')}`);
 if(!ap.length){console.log('  ▲ 승인 소재 없음 — 중단');return;}
 const [ok,have]=await raw(`/ncc/keywords?nccAdgroupId=${dst.nccAdgroupId}`,'GET',null);
 const exist=new Set((have||[]).filter(k=>!k.delFlag).map(k=>k.keyword));
 const todo=kws.filter(k=>!exist.has(k));
 console.log(`  기존 키워드 ${exist.size}개 · 이동할 탈스 ${kws.length}종 중 신규 ${todo.length}개 (중복 ${kws.length-todo.length})`);
 console.log(`  입찰가 합 ${won(todo.reduce((s,k)=>s+bidOf(k),0))}원`);
 if(!APPLY){console.log('\ndry-run — 실행하려면 --apply');return;}
 let ok1=0,bad1=0;
 for(let i=0;i<todo.length;i+=100){
  const b=todo.slice(i,i+100).map(k=>({keyword:k,bidAmt:bidOf(k),useGroupBidAmt:false}));
  const [o,e]=await raw(`/ncc/keywords?nccAdgroupId=${dst.nccAdgroupId}`,'POST',b);
  if(o)ok1+=b.length;else{bad1+=b.length;console.log('  등록 실패',String(e).slice(0,200));}
  await sleep(300);
 }
 console.log(`키워드 등록 — 성공 ${ok1} / 실패 ${bad1}`);
 // 검수중 전용그룹 잠금 (경합 제거)
 const [o2,e2]=await raw('/ncc/adgroups/'+SRC_GRP+'?fields=userLock','PUT',{nccAdgroupId:SRC_GRP,userLock:true});
 console.log(o2?'소잠_탈스테로이드_전용 그룹 잠금 완료':'그룹 잠금 실패 '+String(e2).slice(0,150));
})();
