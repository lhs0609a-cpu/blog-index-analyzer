// 간절도 60+ 전부 켜기 — 적용. 사용: node _sojam_20260917_apply.js on | bid | verify | rollback
// 안전장치: 변경 직전 GET 재조회, 원본 before.json 백업, 인상만, 10원 단위, 배치 20, 전건 재검증.
const fs=require('fs'),path=require('path'),CID='1858907';
const BASE='https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID;
const D=path.join(__dirname,'../reports/sojam-20260917/');
const J=n=>JSON.parse(fs.readFileSync(D+n,'utf8'));
const save=(n,o)=>{const t=D+n+'.tmp';fs.writeFileSync(t,JSON.stringify(o));fs.renameSync(t,D+n);};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(m,p,b){
  for(let a=0;a<3;a++){
    try{const r=await fetch(BASE,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:CID,method:m,path:p,body:b===undefined?null:b}),signal:AbortSignal.timeout(90000)});
      const d=await r.json(); if(!r.ok||!d.success)throw Error('rej '+String(d.error||'').slice(0,160)); return d.response;}
    catch(e){ if(a===2)throw e; await sleep(2500);} }
}
const backup=(before,id,k)=>{ if(!before[id]) before[id]={keyword:k.keyword,bidAmt:k.bidAmt,useGroupBidAmt:k.useGroupBidAmt,userLock:k.userLock}; };

async function run(mode){
  const {acts}=J('on_plan.json');
  const todoAll = mode==='on' ? acts.filter(a=>a.needOn) : acts;
  const RF='on_result_'+mode+'.json';
  const st=fs.existsSync(D+RF)?J(RF):{ok:[],skip:[],fail:[]};
  const done=new Set([...st.ok,...st.skip].map(x=>x.id));
  const before=fs.existsSync(D+'on_before.json')?J('on_before.json'):{};
  const LIM=Number(process.argv[3]||0);
  let todo=todoAll.filter(a=>!done.has(a.id));
  if(LIM>0)todo=todo.slice(0,LIM);
  console.error(mode,'적용 대상',todo.length,'/',todoAll.length);
  for(let i=0;i<todo.length;i+=10){
    const part=todo.slice(i,i+10);
    let fresh;
    try{ fresh=await api('GET','/ncc/keywords?ids='+encodeURIComponent(part.map(a=>a.id).join(','))); }
    catch(e){ for(const a of part) st.fail.push({id:a.id,k:a.k,err:'조회실패 '+String(e).slice(0,120)}); save(RF,st); continue; }
    const body=[];
    for(const a of part){
      const k=(fresh||[]).find(x=>x.nccKeywordId===a.id);
      if(!k||k.delFlag){st.skip.push({id:a.id,k:a.k,why:'조회 안 됨/삭제'});continue;}
      if(mode==='on'){
        if(!k.userLock){st.skip.push({id:a.id,k:a.k,why:'이미 켜짐'});continue;}
        backup(before,a.id,k); body.push({...k,userLock:false});
      }else{
        if(k.userLock){st.skip.push({id:a.id,k:a.k,why:'아직 꺼짐'});continue;}
        const cur=k.useGroupBidAmt?0:k.bidAmt;
        if(a.bidAmt<=cur){st.skip.push({id:a.id,k:a.k,why:'이미 목표 이상 '+cur});continue;}
        if(a.bidAmt%10){st.skip.push({id:a.id,k:a.k,why:'10원 단위 아님'});continue;}
        backup(before,a.id,k); body.push({...k,bidAmt:a.bidAmt,useGroupBidAmt:false});
      }
    }
    save('on_before.json',before);
    if(body.length){
      try{
        await api('PUT','/ncc/keywords?fields='+(mode==='on'?'userLock':'bidAmt'),body);
        const after=await api('GET','/ncc/keywords?ids='+encodeURIComponent(body.map(b=>b.nccKeywordId).join(',')));
        for(const b of body){
          const k=(after||[]).find(x=>x.nccKeywordId===b.nccKeywordId);
          const a=part.find(p=>p.id===b.nccKeywordId);
          const good = mode==='on' ? (k&&k.userLock===false) : (k&&k.bidAmt===a.bidAmt&&!k.useGroupBidAmt);
          (good?st.ok:st.fail).push({id:a.id,k:a.k,axis:a.axis,to:mode==='on'?'ON':a.bidAmt,got:k?(mode==='on'?!k.userLock:k.bidAmt):null});
        }
      }catch(e){ for(const b of body) st.fail.push({id:b.nccKeywordId,k:b.keyword,err:String(e).slice(0,160)}); }
    }
    save(RF,st);
    if((i/20)%15===0)console.error('  ',mode,'적용',st.ok.length,'실패',st.fail.length,'건너뜀',st.skip.length);
    await sleep(1500);
  }
  console.log(JSON.stringify({mode,적용:st.ok.length,실패:st.fail.length,건너뜀:st.skip.length}));
}
async function verify(){
  const {acts}=J('on_plan.json');
  const ids=acts.map(a=>a.id); let bad=[],n=0,onOk=0,bidOk=0;
  for(let i=0;i<ids.length;i+=20){
    const r=await api('GET','/ncc/keywords?ids='+encodeURIComponent(ids.slice(i,i+20).join(',')));
    for(const k of (Array.isArray(r)?r:[])){
      const a=acts.find(x=>x.id===k.nccKeywordId); if(!a)continue; n++;
      if(!k.userLock)onOk++;
      if(!k.useGroupBidAmt&&k.bidAmt>=Math.min(a.bidAmt,a.target))bidOk++;
      else if(k.bidAmt<70)bad.push({k:a.k,bid:k.bidAmt});
    }
    if((i/20)%40===0)console.error('  검증',n,'/',ids.length);
  }
  console.log(JSON.stringify({검증:n,켜짐:onOk,목표입찰이상:bidOk,이상:bad.length}));
  save('on_verify.json',{n,onOk,bidOk,bad:bad.slice(0,200)});
}
async function rollback(){
  const before=J('on_before.json'); const ids=Object.keys(before);
  console.error('롤백 대상',ids.length);
  for(let i=0;i<ids.length;i+=20){
    const part=ids.slice(i,i+20);
    const fresh=await api('GET','/ncc/keywords?ids='+encodeURIComponent(part.join(',')));
    const body=part.map(id=>{const k=(fresh||[]).find(x=>x.nccKeywordId===id);const b=before[id];return k?{...k,bidAmt:b.bidAmt,useGroupBidAmt:b.useGroupBidAmt,userLock:b.userLock}:null;}).filter(Boolean);
    if(body.length){await api('PUT','/ncc/keywords?fields=bidAmt',body);await api('PUT','/ncc/keywords?fields=userLock',body);}
    if((i/20)%20===0)console.error('  롤백',i,'/',ids.length);
    await sleep(500);
  }
  console.log('롤백 완료');
}
const m=process.argv[2];
({on:()=>run('on'),bid:()=>run('bid'),verify,rollback}[m]||(()=>Promise.resolve(console.log('on|bid|verify|rollback'))))().catch(e=>{console.error(e.stack);process.exitCode=1;});
