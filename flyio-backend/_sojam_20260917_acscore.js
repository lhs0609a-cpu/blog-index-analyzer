// 자동완성 미등록어를 기존 간절도 분류기(_sojam_20260916_weak.js 원본 규칙)로 채점
const fs=require('fs');
const src=fs.readFileSync('_sojam_20260916_weak.js','utf8');
const grab=re=>src.match(re)[0];
const code=[grab(/const AXES = \[[\s\S]*?\n\];/),grab(/const AXRATE = \{[\s\S]*?\};/),grab(/const SIG = \[[\s\S]*?\]\];/),
  grab(/const PEN = \[[\s\S]*?\]\];/),grab(/const CUT = [^\n]*/).split('//')[0],grab(/const JUNK = [^\n]*/).split('//')[0],
  grab(/const NOISE = [^\n]*/).split('//')[0]].join('\n');
const {AXES,AXRATE,SIG,PEN,CUT,JUNK,NOISE}=new Function(code+'\nreturn {AXES,AXRATE,SIG,PEN,CUT,JUNK,NOISE};')();
const miss=JSON.parse(fs.readFileSync('../reports/sojam-20260917/ac_missing.json','utf8'));
const rows=[];
for(const m of miss){const k=m.k;
  if(CUT.test(k)||JUNK.test(k)||NOISE.test(k))continue;
  const ax=AXES.find(([,r])=>r.test(k)); if(!ax)continue; const ar=AXRATE[ax[0]]; if(!ar)continue;
  let mult=1;const sig=[];
  for(const [n,w,r] of SIG) if(r.test(k)){mult*=w;sig.push(n);}
  for(const [n,w,r] of PEN) if(r.test(k)){mult*=w;sig.push('↓'+n);}
  rows.push({k,axis:ax[0],score:+(40.5*mult*ar/0.405).toFixed(1),sig,seeds:m.seeds.slice(0,3)});}
rows.sort((a,b)=>b.score-a.score);
fs.writeFileSync('../reports/sojam-20260917/ac_missing_scored.json',JSON.stringify(rows));
console.log('자동완성 미등록',miss.length,'중 진료축·정책 통과',rows.length);
console.log('  간절도 60+',rows.filter(r=>r.score>=60).length,'· 40~60',rows.filter(r=>r.score>=40&&r.score<60).length,'· 40 미만',rows.filter(r=>r.score<40).length);
const ax={};for(const r of rows.filter(r=>r.score>=40))ax[r.axis]=(ax[r.axis]||0)+1;
console.log('  축별(40+):',Object.entries(ax).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+' '+v).join(' · '));
console.log('\n간절도 상위 30:');
for(const r of rows.slice(0,30))console.log('  '+r.k.padEnd(26)+r.axis.padEnd(13)+String(r.score).padStart(6)+'  '+r.sig.filter(s=>!s.startsWith('↓')).join('+'));
