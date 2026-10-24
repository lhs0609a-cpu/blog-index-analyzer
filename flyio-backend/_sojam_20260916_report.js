// 9/15 하루치 — 내원가능성 높은 키워드의 노출량·실순위. 실순위는 /stats avgRnk(그날 노출가중).
const fs=require('fs'),path=require('path');
const D=path.join(__dirname,'../reports/sojam-20260915/');
const J=n=>JSON.parse(fs.readFileSync(D+n,'utf8'));
const day=J('day_20260915.json');
const T=JSON.parse(fs.readFileSync(path.join(__dirname,'../reports/sojam-20260915_targets.json'),'utf8'));
const EX=JSON.parse(fs.readFileSync(path.join(__dirname,'../reports/sojam-20260915_excluded_axes.json'),'utf8'));
const core=J('rows.json'), exr=J('exax_rows.json');
const volCore=new Map(core.map(r=>[r.k,r.vol2])), volEx=new Map(exr.map(r=>[r.k,r.vol2]));
const bidCore=new Map(core.map(r=>[r.k,r.bid])), bidEx=new Map(exr.map(r=>[r.k,r.bid]));
const SIG=[['치료처탐색',4,/한의원|한방|병원|의원|클리닉|잘하는곳|잘하는|명의|전문|추천|어디|강남|역삼|신논현|논현|서초|교대|양재|선릉|도곡|한티|매봉|삼성동/],
 ['만성·재발',3,/만성|재발|안낫|안나|오래|몇년|수년|평생|계속|자꾸|난치|반복|지속/],
 ['고통강도',3,/심한|심할때|심해|극심|너무|미치|미칠|죽겠|잠못|못자|밤에|밤마다|새벽|진물|피나|피가|따가|쓰라|통증|아파|괴로|고통|참을수|긁어서|터져|헐어|헐었/],
 ['완치·근본',2,/완치|낫는법|낫는방법|고치는법|근본|치료법|치료방법|치료제|치료|없애는|해결/],
 ['노출부위',1,/얼굴|손|목|입술|입가|이마|턱|두피|머리|항문|똥꼬|외음부|음부|사타구니|고환|음낭|회음|질입구|유두|겨드랑|엉덩이/]];
const NOISE=/간지럼(?!증)|간지럽히/;
// 상담일지 1~9월 내원 / 8~9월 동의
const VISIT={'아토피':62,'가려움·소양':55,'습진':28,'지루성·두피':14,'접촉성피부염':13,'한포진':12,'묘기증':9,'은밀부위':8,'피부질환 일반':17,'모낭염·한선염':1,'구내염·구순염':1,'난치·자가면역':1,'무좀·백선':1,'다한증·땀띠':1,'백반증':0,'탈스테로이드':0,'두드러기':48,'건선':17,'여드름':15};
const AGREE={'가려움·소양':4,'두드러기':3,'건선':3,'아토피':2,'습진':2,'한포진':1,'모낭염·한선염':1,'여드름':1};
const rows=[];
for(const [src,map,volm,bidm] of [['내원축',T,volCore,bidCore],['동의제외축',EX,volEx,bidEx]]){
 for(const [k,t] of Object.entries(map)){
  let imp=0,clk=0,cost=0,rs=0,ri=0;
  for(const id of t.ids){const s=day[id]||{};imp+=s.imp||0;clk+=s.clk||0;cost+=s.cost||0;if(s.rank&&s.imp){rs+=s.rank*s.imp;ri+=s.imp;}}
  const sg=NOISE.test(k)?{sig:[],pts:0}:(()=>{const m=SIG.filter(([,,r])=>r.test(k));return{sig:m.map(x=>x[0]),pts:m.reduce((a,x)=>a+x[1],0)};})();
  const tier=(sg.pts>=6||(sg.sig.includes('치료처탐색')&&sg.sig.length>=2))?'상':sg.pts>=3?'중':'하';
  rows.push({k,axis:t.axis,src,vol:volm.get(k)??null,bid:bidm.get(k)??0,imp,clk,cost,
   rank:ri?+(rs/ri).toFixed(1):null,tier,sig:sg.sig,visit:VISIT[t.axis]??0,agree:AGREE[t.axis]??0});
 }
}
fs.writeFileSync(D+'rows_20260915.json',JSON.stringify(rows));
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const pad=(s,n)=>{s=String(s);let w=0;for(const c of s)w+=/[가-힣ㄱ-힣]/.test(c)?2:1;return s+' '.repeat(Math.max(0,n-w));};
// 내원가능성 등급
const grade=r=>(r.agree>0&&(r.tier!=='하'||(r.vol||0)>=1000))?'A':(r.visit>=12&&(r.tier!=='하'||(r.vol||0)>=1000))?'B':r.visit>=8?'C':'D';
for(const r of rows) r.grade=grade(r);
const shown=rows.filter(r=>r.imp>0);
console.log('대상 키워드',rows.length,'| 9/15 노출된 것',shown.length,'| 클릭',shown.reduce((a,r)=>a+r.clk,0),'| 소진',won(shown.reduce((a,r)=>a+r.cost,0))+'원');
console.log('');
for(const g of ['A','B','C','D']){
 const a=rows.filter(r=>r.grade===g), m=a.filter(r=>r.rank!=null);
 const wr=m.reduce((x,r)=>x+r.rank*r.imp,0)/(m.reduce((x,r)=>x+r.imp,0)||1);
 console.log(' '+g+'급 '+a.length+'개 · 어제 노출 '+m.length+'개 '+won(m.reduce((x,r)=>x+r.imp,0))+'회 · 노출가중 실순위 '+(m.length?wr.toFixed(2):'-')+' · 클릭 '+m.reduce((x,r)=>x+r.clk,0)+' · 소진 '+won(m.reduce((x,r)=>x+r.cost,0))+'원');
}
module.exports={rows};
