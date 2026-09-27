const fs=require('fs');const D='reports/medilon_20260921/';
const u=JSON.parse(fs.readFileSync(D+'kwurg.json','utf8'));
const cps=JSON.parse(fs.readFileSync(D+'campaigns.json','utf8'));
const cstat=JSON.parse(fs.readFileSync(D+'campaign_stats.json','utf8'));
const MED=/^A_|^B_/;
const round10=x=>Math.max(70,Math.round(x/10)*10);

// ── 입찰 규칙 ────────────────────────────────────────
// 실수요(경쟁 입찰가가 바닥을 넘는 것)에만 돈을 쓴다. 나머지는 70원 유지 — 올려도 살 물량이 없다.
const CAP={U5:9000,U4:9000,U3:4000,U2:2000,U1:800,U0:70};
function targetBid(r){
  if(!r.tier) return null;
  if(!r.demand||!r.est1) return 70;
  const med=MED.test(r.cat);
  let b;
  if(r.tier==='U5'||r.tier==='U4') b=r.est3||r.est1*0.7;       // 3위 목표
  else if(r.tier==='U3')           b=(r.est3||r.est1*0.7)*0.6; // 5위권
  else if(r.tier==='U2')           b=(r.est3||r.est1*0.7)*0.4;
  else if(r.tier==='U1')           b=(r.est3||r.est1*0.7)*0.2;
  else                             b=70;
  if(!med) b*=0.6;
  return round10(Math.min(b,CAP[r.tier]));
}
const plan=u.map(r=>({...r,newBid:targetBid(r)}));
const chg=plan.filter(r=>r.newBid!=null&&r.newBid!==r.bid);
console.log('입찰 변경 대상',chg.length,'/ 판정 대상',plan.filter(r=>r.tier).length);
const byT={};for(const r of chg){const k=r.tier+(MED.test(r.cat)?' 의료':' 비의료');byT[k]=byT[k]||{n:0,s:0};byT[k].n++;byT[k].s+=r.newBid;}
console.log('\ntier별 변경 건수 / 평균 새 입찰가');
for(const [k,v] of Object.entries(byT).sort())console.log('  '+k.padEnd(12),String(v.n).padStart(5),'건  평균',Math.round(v.s/v.n),'원');

// ── 예상 지출 ───────────────────────────────────────
// 3위 CTR 2%, 5위 1%, 그 외 0.5% 로 보수 추정
const ctr=t=>t==='U5'||t==='U4'?0.02:t==='U3'?0.01:0.005;
let monthly=0;for(const r of plan){if(r.newBid>70&&r.v>0)monthly+=r.v*ctr(r.tier)*r.newBid;}
console.log('\n예상 월 지출',Math.round(monthly).toLocaleString(),'원 · 일',Math.round(monthly/30).toLocaleString(),'원');
console.log('현재 실제 지출 일평균 1,094원 · 현재 일예산 합계 424,000원');

// ── 캠페인별 긴급도 가치 ─────────────────────────────
const cv={};for(const r of plan){ if(!r.cid)continue; const c=cv[r.cid]=cv[r.cid]||{v:0,real:0,junk:0,n:0};
  c.n++; if(r.cat==='D_무관')c.junk++; if(r.tier&&r.demand){c.real++;c.v+=(r.u||0)*Math.max(r.v,1);} }
const st={};for(const c of cstat)st[c.id]=c;
const rows=cps.map(c=>({id:c.nccCampaignId,name:c.name,old:c.dailyBudget,...(cv[c.nccCampaignId]||{v:0,real:0,junk:0,n:0}),cost:+((st[c.nccCampaignId]||{}).salesAmt||0)}));
const TOTAL=rows.reduce((a,b)=>a+b.old,0);
const pg=rows.filter(r=>r.name.startsWith('제휴'));
const other=rows.filter(r=>!r.name.startsWith('제휴'));
const pgTotal=pg.reduce((a,b)=>a+b.old,0);                 // 제휴 라인은 건드리지 않는다
const pool=TOTAL-pgTotal;
const vs=other.reduce((a,b)=>a+b.v,0);
for(const r of other) r.neu = r.v>0 ? Math.max(1000,Math.round(pool*0.9*r.v/vs/100)*100) : 1000;
// 남은 예산은 가치 상위에 비례 배분 후 총합 보정
let sum=other.reduce((a,b)=>a+b.neu,0);
const k=pool/sum; for(const r of other) r.neu=Math.max(1000,Math.round(r.neu*k/100)*100);
// 반올림 잔차를 가치 1위 캠페인에서 정산해 총액을 정확히 보존한다
let diff=pool-other.reduce((a,b)=>a+b.neu,0);
const top=other.slice().sort((a,b)=>b.v-a.v);
for(const r of top){if(!diff)break;const step=diff>0?Math.min(diff,100000):Math.max(diff,1000-r.neu);r.neu+=step;diff-=step;}
for(const r of pg) r.neu=r.old;
const all=[...other,...pg];
console.log('\n예산 재배분 (제휴 라인 '+pgTotal.toLocaleString()+'원 고정, 나머지 '+pool.toLocaleString()+'원 재배분)');
console.log('합계 '+all.reduce((a,b)=>a+b.neu,0).toLocaleString()+'원 (기존 '+TOTAL.toLocaleString()+'원)');
console.log('\n상위 15 (긴급도 가치순)');
for(const r of other.slice().sort((a,b)=>b.v-a.v).slice(0,15))
  console.log('  '+r.name.padEnd(24),'키워드',String(r.n).padStart(5),'실수요',String(r.real).padStart(4),
    ' 예산',String(r.old).padStart(6),'→',String(r.neu).padStart(6));
const cut=other.filter(r=>r.neu<r.old);
console.log('\n예산 삭감 캠페인',cut.length,'개 · 회수액',cut.reduce((a,b)=>a+(b.old-b.neu),0).toLocaleString(),'원/일');
fs.writeFileSync(D+'plan_bids.json',JSON.stringify(chg.map(r=>({id:r.id,kw:r.kw,gid:r.gid,old:r.bid,neu:r.newBid,tier:r.tier,cat:r.cat}))));
fs.writeFileSync(D+'plan_budget.json',JSON.stringify(all.map(r=>({id:r.id,name:r.name,old:r.old,neu:r.neu}))));
