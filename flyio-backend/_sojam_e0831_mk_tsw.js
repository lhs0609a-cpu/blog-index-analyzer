// 파워링크에 '소잠_탈스테로이드_전용' 그룹 생성 + 승인 소재 복제 + 탈스 키워드 이관
//   node _sojam_e0831_mk_tsw.js [--apply]
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const APPLY=process.argv.includes('--apply');
const CAMP='cmp-a001-01-000000002808841';       // 파워링크 (일예산 89,030원)
const REF_GRP='grp-a001-01-000000071999012';    // 소잠_지루성_전용 (승인 소재 보유)
const NAME='소잠_탈스테로이드_전용';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,method,body,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method,body,customer_id:CID}),
  signal:AbortSignal.timeout(180000)});
 if(r.ok){const d=await r.json();if(d.success)return[true,d.response];return[false,d.error||JSON.stringify(d).slice(0,300)];}
 }catch(e){}await sleep(1500*(t+1));}return[false,'retry exhausted'];}
const won=n=>(n||0).toLocaleString('ko-KR');
const rows=JSON.parse(fs.readFileSync(P('_sojam_e0831_steroid.json'),'utf8'));
const lad=JSON.parse(fs.readFileSync(P('_sojam_e0831_steroid_ladder.json'),'utf8'));
const r10=v=>Math.max(70,Math.round(v/10)*10);
const FLOOR=500,CAP=20000;
const kws=[...new Set(rows.map(r=>r.kw))];
const bidOf=k=>{const l=lad[k]||{};const e=l[1]??l[2];return e==null?FLOOR:r10(Math.min(CAP,Math.max(FLOOR,e)));};
(async()=>{
 // 0) 이미 만들어졌는지 확인
 const gs=(await raw(`/ncc/adgroups?nccCampaignId=${CAMP}`,'GET',null))[1]||[];
 let grp=gs.find(g=>g.name===NAME&&!g.delFlag);
 const refG=(await raw(`/ncc/adgroups?ids=${REF_GRP}`,'GET',null))[1][0];
 const [ok0,refAds]=await raw(`/ncc/ads?nccAdgroupId=${REF_GRP}`,'GET',null);
 const refAd=(refAds||[]).find(a=>!a.delFlag&&a.status==='ELIGIBLE');
 console.log(`파워링크 그룹 ${gs.filter(g=>!g.delFlag).length}개 · '${NAME}' ${grp?'이미 있음':'없음 → 생성'}`);
 console.log(`복제할 소재: [${refAd.type}] ${refAd.ad.basic.headline} · 심의 ${refAd.ad.basic.medicalNo}`);
 console.log(`이관할 키워드 ${kws.length}종 · 입찰가 합 ${won(kws.reduce((s,k)=>s+bidOf(k),0))}원 (평균 ${won(kws.reduce((s,k)=>s+bidOf(k),0)/kws.length)}원)`);
 console.log(`기존 인스턴스 ${rows.length}개는 70원으로 내려 경합 제거`);
 if(!APPLY){console.log('\ndry-run — 실행하려면 --apply');return;}

 // 1) 그룹 생성
 if(!grp){
  const payload={nccCampaignId:CAMP,name:NAME,adgroupType:'WEB_SITE',
   pcChannelId:refG.pcChannelId,mobileChannelId:refG.mobileChannelId,
   bidAmt:70,useDailyBudget:false,keywordPlusWeight:100,
   mobileNetworkBidWeight:120,pcNetworkBidWeight:100,useCntsNetworkBidAmt:false,contentsNetworkBidAmt:70};
  const [o,r]=await raw('/ncc/adgroups','POST',payload);
  if(!o){console.log('그룹 생성 실패',String(r).slice(0,300));return;}
  grp=r;console.log(`그룹 생성 완료 — ${grp.nccAdgroupId}`);
 }
 // 2) 소재 복제
 const [oa,cur]=await raw(`/ncc/ads?nccAdgroupId=${grp.nccAdgroupId}`,'GET',null);
 if(!(cur||[]).some(a=>!a.delFlag)){
  const b=JSON.parse(JSON.stringify(refAd.ad.basic));
  const [o,r]=await raw('/ncc/ads','POST',{nccAdgroupId:grp.nccAdgroupId,type:refAd.type,ad:{basic:b}});
  console.log(o?`소재 등록 완료 — ${r.nccAdId} (${r.inspectStatus})`:`소재 등록 실패 ${String(r).slice(0,300)}`);
 } else console.log('소재 이미 있음 — 건너뜀');
 // 3) 키워드 등록
 const [ok,have]=await raw(`/ncc/keywords?nccAdgroupId=${grp.nccAdgroupId}`,'GET',null);
 const exist=new Set((have||[]).filter(k=>!k.delFlag).map(k=>k.keyword));
 const todo=kws.filter(k=>!exist.has(k));
 console.log(`키워드 등록 — 이미 ${exist.size}개 · 새로 ${todo.length}개`);
 let ok1=0,bad1=0;
 for(let i=0;i<todo.length;i+=100){
  const b=todo.slice(i,i+100).map(k=>({keyword:k,bidAmt:bidOf(k),useGroupBidAmt:false}));
  const [o,e]=await raw(`/ncc/keywords?nccAdgroupId=${grp.nccAdgroupId}`,'POST',b);
  if(o)ok1+=b.length;else{bad1+=b.length;console.log('  실패',String(e).slice(0,200));}
  await sleep(300);
 }
 console.log(`키워드 등록 완료 — 성공 ${ok1} / 실패 ${bad1}`);
 fs.writeFileSync(P('_sojam_e0831_tsw_group.json'),JSON.stringify({grp:grp.nccAdgroupId,kws},null,1));
 // 4) 기존 인스턴스 70원으로
 const items=rows.map(r=>({nccKeywordId:r.id,nccAdgroupId:r.gid,bidAmt:70,useGroupBidAmt:false}));
 let ok2=0,bad2=0;
 for(let i=0;i<items.length;i+=100){const b=items.slice(i,i+100);
  const [o,e]=await raw('/ncc/keywords?fields=bidAmt','PUT',b);
  if(o)ok2+=b.length;else{bad2+=b.length;console.log('  구인스턴스 실패',String(e).slice(0,150));}
  await sleep(150);}
 console.log(`기존 인스턴스 70원 인하 — 성공 ${ok2} / 실패 ${bad2}`);
})();
