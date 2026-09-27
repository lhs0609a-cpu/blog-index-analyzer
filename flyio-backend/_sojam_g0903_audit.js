// 소잠 전수 감사 — (1) 클릭·소진 키워드가 내원 가능한가 (2) 중요한데 묻힌 키워드 (3) 신환 역산 재료
//   입력: _sojam_g0903_kwstats.json (수집), _sojam_f0901_research2.json + _sojam_b0827_ROLLBACK_bids_before.json (검색량)
//   출력: _sojam_g0903_audit.json, 콘솔 요약
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const {why,REGION:R1}=require('./_sojam_d0828_rule.js');
const {isDerm}=require('./_sojam_e0831_derm.js');
let bare=()=>false;try{const b=require('./_sojam_e0831_bare.js');bare=b.isBare||b.bare||bare;}catch(e){}
const won=n=>Math.round(n||0).toLocaleString('ko-KR');

// 내원권: 본원 강남권 + 지역 무관(전국·서울·수도권) — 그 외 지역어가 들어 있으면 타지역
const GANGNAM=['강남','강남역','신논현','논현','신사','압구정','청담','삼성','선릉','역삼','서초','교대','방배','양재',
 '매봉','도곡','대치','한티','개포','일원','수서','잠원','반포','고속터미널','학동','언주','삼성중앙','봉은사','서울','수도권','전국'];
