// 9/15 두통 축 신규 발굴 779개를 "승인 소재가 붙어 있는" 9/14 두통 그룹에 축별로 등록한다.
//   대상 캠페인: cmp-a001-01-000000009310428 (해울한의원 파워링크, 60,000원)
//   그룹: 해울_0914_* 중 소재 APPROVED·운영중인 것만. 소재 0개(17~20번)는 쓰지 않는다.
//   입찰: useGroupBidAmt=true → 그룹 입찰 70원 상속(그룹 입찰 하나로 축 전체를 올릴 수 있다)
// 사용: node _haeul_20260915_register.js --dry | --apply
const fs=require('fs'),path=require('path'),assert=require('assert');
const CID=3442423,CAMP='cmp-a001-01-000000009310428',LIMIT=1000,GBID=70;
const SRC='D:/developer/blog-index-analyzer/output/haeul-headache-20260915/두통_신규후보_20260915.csv';
const D=path.join(__dirname,'reports','haeul_20260915');fs.mkdirSync(D,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const norm=s=>s.replace(/\s+/g,'').toLowerCase();
async function api(m,p,b=null){for(let n=0;n<(m==='GET'?4:2);n++)try{
 const r=await fetch('https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID,
  {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:String(CID),method:m,path:p,body:b}),signal:AbortSignal.timeout(60000)});
 const d=await r.json(); if(!r.ok||!d.success)throw Error(String(d.error||'').slice(0,400)); return d.response;
}catch(e){if(n===(m==='GET'?3:1))throw e;await sleep(2500);}}

// 축 배정 — 위에서부터 먼저 걸리는 그룹으로. 전부 소재 승인된 그룹만 쓴다.
const ROUTE=[
 [/삼차신경통/,'06_삼차신경통'],
 [/군발/,'05_군발두통'],
 [/약물과용|진통제|타이레놀|약먹어도|게보린|이지엔|펜잘|낫도|내성/,'08_약물과용두통'],
 [/생리|월경|배란|임신|임산부|산후|출산후|갱년기|폐경|피임약/,'04_생리전두통'],
 [/수험생|고3|중학생|고등학생|공부할때|시험/,'21_수험생두통'],
 [/소아|어린이|아기|유아|초등|아이두통|아이머리/,'09_소아두통'],
 [/노인|60대|70대|고령/,'07_노인성두통'],
 [/편두통/,'03_편두통'],
 [/긴장성|뒷목|목뒤|경추|거북목|어깨|승모근|뻐근/,'02_긴장성두통'],
 [/어지|현훈|이석|메니에르|전정/,'12_어지럼증'],
 [/불면|잠못|수면부족/,'15_불면증'],
 [/공황|불안/,'16_공황장애'],
 [/자율신경/,'10_자율신경실조증'],
 [/./,'01_두통 일반'],
];
const route=k=>ROUTE.find(([re])=>re.test(k))[1];

