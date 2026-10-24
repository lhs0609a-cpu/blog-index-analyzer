const fs=require('fs');const D='reports/medilon_20260921/';
const ks=JSON.parse(fs.readFileSync(D+'keyword_stats.json','utf8'));
const kw=JSON.parse(fs.readFileSync(D+'kwclass.json','utf8'));
const byId={};for(const r of kw)byId[r.id]=r;
const rows=Object.entries(ks).map(([id,s])=>({...byId[id],imp:+s.impCnt||0,clk:+s.clkCnt||0,cost:+s.salesAmt||0})).filter(r=>r.kw);
rows.sort((a,b)=>b.clk-a.clk||b.cost-a.cost);
const agg={};for(const r of rows){const c=r.cat||'?';agg[c]=agg[c]||{n:0,imp:0,clk:0,cost:0};agg[c].n++;agg[c].imp+=r.imp;agg[c].clk+=r.clk;agg[c].cost+=r.cost;}
console.log('90일 실적, 분류별');
for(const [c,v] of Object.entries(agg).sort((a,b)=>b[1].cost-a[1].cost))
  console.log('  '+c.padEnd(18),'키워드',String(v.n).padStart(5),'노출',String(v.imp).padStart(8),'클릭',String(v.clk).padStart(5),'비용',String(Math.round(v.cost)).padStart(6));
console.log('\n클릭 상위 40');
for(const r of rows.slice(0,40))console.log('  '+String(r.clk).padStart(3),'클릭',String(Math.round(r.cost)).padStart(5),'원',String(r.imp).padStart(7),'노출  ',(r.cat||'').padEnd(16),r.kw);
console.log('\n노출만 많고 클릭 0 인 상위 20 (허수 노출)');
for(const r of rows.filter(r=>r.clk===0).sort((a,b)=>b.imp-a.imp).slice(0,20))console.log('  '+String(r.imp).padStart(7),'노출  ',(r.cat||'').padEnd(16),r.kw);
