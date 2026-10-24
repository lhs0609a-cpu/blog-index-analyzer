// "진짜 내원할 가능성 높은 키워드" — 월 기대 내원수 기준 정렬.
// 기대내원/월 = 월검색량 × 단계별 클릭전환(문의까지의 거리) × 축 내원율(문의→내원, 상담일지 1~9월 실측)
// ⚠️ 키워드→내원 직접 연결은 시트에 없다. 단계 가중치는 추정이고, 축 내원율만 실측이다.
const fs=require('fs'),path=require('path');
const D=path.join(__dirname,'../reports/sojam-20260915/');
const rows=JSON.parse(fs.readFileSync(D+'rows_20260915.json','utf8'));
const {acts}=JSON.parse(fs.readFileSync(D+'actions.json','utf8'));
const newBid=new Map(acts.map(a=>[a.k,a.targetEff]));
const STAGE=[
 ['치료처 탐색', 0.020, /(한의원|한방|병원|의원|클리닉|잘하는곳|잘하는|명의|전문의|전문|어디|추천|후기|비용|가격|상담)/],
 ['치료법 탐색', 0.008, /(치료|완치|낫는법|낫는방법|고치는법|근본|해결|없애는|치료제|치료법)/],
 ['고통 호소',   0.006, /(만성|재발|안낫|안나|오래|몇년|수년|평생|계속|자꾸|반복|난치|심한|심해|심할때|극심|너무|미치|죽겠|잠못|못자|밤에|새벽|진물|피나|따가|쓰라|괴로|고통|긁어서|터져|헐어)/],
 ['원인·증상 탐색',0.002,/(원인|왜|증상|초기|이유|종류|사진|차이|전염)/],
 ['자가 해결',   0.0005,/(연고|크림|로션|약|샴푸|비누|음식|영양제|세안제|패치)/],
];
const stageOf=k=>{for(const s of STAGE) if(s[2].test(k)) return s; return ['질환명 단독',0.003,null];};
// 축: [문의, 내원, 동의] — 상담일지 1~9월 / 동의는 8~9월
const AXIS={'아토피':[115,62,2],'가려움·소양':[116,55,4],'습진':[138,58,2],'두드러기':[102,48,3],'건선':[41,17,3],
 '피부질환 일반':[51,17,0],'여드름':[22,15,1],'지루성·두피':[34,14,0],'접촉성피부염':[23,13,0],'한포진':[29,12,1],
 '묘기증':[15,9,0],'은밀부위':[16,8,0],'모낭염·한선염':[2,1,1],'구내염·구순염':[4,1,0],'난치·자가면역':[6,1,0],
 '무좀·백선':[5,1,0],'다한증·땀띠':[2,1,0],'탈스테로이드':[1,0,0],'백반증':[1,0,0]};
const NOISE=/간지럼(?!증)|간지럽히|짜는|도구/;
const out=[];
for(const r of rows){
 const a=AXIS[r.axis]; if(!a||NOISE.test(r.k)) continue;
 const [inq,vis,ag]=a;
 const visitRate=vis/inq;                       // 문의→내원 실측
 const payRate=ag?ag/Math.max(inq*0.24,1):0;    // 8~9월은 전체 문의의 약 24% 구간
 const [stage,conv]=stageOf(r.k);
 const vol=r.vol||0;
 const expVisit=vol*conv*visitRate;             // 월 기대 내원수
 out.push({...r,stage,conv,visitRate,expVisit,payRate,bidNow:newBid.get(r.k)??r.bid});
}
out.sort((x,y)=>y.expVisit-x.expVisit);
fs.writeFileSync(D+'intent_rank2.json',JSON.stringify(out));
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const pad=(s,n)=>{s=String(s);let w=0;for(const c of s)w+=/[가-힣ㄱ-힣]/.test(c)?2:1;return s+' '.repeat(Math.max(0,n-w));};
const top=out.filter(r=>r.expVisit>0);
console.log('평가',out.length,'개 · 기대 내원 > 0 인 것',top.length,'개');
console.log('상위 100개 합산 월 기대내원',top.slice(0,100).reduce((a,r)=>a+r.expVisit,0).toFixed(1),'명 / 전체',top.reduce((a,r)=>a+r.expVisit,0).toFixed(1),'명');
console.log('');
console.log('  #   '+pad('키워드',20)+pad('축',13)+pad('단계',14)+pad('월검색',8)+pad('월기대내원',10)+pad('어제노출',9)+pad('실순위',7)+'입찰');
top.slice(0,60).forEach((r,i)=>console.log('  '+String(i+1).padStart(3)+' '+pad(r.k,20)+pad(r.axis,13)+pad(r.stage,14)+pad(won(r.vol),8)+pad(r.expVisit.toFixed(2),10)+pad(r.imp?won(r.imp):'0',9)+pad(r.rank==null?'-':r.rank.toFixed(1),7)+won(r.bidNow)));
