// Q1 — 내원에 중요한 키워드인데 7일(9/14~20) 노출이 0인 것 전수 + 무엇이 막고 있는지
// 중요도 = [[sojam-urgency-from-sheet]] 실측 내원율 모델 점수 ≥ 40.5(상담일지 기저 내원율)
const fs=require('fs'),path=require('path');
const D=path.join(__dirname,'../reports/sojam-20260921/');
const J=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const rows=J(D+'rows.json'), P=J(D+'perf.json'), vol=J(D+'vol.json'), ST=J(D+'state.json');
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const wlen=s=>{let w=0;for(const c of String(s))w+=/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(c)?2:1;return w;};
const pad=(s,n)=>String(s)+' '.repeat(Math.max(0,n-wlen(s)));
const lpad=(s,n)=>' '.repeat(Math.max(0,n-wlen(s)))+String(s);
const mv=k=>{const v=vol[k];return v?(v.pc+v.mo):null;};

// 7일 노출이 있었던 그룹 = 소재가 실제로 도는 게 증명된 그룹
const impGroups=new Set(P.kagg.filter(r=>r.imp>0).map(r=>r.gid));
const kwState=ST.kw, adState=ST.ads;
const S=J(D+'struct.json');
const campOff=new Map(S.campaigns.map(c=>[c.id,c.off]));
const gOff=new Map(S.gmeta.filter(g=>!String(g[0]).startsWith('ERR:')).map(g=>[g[0],g[1]]));

function blockOf(reg,cid){
  const st=kwState[reg.id];
  if(!st) return '조회 안 됨';           // 미조회를 '없음'으로 읽지 않는다
  if(st[4]) return '삭제됨';
  if(st[0]) return '키워드 OFF';
  if(st[3]!=='APPROVED') return '키워드 검수 '+st[3];
  if(gOff.get(reg.gid)) return '그룹 OFF';
  if(campOff.get(cid)) return '캠페인 OFF';
  if(!impGroups.has(reg.gid)){
    const a=adState[reg.gid];
    if(a==='ERR'||a===undefined) return '소재 미확인';
    if(a[1]===0) return a[3]>0?'소재 반려':(a[2]>0?'소재 검수중':'소재 0개');
  }
  if(reg.eff<=100) return '입찰 바닥('+reg.eff+'원)';
  return null;                            // 막는 게 없다 = 돌고 있다
}

