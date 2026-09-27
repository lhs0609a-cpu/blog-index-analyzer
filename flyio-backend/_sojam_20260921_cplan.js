// ⓒ 실행 — '노출은 되는데 4위 밖' 19개를 3위 추정가로 인상하는 계획.
// 가드: 인상만 · 10원 단위 내림 · 기기 가중치 반영 적용입찰 상한 15,000 · 실제로 도는 등록 1건만
//      · 백반증/원장 제외축은 애초에 후보에서 빠져 있음 · 잠금·검수·소재 미충족은 제외
const fs=require('fs'),path=require('path');
const D=path.join(__dirname,'../reports/sojam-20260921/');
const J=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const pick=J(D+'c_pick.json'), B=J(D+'c_before.json'), rows=J(D+'rows.json'), P=J(D+'perf.json');
const byk=new Map(rows.map(r=>[r.k,r]));
const kw=new Map(B.kw.map(x=>[x.nccKeywordId,x]));
const grp=new Map(B.grp.map(g=>[g.nccAdgroupId,g]));
const perf=new Map(P.kagg.map(r=>[r.kid,r]));
const CAP=15000;
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const wlen=s=>{let w=0;for(const c of String(s))w+=/[가-힣]/.test(c)?2:1;return w;};
const pad=(s,n)=>String(s)+' '.repeat(Math.max(0,n-wlen(s)));
const lpad=(s,n)=>' '.repeat(Math.max(0,n-wlen(s)))+String(s);

const plan=[],skip=[];
for(const p of pick){
  const regs=(byk.get(p.k).regs||[]).map(r=>{
    const k=kw.get(r.id), g=grp.get(r.gid)||{}, ad=B.ads[r.gid]||[0,0];
    if(!k||k.delFlag) return null;
    const mw=g.mobileNetworkBidWeight??100;
    const eff=Math.round((k.useGroupBidAmt?(g.bidAmt||0):(k.bidAmt||0))*mw/100);
    const pf=perf.get(r.id)||{imp:0,clk:0,cost:0};
    let bad=null;
    if(k.userLock) bad='키워드 OFF';
    else if(k.inspectStatus!=='APPROVED') bad='검수 '+k.inspectStatus;
    else if(g.userLock) bad='그룹 OFF';
    else if(g.status!=='ELIGIBLE') bad='그룹 '+g.statusReason;
    else if(ad[1]===0) bad='승인 소재 0';
    return {id:r.id,gid:r.gid,gname:g.name,mw,pw:g.pcNetworkBidWeight??100,bid:k.bidAmt,ugb:!!k.useGroupBidAmt,
            gbid:g.bidAmt,eff,imp:pf.imp,clk:pf.clk,cost:pf.cost,bad};
  }).filter(Boolean);
  const ok=regs.filter(r=>!r.bad);
  if(!ok.length){skip.push({...p,why:'집행 가능한 등록 없음('+[...new Set(regs.map(r=>r.bad))].join(',')+')'});continue;}
  // 실제로 노출을 만들고 있는 등록을 올린다. 없으면 현재 적용입찰이 가장 높은 것.
  ok.sort((a,b)=>b.imp-a.imp||b.eff-a.eff);
  const t=ok[0];
  const targetEff=Math.min(p.e3,CAP);
  const newBid=Math.max(70,Math.floor(targetEff/(t.mw/100)/10)*10);
  if(newBid<=t.bid){skip.push({...p,why:'이미 목표 이상(현재 '+won(t.bid)+'원)'});continue;}
  plan.push({k:p.k,axis:p.axis,vol:p.vol,rank:p.rank,e3:p.e3,add:p.add,cpg:p.cpg,
    id:t.id,gid:t.gid,gname:t.gname,mw:t.mw,pw:t.pw,ugb:t.ugb,oldBid:t.bid,newBid,
    oldEff:t.eff,newEff:Math.round(newBid*t.mw/100),pcEff:Math.round(newBid*t.pw/100),
    imp7:t.imp,clk7:t.clk,cost7:Math.round(t.cost),nOk:ok.length,nReg:regs.length});
}
fs.writeFileSync(D+'c_plan.json',JSON.stringify({plan,skip}));
console.log('■ 인상 계획 '+plan.length+'건 · 제외 '+skip.length+'건');
console.log('  '+pad('키워드',20)+pad('축',12)+lpad('월검색',7)+lpad('실순위',7)+lpad('현재입찰',9)+lpad('→ 새입찰',9)+lpad('모바일적용',10)+lpad('PC적용',8)+'  그룹');
for(const r of plan)
  console.log('  '+pad(r.k,20)+pad(r.axis,12)+lpad(won(r.vol),7)+lpad(r.rank.toFixed(1),7)+lpad(won(r.oldBid),9)+lpad(won(r.newBid),9)+lpad(won(r.newEff),10)+lpad(won(r.pcEff),8)+'  '+String(r.gname).slice(0,24));
console.log('\n  예상 추가비용 월 '+won(plan.reduce((a,r)=>a+r.add,0))+'원 (일 '+won(plan.reduce((a,r)=>a+r.add,0)/30)+'원)');
if(skip.length){console.log('\n■ 제외');for(const s of skip)console.log('  '+pad(s.k,20)+s.why);}