(async()=>{
 const mode=['--dry','--apply'].find(m=>process.argv.includes(m));
 assert(mode,'--dry 또는 --apply');
 const csv=fs.readFileSync(SRC,'utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/).slice(1);
 const cands=csv.map(l=>l.split(',')[0]).filter(Boolean);
 assert(cands.length>700,'후보 CSV 가 비었다: '+cands.length);

 const gs=(await api('GET','/ncc/adgroups?nccCampaignId='+CAMP)).filter(g=>/^해울_0914_/.test(g.name));
 const byName={};for(const g of gs)byName[g.name.replace(/^해울_0914_/,'')]=g;
 // 소재 승인·운영중 검증
 const usable={};
 for(const [k,g] of Object.entries(byName)){
  const ads=await api('GET','/ncc/ads?nccAdgroupId='+g.nccAdgroupId);
  const ok=ads.filter(a=>a.inspectStatus==='APPROVED'&&!a.userLock).length;
  if(ok>0&&!g.userLock) usable[k]={g,ads:ok};
  await sleep(200);
 }
 console.log('소재 승인·운영중 그룹 '+Object.keys(usable).length+'개');

 // 그룹별 기존 키워드(중복 가드)
 const live={},cap={};
 for(const [k,v] of Object.entries(usable)){
  const ks=await api('GET','/ncc/keywords?nccAdgroupId='+v.g.nccAdgroupId);
  live[k]=new Set(ks.map(x=>norm(x.keyword)));cap[k]=LIMIT-ks.length;
  await sleep(200);
 }

 // 배정 + 넘치면 01_두통 일반 → 그래도 넘치면 여유 있는 그룹으로
 const plan={},skip=[];
 for(const kw of cands){
  let t=route(kw);
  if(!usable[t]) t='01_두통 일반';
  if(live[t].has(norm(kw))){skip.push([kw,'그룹내 중복']);continue}
  const used=(plan[t]||[]).length;
  if(used>=cap[t]){
   const alt=Object.keys(usable).find(k=>(plan[k]||[]).length<cap[k]&&!live[k].has(norm(kw)));
   if(!alt){skip.push([kw,'모든 그룹 정원초과']);continue}
   t=alt;
  }
  (plan[t]=plan[t]||[]).push(kw);
 }
 const total=Object.values(plan).reduce((s,a)=>s+a.length,0);
 console.log('\n배정 결과 (후보 '+cands.length+' → 등록대상 '+total+', 제외 '+skip.length+')');
 for(const k of Object.keys(plan).sort())
  console.log('  '+k.padEnd(22)+String(plan[k].length).padStart(4)+'개  (기존 '+live[k].size+' → '+(live[k].size+plan[k].length)+' / 정원 '+LIMIT+')');
 if(skip.length)console.log('  제외: '+skip.slice(0,5).map(s=>s[0]+'('+s[1]+')').join(', ')+(skip.length>5?' 외 '+(skip.length-5):''));
 fs.writeFileSync(path.join(D,'register_plan.json'),JSON.stringify({plan,skip},null,1));
 if(mode==='--dry'){console.log('\n--dry: 아무것도 등록하지 않았다.');return;}

 const log=path.join(D,'register_events.jsonl');
 let done=0,fail=0;
 for(const [k,arr] of Object.entries(plan)){
  const gid=usable[k].g.nccAdgroupId;
  for(let i=0;i<arr.length;i+=100){
   // ⚠️ bidAmt 를 빼면 네이버가 HTTP 200 에 resultStatus 3916(입찰가 미입력)만 담아 돌려주고
   //    아무것도 저장되지 않는다. useGroupBidAmt=true 여도 bidAmt 를 같이 보내야 한다.
   //    응답 배열 길이는 성공 수가 아니다 — nccKeywordId 유무로 세야 한다.
   const part=arr.slice(i,i+100).map(kw=>({keyword:norm(kw),bidAmt:GBID,useGroupBidAmt:true,userLock:false}));
   try{
    const r=await api('POST','/ncc/keywords?nccAdgroupId='+gid,part);
    const ok=r.filter(x=>x.nccKeywordId);
    const bad=r.filter(x=>!x.nccKeywordId);
    done+=ok.length;fail+=bad.length;
    fs.appendFileSync(log,JSON.stringify({g:k,gid,ok:ok.length,bad:bad.length,ids:ok.map(x=>x.nccKeywordId),
      errs:bad.slice(0,5).map(x=>({kw:x.keyword,rs:x.resultStatus}))})+'\n');
    console.log('  '+k+' +'+ok.length+(bad.length?'  거부 '+bad.length+' '+JSON.stringify(bad[0].resultStatus):'')+'  (누적 '+done+')');
   }catch(e){
    fail+=part.length;
    fs.appendFileSync(log,JSON.stringify({g:k,gid,error:e.message,kws:part.map(x=>x.keyword)})+'\n');
    console.log('  ⚠️ '+k+' 배치 실패: '+e.message);
   }
   await sleep(1200);
  }
 }
 console.log('\n등록 '+done+'개 / 실패 '+fail+'개');
 // 검증
 await sleep(2000);
 let after=0;
 for(const k of Object.keys(plan)){
  const ks=await api('GET','/ncc/keywords?nccAdgroupId='+usable[k].g.nccAdgroupId);
  console.log('  검증 '+k.padEnd(22)+live[k].size+' → '+ks.length+' (+'+(ks.length-live[k].size)+')');
  after+=ks.length-live[k].size;
  await sleep(300);
 }
 console.log('검증 합계 +'+after+'개');
})();
