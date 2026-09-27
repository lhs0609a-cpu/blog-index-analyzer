// 소잠 2026-09-17 보고 — 어제(9/16) 소진·클릭 키워드 + 내원가능성 상위 전수 실순위
const fs=require('fs'),path=require('path');
const D16=path.join(__dirname,'../reports/sojam-20260916/'),D17=path.join(__dirname,'../reports/sojam-20260917/');
const J=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const weak=J(D16+'weak.json'), bytext=J(D16+'inv/bytext.json');
const groups=new Map(J(D16+'inv/groups.json').map(g=>[g.id,g]));
const camps=new Map(J(D16+'inv/campaigns.json').map(c=>[c.id,c]));
const ads=new Map(); for(const l of fs.readFileSync(D16+'ads.jsonl','utf8').split('\n')){if(!l.trim())continue;const d=JSON.parse(l);ads.set(d.gid,d);}
const day=J(D17+'day16.json'), win=J(D17+'win3.json'), kw=J(D17+'kwnow.json');
const HI=weak.filter(r=>r.score>=40);
const wavg=(list,pick)=>{let s=0,i=0;for(const x of list){const a=pick(x);if(a&&a.rank&&a.imp){s+=a.rank*a.imp;i+=a.imp;}}return i?{rank:+(s/i).toFixed(1),imp:i}:{rank:null,imp:0};};
const rows=HI.map(r=>{
  const regs=(bytext[r.k]||[]);
  const live=regs.filter(x=>{const m=kw[x.id]||{};const g=groups.get(m.gid||x.gid)||{},c=camps.get(g.cid)||{},a=ads.get(m.gid||x.gid)||{ok:0};
    return m.k && !m.del && !m.lock && !g.lock && !c.lock && m.st!=='PAUSED' && m.ins==='APPROVED' && a.ok>0;});
  const eff=x=>{const m=kw[x.id]||{};const g=groups.get(m.gid||x.gid)||{};return Math.round((m.ugb?(g.bid||0):(m.bid||0))*((g.mw??100)/100));};
  const bid=live.length?Math.max(...live.map(eff)):0;
  const d=wavg(regs,x=>day[x.id]), w=wavg(regs,x=>win[x.id]);
  const agg=f=>regs.reduce((a,x)=>a+((day[x.id]||{})[f]||0),0);
  return {...r, nReg:regs.length, nLive:live.length, bidNow:bid,
    dImp:agg('imp'), dClk:agg('clk'), dCost:agg('cost'), dRank:d.rank,
    wRank:w.rank, wImp:w.imp,
    rank: d.rank!=null?d.rank:w.rank, rankSrc: d.rank!=null?'9/16':(w.rank!=null?'9/14~16':null)};
});
fs.writeFileSync(D17+'rows.json',JSON.stringify(rows));
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const W=s=>{let w=0;for(const c of String(s))w+=/[가-힣ㄱ-ㅎㅏ-ㅣ―·]/.test(c)?2:1;return w;};
const pad=(s,n)=>String(s)+' '.repeat(Math.max(0,n-W(s)));
const padL=(s,n)=>' '.repeat(Math.max(0,n-W(s)))+String(s);
const sum=(l,f)=>l.reduce((a,r)=>a+(r[f]||0),0);
console.log('내원가능성 기준(상담일지 기저 내원율 40.5%) 이상 키워드 '+rows.length+'개 · 월검색 '+won(sum(rows,'vol')));
const exposed=rows.filter(r=>r.dImp>0), zero=rows.filter(r=>!r.dImp);
console.log('  어제 노출된 것 '+exposed.length+'개(노출 '+won(sum(exposed,'dImp'))+' · 클릭 '+sum(exposed,'dClk')+' · 소진 '+won(sum(exposed,'dCost'))+'원)');
console.log('  어제 노출 0 '+zero.length+'개 · 그중 3일 창에도 노출 0 '+zero.filter(r=>!r.wImp).length+'개');
const band=(lo,hi)=>rows.filter(r=>r.rank!=null&&r.rank>=lo&&r.rank<hi);
console.log('\n[실순위 분포 · 노출가중 avgRnk, 어제 없으면 9/14~16]');
for(const [l,h,n] of [[0,2,'1위대'],[2,3,'2위대'],[3,4,'3위대'],[4,5,'4위대'],[5,7,'5~6위'],[7,99,'7위 밖']]){
  const b=band(l,h); console.log('  '+pad(n,8)+padL(b.length,5)+'개 · 월검색 '+padL(won(sum(b,'vol')),9)+' · 어제클릭 '+padL(sum(b,'dClk'),3));
}
console.log('  '+pad('측정불가',8)+padL(rows.filter(r=>r.rank==null).length,5)+'개 · 월검색 '+padL(won(sum(rows.filter(r=>r.rank==null),'vol')),9));
const head=(t,list)=>{
  console.log('\n■ '+t+' — '+list.length+'개');
  console.log('  '+pad('키워드',22)+pad('축',12)+padL('월검색',8)+padL('간절',6)+padL('입찰',8)+padL('실순위',7)+padL('어제노출',9)+padL('클릭',5)+padL('소진',9));
  for(const r of list.slice(0,40)) console.log('  '+pad(r.k,22)+pad(r.axis,12)+padL(won(r.vol),8)+padL(r.score,6)+padL(won(r.bidNow),8)+padL((r.rank==null?'-':r.rank.toFixed(1))+(r.rankSrc==='9/14~16'?'*':''),7)+padL(won(r.dImp),9)+padL(r.dClk,5)+padL(won(r.dCost),9));
};
const bigOut=rows.filter(r=>r.rank!=null&&r.rank>4).sort((a,b)=>b.vol-a.vol);
head('실순위 5위 밖 (수요 큰 순)',bigOut);
head('월검색 1,000+ 인데 어제 노출 0',rows.filter(r=>r.vol>=1000&&!r.dImp).sort((a,b)=>b.vol-a.vol));
head('살아있는 등록이 없음(소재·검수·잠금)',rows.filter(r=>r.nLive===0).sort((a,b)=>b.vol-a.vol));
head('입찰 100원 이하로 눌린 것',rows.filter(r=>r.nLive>0&&r.bidNow<=100).sort((a,b)=>b.vol-a.vol));
