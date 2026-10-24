const fs=require('fs');const R='reports/medilon_20260921/';
const rows=JSON.parse(fs.readFileSync(R+'kwmaster.json','utf8'));
const nofin=new Set(fs.readFileSync(R+'nofin2.txt','utf8').split('\n'));
const buckets={};
for(const r of rows){const line=r.cname.split('_')[0];const k=line+(nofin.has(r.kw)?'/비금융':'/금융');
  (buckets[k]=buckets[k]||[]).push(r.kw);}
for(const [k,v] of Object.entries(buckets).sort((a,b)=>b[1].length-a[1].length)){
  const s=[];const step=Math.max(1,Math.floor(v.length/40));
  for(let i=0;i<v.length&&s.length<40;i+=step)s.push(v[i]);
  console.log('### '+k+' ('+v.length+')');console.log(s.join(' | '));console.log();}
