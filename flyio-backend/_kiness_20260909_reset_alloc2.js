// 우선순위 사다리대로 위에서부터 채우고 목표 일 지출에서 멈춘다.
// 등급은 운영 우선순위이며 내원 확률이나 진단이 아니다.
const fs=require('fs'),path=require('path');
const D=path.join(__dirname,'reports','kiness_bidreset_20260909');
const plan=JSON.parse(fs.readFileSync(path.join(D,'plan_vol.json'),'utf8'));
const curve=JSON.parse(fs.readFileSync(path.join(D,'perf_curve.json'),'utf8'));
const e1=JSON.parse(fs.readFileSync(path.join(D,'estimates_rank1.json'),'utf8'));
const primary=new Set(JSON.parse(fs.readFileSync(path.join(D,'primary_ids.json'),'utf8')));
const B=[300,700,1500,3000,5000,8000,12000,18000,25000,35000,50000];
const TARGET=Number(process.argv[2])||150000;
// 아동·청소년이 특정된 검색만 진료 대상이 분명하다. 나머지 인접어는 성인 검색이 섞인다.
const CHILD=/어린이|청소년|초등|중학생|고등학생|남아|여아|아동|소아|우리(?:아이|아들|딸)|자녀|아이|성장기|사춘기|초경|중[123]|고[123]|초[1-6]|(?:[4-9]|1[0-8])(?:세|살)|학생|키성장|성장/;
function sub(p){return p.tier==='T6_인접진료'?(CHILD.test(p.keyword)?'T6a_인접진료_아동':'T6b_인접진료_일반'):p.tier;}
const CAP2=Number(process.env.CAP_T2)||30000, CAP3=Number(process.env.CAP_T3)||25000;
const TIER={
 T1_브랜드:        {cap:3000,  floor:1000,order:1},
 T2_지점생활권:     {cap:CAP2,  floor:500, order:2},
 T3_대표상담검사:   {cap:CAP3,  floor:500, order:3},
 T4_성장고민:      {cap:12000, floor:300, order:4},
 T5_상담롱테일:     {cap:8000,  floor:300, order:5},
 T6a_인접진료_아동: {cap:null,  floor:300, order:6},
 T6b_인접진료_일반: {cap:null,  floor:300, order:7},
};
function bidFor(p,cap){
 const t=TIER[sub(p)];if(!t)return 70;
 if(!primary.has(p.id))return 70;
 const e=e1[p.id];if(!e)return 70;
 // 그룹 PC·모바일 입찰가중치를 나눠줘야 기기별 실효 입찰가가 목표 추정가에 닿는다.
 const want=Math.ceil(Math.max(e.PC*100/(p.pcW||100),e.MOBILE*100/(p.moW||100))*1.10/10)*10;
 // 지난 7일 실제 클릭이 있던 키워드는 실측 단가 아래로 내리지 않는다. 추정가가 실제 낙찰가보다 낮게 나오는 경우가 있다.
 const proven=p.clk7>0?Math.ceil(p.cpc7*1.10/10)*10:0;
 // 네이버 입찰가는 70원 이상 10원 단위여야 한다.
 const v=Math.max(70,Math.min(cap,Math.max(t.floor,want,proven)));
 return Math.max(70,Math.floor(v/10)*10);
}
function at(c,b){const g=d=>{const t=c[d];if(!t||b<B[0])return {c:0,cost:0};
 let lo=B[0],hi=B[B.length-1];for(const x of B)if(x<=b)lo=x;for(let i=B.length-1;i>=0;i--)if(B[i]>=b)hi=B[i];
 if(lo===hi)return t[lo];const w=(b-lo)/(hi-lo);
 return {c:t[lo].c+(t[hi].c-t[lo].c)*w,cost:t[lo].cost+(t[hi].cost-t[lo].cost)*w};};
 const p=g('PC'),m=g('MOBILE');return {clicks:p.c+m.c,cost:p.cost+m.cost};}
function forecast(bids){const byTier={};let total=0,clicks=0;
 for(const p of plan){const c=curve[p.id];if(!c)continue;const b=bids.get(p.id);if(!b||b<=70)continue;
  const r=at(c,b),cost=r.cost/30.4,ck=r.clicks/30.4,k=sub(p);
  const s=byTier[k]||(byTier[k]={cost:0,clicks:0});s.cost+=cost;s.clicks+=ck;total+=cost;clicks+=ck;}
 return {total,clicks,byTier};}
