const fs=require('fs');const D='reports/medilon_20260921/';
const vol=JSON.parse(fs.readFileSync(D+'volumes.json','utf8'));
const live=new Set(JSON.parse(fs.readFileSync(D+'kwclass.json','utf8')).map(r=>r.kw.replace(/\s/g,'').toUpperCase()));
const n=v=>v==='< 10'?5:(+v||0);
const rejected=new Set(fs.existsSync(D+'../medilon_20260915/missing.txt')?fs.readFileSync(D+'../medilon_20260915/missing.txt','utf8').split(/\r?\n/).filter(Boolean):[]);
// 자동완성으로 실존 확인된 것 (wave1+wave2)
const acHit=new Set();
for(const f of ['ac_raw.json','ac_raw2.json'])
  for(const v of Object.values(JSON.parse(fs.readFileSync(D+f,'utf8'))))
    for(const x of v)acHit.add(x.replace(/\s/g,''));
const cand=JSON.parse(fs.readFileSync(D+'gaplist.json','utf8')).map(k=>k.replace(/\s/g,''));
const rows=[];
for(const k of new Set(cand)){
  if(live.has(k.toUpperCase()))continue;
  if(rejected.has(k))continue;
  if(!/^[가-힣A-Za-z0-9]+$/.test(k)||k.length>25)continue;
  const v=vol[k.toUpperCase()]||vol[k]||{};const t=n(v.pc)+n(v.mo);
  const verified=acHit.has(k);
  if(t>=15||verified) rows.push({kw:k,v:t,ac:verified});
}
rows.sort((a,b)=>b.v-a.v);
fs.writeFileSync(D+'plan_register.json',JSON.stringify(rows,null,1));
console.log('등록 후보',rows.length,'개 (자동완성 확인',rows.filter(r=>r.ac).length,'· 볼륨≥15',rows.filter(r=>r.v>=15).length,')');
console.log('월 검색량 합계',rows.reduce((a,b)=>a+b.v,0));
console.log();
for(const r of rows)console.log('  월'+String(r.v).padStart(6),(r.ac?'자동완성':'        '),r.kw);
