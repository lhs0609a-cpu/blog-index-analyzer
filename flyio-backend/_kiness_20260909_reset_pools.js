const fs=require('fs'),path=require('path');const D=path.join(__dirname,'reports','kiness_bidreset_20260909');
const plan=JSON.parse(fs.readFileSync(path.join(D,'plan_vol.json'),'utf8'));
const curve=JSON.parse(fs.readFileSync(path.join(D,'perf_curve.json'),'utf8'));
const alloc=JSON.parse(fs.readFileSync(path.join(D,'alloc.json'),'utf8'));const bids=new Map(alloc.bids);
const groups=new Map(JSON.parse(fs.readFileSync(path.join(D,'groups.json'),'utf8')).map(g=>[g.nccAdgroupId,g]));
const B=[300,700,1500,3000,5000,8000,12000,18000,25000,35000,50000];
function at(c,b){const g=d=>{const t=c[d];if(!t)return {c:0,cost:0};if(b<B[0])return {c:0,cost:0};
 let lo=B[0],hi=B[B.length-1];for(const x of B)if(x<=b)lo=x;for(let i=B.length-1;i>=0;i--)if(B[i]>=b)hi=B[i];
 if(lo===hi)return t[lo];const w=(b-lo)/(hi-lo);return {c:t[lo].c+(t[hi].c-t[lo].c)*w,cost:t[lo].cost+(t[hi].cost-t[lo].cost)*w};};
 const p=g('PC'),m=g('MOBILE');return {cost:p.cost+m.cost};}
const pool={};
for(const p of plan){const c=curve[p.id];if(!c)continue;const b=bids.get(p.id);if(!b||b<=70)continue;
 const g=groups.get(p.gid),k=g.sharedBudgetName||'자체';
 const a=pool[k]||(pool[k]={cost:0,cap:g.sharedDailyBudget||g.dailyBudget,kw:0,top:[]});
 const r=at(c,b);a.cost+=r.cost/30.4;a.kw++;a.top.push({kw:p.keyword,tier:p.tier,bid:b,cost:Math.round(r.cost/30.4),grp:g.name});}
for(const [k,v] of Object.entries(pool).sort((a,b)=>b[1].cost-a[1].cost)){
 console.log('['+k+'] 현재상한',v.cap?.toLocaleString(),'| 예상 일 지출',Math.round(v.cost).toLocaleString(),'| 헤드키워드',v.kw);
 for(const t of v.top.sort((a,b)=>b.cost-a.cost).slice(0,6))console.log('    ',t.kw,t.tier,'입찰'+t.bid,'비용/일'+t.cost.toLocaleString(),'|',t.grp);}