const base=new Map();
for(const p of plan){const k=sub(p),t=TIER[k];base.set(p.id,t&&t.cap?bidFor(p,t.cap):70);}
const core=forecast(base);
// 6순위(아동 특정)를 먼저 채우고, 남으면 7순위(일반 인접어)를 채운다.
function solve(from,cap6a,cap6b){const m=new Map(base);
 for(const p of plan){const k=sub(p);if(k==='T6a_인접진료_아동')m.set(p.id,bidFor(p,cap6a));if(k==='T6b_인접진료_일반')m.set(p.id,bidFor(p,cap6b));}
 return m;}
let a=300,b=25000,c6a=300;
for(let i=0;i<24;i++){const mid=Math.round((a+b)/2);if(forecast(solve(0,mid,300)).total>TARGET)b=mid;else{a=mid;c6a=mid;}}
let full6a=forecast(solve(0,25000,300)).total;
let c6b=300;
if(full6a<TARGET){c6a=25000;let x=300,y=25000;
 for(let i=0;i<24;i++){const mid=Math.round((x+y)/2);if(forecast(solve(0,c6a,mid)).total>TARGET)y=mid;else{x=mid;c6b=mid;}}}
const bids=solve(0,c6a,c6b);const f=forecast(bids);
console.log('1~5순위만 예상 일 지출',Math.round(core.total).toLocaleString(),'원');
console.log('6순위(아동 인접) 상한',c6a.toLocaleString(),'원 / 7순위(일반 인접) 상한',c6b.toLocaleString(),'원');
console.log('→ 전체 예상 일 지출',Math.round(f.total).toLocaleString(),'원 / 클릭',f.clicks.toFixed(1),'건');
const stat={};
for(const p of plan){const k=sub(p),bd=bids.get(p.id);const s=stat[k]||(stat[k]={n:0,min:Infinity,max:0,raised:0,cut:0});
 s.n++;if(bd>70){s.min=Math.min(s.min,bd);s.max=Math.max(s.max,bd);}if(bd>p.oldBid)s.raised++;if(bd<p.oldBid)s.cut++;}
console.log('');
console.log('순위 티어'.padEnd(20),'키워드'.padStart(7),'인상'.padStart(6),'인하'.padStart(6),'입찰범위'.padStart(15),'클릭/일'.padStart(8),'비용/일'.padStart(10),'CPC'.padStart(8));
for(const [k,t] of Object.entries(TIER).sort((x,y)=>x[1].order-y[1].order)){const s=stat[k]||{n:0,min:70,max:70,raised:0,cut:0},v=f.byTier[k]||{cost:0,clicks:0};
 console.log((t.order+'. '+k).padEnd(20),String(s.n).padStart(7),String(s.raised).padStart(6),String(s.cut).padStart(6),
  ((s.min===Infinity?70:s.min)+'~'+s.max).padStart(15),v.clicks.toFixed(1).padStart(8),Math.round(v.cost).toLocaleString().padStart(10),(v.clicks?Math.round(v.cost/v.clicks):0).toLocaleString().padStart(8));}
const sup=stat['T7_억제']||{n:0};
console.log(('8. T7_억제/중복').padEnd(20),String(plan.length-Object.entries(stat).filter(([k])=>TIER[k]).reduce((a,[,v])=>a+v.n,0)).padStart(7),'','','',' 70~70'.padStart(15));
// 모니터가 쓸 키워드별 상한. 경쟁이 올라가면 이 선까지 되올릴 수 있다.
const caps=new Map(),floors=new Map(),weights=new Map();
for(const p of plan){const k=sub(p),t=TIER[k];
 const capped=!t||!primary.has(p.id)?70:(k==='T6a_인접진료_아동'?c6a:k==='T6b_인접진료_일반'?c6b:t.cap);
 caps.set(p.id,capped);
 // 하한: 티어 하한과 실측 클릭단가 보호선. 모니터가 이 아래로 내리면 안 된다.
 const proven=p.clk7>0?Math.ceil(p.cpc7*1.10/10)*10:0;
 floors.set(p.id,!t||!primary.has(p.id)?70:Math.min(capped,Math.max(t.floor,proven)));
 weights.set(p.id,[p.pcW||100,p.moW||100]);}
fs.writeFileSync(path.join(D,(process.argv[3]||'alloc2')+'.json'),JSON.stringify({at:new Date().toISOString(),target:TARGET,cap6a:c6a,cap6b:c6b,
 forecast:{total:f.total,clicks:f.clicks,byTier:f.byTier},core:core.total,bids:[...bids],caps:[...caps],floors:[...floors],weights:[...weights],
 tierCaps:Object.fromEntries(Object.entries(TIER).map(([k,v])=>[k,k==='T6a_인접진료_아동'?c6a:k==='T6b_인접진료_일반'?c6b:v.cap]))}));
