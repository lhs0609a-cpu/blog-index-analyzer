// "진짜 내원할 가능성 높은 키워드" 순위.
// ⚠️ 상담일지에 키워드ID 가 전부 비어 있어 키워드→내원 직접 연결은 존재하지 않는다([[sojam-agreement-column]]).
// 그래서 근거는 두 층뿐이다: (1) 축 단위 실측 내원·동의, (2) 키워드 문구의 행동 단계.
// 점수 = 행동단계 가중 × 축 내원가중(내원수 + 동의 보너스). 검색량은 '규모'라 순위가 아니라 별도 열로 둔다.
const fs=require('fs'),path=require('path');
const D=path.join(__dirname,'../reports/sojam-20260915/');
const rows=JSON.parse(fs.readFileSync(D+'rows_20260915.json','utf8'));
const {acts}=JSON.parse(fs.readFileSync(D+'actions.json','utf8'));
const newBid=new Map(acts.map(a=>[a.k,a.targetEff]));

// 1) 행동 단계 — 내원까지의 거리. 위로 갈수록 가깝다.
const STAGE=[
 ['1. 치료처를 찾는 중', 100, /(한의원|한방|병원|의원|클리닉|잘하는곳|잘하는|명의|전문의|전문|어디|추천|후기|비용|가격|상담)/],
 ['2. 치료법을 찾는 중',  60, /(치료|완치|낫는법|낫는방법|고치는법|근본|해결|없애는|치료제|치료법|관리)/],
 ['3. 안 낫아 괴로운 중', 40, /(만성|재발|안낫|안나|오래|몇년|수년|평생|계속|자꾸|반복|난치|심한|심해|심할때|극심|너무|미치|죽겠|잠못|못자|밤에|새벽|진물|피나|따가|쓰라|괴로|고통|긁어서|터져|헐어)/],
 ['4. 원인·정체를 찾는 중',20, /(원인|왜|증상|초기|이유|종류|사진|차이|전염)/],
 ['5. 혼자 해결 시도',      5, /(연고|크림|로션|약|샴푸|비누|음식|영양제|세안제|패치|민간요법|집에서)/],
];
const stageOf=k=>{for(const s of STAGE) if(s[2].test(k)) return s; return ['6. 단순 질환명',10,null];};
// 2) 축 내원가중 — 상담일지 1~9월 내원수 + 8~9월 동의(결제) 보너스
const AXIS={ // [내원수, 동의수]
 '아토피':[62,2],'가려움·소양':[55,4],'습진':[58,2],'두드러기':[48,3],'건선':[17,3],'피부질환 일반':[17,0],
 '여드름':[15,1],'지루성·두피':[14,0],'접촉성피부염':[13,0],'한포진':[12,1],'묘기증':[9,0],'은밀부위':[8,0],
 '모낭염·한선염':[1,1],'구내염·구순염':[1,0],'난치·자가면역':[1,0],'무좀·백선':[1,0],'다한증·땀띠':[1,0],
 '탈스테로이드':[0,0],'백반증':[0,0]};
const NOISE=/간지럼(?!증)|간지럽히|사진$|짜는|도구/;
const out=[];
for(const r of rows){
 const a=AXIS[r.axis]; if(!a) continue;
 if(NOISE.test(r.k)) continue;
 const [vis,ag]=a;
 const [stage,sw]=stageOf(r.k);
 const axisW=vis+ag*15;                 // 동의 1건 = 내원 15명치로 본다(결제까지 간 신호)
 const score=Math.round(sw*axisW/10);
 out.push({...r,stage,sw,axisW,score,bidNow:newBid.get(r.k)??r.bid});
}
out.sort((x,y)=>y.score-x.score||(y.vol||0)-(x.vol||0));
fs.writeFileSync(D+'intent_rank.json',JSON.stringify(out));
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
console.log('평가 대상',out.length,'개');
const byStage={};
for(const r of out){const s=byStage[r.stage]=byStage[r.stage]||{n:0,imp:0,clk:0,cost:0,vol:0};s.n++;s.imp+=r.imp;s.clk+=r.clk;s.cost+=r.cost;s.vol+=r.vol||0;}
console.log('');
console.log('행동 단계별 (9/15 실적)');
for(const [k,v] of Object.entries(byStage).sort())
 console.log('  '+k.padEnd(22)+String(v.n).padStart(6)+'개  월검색 '+won(v.vol).padStart(9)+'  노출 '+won(v.imp).padStart(7)+'  클릭 '+String(v.clk).padStart(3)+'  소진 '+won(v.cost).padStart(8)+'원');
