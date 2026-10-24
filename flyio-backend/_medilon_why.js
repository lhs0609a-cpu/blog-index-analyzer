const fs=require('fs');const R='reports/medilon_20260921/';
const out=JSON.parse(fs.readFileSync(R+'kwclass.json','utf8'));
const g={};for(const r of out)if(r.cat==='D_무관')(g[r.why]=g[r.why]||[]).push(r.kw);
for(const [w,v] of Object.entries(g).sort((a,b)=>b[1].length-a[1].length)){
  const s=[];const step=Math.max(1,Math.floor(v.length/25));
  for(let i=0;i<v.length&&s.length<25;i+=step)s.push(v[i]);
  console.log('['+w+' '+v.length+'] '+s.join(' | '));}
