// 간절도 = 상담일지에서 실측한 내원율 리프트를 키워드 문구에 매핑한 값.
// 근거: data/sojam-private/notes_all.json 482행 비고. 기저 내원율 40.5%.
// ⚠️ 리프트는 '환자가 상담에서 한 말'에서 잰 것이고, 키워드는 '검색창에 친 말'이다. 같은 뜻을 담은 문구로 옮긴 것이지 같은 데이터가 아니다.
const fs=require('fs'),path=require('path');
const D=path.join(__dirname,'../reports/sojam-20260915/');
const rows=JSON.parse(fs.readFileSync(D+'rows_20260915.json','utf8'));
const {acts}=JSON.parse(fs.readFileSync(D+'actions.json','utf8'));
const newBid=new Map(acts.map(a=>[a.k,a.targetEff]));

// [이름, 실측리프트, 키워드에서 같은 뜻을 담는 표현]
const SIG=[
 ['점점 심해짐',1.66,/번지|퍼지|퍼졌|심해지|점점|갑자기|번짐|올라오는|계속올라|났다가|더심|악화/],
 ['재발 반복',  1.64,/재발|자꾸|반복|또생|계속생|끊으면|중단하면|낫다가|나았다가|안낫|안나아|잘안/],
 ['오래됨(6년~)',1.57,/만성|몇년|수년|오래된|오래|년째/],
 ['타 치료처 경험',1.54,/한의원|한방|대학병원|병원에서|피부과에서|잘하는곳|잘하는|명의|용한|유명한/],
 ['어릴때부터', 1.51,/성인아토피|어릴때|어렸을때|유아기|태열|소아|초등|중학생|고등학생/],
 ['막막·절박',  1.46,/어떻게해야|어떡|방법없|도와|살려|지푸라기|절박|막막|답답|미치겠|죽겠|못살/],
 ['가족 대리',  1.45,/아기|아이|우리아이|신생아|영아|유아|돌쟁이|아들|딸|어머니|엄마|남편|아내|부모/],
 ['전신·온몸',  1.41,/전신|온몸|몸전체|여기저기|곳곳/],
 ['스테로이드', 1.37,/스테로이드|탈스|연고끊|약끊|st연고|리바운드|호르몬제/],
 ['진물·피',    1.19,/진물|피나|피가|짓무|딱지|터져|갈라져|갈라짐|헐어|헐었/],
];
const PENALTY=[
 ['10년 이상',  0.94,/10년|십년|평생/],
 ['자가해결',   0.55,/연고|크림|로션|샴푸|비누|음식|영양제|세안제|패치|바르는|먹는약|약추천|파스/],
 ['정보탐색',   0.70,/사진|종류|차이|전염|뜻|무엇|이란|영어|검사/],
];
// 축 내원율(문의→내원, 상담일지 1~9월 실측)
const AXIS={'아토피':62/115,'가려움·소양':55/116,'습진':58/138,'두드러기':48/102,'건선':17/41,'피부질환 일반':17/51,
 '여드름':15/22,'지루성·두피':14/34,'접촉성피부염':13/23,'한포진':12/29,'묘기증':9/15,'은밀부위':8/16,
 '모낭염·한선염':1/2,'구내염·구순염':1/4,'난치·자가면역':1/6,'무좀·백선':1/5,'다한증·땀띠':1/2,'탈스테로이드':0.3,'백반증':0.05};
const NOISE=/간지럼(?!증)|간지럽히|짜는|도구/;
const out=[];
for(const r of rows){
 const ar=AXIS[r.axis]; if(ar===undefined||NOISE.test(r.k)) continue;
 const hits=SIG.filter(s=>s[2].test(r.k)), pen=PENALTY.filter(s=>s[2].test(r.k));
 let mult=1;
 for(const h of hits) mult*=h[1];
 for(const p of pen) mult*=p[1];
 const urgency=0.405*mult;          // 이 문구를 쓴 사람의 추정 내원율
 const score=urgency*ar/0.405;      // 축 내원율까지 반영
 out.push({...r,sig:hits.map(h=>h[0]),pen:pen.map(p=>p[0]),mult:+mult.toFixed(2),
  urgency:+(Math.min(urgency,0.95)*100).toFixed(1),axisRate:+(ar*100).toFixed(0),
  score:+(score*100).toFixed(1),expVisit:+((r.vol||0)*0.02*Math.min(score,0.95)).toFixed(2),
  bidNow:newBid.get(r.k)??r.bid});
}
out.sort((a,b)=>b.score-a.score||(b.vol||0)-(a.vol||0));
fs.writeFileSync(D+'urgency_rank.json',JSON.stringify(out));
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const pad=(s,n)=>{s=String(s);let w=0;for(const c of s)w+=/[가-힣ㄱ-힣]/.test(c)?2:1;return s+' '.repeat(Math.max(0,n-w));};
const real=out.filter(r=>(r.vol||0)>=30);
console.log('평가',out.length,'| 월검색 30+ 인 것',real.length);
console.log('');
console.log('■ 간절도 순위 (월검색 30 이상) — 상위 50');
console.log('  #  '+pad('키워드',22)+pad('축',13)+pad('간절점수',9)+pad('월검색',8)+pad('노출',7)+pad('순위',6)+pad('입찰',8)+'잡힌 신호');
real.slice(0,50).forEach((r,i)=>console.log('  '+String(i+1).padStart(2)+' '+pad(r.k,22)+pad(r.axis,13)+pad(r.score,9)+pad(won(r.vol),8)+pad(r.imp?won(r.imp):'0',7)+pad(r.rank==null?'-':r.rank.toFixed(1),6)+pad(won(r.bidNow),8)+r.sig.join('+')+(r.pen.length?' −'+r.pen.join('−'):'')));
