// 9/16 해울 특성 발굴 843개를 소재 승인된 9/14 그룹에 축별로 등록한다.
//   축 라우팅: 자율신경/미주신경/기립성 → 10·11번, 어지럼/이석/메니에르/전정 → 12·13·14번,
//              불면 → 15번, 공황/두근 → 16번, 두통계 → 01~09·21번.
//   입찰: bidAmt 70 + useGroupBidAmt (그룹 입찰 하나로 축 전체 조절 가능)
//   ⚠️ bidAmt 를 빼면 네이버가 200 에 resultStatus 3916 만 담아 돌려주고 아무것도 저장 안 된다.
// 사용: node _haeul_20260916_register.js --dry | --apply
const fs=require('fs'),path=require('path'),assert=require('assert');
const CID=3442423,CAMP='cmp-a001-01-000000009310428',LIMIT=1000,GBID=70;
const SRC='D:/developer/blog-index-analyzer/output/haeul-visit-discovery-20260916/해울특성_내원후보_20260916.csv';
const D=path.join(__dirname,'reports','haeul_20260916');fs.mkdirSync(D,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const norm=s=>s.replace(/\s+/g,'').toLowerCase();
async function api(m,p,b=null){for(let n=0;n<(m==='GET'?4:2);n++)try{
 const r=await fetch('https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID,
  {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:String(CID),method:m,path:p,body:b}),signal:AbortSignal.timeout(60000)});
 const d=await r.json(); if(!r.ok||!d.success)throw Error(String(d.error||'').slice(0,400)); return d.response;
}catch(e){if(n===(m==='GET'?3:1))throw e;await sleep(2500);}}

const ROUTE=[
 [/미주신경|실신|기절|기립성/,'11_미주신경성실신'],
 [/자율신경/,'10_자율신경실조증'],
 [/메니에르/,'13_메니에르병'],
 [/전정신경|평형장애/,'14_전정신경염'],
 [/이석증|어지럼|어지러|현훈/,'12_어지럼증'],
 [/불면|잠못|수면장애|수면부족/,'15_불면증'],
 [/공황|두근거림|심계항진|불안/,'16_공황장애'],
 [/삼차신경통/,'06_삼차신경통'],
 [/군발/,'05_군발두통'],
 [/약물과용|진통제|타이레놀|소염진통제|약부작용|약내성|약없이|양약/,'08_약물과용두통'],
 [/생리|월경|배란|임신|임산부|산후|갱년기|폐경/,'04_생리전두통'],
 [/수험생|고3|중학생|고등학생/,'21_수험생두통'],
 [/소아|어린이|아기|유아|초등/,'09_소아두통'],
 [/노인|고령|60대|70대/,'07_노인성두통'],
 [/편두통/,'03_편두통'],
 [/긴장성|뒷목|목뒤|경추|거북목|승모근/,'02_긴장성두통'],
 [/./,'01_두통 일반'],
];
const route=k=>ROUTE.find(([re])=>re.test(k))[1];

(async()=>{
 const mode=['--dry','--apply'].find(m=>process.argv.includes(m));
 assert(mode,'--dry 또는 --apply');
 const lines=fs.readFileSync(SRC,'utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/).slice(1);
 const cands=lines.map(l=>norm(l.split(',')[0])).filter(Boolean);
 assert(cands.length>800,'후보 CSV 이상: '+cands.length);
 console.log('후보 '+cands.length+'개');

 const gs=(await api('GET','/ncc/adgroups?nccCampaignId='+CAMP)).filter(g=>/^해울_0914_/.test(g.name));
 const usable={},live={},cap={};
 for(const g of gs){
  const k=g.name.replace(/^해울_0914_/,'');
  const ads=await api('GET','/ncc/ads?nccAdgroupId='+g.nccAdgroupId);
  if(g.userLock||!ads.some(a=>a.inspectStatus==='APPROVED'&&!a.userLock)){await sleep(150);continue}
  const ks=await api('GET','/ncc/keywords?nccAdgroupId='+g.nccAdgroupId);
  usable[k]={g};live[k]=new Set(ks.map(x=>norm(x.keyword)));cap[k]=LIMIT-ks.length;
  await sleep(200);
 }
 console.log('소재 승인·운영중 그룹 '+Object.keys(usable).length+'개');

 const plan={},skip=[];
 for(const kw of cands){
  let t=route(kw); if(!usable[t]) t='01_두통 일반';
  if(live[t].has(kw)){skip.push([kw,'그룹내 중복']);continue}
  if((plan[t]||[]).length>=cap[t]){
   const alt=Object.keys(usable).find(k=>(plan[k]||[]).length<cap[k]&&!live[k].has(kw));
   if(!alt){skip.push([kw,'정원초과']);continue}
   t=alt;
  }
  (plan[t]=plan[t]||[]).push(kw);
 }
 const total=Object.values(plan).reduce((s,a)=>s+a.length,0);
 console.log('\n배정 (등록대상 '+total+', 제외 '+skip.length+')');
 for(const k of Object.keys(plan).sort())
  console.log('  '+k.padEnd(22)+String(plan[k].length).padStart(4)+'개  (기존 '+live[k].size+' → '+(live[k].size+plan[k].length)+' / 정원 '+LIMIT+')');
 if(skip.length)console.log('  제외: '+skip.slice(0,6).map(s=>s[0]+'('+s[1]+')').join(', ')+(skip.length>6?' 외 '+(skip.length-6):''));
 fs.writeFileSync(path.join(D,'register_plan.json'),JSON.stringify({plan,skip},null,1));
 if(mode==='--dry'){console.log('\n--dry: 아무것도 등록하지 않았다.');return}

 const log=path.join(D,'register_events.jsonl');
 let done=0,fail=0;const rejects=[];
 for(const [k,arr] of Object.entries(plan)){
  const gid=usable[k].g.nccAdgroupId;
  for(let i=0;i<arr.length;i+=100){
   const part=arr.slice(i,i+100).map(kw=>({keyword:kw,bidAmt:GBID,useGroupBidAmt:true,userLock:false}));
   try{
    const r=await api('POST','/ncc/keywords?nccAdgroupId='+gid,part);
    const ok=r.filter(x=>x.nccKeywordId),bad=r.filter(x=>!x.nccKeywordId);
    done+=ok.length;fail+=bad.length;
    for(const b of bad)rejects.push({kw:b.keyword,rs:b.resultStatus});
    fs.appendFileSync(log,JSON.stringify({g:k,gid,ok:ok.length,bad:bad.length,ids:ok.map(x=>x.nccKeywordId)})+'\n');
    console.log('  '+k+' +'+ok.length+(bad.length?'  거부 '+bad.length:'')+'  (누적 '+done+')');
   }catch(e){fail+=part.length;console.log('  ⚠️ '+k+' 배치 실패: '+e.message)}
   await sleep(1200);
  }
 }
 fs.writeFileSync(path.join(D,'rejects.json'),JSON.stringify(rejects,null,1));
 console.log('\n등록 '+done+' / 거부 '+fail);
 await sleep(2000);
 let after=0;
 for(const k of Object.keys(plan)){
  const ks=await api('GET','/ncc/keywords?nccAdgroupId='+usable[k].g.nccAdgroupId);
  console.log('  검증 '+k.padEnd(22)+live[k].size+' → '+ks.length+' (+'+(ks.length-live[k].size)+')');
  after+=ks.length-live[k].size;await sleep(300);
 }
 console.log('검증 합계 +'+after);
})();
