const fs=require('fs');const D='reports/medilon_20260921/';
const est=JSON.parse(fs.readFileSync(D+'estimates.json','utf8'));
const u=JSON.parse(fs.readFileSync(D+'kwurg.json','utf8'));
const vol=JSON.parse(fs.readFileSync(D+'volumes.json','utf8'));
const n=v=>v==='< 10'?5:(+v||0);
const g=k=>{const p=est['PC|1|'+k],m=est['MOBILE|1|'+k];return {p,m};};
const byTier={};
for(const r of u){ if(!r.tier)continue; const e=g(r.kw); if(e.p==null&&e.m==null)continue;
  const b=Math.max(e.p||0,e.m||0); (byTier[r.tier]=byTier[r.tier]||[]).push(b); }
console.log('tier별 1위 추정입찰가 분포 (PC/MO 최대)');
for(const [t,v] of Object.entries(byTier).sort()){v.sort((a,b)=>a-b);
  const q=p=>v[Math.floor(v.length*p)];
  console.log('  '+t,'n='+String(v.length).padStart(5),'중앙',String(q(.5)).padStart(6),'75%',String(q(.75)).padStart(6),'90%',String(q(.9)).padStart(7),'최대',String(v[v.length-1]).padStart(7));}
console.log('\n볼륨 있는 의료 키워드의 1위 추정가 상위 30');
const rows=u.filter(r=>r.tier).map(r=>{const v=vol[r.kw.toUpperCase()]||vol[r.kw]||{};const e=g(r.kw);
  return {kw:r.kw,tier:r.tier,cat:r.cat,v:n(v.pc)+n(v.mo),b:Math.max(e.p||0,e.m||0)};}).filter(r=>r.v>=10&&r.b>0);
rows.sort((a,b)=>b.v-a.v);
for(const r of rows.slice(0,30))console.log('  월'+String(r.v).padStart(6),'1위'+String(r.b).padStart(7),'원 ',r.tier,(r.cat||'').padEnd(16),r.kw);
