const fs=require('fs'),path=require('path');
const D=path.join(__dirname,'../reports/sojam-20260917/'),D16=path.join(__dirname,'../reports/sojam-20260916/');
const J=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const VITILIGO=/백반/,PROCTO=/항문튀어나옴|항문종기|항문피$|항문출혈|항문농양|항문열상|치질|치핵|치루|탈항|항문외과|대장/;
const urg=J(D+'urg_rows.json'),bytext=J(D16+'inv/bytext.json');
const TOP=urg.filter(r=>r.score>=60&&!VITILIGO.test(r.k)&&!PROCTO.test(r.k));
const kw=J(D+'on_kw.json'),grp=J(D+'on_grp.json'),camp=J(D+'on_camp.json'),ads=J(D+'on_ads.json');
const out=[];
for(const r of TOP){
  const regs=(bytext[r.k]||[]).map(x=>{
    const m=kw[x.id]; if(!m||m.del)return null;
    const g=grp[m.gid]||{},c=camp[g.cid]||{},a=ads[m.gid]||{ok:0,pend:0,rej:0,n:0};
    const eff=Math.round((m.ugb?(g.bid||0):(m.bid||0))*((g.mw??100)/100));
    let block=null;
    if(m.lock)block='키워드 OFF';
    else if(m.ins!=='APPROVED')block='키워드 검수:'+m.ins;
    else if(g.lock)block='그룹 OFF';
    else if(c.lock)block='캠페인 OFF';
    else if(a.ok===0)block=a.pend>0?'소재 검수중':(a.rej>0?'소재 반려':'소재 0');
    else if(eff<=100)block='입찰 바닥';
    return{...x,...m,gname:g.name,cname:c.name,eff,block,adOk:a.ok,adPend:a.pend,adRej:a.rej,adN:a.n};
  }).filter(Boolean);
  const runnable=regs.filter(x=>!x.block);
  // 이 키워드를 노출시키려면 무엇을 해야 하나 — 가장 싼 조치 하나
  let fix=null,pick=null;
  if(runnable.length)fix='이미 돈다';
  else{
    const order=['입찰 바닥','키워드 OFF','그룹 OFF','캠페인 OFF','소재 검수중','소재 반려','소재 0'];
    for(const b of order){const c=regs.find(x=>x.block===b);if(c){fix=b;pick=c;break;}}
    if(!fix)fix='등록 없음';
  }
  out.push({k:r.k,axis:r.axis,score:r.score,vol:r.vol,sig:r.sig,wImp:r.wImp,wClk:r.wClk,wCost:r.wCost,
    nReg:regs.length,nRun:runnable.length,bestEff:regs.length?Math.max(...regs.map(x=>x.eff)):0,fix,
    pickId:pick?pick.id:(runnable[0]?runnable[0].id:null),pickGid:pick?pick.gid:(runnable[0]?runnable[0].gid:null),
    regs:regs.map(x=>({id:x.id,gid:x.gid,bid:x.bid,ugb:x.ugb,eff:x.eff,block:x.block,adOk:x.adOk,adPend:x.adPend,adRej:x.adRej,gname:x.gname}))});
}
fs.writeFileSync(D+'on_class.json',JSON.stringify(out));
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const by={};for(const r of out)by[r.fix]=(by[r.fix]||{n:0,vol:0}),by[r.fix].n++,by[r.fix].vol+=r.vol||0;
console.log('간절도 60+ (백반증·치질영역 제외)',out.length,'어 · 등록',out.reduce((a,r)=>a+r.nReg,0));
console.log('\n[지금 도는가 / 안 돌면 무엇이 막는가]');
for(const [k,v] of Object.entries(by).sort((a,b)=>b[1].n-a[1].n))console.log('  '+k.padEnd(14)+String(v.n).padStart(6)+'어 · 월검색 '+won(v.vol).padStart(9));
const nr=out.filter(r=>r.nRun===0);
console.log('\n안 도는',nr.length,'어 중 7일 노출 0 =',nr.filter(r=>!r.wImp).length);
const runz=out.filter(r=>r.nRun>0&&!r.wImp);
console.log('도는데 7일 노출 0 =',runz.length,'어 (검색량 자체가 없거나 순위 밖) · 그중 월검색 30+ =',runz.filter(r=>r.vol>=30).length);
const ax={};for(const r of out.filter(r=>r.nRun===0)){const a=ax[r.axis]=ax[r.axis]||{};a[r.fix]=(a[r.fix]||0)+1;}
console.log('\n[축별 막힌 사유]');
for(const [k,v] of Object.entries(ax).sort((a,b)=>Object.values(b[1]).reduce((x,y)=>x+y,0)-Object.values(a[1]).reduce((x,y)=>x+y,0)))
  console.log('  '+k.padEnd(14)+Object.entries(v).sort((a,b)=>b[1]-a[1]).map(([a,b])=>a+' '+b).join(' · '));
