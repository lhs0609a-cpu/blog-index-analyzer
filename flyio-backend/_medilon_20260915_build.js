// 메디론(4362992) 대출 축 구축.
// 계정 키워드 한도 10만에 93,219이 차 있어 auto_001_* 무관 키워드 11,186을 먼저 비우고
// 비어 있던 대출 축 17,467개를 채운다. 한도에 걸리면 API가 HTTP 200에 resultStatus 3912만
// 붙여 조용히 버리므로 성공은 nccKeywordId 유무로만 센다.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const C=JSON.parse(fs.readFileSync(path.join(__dirname,'_medilon_creds.json'),'utf8'));
const BASE='https://api.searchad.naver.com',CID=String(C.customer_id);
const D=path.join(__dirname,'reports','medilon_20260915');fs.mkdirSync(D,{recursive:true});
const CK=f=>path.join(D,f);
const APPLY=process.argv.includes('--apply');
const ONLY=(process.argv.find(a=>a.startsWith('--only='))||'').split('=')[1]||'all';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function headers(m,uri){const ts=String(Date.now());
  return {'Content-Type':'application/json; charset=UTF-8','X-Timestamp':ts,'X-API-KEY':C.api_key,'X-Customer':CID,
    'X-Signature':crypto.createHmac('sha256',C.secret_key).update(`${ts}.${m}.${uri}`).digest('base64')};}
