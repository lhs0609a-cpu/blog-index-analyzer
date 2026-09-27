// 키네스 18만원 운영 모니터. 기본은 읽기 전용이며 --apply 일 때만 헤드 키워드 입찰가를 갱신한다.
// 티어 상한을 넘겨 올리지 않는다. 상한 변경은 사람이 판단한다.
const fs=require('fs'),path=require('path');const {req,pool}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_bidreset_20260909');
const LOG=path.join(__dirname,'kiness_monitor_logs');fs.mkdirSync(LOG,{recursive:true});
const APPLY=process.argv.includes('--apply');
// 9/14 실제 미노출 복구 입찰은 이전 배분표로 되돌리지 않는다.
const visibilityApplied=path.join(__dirname,'reports','kiness_20260914','applied.json');
const visibilityProtected=new Set(fs.existsSync(visibilityApplied)
 ? JSON.parse(fs.readFileSync(visibilityApplied,'utf8')).bids.map(x=>x.id) : []);
const allRegionApplied=path.join(__dirname,'reports','kiness_20260914','all_regions','applied.json');
if(fs.existsSync(allRegionApplied))for(const id of JSON.parse(fs.readFileSync(allRegionApplied,'utf8')).protectedKeywordIds||[])
 visibilityProtected.add(id);
// 9/15 실측 미노출 복구 입찰도 같은 이유로 보호한다.
const visibility0915=path.join(__dirname,'reports','kiness_20260915','applied.json');
if(fs.existsSync(visibility0915))for(const id of JSON.parse(fs.readFileSync(visibility0915,'utf8')).protectedKeywordIds||[])
 visibilityProtected.add(id);
const SEARCH_BUDGET=250000, ACCOUNT_TARGET=256000;
const call=(m,p,b)=>req(m,p,b,441986,m==='GET'?4:1);
const kst=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
(async()=>{
 const alloc=JSON.parse(fs.readFileSync(path.join(D,'alloc2.json'),'utf8'));
 const plan=JSON.parse(fs.readFileSync(path.join(D,'plan_vol.json'),'utf8'));
 const bids=new Map(alloc.bids),caps=new Map(alloc.caps||[]),floors=new Map(alloc.floors||[]),
  weights=new Map(alloc.weights||[]),pm=new Map(plan.map(p=>[p.id,p]));
 const budgets=await call('GET','/ncc/shared-budgets');
 const total=budgets.find(b=>b.sharedBudgetId==='nsb-a001-01-000000000073065');
 if(!total)throw Error('총 검색예산을 찾지 못했다');
 const budgetOk=total.dailyBudget<=SEARCH_BUDGET;
 const camps=await call('GET','/ncc/campaigns');
 const day=kst();
 const stats=[];for(let i=0;i<camps.length;i+=50){
  const r=await call('GET','/stats?ids='+encodeURIComponent(camps.slice(i,i+50).map(c=>c.nccCampaignId).join(','))
   +'&fields='+encodeURIComponent(JSON.stringify(['salesAmt','clkCnt','impCnt']))
   +'&timeRange='+encodeURIComponent(JSON.stringify({since:day,until:day})));
  if(!Array.isArray(r.data))throw Error('통계 조회 실패');stats.push(...r.data);}
 const spend=stats.reduce((a,x)=>({cost:a.cost+(x.salesAmt||0),clicks:a.clicks+(x.clkCnt||0),imps:a.imps+(x.impCnt||0)}),{cost:0,clicks:0,imps:0});
 // 헤드 키워드만 1위 추정가로 재조회한다. 상한 안에서만 움직인다.
 const curve=JSON.parse(fs.readFileSync(path.join(D,'perf_curve.json'),'utf8'));
 const head=plan.filter(p=>curve[p.id]&&(caps.get(p.id)??0)>70);
 const jobs=[];for(const device of ['PC','MOBILE'])for(let i=0;i<head.length;i+=100)jobs.push({device,rows:head.slice(i,i+100)});
 const est=await pool(jobs,4,async j=>({device:j.device,
  data:(await call('POST','/estimate/average-position-bid/id',{device:j.device,items:j.rows.map(x=>({key:x.id,position:1}))})).estimate}));
 if(est.some(x=>!Array.isArray(x.data)))throw Error('추정가 조회 실패');
 const e1={};for(const b of est)for(const e of b.data)(e1[e.nccKeywordId]=e1[e.nccKeywordId]||{})[b.device]=e.bid;
 const gids=[...new Set(head.map(p=>p.gid))];
 const inv=await pool(gids,6,async gid=>({gid,keywords:await call('GET','/ncc/keywords?nccAdgroupId='+gid)}));
 if(inv.some(x=>!Array.isArray(x.keywords)))throw Error('키워드 조회 실패');
 const km=new Map(inv.flatMap(x=>x.keywords).map(k=>[k.nccKeywordId,k]));
 const moves=[];
 for(const p of head){const k=km.get(p.id),e=e1[p.id],planned=bids.get(p.id);
  if(!k||k.userLock||k.status!=='ELIGIBLE'||!e||visibilityProtected.has(p.id))continue;
  const cap=caps.get(p.id)??planned;              // 티어 상한. 경쟁이 오르면 여기까지 되올린다
  const floor=floors.get(p.id)??70;               // 티어 하한과 실측 단가 보호선
  const [pcW,moW]=weights.get(p.id)||[100,100];   // 기기별 실효 입찰가가 추정가에 닿게 가중치를 나눈다
  const need=Math.ceil(Math.max(e.PC*100/pcW,e.MOBILE*100/moW)*1.10/10)*10;
  const want=Math.max(70,Math.floor(Math.min(cap,Math.max(floor,need))/10)*10);
  if(want!==k.bidAmt||k.useGroupBidAmt)moves.push({id:p.id,gid:p.gid,keyword:p.keyword,from:k.bidAmt,to:want});}
 let applied=0;
 if(APPLY&&budgetOk){for(let i=0;i<moves.length;i+=100){const chunk=moves.slice(i,i+100);
  const r=await call('PUT','/ncc/keywords?fields=bidAmt',chunk.map(x=>({nccKeywordId:x.id,nccAdgroupId:x.gid,bidAmt:x.to,useGroupBidAmt:false})));
  if(!Array.isArray(r)||r.length!==chunk.length)throw Error('입찰 반영 실패');applied+=chunk.length;}}
 const out={at:new Date().toISOString(),day,budgetConfigured:total.dailyBudget,budgetOk,accountTarget:ACCOUNT_TARGET,
  spend,head:head.length,moves:moves.length,applied,
  topMoves:moves.sort((a,b)=>Math.abs(b.to-b.from)-Math.abs(a.to-a.from)).slice(0,15)};
 fs.writeFileSync(path.join(LOG,'reset_'+day+'_'+String(Date.now())+'.json'),JSON.stringify(out,null,1));
 console.log(JSON.stringify({day,spend,budgetConfigured:total.dailyBudget,moves:moves.length,applied}));
})().catch(e=>{fs.writeFileSync(path.join(LOG,'reset_error_'+Date.now()+'.json'),JSON.stringify({at:new Date().toISOString(),error:String(e)}));console.error(e);process.exitCode=1;});
