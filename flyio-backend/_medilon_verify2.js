const fs=require('fs');const V='reports/medilon_20260921_final/',D='reports/medilon_20260921/';
const kw=fs.readFileSync(V+'keyword.tsv','utf8').split(/\r?\n/).filter(Boolean).map(l=>l.split('\t'));
const ag=fs.readFileSync(V+'adgroup.tsv','utf8').split(/\r?\n/).filter(Boolean).map(l=>l.split('\t'));
const ad=fs.readFileSync(V+'ad.tsv','utf8').split(/\r?\n/).filter(Boolean).map(l=>l.split('\t'));
const ST={'20':'ELIGIBLE','10':'UNDER_REVIEW','30':'DISAPPROVED'};
const byId={};const byKw=new Set();
for(const r of kw){byId[r[2]]={bid:+r[4],lock:!!+r[7],st:ST[r[8]],useG:!!+r[9],gid:r[1]};byKw.add(r[3].replace(/\s/g,'').toUpperCase());}
console.log('라이브 키워드',kw.length,'/ 100,000 · 잔여',100000-kw.length);
const chk=(f,t,l)=>{const p=JSON.parse(fs.readFileSync(D+f,'utf8'));const ok=p.filter(t).length;
  console.log('  '+l.padEnd(14),ok+'/'+p.length,ok===p.length?'✓':'← 불일치');
  if(ok!==p.length)console.log('     미반영:',p.filter(x=>!t(x)).slice(0,5).map(x=>x.kw||x.name).join(', '));};
chk('plan_bids.json',p=>byId[p.id]&&byId[p.id].bid===p.neu,'입찰');
chk('plan_turnoff.json',p=>byId[p.id]&&byId[p.id].lock===true,'무관 OFF');
chk('plan_turnon.json',p=>byId[p.id]&&byId[p.id].lock===false,'개원인수 ON');
chk('plan_register.json',p=>byKw.has(p.kw.replace(/\s/g,'').toUpperCase()),'신규 등록');
chk('plan_disoff.json',p=>byId[p.id]&&byId[p.id].lock===true,'금지표현 OFF');
// 신규 그룹
const g=ag.find(r=>r[3]==='의료대출_개원인수축_0001');
if(!g){console.log('\n신규 그룹 없음 ←');}
else{
  const gk=kw.filter(r=>r[1]===g[1]);
  const ga=ad.filter(r=>r[1]===g[1]);
  console.log('\n신규 그룹',g[3],g[1]);
  console.log('  그룹입찰',g[4],'· 키워드',gk.length,'· 소재',ga.length);
  console.log('  키워드 입찰',Math.min(...gk.map(r=>+r[4])),'~',Math.max(...gk.map(r=>+r[4])));
  const st={};for(const r of gk)st[ST[r[8]]]=(st[ST[r[8]]]||0)+1;console.log('  검수상태',st);
  if(ga[0])console.log('  소재:',ga[0][4],'/',ga[0][5]);
}
const dis=kw.filter(r=>r[8]==='30');
console.log('\nDISAPPROVED 총',dis.length,'· 그중 ON',dis.filter(r=>!+r[7]).length,'(전부 제휴_PG 상표어)');
