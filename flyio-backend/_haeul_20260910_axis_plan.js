// 원장 결정(2026-09-10): 소진금액 4:3:3, B안 = 자율신경 유지·두통/어지럼 증량, 상한 어지럼 25,000 / 그 외 10,000.
// 대상은 메인 두통 그룹과 메인 어지럼증 그룹만 — 같은 키워드가 자동풀에 70원으로 중복돼 있어도 올리지 않는다(자기 경쟁 방지).
// 입찰 규칙: 내원의도어 = max(PC3,MO3), 질환 대표어 = MO3, 정보성 = MO3 와 5,000 중 작은 값. 전부 축 상한으로 자르고, 현재보다 낮추지 않는다.
const fs=require('fs'),path=require('path');
const D0=path.join(__dirname,'reports','haeul_20260910');
const J=p=>JSON.parse(fs.readFileSync(path.join(D0,p),'utf8'));
const census=J('census.json'),est=J('estimates_25k.json');
const G={head:'grp-a001-01-000000049624428',dizzy:'grp-a001-01-000000054603422'};
const CAP={head:10000,dizzy:25000};
const INTENT=/병원|한의원|치료(?!제|약)|클리닉|잘하는|전문|진료|어디로|어느과|무슨과/;
const INFO=/원인|증상|이유|검사|방법|없애는|심할때|아플때|자가|운동|음식|좋은|차|혈자리|지압|스트레칭|후기/;
const EXCLUDE=/치료제|약|음식|차$|뇌출혈|뇌졸중|뇌경색|뇌종양|응급|벼락|마비|수술|주사|보톡스|아이|어린이|청소년|임산부|강아지|고양이/;
const r10=n=>Math.ceil(n/10)*10;
const plan=[],skipped=[];
for(const [ax,gid] of Object.entries(G)){
 const rows=census.rows.filter(r=>r[2]===gid);
 for(const [a,keyword,,kid,bid,c7] of rows){
  const cur=+bid,on=c7==='0',e=est[keyword]||{};
  const why=[];
  if(a!==ax&&!(ax==='dizzy'&&a==='dizzy')){skipped.push({keyword,why:'축 불일치('+a+')',cur,on});continue;}
  if(EXCLUDE.test(keyword)){skipped.push({keyword,why:'제외어',cur,on});continue;}
  if(!e.PC3&&!e.MOBILE3){skipped.push({keyword,why:'추정가 없음',cur,on});continue;}
  let kind,raw;
  if(INTENT.test(keyword)){kind='내원의도';raw=Math.max(e.PC3||0,e.MOBILE3||0);}
  else if(INFO.test(keyword)){kind='정보성';raw=Math.min(e.MOBILE3||e.PC3,5000);}
  else{kind='대표어';raw=e.MOBILE3||e.PC3;}
  const target=Math.min(CAP[ax],r10(raw));
  const after=Math.max(cur,target);
  if(after===cur&&on){skipped.push({keyword,why:'이미 목표 이상',cur,on});continue;}
  plan.push({ax,gid,kid,keyword,kind,before:cur,after,turnOn:!on,PC3:e.PC3,MO3:e.MOBILE3,capped:raw>CAP[ax]});
 }
}
fs.writeFileSync(path.join(D0,'axis_plan.json'),JSON.stringify({createdAt:new Date().toISOString(),decision:'4:3:3 소진금액, B안, 상한 어지럼25000/그외10000',plan,skipped},null,1));
const show=ax=>plan.filter(p=>p.ax===ax).sort((a,b)=>b.after-a.after).map(p=>({키워드:p.keyword,유형:p.kind,현재:p.before,변경:p.after,켜기:p.turnOn?'ON':'',PC3:p.PC3,MO3:p.MO3,상한걸림:p.capped?'Y':''}));
console.log('== 두통 그룹 ('+plan.filter(p=>p.ax==='head').length+'개) ==');console.table(show('head'));
console.log('== 어지럼 그룹 ('+plan.filter(p=>p.ax==='dizzy').length+'개) ==');console.table(show('dizzy'));
console.log('== 제외/유지 ==');console.table(skipped);
console.log('합계: 변경',plan.length,'| 켜기',plan.filter(p=>p.turnOn).length,'| 입찰 인상',plan.filter(p=>p.after>p.before).length);
