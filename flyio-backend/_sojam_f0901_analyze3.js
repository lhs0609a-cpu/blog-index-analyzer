const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const {why,REGION}=require('./_sojam_d0828_rule.js');
const st=JSON.parse(fs.readFileSync(P('_sojam_f0901_research2.json'),'utf8'));
const inv=JSON.parse(fs.readFileSync(P('_sojam_e0831_live.json'),'utf8'));
const have=new Set(inv.map(r=>r.kw));
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
// 진료 축
const AXIS=[
 ['아토피',/아토피|태열/],['지루성·두피',/지루|두피|비듬|모낭염/],['습진·한포진',/습진|한포진|물집|수포/],
 ['가려움·소양',/가려움|간지러움|가렵|소양|따가움|화끈|긁/],['백반증·색소',/백반증|백색비강진|색소탈실/],
 ['종기·농양',/종기|봉와직염|한선염|농양|절종|부스럼|멍울/],['진균·무좀',/무좀|백선|어루러기|칸디다|완선|간찰진|곰팡이/],
 ['땀·다한증',/땀띠|다한증|액취|땀냄새|땀많/],['알레르기',/알레르기|알러지|한랭|햇빛/],
 ['구강·입술',/구순|구내염|구각|입술|설염|혀갈라짐|구강|입안/],['탈스테로이드',/스테로이드|듀피젠트|면역억제/],
 ['난치·자가면역',/양진|묘기증|비강진|편평태선|경화성태선|어린선|농가진|수족구|천포창|루푸스|혈관염|자반증|농피증|스티븐스존슨|베체트|자가면역/],
 ['흉터·각질',/켈로이드|비후성흉터|각질|각화|건조증|어린선|짓무름|갈라짐/],
 ['영유아',/기저귀|신생아|유아|아기|소아|어린이/],
];
const SKIN=new RegExp(AXIS.map(a=>a[1].source).join('|'));
// 원장 제외 축 + 비의료·상품·타업종
const EXCL=/사마귀|곤지름|두드러기|건선|대상포진|여드름|피부과|성형외과|탈모|라식|라섹|렌즈삽입|안과|치질|치핵|직장암|비뇨기과|산부인과|다이어트|비만|난임|불임|보톡스|필러|리프팅|제모|왁싱|문신|미백|화이트닝|주름|안티에이징|검버섯|기미|비립종|한관종|쥐젖/;
const PROD=/추천|후기|가격|비용|판매|구매|쇼핑|최저가|할인|쿠폰|직구|올리브영|다이소|쿠팡|네이버페이|리뷰|브랜드|제품|세트|기획|샴푸|린스|비누|바디워시|클렌징|폼|토너|로션|크림|에센스|세럼|앰플|마스크팩|패치|밴드|영양제|유산균|비타민|건강기능식품|보험|실비|병원비|수술비|알바|채용|구인|자격증|학원|시험|카페|블로그|유튜브|드라마|영화|노래|게임/;
const rows=Object.entries(st.kw).map(([k,v])=>({kw:k,pc:v.pc,mo:v.mo,tot:v.pc+v.mo,comp:v.comp}))
 .filter(r=>SKIN.test(r.kw)&&!EXCL.test(r.kw)&&!PROD.test(r.kw)&&!why(r.kw)
   &&!REGION.some(t=>r.kw.startsWith(t)) && r.tot>=200);
const neu=rows.filter(r=>!have.has(r.kw)).sort((a,b)=>b.tot-a.tot);
const axisOf=k=>{for(const[n,re]of AXIS)if(re.test(k))return n;return '기타';};
console.log(`수집 ${won(Object.keys(st.kw).length)} → 진료범위 필터 통과 ${won(rows.length)} (월 200회 이상)`);
console.log(`  보유 ${won(rows.length-neu.length)} · 신규 ${won(neu.length)} · 신규 검색량 합 ${won(neu.reduce((s,r)=>s+r.tot,0))}회/월\n`);
const A={};for(const r of neu){const a=axisOf(r.kw);(A[a]||=[]).push(r);}
console.log('=== 축별 신규 발굴 ===');
Object.entries(A).sort((x,y)=>y[1].reduce((s,r)=>s+r.tot,0)-x[1].reduce((s,r)=>s+r.tot,0))
 .forEach(([a,l])=>console.log(`  ${a.padEnd(16)}${String(l.length).padStart(5)}종 · 월 ${won(l.reduce((s,r)=>s+r.tot,0)).padStart(9)}회`));
console.log('\n=== 신규 발굴 검색량 상위 70 ===');
console.log('  키워드                          월검색량    PC    모바일  경쟁  축');
neu.slice(0,70).forEach(r=>console.log(`  ${r.kw.slice(0,28).padEnd(30)}${won(r.tot).padStart(8)}${won(r.pc).padStart(7)}${won(r.mo).padStart(8)}  ${(r.comp||'').padEnd(3)} ${axisOf(r.kw)}`));
fs.writeFileSync(P('_sojam_f0901_new_kw2.json'),JSON.stringify(neu.map(r=>({...r,axis:axisOf(r.kw)})),null,1));
