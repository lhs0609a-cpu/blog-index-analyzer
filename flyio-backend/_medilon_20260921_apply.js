// 메디론 2026-09-21 적용. 단계는 반드시 순차 실행한다 (--only=bids|budget|off|on|register).
// 9/15 교훈: 단계를 동시에 띄우면 그룹 생성이 겹쳐 3710 이름중복이 쏟아진다.
const fs=require('fs'),crypto=require('crypto');const D='reports/medilon_20260921/';
const C=JSON.parse(fs.readFileSync('_medilon_creds.json','utf8'));
const BASE='https://api.searchad.naver.com',CID=String(C.customer_id);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function hdr(m,uri){const ts=String(Date.now());return {'Content-Type':'application/json; charset=UTF-8','X-Timestamp':ts,'X-API-KEY':C.api_key,'X-Customer':CID,'X-Signature':crypto.createHmac('sha256',C.secret_key).update(ts+'.'+m+'.'+uri).digest('base64')};}
async function req(m,ep,b){let last;
  for(let t=0;t<5;t++){try{
    const r=await fetch(BASE+ep,{method:m,headers:hdr(m,ep.split('?')[0]),body:b==null?undefined:JSON.stringify(b),signal:AbortSignal.timeout(60000)});
    const x=await r.text();
    if(r.status===429||r.status>=500){await sleep(2500*(t+1));last=r.status+' '+x.slice(0,120);continue;}
    if(!r.ok)throw new Error(r.status+' '+x.slice(0,250));
    try{return JSON.parse(x)}catch(e){return x}
  }catch(e){last=e.message;if(t===4)throw new Error(last);await sleep(1500*(t+1));}}
  throw new Error(last);}
const CK=D+'apply_ckpt.json';
const ck=fs.existsSync(CK)?JSON.parse(fs.readFileSync(CK,'utf8')):{};
const save=()=>fs.writeFileSync(CK,JSON.stringify(ck));
const only=(process.argv.find(a=>a.startsWith('--only='))||'').split('=')[1];
const DRY=process.argv.includes('--dry');