const REVIVE=/^(두드러기|건선|여드름)$/;   // 원장이 '결제가 안 된다'고 뺐다가 9/15부터 되살리는 중인 축
const ORDER=['입찰 바닥','키워드 OFF','키워드 검수','그룹 OFF','캠페인 OFF','소재 반려','소재 검수중','소재 0개','소재 미확인','조회 안 됨','삭제됨'];
// Q2 의 '내원가능성 낮음' 과 같은 기준을 쓴다 — 정보형 질의와 제품·시술어는 중요 키워드가 아니다
const cand=rows.filter(r=>r.axis&&!r.noise&&!r.brand&&!r.excl.length&&!r.far&&!r.info&&!r.prod&&r.score>=40.5);
for(const r of cand){
  r.vol=mv(r.k);
  const bl=r.regs.map(g=>({...g,block:blockOf(g,g.cid)}));
  r.run=bl.filter(g=>!g.block);
  r.bl=bl;
  if(r.run.length) r.fix=r.imp?'노출됨':'도는데 노출 0';
  else{
    let f=null;
    for(const o of ORDER){const c=bl.find(g=>g.block&&g.block.startsWith(o));if(c){f=c.block.replace(/\(.*/,'');break;}}
    r.fix=f||'등록 없음';
  }
  r.bestEff=Math.max(0,...bl.map(g=>g.eff));
}
const zero=cand.filter(r=>!r.imp);
console.log('■ 내원 중요 키워드 = 진료축 ∩ 원장 제외축 아님 ∩ 타지역 아님 ∩ 정보형·제품어 아님 ∩ 내원가능성 점수 ≥ 40.5(상담일지 기저 내원율)');
console.log('  대상 '+won(cand.length)+'개 · 7일(9/14~20) 노출 0 = '+won(zero.length)+'개 ('+(zero.length/cand.length*100).toFixed(1)+'%)\n');

// 검색량 계층 — 노출 0 이 '문제'인지 '정상'인지를 가르는 것은 검색량이다
const TIER=[['월 1,000+',v=>v>=1000],['월 300~999',v=>v>=300],['월 100~299',v=>v>=100],['월 30~99',v=>v>=30],['월 10~29',v=>v>=10],['월 10 미만·미확인',v=>true]];
const tierOf=r=>{const v=r.vol||0;for(const [n,f] of TIER)if(f(v))return n;};
const byTier={};
for(const r of zero){const t=tierOf(r);(byTier[t]=byTier[t]||[]).push(r);}
console.log('  [검색량별 노출 0]');
for(const [t] of TIER){const l=byTier[t]||[];
  const b={};for(const r of l)b[r.fix]=(b[r.fix]||0)+1;
  console.log('   '+pad(t,20)+lpad(won(l.length)+'개',9)+'  '+Object.entries(b).sort((a,b2)=>b2[1]-a[1]).map(([k,v])=>k+' '+v).join(' · '));}
console.log('\n  ※ 월 10 미만은 하루 기대 노출이 0.3회 미만이라 7일 노출 0 이 구조상 정상이다 — 입찰로 살아나지 않는다.');

// 실제 문제 = 검색량 30+ 인데 노출 0
const real=zero.filter(r=>(r.vol||0)>=30).sort((a,b)=>(b.vol||0)-(a.vol||0));
console.log('\n\n■ 진짜 문제 — 월검색 30 이상인데 7일 노출 0 : '+real.length+'개 (월검색 합 '+won(real.reduce((a,r)=>a+r.vol,0))+')');
const byFix={};for(const r of real){const f=byFix[r.fix]=byFix[r.fix]||{n:0,vol:0};f.n++;f.vol+=r.vol;}
for(const [k,v] of Object.entries(byFix).sort((a,b)=>b[1].vol-a[1].vol))
  console.log('   '+pad(k,18)+lpad(v.n+'개',7)+lpad('월검색 '+won(v.vol),16));
const rev=real.filter(r=>REVIVE.test(r.axis));
console.log('   ※ 이 중 '+rev.length+'개(월검색 '+won(rev.reduce((a,r)=>a+r.vol,0))+')는 두드러기·건선·여드름 — 원장이 한때 뺀 축이라 현재 상태가 의도일 수 있다.');
const axr={};for(const r of real){const a=axr[r.axis]=axr[r.axis]||{n:0,vol:0};a.n++;a.vol+=r.vol;}
console.log('');
console.log('   [축별]');
for(const [k,v] of Object.entries(axr).sort((a,b)=>b[1].vol-a[1].vol))
  console.log('    '+pad(k,14)+lpad(v.n+'개',7)+lpad('월검색 '+won(v.vol),16));

for(const grpName of Object.keys(byFix).sort((a,b)=>byFix[b].vol-byFix[a].vol)){
  const l=real.filter(r=>r.fix===grpName);
  console.log('\n\n── '+grpName+' ('+l.length+'개) ─────────────────────────────');
  console.log('  '+pad('키워드',26)+pad('축',13)+lpad('점수',6)+lpad('월검색',9)+lpad('현재입찰',9)+lpad('등록',5)+'  비고/그룹');
  for(const r of l)
    console.log('  '+pad(r.k,26)+pad(r.axis,13)+lpad(r.score,6)+lpad(won(r.vol),9)+lpad(won(r.bestEff),9)+lpad(r.nReg,5)+'  '+(REVIVE.test(r.axis)?'[원장 제외이력축] ':'')+(r.bl[0]?String(r.bl[0].gname).slice(0,26):''));
  const nrev=l.filter(r=>REVIVE.test(r.axis)).length;
  if(nrev)console.log('  ── 이 중 '+nrev+'개가 원장이 한때 뺀 축(두드러기·건선·여드름)이다 — 70원인 게 의도일 수 있다.');
}

// 노출은 되지만 4위 밖 — 계정 실측 CTR 이 4위 0.06% / 5위 0.02% 라 사실상 안 보이는 것과 같다
const seen=cand.filter(r=>r.imp>=10&&r.rank!=null&&r.rank>4&&r.rank<50).sort((a,b)=>(b.vol||0)-(a.vol||0));
console.log('');
console.log('');
console.log('■ 노출은 되는데 4위 밖 (7일 노출 10회 이상만, 표본 부족 제외) : '+seen.length+'개');
console.log('  '+pad('키워드',26)+pad('축',13)+lpad('점수',6)+lpad('월검색',9)+lpad('노출',8)+lpad('클릭',5)+lpad('실순위',7)+lpad('현재입찰',9));
for(const r of seen.slice(0,80))
  console.log('  '+pad(r.k,26)+pad(r.axis,13)+lpad(r.score,6)+lpad(won(r.vol),9)+lpad(won(r.imp),8)+lpad(r.clk,5)+lpad(r.rank.toFixed(1),7)+lpad(won(r.bestEff),9));
if(seen.length>80)console.log('  … 외 '+(seen.length-80)+'개 (q1.json)');

fs.writeFileSync(D+'q1_seen.json',JSON.stringify(seen.map(r=>({k:r.k,axis:r.axis,score:r.score,vol:r.vol,imp:r.imp,clk:r.clk,cost:r.cost,rank:r.rank,bestEff:r.bestEff}))));
fs.writeFileSync(D+'q1.json',JSON.stringify(cand.map(r=>({k:r.k,axis:r.axis,score:r.score,vol:r.vol,imp:r.imp,clk:r.clk,cost:r.cost,
  fix:r.fix,bestEff:r.bestEff,nReg:r.nReg,nRun:r.run.length,blocks:r.bl.map(g=>({id:g.id,gid:g.gid,gname:g.gname,eff:g.eff,block:g.block}))}))));
console.log('\n저장: reports/sojam-20260921/q1.json');
