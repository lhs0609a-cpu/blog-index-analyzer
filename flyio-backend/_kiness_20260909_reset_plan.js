const fs=require('fs'),path=require('path');const {LADDER}=require('./_kiness_20260909_reset_ladder');
const D=path.join(__dirname,'reports','kiness_bidreset_20260909');
const rows=JSON.parse(fs.readFileSync(path.join(D,'ladder_rows.json'),'utf8'));
const est=JSON.parse(fs.readFileSync(path.join(D,'estimates_target.json'),'utf8'));
// 파워링크 순위별 클릭 점유 가정. 관측 CTR이 아니라 예측용 가중치다.
const SHARE=p=>{const t={1:1,2:.68,3:.5,4:.4,5:.33,6:.28,7:.24,8:.21,9:.19,10:.17};return p<=10?t[Math.round(p)]:Math.max(.08,.17*10/p);};
const CAPMUL=+process.argv[2]||1;   // 하위 티어 상한 조정 계수
const plan=[];
for(const r of rows){
 const L=LADDER[r.tier];
 let bid,pcTarget=null,moTarget=null,capped=false;
 if(!L.rank){bid=L.cap;}
 else{
  const e=est[r.id];if(!e||!(e.PC>0)||!(e.MOBILE>0))throw Error('missing estimate '+r.id);
  const cap=r.order<=3?L.cap:Math.round(L.cap*CAPMUL);
  pcTarget=Math.min(cap,Math.max(L.floor,Math.round(e.PC*1.05)));
  moTarget=Math.min(cap,Math.max(L.floor,Math.round(e.MOBILE*1.05)));
  const want=Math.ceil(Math.max(pcTarget*100/r.pcW,moTarget*100/r.moW)/10)*10;
  bid=Math.max(70,Math.min(100000,want));
  capped=Math.round(e.PC*1.05)>cap||Math.round(e.MOBILE*1.05)>cap;
  r.estPC=e.PC;r.estMO=e.MOBILE;
 }
 const pcEff=Math.round(bid*r.pcW/100),moEff=Math.round(bid*r.moW/100);
 // 예측: 노출은 지난주 수준 유지 가정, 순위만 이동. 실제로는 입찰 인상 시 노출도 늘어 하한 추정이다.
 const dImp=r.imp7/7, curRank=r.rank7||8, tgt=L.rank||10;
 const uplift=L.rank?SHARE(tgt)/SHARE(curRank):SHARE(10)/SHARE(curRank);
 plan.push({...r,bid,pcTarget,moTarget,pcEff,moEff,capped,targetRank:L.rank,cap:L.cap,
  dImp,uplift,shareCur:SHARE(curRank),shareTgt:L.rank?SHARE(tgt):SHARE(10),
  cpc:L.rank?Math.round((pcEff*0.24+moEff*0.76)):bid});
}
// CTR 기준선을 지난주 실측으로 보정한다.
let den=0,num=0;for(const p of plan){den+=p.imp7*p.shareCur;num+=p.clk7;}
const CTR=num/den;
let total=0;const byTier={};
for(const p of plan){
 p.predClicks=p.dImp*p.shareTgt*CTR;
 p.predCost=p.predClicks*p.cpc;
 total+=p.predCost;
 const a=byTier[p.tier]||(byTier[p.tier]={n:0,changed:0,capped:0,clicks:0,cost:0,minBid:Infinity,maxBid:0});
 a.n++;a.changed+=p.bid!==p.oldBid?1:0;a.capped+=p.capped?1:0;a.clicks+=p.predClicks;a.cost+=p.predCost;
 a.minBid=Math.min(a.minBid,p.bid);a.maxBid=Math.max(a.maxBid,p.bid);
}
fs.writeFileSync(path.join(D,'plan.json'),JSON.stringify(plan));
console.log('CTR 기준선',(CTR*100).toFixed(3)+'%','| 상한계수',CAPMUL);
console.log('tier'.padEnd(16),'키워드'.padStart(6),'변경'.padStart(6),'상한걸림'.padStart(7),'입찰범위'.padStart(16),'예상클릭/일'.padStart(9),'예상비용/일'.padStart(10));
for(const [k,v] of Object.entries(byTier).sort((a,b)=>LADDER[a[0]].order-LADDER[b[0]].order))
 console.log(k.padEnd(16),String(v.n).padStart(6),String(v.changed).padStart(6),String(v.capped).padStart(7),
  (v.minBid+'~'+v.maxBid).padStart(16),v.clicks.toFixed(1).padStart(9),Math.round(v.cost).toLocaleString().padStart(10));
console.log('예상 일 지출 합계',Math.round(total).toLocaleString(),'원');
fs.writeFileSync(path.join(D,'plan_summary.json'),JSON.stringify({at:new Date().toISOString(),capMul:CAPMUL,ctrBase:CTR,total:Math.round(total),byTier},null,1));
