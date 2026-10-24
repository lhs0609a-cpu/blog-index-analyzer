const fs=require('fs');const D='reports/medilon_20260921/';
const vol=JSON.parse(fs.readFileSync(D+'volumes.json','utf8'));
const live=new Set(JSON.parse(fs.readFileSync(D+'kwclass.json','utf8')).map(r=>r.kw.replace(/\s/g,'').toUpperCase()));
const n=v=>v==='< 10'?5:(+v||0);
const cand=JSON.parse(fs.readFileSync(D+'gaplist.json','utf8')).map(k=>k.replace(/\s/g,''));
const rows=cand.map(k=>{const v=vol[k]||vol[k.toUpperCase()]||{};return {kw:k,v:n(v.pc)+n(v.mo),live:live.has(k.toUpperCase())};})
 .filter(r=>r.v>0).sort((a,b)=>b.v-a.v);
console.log('== 갭 후보 중 실검색량 있는 것 ==');
console.log('미등록:');
for(const r of rows.filter(r=>!r.live).slice(0,70))console.log('  '+String(r.v).padStart(6),r.kw);
console.log('\n미등록 총',rows.filter(r=>!r.live).length,'개 · 합계 월',rows.filter(r=>!r.live).reduce((a,b)=>a+b.v,0));
console.log('등록됨 총',rows.filter(r=>r.live).length,'개 · 합계 월',rows.filter(r=>r.live).reduce((a,b)=>a+b.v,0));
console.log('\n등록된 것 중 볼륨 상위 25 (지금 70원에 방치):');
for(const r of rows.filter(r=>r.live).slice(0,25))console.log('  '+String(r.v).padStart(6),r.kw);
