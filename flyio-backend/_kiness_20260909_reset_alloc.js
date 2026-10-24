// 우선순위 사다리대로 위에서부터 채우고, 목표 일 지출 18만원에서 멈춘다.
const fs=require('fs'),path=require('path');
const D=path.join(__dirname,'reports','kiness_bidreset_20260909');
const plan=JSON.parse(fs.readFileSync(path.join(D,'plan_vol.json'),'utf8'));
const curve=JSON.parse(fs.readFileSync(path.join(D,'perf_curve.json'),'utf8'));
const e1=JSON.parse(fs.readFileSync(path.join(D,'estimates_rank1.json'),'utf8'));
const primary=new Set(JSON.parse(fs.readFileSync(path.join(D,'primary_ids.json'),'utf8')));
const BIDS=[300,700,1500,3000,5000,8000,12000,18000,25000,35000,50000];
const TARGET=Number(process.argv[2])||150000;
// 티어별 클릭당 허용 상한. 문의 의도가 낮을수록 낮다.
const TIER=[
 {t:'T1_브랜드',      cap:3000,  floor:300},
 {t:'T2_지점생활권',   cap:30000, floor:500},
 {t:'T3_대표상담검사', cap:25000, floor:500},
 {t:'T4_성장고민',    cap:12000, floor:300},
 {t:'T5_상담롱테일',   cap:8000,  floor:300},
 {t:'T6_인접진료',    cap:null,  floor:300},   // 남는 예산을 채우는 조절 티어
];
const CAPOF=Object.fromEntries(TIER.map(x=>[x.t,x]));
function bidFor(p,cap){
 const c=CAPOF[p.tier];if(!c)return 70;
 if(!primary.has(p.id))return 70;                 // 같은 키워드의 중복 위치는 억제
 const e=e1[p.id];if(!e)return 70;
 const want=Math.ceil(Math.max(e.PC,e.MOBILE)*1.10/10)*10;
 return Math.max(70,Math.min(cap,Math.max(c.floor,want)));
}
function forecast(bids){
 const byTier={};let total=0,clicks=0;
 for(const p of plan){const c=curve[p.id];if(!c)continue;const b=bids.get(p.id);if(!b||b<=70)continue;
  let lo=BIDS[0],hi=BIDS[BIDS.length-1];for(const x of BIDS)if(x<=b)lo=x;for(let i=BIDS.length-1;i>=0;i--)if(BIDS[i]>=b)hi=BIDS[i];
  const g=d=>{const t=c[d];if(!t)return {c:0,cost:0};if(lo===hi)return t[lo];const w=(b-lo)/(hi-lo);
   return {c:t[lo].c+(t[hi].c-t[lo].c)*w,cost:t[lo].cost+(t[hi].cost-t[lo].cost)*w};};
  const a=g('PC'),m=g('MOBILE'),cost=(a.cost+m.cost)/30.4,ck=(a.c+m.c)/30.4;
  const s=byTier[p.tier]||(byTier[p.tier]={cost:0,clicks:0});s.cost+=cost;s.clicks+=ck;total+=cost;clicks+=ck;}
 return {total,clicks,byTier};
}
// 1~5순위는 상한까지 채우고, 6순위 상한만 목표에 맞춰 조정한다.
const base=new Map();
for(const p of plan)base.set(p.id,CAPOF[p.tier]&&p.tier!=='T6_인접진료'?bidFor(p,CAPOF[p.tier].cap):70);
const core=forecast(base);
let lo=300,hi=50000,t6=300;
for(let i=0;i<24;i++){const mid=Math.round((lo+hi)/2);const m=new Map(base);
 for(const p of plan)if(p.tier==='T6_인접진료')m.set(p.id,bidFor(p,mid));
 const f=forecast(m);if(f.total>TARGET)hi=mid;else{lo=mid;t6=mid;}}
const bids=new Map(base);for(const p of plan)if(p.tier==='T6_인접진료')bids.set(p.id,bidFor(p,t6));
const f=forecast(bids);
console.log('1~5순위만  예상 일 지출',Math.round(core.total).toLocaleString(),'클릭/일',core.clicks.toFixed(1));
console.log('6순위 상한',t6.toLocaleString(),'원 → 전체 예상 일 지출',Math.round(f.total).toLocaleString(),'클릭/일',f.clicks.toFixed(1));
console.log('tier'.padEnd(16),'입찰범위'.padStart(16),'상한도달'.padStart(8),'예상클릭/일'.padStart(10),'예상비용/일'.padStart(11),'예상CPC'.padStart(8));
const stat={};
for(const p of plan){const b=bids.get(p.id);const a=stat[p.tier]||(stat[p.tier]={n:0,min:Infinity,max:0,atCap:0});a.n++;if(b>70){a.min=Math.min(a.min,b);a.max=Math.max(a.max,b);}a.atCap+=b>=(p.tier==='T6_인접진료'?t6:(CAPOF[p.tier]?.cap||0))&&b>70?1:0;}
for(const {t} of TIER){const s=stat[t],v=f.byTier[t]||{cost:0,clicks:0};
 console.log(t.padEnd(16),((s.min===Infinity?70:s.min)+'~'+s.max).padStart(16),String(s.atCap).padStart(8),v.clicks.toFixed(1).padStart(10),Math.round(v.cost).toLocaleString().padStart(11),(v.clicks?Math.round(v.cost/v.clicks):0).toLocaleString().padStart(8));}
fs.writeFileSync(path.join(D,'alloc.json'),JSON.stringify({t6cap:t6,target:TARGET,forecast:{total:f.total,clicks:f.clicks,byTier:f.byTier},bids:[...bids]}));