async function req(m,ep,body,tries=5){
  const uri=ep.split('?')[0];let last;
  for(let t=0;t<tries;t++){
    try{
      const r=await fetch(BASE+ep,{method:m,headers:headers(m,uri),
        body:body==null?undefined:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
      const txt=await r.text();
      if(r.ok){try{return JSON.parse(txt)}catch(e){return txt}}
      last=new Error(`HTTP ${r.status} ${txt.slice(0,300)}`);
      if(r.status>=400&&r.status<500&&r.status!==429)throw last;
    }catch(e){last=e;if(t===tries-1)throw e;}
    await sleep(Math.min(1000*2**t,10000));
  }
  throw last;
}
// 재개용 체크포인트: 통째로 덮어쓰면 중복 실행 때 결과가 날아간다. 한 줄씩 append 한다.
const done=f=>{try{return new Set(fs.readFileSync(CK(f),'utf8').split('\n').filter(Boolean))}catch(e){return new Set()}};
const mark=(f,v)=>fs.appendFileSync(CK(f),v+'\n');

async function phaseDelete(){
  const del=JSON.parse(fs.readFileSync(path.join(__dirname,'_medilon_20260915_delete.json'),'utf8'));
  const already=done('deleted.txt');
  const todo=del.filter(d=>!already.has(d.id));
  console.log(`[삭제] 대상 ${del.length} / 남은 ${todo.length}`);
  if(!APPLY){console.log('  --apply 없으면 실행 안 함');return;}
  let gone=0,removed=0;
  // 이미 지워진 id 가 하나라도 섞이면 배치 전체가 404/1018 로 죽는다. 실패하면 반으로 갈라
  // 내려가고, 한 개까지 갈라서도 404 면 '이미 없음'으로 기록하고 넘어간다.
  async function run(batch){
    if(!batch.length)return;
    try{
      await req('DELETE','/ncc/keywords?ids='+batch.map(x=>x.id).join(','),null,2);
      for(const x of batch)mark('deleted.txt',x.id);
      removed+=batch.length;
    }catch(e){
      if(batch.length===1){
        if(/404|1018/.test(e.message)){mark('deleted.txt',batch[0].id);gone++;}
        else console.log('  삭제 불가',batch[0].kw,e.message.slice(0,90));
        return;
      }
      const h=Math.ceil(batch.length/2);
      await run(batch.slice(0,h));await run(batch.slice(h));
    }
  }
  for(let i=0;i<todo.length;i+=30){          // 30개가 실측상 안정적이다
    await run(todo.slice(i,i+30));
    if(i%300===0)console.log(`  진행 ${Math.min(i+30,todo.length)}/${todo.length} (삭제 ${removed} / 이미없음 ${gone})`);
    await sleep(120);
  }
  console.log(`[삭제] 끝 — 실제 삭제 ${removed}, 이미 없던 것 ${gone}`);
}

async function phaseGroups(){
  const add=JSON.parse(fs.readFileSync(path.join(__dirname,'_medilon_20260915_add.json'),'utf8'));
  const PER=100, need=Math.ceil(add.length/PER);
  const made=done('groups.txt');           // "idx\tgrpId"
  const map=new Map([...made].map(l=>l.split('\t')).map(([i,g])=>[Number(i),g]));
  console.log(`[그룹] 필요 ${need} / 생성됨 ${map.size}`);
  if(!APPLY){console.log('  --apply 없으면 실행 안 함');return map;}
  const camps=(await req('GET','/ncc/campaigns')).filter(c=>c.name.startsWith('의료대출'));
  const CH='bsn-a001-00-000000014233110';
  const AD={headline:'병원, 약국 운영자금 3억',
            description:'병원장님과 약사님을 위한 맞춤형 자금 가이드. 카드매출 기반 3억 이상 한도 설정',
            url:'https://portal.brandplaton.com'};
  for(let i=0;i<need;i++){
    if(map.has(i))continue;
    const cmp=camps[i%camps.length];
    try{
      const g=await req('POST','/ncc/adgroups',{nccCampaignId:cmp.nccCampaignId,
        name:'의료대출_대출축_'+String(i+1).padStart(4,'0'),
        pcChannelId:CH,mobileChannelId:CH,bidAmt:70,adgroupType:'WEB_SITE'});
      await req('POST','/ncc/ads',{nccAdgroupId:g.nccAdgroupId,type:'TEXT_45',
        ad:{headline:AD.headline,description:AD.description,
            pc:{headline:AD.headline,description:AD.description,final:AD.url},
            mobile:{headline:AD.headline,description:AD.description,final:AD.url}}});
      map.set(i,g.nccAdgroupId);mark('groups.txt',i+'\t'+g.nccAdgroupId);
      console.log(`  그룹 ${i+1}/${need} ${g.nccAdgroupId}`);
    }catch(e){console.log(`  그룹 ${i+1} 실패`,e.message.slice(0,150));}
    await sleep(150);
  }
  return map;
}

async function phaseKeywords(map){
  const add=JSON.parse(fs.readFileSync(path.join(__dirname,'_medilon_20260915_add.json'),'utf8'));
  const PER=100;
  const ok=done('kw_ok.txt');
  console.log(`[키워드] 대상 ${add.length} / 등록됨 ${ok.size}`);
  if(!APPLY){console.log('  --apply 없으면 실행 안 함');return;}
  for(let i=0;i*PER<add.length;i++){
    const g=map.get(i);if(!g){console.log(`  그룹 ${i} 없음, 건너뜀`);continue;}
    const batch=add.slice(i*PER,(i+1)*PER).filter(x=>!ok.has(x.kw));
    if(!batch.length)continue;
    try{
      const r=await req('POST','/ncc/keywords?nccAdgroupId='+g,
        batch.map(x=>({keyword:x.kw,bidAmt:70,useGroupBidAmt:true})));
      let n=0;
      for(const x of (Array.isArray(r)?r:[])){
        if(x.nccKeywordId&&!x.resultStatus){ok.add(x.keyword);mark('kw_ok.txt',x.keyword);n++;}
      }
      const limit=(Array.isArray(r)?r:[]).find(x=>x.resultStatus?.code===3912);
      console.log(`  그룹 ${i+1}: 보냄 ${batch.length} 성공 ${n}`+(limit?'  ← 계정 키워드 한도 도달':''));
      if(limit){console.log('한도에 걸려 중단한다.');return;}
    }catch(e){console.log(`  그룹 ${i+1} 실패`,e.message.slice(0,150));}
    await sleep(200);
  }
}

(async()=>{
  console.log(APPLY?'=== 실행 모드 ===':'=== 점검 모드 (--apply 로 실행) ===');
  const bm=await req('GET','/billing/bizmoney');
  console.log('비즈머니',bm.bizmoney,'budgetLock',bm.budgetLock);
  if(ONLY==='all'||ONLY==='delete')await phaseDelete();
  let map=new Map();
  if(ONLY==='all'||ONLY==='groups')map=await phaseGroups()||map;
  if(ONLY==='keywords'){
    map=new Map([...done('groups.txt')].map(l=>l.split('	')).map(([i,g])=>[Number(i),g]));
    const need=Math.ceil(JSON.parse(fs.readFileSync(path.join(__dirname,'_medilon_20260915_add.json'),'utf8')).length/100);
    if(map.size<need){console.log(`그룹이 ${map.size}/${need} 뿐이다. --only=groups 를 먼저 끝내라.`);return;}
  }
  if(ONLY==='all'||ONLY==='keywords')await phaseKeywords(map);
  console.log('끝. 실제 등록 수는 마스터리포트로 대조할 것: node _medilon_20260915_verify.js');
})().catch(e=>{console.error('치명',e.message);process.exit(1)});
