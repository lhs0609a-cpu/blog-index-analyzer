// 해울 '편두통한의원' 메인 두통그룹 입찰가를 4,580 → 7,000 으로 올린다.
// 적용 직전 현재값을 다시 읽어 before 와 다르면 멈춘다. 적용 후 라이브로 대조한다.
// 사용: node _haeul_20260915_bid.js --dry | --apply
const fs=require('fs'),path=require('path'),assert=require('assert');
const CID=3442423, D0=path.join(__dirname,'reports','haeul_20260915');
fs.mkdirSync(D0,{recursive:true});
const save=(n,x)=>fs.writeFileSync(path.join(D0,n+'.json'),JSON.stringify(x,null,1));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(method,p,body=null){for(let t=0;t<(method==='GET'?4:1);t++){try{
 const r=await fetch('https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:String(CID),method,path:p,body}),signal:AbortSignal.timeout(45000)});
 const d=await r.json();if(!r.ok||!d.success)throw Error(String(d.error||JSON.stringify(d)).slice(0,400));return d.response;
}catch(e){if(method!=='GET'||t===3)throw e;await sleep(2000);}}}

const PLAN=[{kid:'nkw-a001-01-000007141677653',gid:'grp-a001-01-000000049624428',keyword:'편두통한의원',before:4580,after:7000}];
const CAP=10000; // 두통 축 원장 승인 입찰 상한

(async()=>{
 const mode=['--dry','--apply'].find(m=>process.argv.includes(m));
 assert(mode,'--dry 또는 --apply 를 붙여라');
 for(const p of PLAN){
  assert(p.after%10===0,'입찰가는 10원 단위여야 한다: '+p.after);
  assert(p.after<=CAP,'두통 축 상한 '+CAP+'원 초과: '+p.after);
 }
 const gids=[...new Set(PLAN.map(p=>p.gid))];
 const before={};
 for(const gid of gids){
  const g=await api('GET','/ncc/adgroups/'+gid);
  assert.equal(g.customerId,CID);
  assert(!g.userLock,'그룹이 꺼져 있다: '+g.name);
  before[gid]={group:{id:g.nccAdgroupId,name:g.name,bidAmt:g.bidAmt,userLock:g.userLock,status:g.status},
               keywords:await api('GET','/ncc/keywords?nccAdgroupId='+gid)};
 }
 const km=new Map(Object.values(before).flatMap(x=>x.keywords).map(k=>[k.nccKeywordId,k]));
 for(const p of PLAN){
  const k=km.get(p.kid);
  assert(k,'키워드를 찾지 못했다: '+p.keyword);
  assert.equal(k.keyword,p.keyword,'키워드 이름 불일치: '+k.keyword);
  assert.equal(k.bidAmt,p.before,'현재 입찰가가 계획과 다르다 '+p.keyword+' '+k.bidAmt+'≠'+p.before);
  assert(!k.userLock,'키워드가 꺼져 있다: '+p.keyword);
  assert(!k.useGroupBidAmt,'그룹 입찰가를 쓰고 있다: '+p.keyword);
  console.log(`${p.keyword}  ${p.before} → ${p.after}원  (그룹 ${before[p.gid].group.name}, QI ${k.nccQi&&k.nccQi.qiGrade}등급)`);
 }
 save('bid_before',before);
 console.log('사전검증 통과: '+PLAN.length+'개');
 if(mode==='--dry'){console.log('--dry: 아무것도 바꾸지 않았다.');return;}

 const r=await api('PUT','/ncc/keywords?fields=bidAmt',
   PLAN.map(p=>({nccKeywordId:p.kid,nccAdgroupId:p.gid,bidAmt:p.after,useGroupBidAmt:false})));
 assert(Array.isArray(r)&&r.length===PLAN.length,'응답 수 불일치: '+JSON.stringify(r).slice(0,300));
 save('bid_response',r);

 // 라이브 대조 (스크립트 카운터가 아니라 실제 값으로 본다)
 await sleep(1500);
 const live=await api('GET','/ncc/keywords?ids='+PLAN.map(p=>p.kid).join(','));
 const lm=new Map(live.map(k=>[k.nccKeywordId,k]));
 const bad=PLAN.filter(p=>{const k=lm.get(p.kid);return !k||k.bidAmt!==p.after||k.useGroupBidAmt||k.userLock;});
 save('bid_after',live);
 for(const p of PLAN){const k=lm.get(p.kid);console.log(`라이브 확인: ${p.keyword} = ${k?k.bidAmt:'없음'}원`);}
 assert.equal(bad.length,0,'라이브 값이 계획과 다르다: '+bad.map(p=>p.keyword).join(','));
 console.log('완료: '+PLAN.length+'개 반영됨. 기록 '+path.relative(process.cwd(),D0));
})().catch(e=>{console.error('실패:',String(e));process.exitCode=1;});