async function bids(){
  const plan=JSON.parse(fs.readFileSync(D+'plan_bids.json','utf8')).filter(p=>p.neu!==p.old);
  ck.bids=ck.bids||{};
  const todo=plan.filter(p=>!ck.bids[p.id]);
  console.log('[입찰]',todo.length,'/',plan.length);
  if(DRY)return;
  for(let i=0;i<todo.length;i+=50){
    const b=todo.slice(i,i+50);
    const body=b.map(p=>({nccKeywordId:p.id,nccAdgroupId:p.gid,bidAmt:p.neu,useGroupBidAmt:false}));
    try{ await req('PUT','/ncc/keywords?fields=bidAmt',body);
      for(const p of b)ck.bids[p.id]=p.neu;
    }catch(e){ console.error('  배치 실패, 개별 재시도',e.message.slice(0,90));
      for(const p of b){try{await req('PUT','/ncc/keywords?fields=bidAmt',[{nccKeywordId:p.id,nccAdgroupId:p.gid,bidAmt:p.neu,useGroupBidAmt:false}]);ck.bids[p.id]=p.neu;}
        catch(e2){console.error('   실패',p.kw,e2.message.slice(0,70));}await sleep(120);} }
    save(); if(i%500===0)console.log('  ',i,'/',todo.length); await sleep(150);
  }
  console.log('[입찰] 완료', Object.keys(ck.bids).length);
}
async function budget(){
  const plan=JSON.parse(fs.readFileSync(D+'plan_budget.json','utf8')).filter(p=>p.neu!==p.old);
  ck.budget=ck.budget||{};
  const todo=plan.filter(p=>!ck.budget[p.id]);
  console.log('[예산]',todo.length,'/',plan.length);
  if(DRY)return;
  for(const p of todo){
    try{ await req('PUT','/ncc/campaigns/'+p.id+'?fields=budget',{nccCampaignId:p.id,dailyBudget:p.neu,useDailyBudget:true});
      ck.budget[p.id]=p.neu; }
    catch(e){console.error('  실패',p.name,e.message.slice(0,90));}
    save(); await sleep(150);
  }
  console.log('[예산] 완료',Object.keys(ck.budget).length);
}
async function lock(file,val,label){
  const plan=JSON.parse(fs.readFileSync(D+file,'utf8'));
  const key=label; ck[key]=ck[key]||{};
  const todo=plan.filter(p=>!ck[key][p.id]);
  console.log('['+label+']',todo.length,'/',plan.length);
  if(DRY)return;
  for(let i=0;i<todo.length;i+=50){
    const b=todo.slice(i,i+50);
    try{ await req('PUT','/ncc/keywords?fields=userLock',b.map(p=>({nccKeywordId:p.id,nccAdgroupId:p.gid,userLock:val})));
      for(const p of b)ck[key][p.id]=1;
    }catch(e){ console.error('  배치 실패, 개별 재시도',e.message.slice(0,90));
      for(const p of b){try{await req('PUT','/ncc/keywords?fields=userLock',[{nccKeywordId:p.id,nccAdgroupId:p.gid,userLock:val}]);ck[key][p.id]=1;}
        catch(e2){console.error('   실패',p.kw,e2.message.slice(0,70));}await sleep(120);} }
    save(); await sleep(150);
  }
  console.log('['+label+'] 완료',Object.keys(ck[key]).length);
}
async function register(){
  const reg=JSON.parse(fs.readFileSync(D+'plan_register.json','utf8'));
  const urg=JSON.parse(fs.readFileSync(D+'kwurg.json','utf8'));
  const est=JSON.parse(fs.readFileSync(D+'estimates.json','utf8'));
  // 대상 그룹: 없으면 만든다
  if(!ck.regGroup){
    const cps=JSON.parse(fs.readFileSync(D+'campaigns.json','utf8'));
    const bud=JSON.parse(fs.readFileSync(D+'plan_budget.json','utf8')).slice().sort((a,b)=>b.neu-a.neu);
    const target=bud.find(b=>/^의료대출/.test(b.name));
    const ch=JSON.parse(fs.readFileSync(D+'channels.json','utf8')).find(c=>c.channelTp==='SITE');
    console.log('[등록] 그룹 생성 · 캠페인',target.name);
    if(DRY)return;
    const g=await req('POST','/ncc/adgroups',{nccCampaignId:target.id,customerId:+CID,
      name:'의료대출_개원인수축_0001',adgroupType:'WEB_SITE',nccBusinessChannelId:ch.nccBusinessChannelId,
      bidAmt:500,useDailyBudget:false,pcChannelId:ch.nccBusinessChannelId,mobileChannelId:ch.nccBusinessChannelId});
    ck.regGroup=g.nccAdgroupId; save();
    await req('POST','/ncc/ads',{nccAdgroupId:ck.regGroup,type:'TEXT_45',
      ad:{headline:'병원 약국 개원자금 3억',description:'개원 인수 권리금까지 맞춤 자금 가이드. 한도 조회는 3분이면 끝납니다',
          pc:{final:'https://portal.brandplaton.com'},mobile:{final:'https://portal.brandplaton.com'}}});
    console.log('[등록] 그룹',ck.regGroup,'· 소재 부착 완료');
  }
  ck.reg=ck.reg||{};
  const todo=reg.filter(r=>!ck.reg[r.kw]);
  console.log('[등록] 키워드',todo.length,'/',reg.length);
  if(DRY)return;
  for(let i=0;i<todo.length;i+=20){
    const b=todo.slice(i,i+20);
    const body=b.map(r=>{const e=Math.max(est['PC|3|'+r.kw]||0,est['MOBILE|3|'+r.kw]||0);
      return {customerId:+CID,nccAdgroupId:ck.regGroup,keyword:r.kw,
        bidAmt:Math.max(70,Math.min(9000,Math.round((e||500)/10)*10)),useGroupBidAmt:false};});
    try{ const r=await req('POST','/ncc/keywords?nccAdgroupId='+ck.regGroup,body);
      const got=new Set((r||[]).map(x=>x.keyword));
      for(const x of b) if(got.has(x.kw)) ck.reg[x.kw]=1; else console.error('  조용히 누락',x.kw);
    }catch(e){console.error('  실패',e.message.slice(0,140));}
    save(); await sleep(250);
  }
  console.log('[등록] 완료',Object.keys(ck.reg).length,'/',reg.length);
}
(async()=>{
  if(!only||only==='bids')await bids();
  if(!only||only==='budget')await budget();
  if(!only||only==='off')await lock('plan_turnoff.json',true,'무관OFF');
  if(!only||only==='on')await lock('plan_turnon.json',false,'개원인수ON');
  if(only==='disoff')await lock('plan_disoff.json',true,'금지표현OFF');
  if(!only||only==='register')await register();
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
