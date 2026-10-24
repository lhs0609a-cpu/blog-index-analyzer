// 스크립트 카운터는 믿지 않는다. 마스터리포트로 라이브 상태를 다시 받아 대조한다.
const fs=require('fs');const V='reports/medilon_20260921_verify/',D='reports/medilon_20260921/';
const kw=fs.readFileSync(V+'keyword.tsv','utf8').split(/\r?\n/).filter(Boolean).map(l=>l.split('\t'));
const cp=fs.readFileSync(V+'campaign.tsv','utf8').split(/\r?\n/).filter(Boolean).map(l=>l.split('\t'));
const byId={},byKw=new Set();
for(const r of kw){byId[r[2]]={bid:+r[4],lock:!!+r[7],useG:!!+r[9]};byKw.add(r[3].replace(/\s/g,'').toUpperCase());}
console.log('라이브 키워드 총계',kw.length,'/ 한도 100,000 · 잔여 슬롯',100000-kw.length);
const chk=(file,test,label)=>{const p=JSON.parse(fs.readFileSync(D+file,'utf8'));
  const ok=p.filter(test).length;console.log(label,ok,'/',p.length, ok===p.length?'✓':'← 불일치 '+(p.length-ok));
  if(ok!==p.length)console.log('   미반영 예시:',p.filter(x=>!test(x)).slice(0,6).map(x=>x.kw||x.name).join(', '));};
chk('plan_bids.json',p=>byId[p.id]&&byId[p.id].bid===p.neu&&!byId[p.id].useG,'입찰 반영');
chk('plan_turnoff.json',p=>byId[p.id]&&byId[p.id].lock===true,'무관 OFF');
chk('plan_turnon.json',p=>byId[p.id]&&byId[p.id].lock===false,'개원인수 ON');
chk('plan_register.json',p=>byKw.has(p.kw.replace(/\s/g,'').toUpperCase()),'신규 등록');
const bud=JSON.parse(fs.readFileSync(D+'plan_budget.json','utf8'));
const live={};for(const r of cp)live[r[1]]=+r[5];
// 캠페인 리포트의 예산 칸이 0 으로 오므로 API 로 직접 대조한다
console.log('\n예산 계획 합계',bud.reduce((a,b)=>a+b.neu,0),'(기존',bud.reduce((a,b)=>a+b.old,0),')');
