const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const st=JSON.parse(fs.readFileSync(P('_sojam_f0901_research.json'),'utf8'));
const inv=JSON.parse(fs.readFileSync(P('_sojam_e0831_live.json'),'utf8'));
const have=new Set(inv.map(r=>r.kw));
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
// 은밀부위
const AREA=/고환|음낭|음경|귀두|(?<![만여남악양급독다])성기|사타구니|서혜|회음|항문|외음|음부|질염|질건조|유두|유륜|겨드랑이|엉덩이|팬티라인|비키니라인|허벅지안쪽|배꼽|고간|불두덩|가랑이|사타쿠니/;
// 피부질환·증상 어휘
const SKIN=/습진|가려움|간지러움|소양|따가|화끈|쓰라|진물|각질|물집|수포|발진|홍반|염증|피부염|건선|태선|백선|완선|무좀|칸디다|곰팡이|모낭염|한선염|종기|뾰루지|여드름|좁쌀|알갱이|돌기|사마귀|곤지름|포진|헤르페스|착색|색소침착|검게|하얗게|백반|짓무름|트러블|갈라짐|껍질|각화|냄새|땀|다한|축축|습기|물집|딱지|부어|붓|멍울|혹|낭종|피지|블랙헤드|간찰|기저귀|땀띠|두드러기|아토피|각화증|건조|가렵|따갑/;
// 비피부(외과·비뇨기과·산부인과 시술) 및 상품 제외
const OUT=/치질|치핵|치루|치열|직장암|대장암|용종|내시경|탈장|정관|포경수술|음경확대|확대술|필러|보형물|성형|왁싱|제모|레이저|청결제|세정제|비누|바디워시|물티슈|팬티|속옷|드로즈|팬티라이너|생리대|탐폰|컵|면도|쉐이빙|제모기|비데|좌욕기|의자|쿠션|방석|영양제추천|유산균|보험|병원비|수술비|실비|보건소|검사키트|자가진단키트|성병검사|임질|매독|클라미디아|에이즈|HIV|피임|임신테스트|정력|발기|조루|불임|정자|전립선|요실금|방광|요도염|신장|결석|생리통|생리불순|난소|자궁|착상|배란|산부인과추천|비뇨기과추천|모소낭수술|모소동수술/;
const rows=Object.entries(st.kw).map(([k,v])=>({kw:k,pc:v.pc,mo:v.mo,tot:v.pc+v.mo,comp:v.comp,depth:v.depth}))
 .filter(r=>AREA.test(r.kw)&&SKIN.test(r.kw)&&!OUT.test(r.kw)&&r.tot>=50);
const neu=rows.filter(r=>!have.has(r.kw)).sort((a,b)=>b.tot-a.tot);
const old=rows.filter(r=>have.has(r.kw)).sort((a,b)=>b.tot-a.tot);
console.log(`수집 ${won(Object.keys(st.kw).length)}개 → 은밀부위 피부질환 필터 통과 ${won(rows.length)}개 (월 검색량 50 이상)`);
console.log(`  계정에 이미 있음 ${won(old.length)}개 · 신규 발굴 ${won(neu.length)}개`);
console.log(`  신규 검색량 합계 ${won(neu.reduce((s,r)=>s+r.tot,0))}회/월\n`);
console.log('=== 신규 발굴 — 검색량 상위 80 ===');
console.log('  키워드                        월검색량    PC     모바일  경쟁도');
neu.slice(0,80).forEach(r=>console.log(`  ${r.kw.slice(0,26).padEnd(28)}${won(r.tot).padStart(8)}${won(r.pc).padStart(8)}${won(r.mo).padStart(8)}  ${r.comp}`));
fs.writeFileSync(P('_sojam_f0901_new_kw.json'),JSON.stringify(neu,null,1));
console.log(`\n(전체 ${won(neu.length)}개는 _sojam_f0901_new_kw.json 에 저장)`);
