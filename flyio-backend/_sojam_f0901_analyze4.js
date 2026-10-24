const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const {why,REGION}=require('./_sojam_d0828_rule.js');
const st=JSON.parse(fs.readFileSync(P('_sojam_f0901_research2.json'),'utf8'));
const inv=JSON.parse(fs.readFileSync(P('_sojam_e0831_live.json'),'utf8'));
const have=new Set(inv.map(r=>r.kw));
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const AXIS=[
 ['아토피',/아토피|태열|침독/],['지루성·두피',/지루|두피|비듬/],['습진·한포진',/습진|한포진/],
 ['가려움·소양',/가려움|간지러움|가렵|소양|따가움|화끈/],['백반증',/백반증|백색비강진/],
 ['모낭염·종기',/모낭염|종기|봉와직염|한선염|절종|부스럼/],['진균·무좀',/무좀|백선|어루러기|칸디다|완선|간찰진/],
 ['땀·다한증',/땀띠|다한증|액취|땀많|땀냄새/],['알레르기',/알레르기|알러지|한랭|햇빛알/],
 ['구강·입술',/구순염|구내염|구각염|입술포진|입안헐|입안염증|입안하얀|설염|혀갈라짐|혓바닥|구강편평태선|구강작열감|아프타/],
 ['탈스테로이드',/탈스|스테로이드|듀피젠트|면역억제/],
 ['난치·자가면역',/결절성양진|피부묘기증|장미색비강진|편평태선|경화성태선|어린선|농가진|천포창|루푸스|혈관염|자반증|농피증|스티븐스존슨|베체트|자가면역/],
 ['각질·건조',/각화증|모공각화|피부건조|각질일어남|손톱갈라짐|발뒤꿈치갈라짐|손끝갈라짐|짓무름/],
];
const SKIN=new RegExp(AXIS.map(a=>a[1].source).join('|'));
const EXCL=/사마귀|곤지름|두드러기|건선|대상포진|여드름|피부과|성형외과|탈모|라식|안과|치질|치핵|직장암|비뇨기과|산부인과|다이어트|비만|난임|불임|보톡스|필러|리프팅|제모|왁싱|문신|타투|반영구|미백|주름|검버섯|기미|비립종|한관종|쥐젖|화상|구강암|구순구개열|치과|소아과|소아청소년과|영유아건강검진|어린이병원|구강내과|한의원가운|수족구/;
// 상품·용품·미용시술·정보성 잡음
const PROD=/선물|용품|마사지기|마사지|브러쉬|괄사|스프레이|토닉|스파|스케일링|클렌저|수딩젤|제거기|청결제|샤워기|샴푸|린스|비누|바디워시|클렌징|폼|토너|로션|크림|에센스|세럼|앰플|마스크팩|패치|밴드|영양제|유산균|비타민|건강기능식품|보험|실비|병원비|수술비|알바|채용|구인|자격증|학원|시험|카페|블로그|유튜브|추천|후기|가격|비용|최저가|할인|쿠폰|직구|올리브영|다이소|쿠팡|판매|구매|쇼핑|제품|세트|기획|각질제거|스케일링/;
const rows=Object.entries(st.kw).map(([k,v])=>({kw:k,pc:v.pc,mo:v.mo,tot:v.pc+v.mo,comp:v.comp}))
 .filter(r=>SKIN.test(r.kw)&&!EXCL.test(r.kw)&&!PROD.test(r.kw)&&!why(r.kw)
   &&!REGION.some(t=>r.kw.startsWith(t))&&r.tot>=200);
const neu=rows.filter(r=>!have.has(r.kw)).sort((a,b)=>b.tot-a.tot);
const axisOf=k=>{for(const[n,re]of AXIS)if(re.test(k))return n;return '기타';};
console.log(`필터 통과 ${won(rows.length)} (월 200회+) — 보유 ${won(rows.length-neu.length)} · 신규 ${won(neu.length)}`);
console.log(`신규 검색량 합 ${won(neu.reduce((s,r)=>s+r.tot,0))}회/월\n`);
const A={};for(const r of neu){(A[axisOf(r.kw)]||=[]).push(r);}
console.log('=== 축별 ===');
Object.entries(A).sort((x,y)=>y[1].reduce((s,r)=>s+r.tot,0)-x[1].reduce((s,r)=>s+r.tot,0))
 .forEach(([a,l])=>console.log(`  ${a.padEnd(14)}${String(l.length).padStart(4)}종 · 월 ${won(l.reduce((s,r)=>s+r.tot,0)).padStart(9)}회 · 최대 ${l[0].kw}`));
console.log('\n=== 신규 발굴 상위 60 ===');
console.log('  키워드                        월검색량    PC    모바일 경쟁 축');
neu.slice(0,60).forEach(r=>console.log(`  ${r.kw.slice(0,26).padEnd(28)}${won(r.tot).padStart(8)}${won(r.pc).padStart(7)}${won(r.mo).padStart(8)} ${(r.comp||'').padEnd(3)} ${axisOf(r.kw)}`));
fs.writeFileSync(P('_sojam_f0901_new_kw2.json'),JSON.stringify(neu.map(r=>({...r,axis:axisOf(r.kw)})),null,1));
console.log(`\n전체 ${won(neu.length)}종 → _sojam_f0901_new_kw2.json`);