// 타지역 사전: bare.js 의 REGION 에서 강남권을 뺀 것 + rule.js 의 REGION
let R2=[];try{const src=fs.readFileSync(P('_sojam_e0831_bare.js'),'utf8');const m=src.match(/const REGION=\[([\s\S]*?)\];/);
 if(m)R2=[...m[1].matchAll(/'([^']+)'/g)].map(x=>x[1]);}catch(e){}
const OTHER=[...new Set([...R1,...R2])].filter(r=>!GANGNAM.includes(r)&&r.length>=2)
 .filter(r=>!['삼성'].includes(r)); // 삼성 은 삼성동(강남권) 이므로 타지역 판정에서 제외
const otherRegion=kw=>OTHER.find(r=>kw.includes(r))||null;

// 원장 지시로 뒤에 추가된 제외 축 (메모 sojam-ad-scope) — rule.js 에 없던 것
const EXCL=[
 ['대상포진',/대상포진|헤르페스조스터|조스터/],
 ['사마귀',/사마귀/],
 ['홍조',/홍조/],
 ['검사·진단',/검사|진단(?!.*공진단)|알러지테스트|알레르기테스트/],
 ['주사(시술)',/예방접종|접종|태반주사|백옥주사|신데렐라주사|줄기세포|골다공증주사|영양주사|비타민주사|마늘주사|감초주사|링거|수액/],
 ['비피부질환',/중이염|식도염|위염|류마티스|골다공증|면역력|백일해|갑상선|공황|불면|자궁|디스크|이명|비염|축농증|천식|당뇨|고혈압|통풍|관절/],
 ['통증',/통증(?!.*가려)/],
];
// 타지역 오탐 방지: 신체어와 겹치는 지역어는 지역 문맥(동/구/역/시/한의원/병원/피부)일 때만 인정
const AMBIG={'가락':/가락(동|시장|역|한의원|병원|피부)/,'일광':/^일광(?!화상|노출|알레르기|피부염)/,'동백':/동백(동|역|한의원|병원|피부)/,
 '수지':/^수지(?!침|점|요법)|수지(구|한의원|병원|피부)/,'중동':/중동(역|한의원|병원|피부)/,'성동':/성동(구|역|한의원|병원)/,
 '신사':/^신사(동|역|한의원|병원|피부)/,'구의':/구의(동|역|한의원|병원)/,'서면':/^서면(?!.)|서면(역|한의원|병원)/,'연수':/연수(구|동|한의원)/};
const otherRegion2=kw=>OTHER.find(r=>AMBIG[r]?AMBIG[r].test(kw):kw.includes(r))||null;
// 제품·시술 의도 (내원권이지만 약함 — 별도 표기)
const PRODUCT=/연고|샴푸|크림|보습제|비누|세정제|로션|약$|약\s|약국|치료제|제거|레이저|시술|필링|박피|성분|추천템/;
// 내원 판정: 사유가 없으면 '내원권'
function verdict(kw){
 const w=why(kw); if(w&&!/^타지역/.test(w)) return w;   // 두드러기·건선 / 진료범위 밖
 for(const [n,re] of EXCL) if(re.test(kw)) return n;
 if(w) return w;                                         // 접두 타지역
 const r=otherRegion2(kw); if(r) return '타지역('+r+')';
 if(bare(kw)) return '지역+업종만';
 if(!isDerm(kw)) return '비피부';
 return null;
}
const isProduct=kw=>PRODUCT.test(kw);

const S=JSON.parse(fs.readFileSync(P('_sojam_g0903_kwstats.json'),'utf8'));
const K=S.keywords;
// 검색량 결합
const vol={};
try{const r2=JSON.parse(fs.readFileSync(P('_sojam_f0901_research2.json'),'utf8')).kw;for(const k in r2)vol[k]=(r2[k].pc||0)+(r2[k].mo||0);}catch(e){}
try{const rb=JSON.parse(fs.readFileSync(P('_sojam_b0827_ROLLBACK_bids_before.json'),'utf8'));rb.forEach(r=>{if(r.vol!=null&&vol[r.kw]==null)vol[r.kw]=r.vol;});}catch(e){}
K.forEach(k=>{k.v=verdict(k.kw);k.prod=isProduct(k.kw);k.vol=vol[k.kw]??null;k.ok=!k.v;k.on=!k.lock&&!k.glock&&!k.clock;});

// ── (1) 소진·클릭 감사 (33일 / 7일)
function audit(win){
 const clk='clk'+win,cost='cost'+win,imp='imp'+win;
 const hit=K.filter(k=>k[clk]>0||k[cost]>0);
 const tot={clk:0,cost:0},by={};
 hit.forEach(k=>{tot.clk+=k[clk];tot.cost+=k[cost];const key=k.v||'내원권';(by[key]||={clk:0,cost:0,n:0});by[key].clk+=k[clk];by[key].cost+=k[cost];by[key].n++;});
 return {hit,tot,by};
}
const A33=audit(33),A7=audit(7);
console.log(`\n══ (1) 클릭·소진 키워드 전수 — 33일(8/1~9/2) ══`);
console.log(`클릭/소진 발생 키워드 ${A33.hit.length}개 · 클릭 ${A33.tot.clk} · 소진 ${won(A33.tot.cost)}원`);
console.log('판정          키워드수   클릭    소진        소진비중');
Object.entries(A33.by).sort((a,b)=>b[1].cost-a[1].cost).forEach(([k,v])=>
 console.log(`  ${k.padEnd(12)} ${String(v.n).padStart(6)} ${String(v.clk).padStart(6)} ${won(v.cost).padStart(11)}원 ${(v.cost/A33.tot.cost*100).toFixed(1).padStart(6)}%`));
console.log(`\n── 최근 7일(8/27~9/2, 재정비 후) ──`);
console.log(`키워드 ${A7.hit.length}개 · 클릭 ${A7.tot.clk} · 소진 ${won(A7.tot.cost)}원`);
Object.entries(A7.by).sort((a,b)=>b[1].cost-a[1].cost).forEach(([k,v])=>
 console.log(`  ${k.padEnd(12)} ${String(v.n).padStart(6)} ${String(v.clk).padStart(6)} ${won(v.cost).padStart(11)}원 ${(v.cost/A7.tot.cost*100).toFixed(1).padStart(6)}%`));
console.log('\n── 7일 내원권 아닌데 돈 나간 상위 25 ──');
A7.hit.filter(k=>!k.ok).sort((a,b)=>b.cost7-a.cost7).slice(0,25).forEach(k=>
 console.log(`  ${won(k.cost7).padStart(7)}원 ${String(k.clk7).padStart(3)}클릭 ${String(k.bid).padStart(6)}원 ${k.kw.padEnd(20)} ${k.v}  [${(k.camp||'').slice(0,18)}]`));
console.log('\n── 7일 내원권 클릭 상위 25 ──');
A7.hit.filter(k=>k.ok).sort((a,b)=>b.clk7-a.clk7||b.cost7-a.cost7).slice(0,25).forEach(k=>
 console.log(`  ${String(k.clk7).padStart(3)}클릭 ${won(k.cost7).padStart(7)}원 CPC ${won(k.clk7?k.cost7/k.clk7:0).padStart(6)} 순위 ${(k.rnk7||0).toFixed(1)} 검색량 ${won(k.vol).padStart(7)} ${k.kw}${k.prod?'  (제품·시술 의도)':''}`));

// ── (2) 중요한데 묻힌 키워드: 내원권 · 검색량 ≥ 300 · 33일 노출이 검색량 대비 미미(또는 0) · 잠금/70원/저순위
const buried=K.filter(k=>k.ok&&(k.vol||0)>=300).map(k=>{
 const share=k.imp33/((k.vol||1)*33/30); // 33일 노출 / 33일치 검색량
 let cause=[];if(k.lock)cause.push('키워드잠금');if(k.glock)cause.push('그룹잠금');if(k.clock)cause.push('캠페인잠금');
 if(!k.lock&&k.bid<=70)cause.push('70원');if(k.imp33>0&&k.rnk33>=5)cause.push('순위'+k.rnk33.toFixed(0));
 return {...k,share,cause:cause.join('·')||'-'};
}).filter(k=>k.share<0.03&&(k.lock||k.glock||k.clock||k.bid<=70||k.rnk33>=5||k.imp33===0));
// 같은 키워드가 여러 그룹에 있으면 검색량 기준 1개만
const seen=new Set();const buriedU=buried.sort((a,b)=>(b.vol||0)-(a.vol||0)).filter(k=>{if(seen.has(k.kw))return false;seen.add(k.kw);return true;});
console.log(`\n══ (2) 내원권인데 묻힌 키워드 — 검색량≥300, 노출점유<3% : ${buriedU.length}개 ══`);
console.log('검색량/월  33일노출  입찰    상태          키워드');
buriedU.slice(0,60).forEach(k=>console.log(`  ${won(k.vol).padStart(7)} ${String(k.imp33).padStart(8)} ${String(k.bid).padStart(6)}원 ${k.cause.padEnd(14)} ${k.kw}`));
const bv=buriedU.reduce((s,k)=>s+(k.vol||0),0);
console.log(`  … 묻힌 키워드 월 검색량 합 ${won(bv)}`);

fs.writeFileSync(P('_sojam_g0903_audit.json'),JSON.stringify({at:new Date().toISOString(),
 audit33:{tot:A33.tot,by:A33.by},audit7:{tot:A7.tot,by:A7.by},
 hit7:A7.hit.map(k=>({kw:k.kw,v:k.v,prod:k.prod,clk:k.clk7,cost:k.cost7,imp:k.imp7,rnk:k.rnk7,bid:k.bid,vol:k.vol,camp:k.camp,id:k.id})),
 hit33:A33.hit.map(k=>({kw:k.kw,v:k.v,clk:k.clk33,cost:k.cost33,imp:k.imp33,rnk:k.rnk33,bid:k.bid,vol:k.vol,camp:k.camp,id:k.id})),
 buried:buriedU.map(k=>({kw:k.kw,prod:k.prod,vol:k.vol,imp33:k.imp33,bid:k.bid,cause:k.cause,id:k.id,gid:k.gid,camp:k.camp,share:k.share}))},null,0));
console.log('\n저장 → _sojam_g0903_audit.json');
