const fs=require('fs'),path=require('path');const D=path.join(__dirname,'reports','kiness_bidreset_20260909');
const plan=JSON.parse(fs.readFileSync(path.join(D,'plan_vol.json'),'utf8'));
const a=JSON.parse(fs.readFileSync(path.join(D,'alloc2.json'),'utf8'));
const bids=new Map(a.bids),curve=JSON.parse(fs.readFileSync(path.join(D,'perf_curve.json'),'utf8'));
const B=[300,700,1500,3000,5000,8000,12000,18000,25000,35000,50000];
function at(c,b){const g=d=>{const t=c[d];if(!t||b<B[0])return {c:0,cost:0};let lo=B[0],hi=B[B.length-1];
 for(const x of B)if(x<=b)lo=x;for(let i=B.length-1;i>=0;i--)if(B[i]>=b)hi=B[i];if(lo===hi)return t[lo];
 const w=(b-lo)/(hi-lo);return {c:t[lo].c+(t[hi].c-t[lo].c)*w,cost:t[lo].cost+(t[hi].cost-t[lo].cost)*w};};
 const p=g('PC'),m=g('MOBILE');return {cost:p.cost+m.cost,clicks:p.c+m.c};}
const camp={};
for(const p of plan){const b=bids.get(p.id);const c=curve[p.id];
 const s=camp[p.campaign]||(camp[p.campaign]={kw:0,active:0,cost:0,clicks:0,max:0});
 s.kw++;if(b>70){s.active++;s.max=Math.max(s.max,b);}
 if(c&&b>70){const r=at(c,b);s.cost+=r.cost/30.4;s.clicks+=r.clicks/30.4;}}
const rows=Object.entries(camp).sort((x,y)=>y[1].cost-x[1].cost);
console.log('캠페인'.padEnd(24),'키워드'.padStart(7),'운영중'.padStart(7),'최고입찰'.padStart(9),'예상클릭/일'.padStart(9),'예상비용/일'.padStart(10));
let t=0;for(const [k,v] of rows){t+=v.cost;
 if(v.cost>=100||v.active>0)console.log(k.padEnd(24),String(v.kw).padStart(7),String(v.active).padStart(7),v.max.toLocaleString().padStart(9),v.clicks.toFixed(2).padStart(9),Math.round(v.cost).toLocaleString().padStart(10));}
console.log('합계 예상 일 지출',Math.round(t).toLocaleString(),'원');
