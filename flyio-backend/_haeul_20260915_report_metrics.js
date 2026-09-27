// period_raw.json → report_metrics.json (7/15~8/15 vs 직전 동기간 6/13~7/14)
const fs=require('fs'),path=require('path');
const D=path.join(__dirname,'reports','haeul_20260915');
const raw=JSON.parse(fs.readFileSync(path.join(D,'period_raw.json'),'utf8'));
const CUR={id:'cur',since:'2026-07-15',until:'2026-08-15',label:'2026.07.15 – 08.15'};
const PRV={id:'prv',since:'2026-06-13',until:'2026-07-14',label:'2026.06.13 – 07.14'};
const days=(a,b)=>{const o=[];for(let d=new Date(a+'T00:00:00Z');d<=new Date(b+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1))o.push(d.toISOString().slice(0,10));return o;};
const cm=new Map(raw.campaigns.map(c=>[c.id,c]));
// 캠페인 분류: 메인 파워링크 / 롱테일 자동풀 / 플레이스
const kind=c=>c.tp==='PLACE'?'place':/자동풀|auto_/.test(c.name)?'pool':'main';
const Z=()=>({imp:0,clk:0,cost:0,rnkSum:0,rnkImp:0});
const add=(a,r)=>{a.imp+=r.imp||0;a.clk+=r.clk||0;a.cost+=r.cost||0;if(r.rnk&&r.imp){a.rnkSum+=r.rnk*r.imp;a.rnkImp+=r.imp;}};
function agg(p){
  const t=Z(), byKind={main:Z(),pool:Z(),place:Z()}, byCamp={}, series=[];
  for(const day of days(p.since,p.until)){
    const rows=raw.byDay[day]||[];
    const d={day,main:Z(),pool:Z(),place:Z()};
    for(const r of rows){
      const c=cm.get(r.id); if(!c) continue;
      const k=kind(c);
      add(t,r); add(byKind[k],r); add(d[k],r);
      (byCamp[r.id]||=Object.assign(Z(),{name:c.name,tp:c.tp,kind:k}));
      add(byCamp[r.id],r);
    }
    series.push(d);
  }
  return {...p,total:t,byKind,byCamp,series,nDays:series.length};
}
const fin=a=>({...a,ctr:a.imp?a.clk/a.imp*100:0,cpc:a.clk?a.cost/a.clk:0,rnk:a.rnkImp?a.rnkSum/a.rnkImp:0});
const deep=o=>{const r={};for(const k of Object.keys(o))r[k]=fin(o[k]);return r;};
const cur=agg(CUR), prv=agg(PRV);
for(const p of [cur,prv]){p.total=fin(p.total);p.byKind=deep(p.byKind);p.byCamp=deep(p.byCamp);}
const out={builtAt:new Date().toISOString(),cur,prv,
  campaigns:raw.campaigns.map(c=>({...c,kind:kind(c)}))};
fs.writeFileSync(path.join(D,'report_metrics.json'),JSON.stringify(out,null,1));
const won=n=>Math.round(n).toLocaleString('ko-KR');
const pct=(a,b)=>b?((a-b)/b*100):0;
const line=(nm,a,b,f=won,suf='')=>console.log(nm.padEnd(10),String(f(a)+suf).padStart(12),String(f(b)+suf).padStart(12),(pct(a,b)>=0?'+':'')+pct(a,b).toFixed(1)+'%');
console.log('지표'.padEnd(10),'7/15~8/15'.padStart(12),'6/13~7/14'.padStart(12),'증감');
line('노출',cur.total.imp,prv.total.imp);
line('클릭',cur.total.clk,prv.total.clk);
line('소진',cur.total.cost,prv.total.cost);
line('CTR',cur.total.ctr,prv.total.ctr,n=>n.toFixed(2),'%');
line('CPC',cur.total.cpc,prv.total.cpc);
line('평균순위',cur.total.rnk,prv.total.rnk,n=>n.toFixed(2));
console.log('\n--- 유형별 (당기) ---');
for(const k of ['main','pool','place']) console.log(k.padEnd(7),'노출',won(cur.byKind[k].imp),'클릭',won(cur.byKind[k].clk),'소진',won(cur.byKind[k].cost),'CPC',won(cur.byKind[k].cpc));
console.log('\n--- 유형별 (전기) ---');
for(const k of ['main','pool','place']) console.log(k.padEnd(7),'노출',won(prv.byKind[k].imp),'클릭',won(prv.byKind[k].clk),'소진',won(prv.byKind[k].cost),'CPC',won(prv.byKind[k].cpc));
