// 개선: 실재 확인된 내원 키워드 중 70~100원에 방치된 것을 3위 추정가로 올리고,
//       그 키워드가 몰린 해울_0914_* 그룹의 1,000원 일예산 캡을 푼다.
//   근거: 방치 676개는 90일 노출 0이 453개. 3위 추정가 평균 1,039원, 전부 올려도 추정 일 1,179원.
//   안전장치: 캠페인 일예산(60,000원)이 총량을 막는다. 중복등록 5개는 제외(9/15 저가중복 재발 방지).
//   되돌리기: node _haeul_20260917_improve.js --apply --revert
// 사용: node _haeul_20260917_improve.js --dry | --apply [--revert]
const fs=require('fs'),path=require('path'),assert=require('assert');
const CID=3442423;
const D=path.join(__dirname,'reports','haeul_20260917');
const SC='C:/Users/leegu/AppData/Local/Temp/claude/D--developer-blog-index-analyzer/4670b754-1f99-4cce-937e-3efb6f6ed66b/scratchpad';
const BEFORE=path.join(D,'improve_before.json');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const CAP_BATCH=5000;                  // 이번 배치 개별 상한(70원짜리를 한 번에 1만원으로 올리지 않는다)
const GROUP_BUDGET_NEW=3000;           // 해울_0914_* 그룹 일예산
async function api(m,p,b=null){for(let t=0;t<(m==='GET'?4:1);t++){try{
 const r=await fetch('https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID,
  {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:String(CID),method:m,path:p,body:b}),signal:AbortSignal.timeout(60000)});
 const d=await r.json(); if(!r.ok||!d.success)throw Error(String(d.error||JSON.stringify(d)).slice(0,300)); return d.response;
}catch(e){if(m!=='GET'||t===3)throw e;await sleep(2500);}}}
const r10=n=>Math.max(70,Math.round(n/10)*10);

