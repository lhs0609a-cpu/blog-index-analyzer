// axis_plan.json 을 적용한다. 적용 직전 API 로 현재값을 다시 읽어 계획의 before 와 다르면 멈춘다.
// 사용: node _haeul_20260910_axis_apply.js --dry | --apply
const fs=require('fs'),path=require('path'),assert=require('assert');
const CID=3442423,D0=path.join(__dirname,'reports','haeul_20260910');
const save=(n,x)=>fs.writeFileSync(path.join(D0,n+'.json'),JSON.stringify(x,null,1));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(method,p,body=null){for(let t=0;t<(method==='GET'?4:1);t++){try{
 const r=await fetch('https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:String(CID),method,path:p,body}),signal:AbortSignal.timeout(45000)});
 const d=await r.json();if(!r.ok||!d.success)throw Error(String(d.error||JSON.stringify(d)).slice(0,400));return d.response;
}catch(e){if(method!=='GET'||t===3)throw e;await sleep(2000);}}}
(async()=>{
 const mode=['--dry','--apply'].find(m=>process.argv.includes(m));assert(mode,'--dry 또는 --apply');
 const {plan}=JSON.parse(fs.readFileSync(path.join(D0,'axis_plan.json'),'utf8'));
 const gids=[...new Set(plan.map(p=>p.gid))];
 const before={};for(const gid of gids){const g=await api('GET','/ncc/adgroups/'+gid);assert.equal(g.customerId,CID);assert(!g.userLock,'그룹 OFF: '+g.name);
  before[gid]={group:g,keywords:await api('GET','/ncc/keywords?nccAdgroupId='+gid)};}
 const km=new Map(Object.values(before).flatMap(x=>x.keywords).map(k=>[k.nccKeywordId,k]));
 for(const p of plan){const k=km.get(p.kid);assert(k,'키워드 없음 '+p.keyword);
  assert.equal(k.bidAmt,p.before,'입찰가가 계획과 다름 '+p.keyword+' '+k.bidAmt+'≠'+p.before);
  assert.equal(!!k.userLock,p.turnOn,'ON/OFF 가 계획과 다름 '+p.keyword);
  assert(p.after<=(p.ax==='dizzy'?25000:10000)&&p.after>=p.before);}
 console.log('사전검증 통과: '+plan.length+'개 (그룹 '+gids.length+')');
 save('axis_apply_before',before);
 if(mode==='--dry'){console.log('--dry: 바꾸지 않았다.');return;}
 const state={startedAt:new Date().toISOString(),events:[]};
 const bids=plan.filter(p=>p.after!==p.before);
 for(let i=0;i<bids.length;i+=50){const part=bids.slice(i,i+50);
  const r=await api('PUT','/ncc/keywords?fields=bidAmt',part.map(p=>({nccKeywordId:p.kid,nccAdgroupId:p.gid,bidAmt:p.after,useGroupBidAmt:false})));
  assert(Array.isArray(r)&&r.length===part.length,'입찰 응답 수 불일치');
  state.events.push({type:'bid',ids:part.map(p=>p.kid)});save('axis_apply_state',state);console.log('입찰 '+(i+part.length)+'/'+bids.length);}
 const ons=plan.filter(p=>p.turnOn);
 for(let i=0;i<ons.length;i+=50){const part=ons.slice(i,i+50);
  const r=await api('PUT','/ncc/keywords?fields=userLock',part.map(p=>({nccKeywordId:p.kid,nccAdgroupId:p.gid,userLock:false})));
  assert(Array.isArray(r)&&r.length===part.length,'ON 응답 수 불일치');
  state.events.push({type:'on',ids:part.map(p=>p.kid)});save('axis_apply_state',state);console.log('켜기 '+(i+part.length)+'/'+ons.length);}
 const after={};for(const gid of gids)after[gid]=await api('GET','/ncc/keywords?nccAdgroupId='+gid);
 save('axis_apply_after',after);
 const am=new Map(Object.values(after).flat().map(k=>[k.nccKeywordId,k]));
 const bad=plan.filter(p=>{const k=am.get(p.kid);return !k||k.bidAmt!==p.after||k.userLock||k.useGroupBidAmt;});
 state.complete=bad.length===0;state.verified=plan.length-bad.length;state.failed=bad.map(p=>p.keyword);state.completedAt=new Date().toISOString();save('axis_apply_state',state);
 console.log('재조회 검증: '+state.verified+'/'+plan.length+' 일치'+(bad.length?' | 불일치: '+bad.map(p=>p.keyword).join(', '):''));
 const status=plan.filter(p=>p.turnOn).map(p=>{const k=am.get(p.kid);return {키워드:p.keyword,status:k.status,inspect:k.inspectStatus};});
 if(status.length){console.log('켠 키워드 상태');console.table(status);}
 assert.equal(bad.length,0,'불일치 존재');
})().catch(e=>{console.error('ERR',e.message);process.exitCode=1;});
