// 계획(plan_final.json) → ID 단위 인상 액션. 텍스트마다 '대표 ID' 하나만 올린다(노출 실적 > 현재 유효입찰 순).
// 유효입찰 = bidAmt × 그룹 모바일가중치/100 이므로, 목표 유효입찰을 가중치로 되나눠 bidAmt 를 만든다. 10원 단위.
const fs=require('fs'),path=require('path');
const D=path.join(__dirname,'../reports/sojam-20260915/');
const J=n=>JSON.parse(fs.readFileSync(D+n,'utf8'));
const plan=J('plan_final.json');
const grp=J('meta_grp.json');
const coreRows=new Map(J('rows.json').map(r=>[r.k,r]));
const exKw=J('exax_kw.json'), exSt=J('exax_stats.json');
const exT=JSON.parse(fs.readFileSync(path.join(__dirname,'../reports/sojam-20260915_excluded_axes.json'),'utf8'));
const winSt=J('stats_win.json');

function optionsFor(t){
  if(t.group==='승인축'){
    const r=coreRows.get(t.k)||{};
    return (r.per||[]).filter(p=>p.live).map(p=>({id:p.id,gid:(J_kwgid[p.id]||null),grp:p.grp,bid:p.bid,imp:p.imp}));
  }
  const ids=(exT[t.k]||{}).ids||[];
  return ids.map(id=>{const m=exKw[id];if(!m||m.missing)return null;const g=grp[m.gid]||{};
    if(m.lock||g.lock||m.st==='PAUSED')return null;
    const base=m.useGrp?(g.bid||0):(m.bid||0);
    return {id,gid:m.gid,grp:g.name,bid:Math.round(base*(g.mw??100)/100),imp:(exSt[id]||{}).imp||0};}).filter(Boolean);
}
// 승인축은 rows.json 의 per 에 gid 가 없으므로 meta_kw 로 보강
const metaKw=J('meta_kw.json');
const J_kwgid={}; for(const [id,m] of Object.entries(metaKw)) if(m&&m.gid) J_kwgid[id]=m.gid;

const acts=[],skip=[];
for(const t of plan.take){
  const opts=optionsFor(t).filter(o=>o.gid);
  if(!opts.length){skip.push({k:t.k,why:'켜진 등록 없음'});continue;}
  opts.sort((a,b)=>(b.imp-a.imp)||(b.bid-a.bid));
  const o=opts[0];
  const g=grp[o.gid]||{};
  const mw=(g.mw??100)/100;
  const bidAmt=Math.max(70,Math.round(t.target/mw/10)*10);
  const m=metaKw[o.id]||exKw[o.id]||{};
  const from=m.useGrp?null:(m.bid??null);
  if(bidAmt<=(m.useGrp?Math.round((g.bid||0)):(m.bid||0))){skip.push({k:t.k,why:'이미 목표 이상'});continue;}
  acts.push({k:t.k,axis:t.axis,group:t.group,id:o.id,gid:o.gid,grpName:o.grp,mw:g.mw??100,
    curEff:o.bid,targetEff:t.target,bidAmt,fromBid:m.bid??null,useGrp:!!m.useGrp,dk:t.dk,dc:t.dc,vol:t.vol,rank:t.rank});
}
fs.writeFileSync(D+'actions.json',JSON.stringify({acts,skip},null,1));
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
console.log('액션',acts.length,'| 건너뜀',skip.length);
if(skip.length) console.log('  건너뜀:',skip.map(s=>s.k+'('+s.why+')').join(' '));
const by={};for(const a of acts){const x=by[a.axis]=by[a.axis]||{n:0,dc:0};x.n++;x.dc+=a.dc;}
console.log('축별:',Object.entries(by).map(([k,v])=>k+' '+v.n+'개').join(' · '));
console.log('그룹별 분포:',Object.entries(acts.reduce((a,x)=>{a[x.grpName]=(a[x.grpName]||0)+1;return a;},{})).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k,v])=>k+':'+v).join(' '));
console.log('bidAmt 상한 확인 — 최대',won(Math.max(...acts.map(a=>a.bidAmt))),'| 10원 단위 위반',acts.filter(a=>a.bidAmt%10).length);
