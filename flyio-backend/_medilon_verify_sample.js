const fs=require('fs');const R='reports/medilon_20260921/';
const out=JSON.parse(fs.readFileSync(R+'kwclass.json','utf8'));
let seed=42; const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff};
for(const c of ['D_무관','A_의료대출','B_의료정책자금','C_비의료대출','B_의료개원인수']){
  const v=out.filter(r=>r.cat===c);const s=[];
  const idx=new Set();while(idx.size<Math.min(60,v.length))idx.add(Math.floor(rnd()*v.length));
  for(const i of idx)s.push(v[i].kw+(c==='D_무관'?'('+v[i].why.slice(0,4)+')':''));
  console.log('### '+c+' n='+v.length+' 표본60');console.log(s.join(' | '));console.log();
}
