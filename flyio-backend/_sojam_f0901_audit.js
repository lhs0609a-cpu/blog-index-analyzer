// 핵심 키워드 감사 — (A) 검색량 큰데 계정에서 죽어있는 것 (B) 아예 없는 것
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const {why}=require('./_sojam_d0828_rule.js');
const V={}; // 검색량 통합
for(const f of ['_sojam_f0901_research.json','_sojam_f0901_research2.json']){
 const s=JSON.parse(fs.readFileSync(P(f),'utf8'));
 for(const [k,v] of Object.entries(s.kw)) V[k]=Math.max(V[k]||0,(v.pc||0)+(v.mo||0));
}
const inv=JSON.parse(fs.readFileSync(P('_sojam_e0831_live.json'),'utf8'));
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
// 소잠 핵심 진료축 (원장이 뺀 축 제외: 두드러기·건선·대상포진·사마귀·여드름·피부과·탈모)
const CORE=/아토피|태열|지루성|두피염|비듬|습진|한포진|가려움|간지러움|가렵|소양|백반증|모낭염|종기|봉와직염|한선염|무좀|백선|어루러기|칸디다|간찰진|완선|땀띠|다한증|액취|알레르기|알러지|구순염|구내염|구각염|입술포진|설염|혀갈라짐|구강편평태선|구강작열감|아프타|탈스|스테로이드리바운드|스테로이드끊|스테로이드금단|듀피젠트|결절성양진|피부묘기증|장미색비강진|편평태선|경화성태선|어린선|농가진|천포창|루푸스|혈관염|자반증|농피증|베체트|자가면역|모공각화|피부질환|피부염|발진|진물|각질/;
const EXCL=/사마귀|곤지름|두드러기|건선|대상포진|여드름|피부과|성형외과|탈모|라식|안과|치질|수술|시술|레이저|보톡스|필러|왁싱|제모|추천|후기|가격|비용|샴푸|크림|로션|세럼|앰플|영양제|유산균|비타민|선물|용품|마사지|브러쉬|팩|토닉|스프레이|청결제|제거기|기기|알바|채용|학원|카페|블로그/;
// 계정 상태 집계 (키워드별 최고 입찰가 · 노출가능 여부)
const acc={};
for(const r of inv){const u=(acc[r.kw]||={bid:0,el:false,n:0});u.bid=Math.max(u.bid,r.bid);u.n++;if(r.st==='ELIGIBLE')u.el=true;}
const cand=Object.entries(V).filter(([k,v])=>v>=1000&&CORE.test(k)&&!EXCL.test(k)&&!why(k));
const dead=[],miss=[];
for(const [k,v] of cand){
 const a=acc[k];
 if(!a) miss.push({kw:k,vol:v});
 else if(!a.el || a.bid<=70) dead.push({kw:k,vol:v,bid:a.bid,el:a.el,n:a.n});
}
dead.sort((a,b)=>b.vol-a.vol); miss.sort((a,b)=>b.vol-a.vol);
console.log(`핵심축 · 월 1,000회 이상 후보 ${won(cand.length)}종`);
console.log(`  ▲ 계정에 있는데 죽어있음(70원 또는 전부 중지) ${won(dead.length)}종 · 검색량 합 ${won(dead.reduce((s,r)=>s+r.vol,0))}회`);
console.log(`  ▲ 계정에 아예 없음 ${won(miss.length)}종 · 검색량 합 ${won(miss.reduce((s,r)=>s+r.vol,0))}회\n`);
console.log('=== [A] 있는데 죽어있는 핵심 키워드 상위 45 ===');
console.log('  키워드                      월검색량  현재입찰가  상태     인스턴스');
dead.slice(0,45).forEach(r=>console.log(`  ${r.kw.slice(0,24).padEnd(26)}${won(r.vol).padStart(8)}${won(r.bid).padStart(9)}원  ${r.el?'노출가능':'전부중지'}${String(r.n).padStart(6)}`));
console.log('\n=== [B] 아예 없는 핵심 키워드 상위 35 ===');
console.log('  키워드                      월검색량');
miss.slice(0,35).forEach(r=>console.log(`  ${r.kw.slice(0,24).padEnd(26)}${won(r.vol).padStart(8)}`));
fs.writeFileSync(P('_sojam_f0901_audit.json'),JSON.stringify({dead,miss},null,1));