(async()=>{
 const mode=['--dry','--apply'].find(m=>process.argv.includes(m));
 assert(mode,'--dry 또는 --apply');
 const revert=process.argv.includes('--revert');

 if(revert){
  assert(fs.existsSync(BEFORE),'되돌릴 기록이 없다');
  const b=JSON.parse(fs.readFileSync(BEFORE,'utf8'));
  console.log('되돌리기: 키워드 '+b.keywords.length+'개, 그룹 '+b.groups.length+'개');
  if(mode==='--dry'){console.log('--dry: 아무것도 안 함');return;}
  for(let i=0;i<b.keywords.length;i+=100){
   await api('PUT','/ncc/keywords?fields=bidAmt',b.keywords.slice(i,i+100).map(k=>({nccKeywordId:k.kid,nccAdgroupId:k.gid,bidAmt:k.bidAmt,useGroupBidAmt:k.useGroupBidAmt})));
   console.log('  키워드 복구 '+Math.min(i+100,b.keywords.length)+'/'+b.keywords.length);await sleep(700);
  }
  for(const g of b.groups){await api('PUT','/ncc/adgroups/'+g.id+'?fields=budget',{...g.raw,dailyBudget:g.dailyBudget});await sleep(400);}
  console.log('복구 완료');return;
 }

 const st=JSON.parse(fs.readFileSync(path.join(SC,'cost_est.json'),'utf8'));
 const bid3=w=>Math.max(st.bid['PC|3'][w]||0,st.bid['MOBILE|3'][w]||0);
 const rows=JSON.parse(fs.readFileSync(path.join(D,'visit_all_rows.json'),'utf8')).filter(r=>r.증거!=='9_증거없음');
 const neg=rows.filter(r=>r.입찰가<=100);
 const dups=neg.filter(r=>r.등록수>1);
 const targets=neg.filter(r=>r.등록수===1);
 console.log('방치 '+neg.length+'개 중 중복등록 '+dups.length+'개 제외 → 대상 '+targets.length+'개');
 if(dups.length)console.log('  제외(중복): '+dups.map(d=>d.키워드).join(', '));

 // 라이브 재조회
 const live={};
 const kids=targets.map(t=>t.kid);
 for(let i=0;i<kids.length;i+=20){const r=await api('GET','/ncc/keywords?ids='+kids.slice(i,i+20).join(','));for(const k of r)live[k.nccKeywordId]=k;await sleep(200);
  if(i%400===0)console.log('  라이브 조회 '+Math.min(i+20,kids.length)+'/'+kids.length);}
 console.log('라이브 확인 '+Object.keys(live).length+'/'+kids.length);

 const plan=[],skip=[];
 for(const t of targets){
  const k=live[t.kid];
  if(!k){skip.push([t.키워드,'조회안됨']);continue}
  if(k.userLock){skip.push([t.키워드,'키워드 OFF']);continue}
  if(k.bidAmt>100&&!k.useGroupBidAmt){skip.push([t.키워드,'이미 '+k.bidAmt+'원']);continue}
  const b=bid3(t.키워드); if(!b){skip.push([t.키워드,'추정가 없음']);continue}
  const after=Math.min(r10(b),CAP_BATCH);
  if(after<=100){skip.push([t.키워드,'추정가도 '+after+'원']);continue}
  plan.push({kid:t.kid,gid:t.gid,kw:t.키워드,before:k.bidAmt,useGroupBidAmt:!!k.useGroupBidAmt,after,est3:b,vol:t.월검색,그룹:t.그룹});
 }
 plan.sort((a,b)=>b.after-a.after);
 console.log('\n계획 '+plan.length+'개 / 건너뜀 '+skip.length+'개');
 const sum=plan.reduce((s,p)=>s+p.after,0);
 console.log('평균 목표입찰 '+Math.round(sum/plan.length)+'원 · 상한적용 '+plan.filter(p=>p.after===CAP_BATCH).length+'개');
 console.table(plan.slice(0,15).map(p=>({키워드:p.kw,월검색:p.vol,현재:p.before,목표:p.after,'3위추정':p.est3,그룹:String(p.그룹).replace(/^해울_/,'')})));

 // 그룹 일예산
 const gids=[...new Set(plan.map(p=>p.gid))];
 const gsel=[];
 for(const gid of gids){const g=await api('GET','/ncc/adgroups/'+gid);
  if(g.useDailyBudget&&g.dailyBudget<=1000&&!g.userLock)gsel.push(g);await sleep(150);}
 console.log('\n일예산 1,000원 이하로 묶인 그룹 '+gsel.length+'개 → '+GROUP_BUDGET_NEW+'원');
 console.table(gsel.map(g=>({그룹:g.name,현재예산:g.dailyBudget,변경:GROUP_BUDGET_NEW,그룹입찰:g.bidAmt})));

 if(mode==='--dry'){console.log('\n--dry: 아무것도 바꾸지 않았다.');
  fs.writeFileSync(path.join(D,'improve_plan.json'),JSON.stringify({plan,skip,groups:gsel.map(g=>({id:g.nccAdgroupId,name:g.name,dailyBudget:g.dailyBudget}))},null,1));return;}

 fs.writeFileSync(BEFORE,JSON.stringify({
  ts:new Date().toISOString(),
  keywords:plan.map(p=>({kid:p.kid,gid:p.gid,kw:p.kw,bidAmt:p.before,useGroupBidAmt:p.useGroupBidAmt})),
  groups:gsel.map(g=>({id:g.nccAdgroupId,name:g.name,dailyBudget:g.dailyBudget,raw:g}))},null,1));
 console.log('\nbefore 저장: '+BEFORE);

 let ok=0;
 for(let i=0;i<plan.length;i+=100){
  const c=plan.slice(i,i+100);
  const r=await api('PUT','/ncc/keywords?fields=bidAmt',c.map(p=>({nccKeywordId:p.kid,nccAdgroupId:p.gid,bidAmt:p.after,useGroupBidAmt:false})));
  ok+=Array.isArray(r)?r.length:0;console.log('  입찰 적용 '+Math.min(i+100,plan.length)+'/'+plan.length);await sleep(700);
 }
 console.log('키워드 적용 '+ok+'/'+plan.length);
 for(const g of gsel){await api('PUT','/ncc/adgroups/'+g.nccAdgroupId+'?fields=budget',{...g,dailyBudget:GROUP_BUDGET_NEW});
  console.log('  예산 '+g.name+' '+g.dailyBudget+'→'+GROUP_BUDGET_NEW);await sleep(400);}

 // 검증
 const chk={};
 for(let i=0;i<plan.length;i+=20){const r=await api('GET','/ncc/keywords?ids='+plan.slice(i,i+20).map(p=>p.kid).join(','));for(const k of r)chk[k.nccKeywordId]=k;await sleep(200);}
 const bad=plan.filter(p=>chk[p.kid]?.bidAmt!==p.after);
 console.log('검증: 일치 '+(plan.length-bad.length)+'/'+plan.length+(bad.length?' 불일치 '+bad.slice(0,5).map(b=>b.kw+'='+chk[b.kid]?.bidAmt).join(','):''));
})().catch(e=>{console.error('ERR',String(e).slice(0,400));process.exitCode=1;});
