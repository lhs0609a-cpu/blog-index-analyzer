const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const {why}=require('./_sojam_d0828_rule.js');
const rows=JSON.parse(fs.readFileSync(P('_sojam_e0831_week_20260825_20260831.json'),'utf8'));
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
// 키워드 단위로 합침(같은 키워드가 여러 캠페인에 있음)
const m={};
for(const r of rows){const u=(m[r.kw]||={kw:r.kw,c:0,k:0,i:0,bid:0,camps:new Set(),rnk:[]});
 u.c+=r.salesAmt;u.k+=r.clkCnt;u.i+=r.impCnt;u.bid=Math.max(u.bid,r.bid);u.camps.add(r.camp);
 if(r.avgRnk)u.rnk.push(r.avgRnk);}
const K=Object.values(m).sort((a,b)=>b.c-a.c);
const TOT=K.reduce((s,r)=>s+r.c,0), TCLK=K.reduce((s,r)=>s+r.k,0);

// 주제 분류
const TOPIC=[['두드러기',/두드러기|두드레기/],['건선',/건선/],['아토피',/아토피/],['습진',/습진/],
 ['지루성·두피',/지루성|두피|비듬|모낭염/],['가려움',/가려움|간지러움|가려워/],['대상포진',/대상포진/],
 ['한포진·수포',/한포진|수포/],['백반증',/백반증/],['여드름·모공',/여드름|뾰루지|모공|화농/],
 ['종기·봉와직염',/종기|봉와직염|멍울/],['무좀·백선',/무좀|백선|완선/],['성기·사타구니',/사타구니|음낭|음경|항문|고환|귀두/],
 ['땀·다한증',/땀띠|다한증|땀/],['알레르기',/알레르기|알러지/],['한의원·병원 일반',/한의원|병원|의원|한방/]];
const topic=kw=>{for(const[t,re]of TOPIC)if(re.test(kw))return t;return '기타';};

console.log(`=== 8/25~8/31 클릭 발생 키워드 ${K.length}개 · 클릭 ${TCLK}회 · 소진 ${won(TOT)}원 · 평균CPC ${won(TOT/TCLK)}원 ===\n`);
console.log('  #  키워드                    클릭   소진      CPC     노출   순위 현재입찰가 누적%  판정');
let acc=0;
K.forEach((r,i)=>{acc+=r.c;
 const w=why(r.kw), rnk=r.rnk.length?(r.rnk.reduce((a,b)=>a+b,0)/r.rnk.length).toFixed(1):'-';
 console.log(`${String(i+1).padStart(4)}  ${r.kw.slice(0,20).padEnd(22)}${String(r.k).padStart(3)}${won(r.c).padStart(9)}원${won(r.c/r.k).padStart(8)}원${won(r.i).padStart(7)}${rnk.padStart(6)}${won(r.bid).padStart(8)}원${String(Math.round(acc*100/TOT)).padStart(5)}%  ${w?'▼'+w:''}`);});

console.log(`\n=== 주제별 ===`);
const T={};for(const r of K){const t=topic(r.kw);const u=(T[t]||={c:0,k:0,n:0});u.c+=r.c;u.k+=r.k;u.n++;}
console.log('  주제              키워드   클릭     소진      비중   CPC');
Object.entries(T).sort((a,b)=>b[1].c-a[1].c).forEach(([t,u])=>
 console.log('  '+t.padEnd(18)+String(u.n).padStart(4)+String(u.k).padStart(6)+won(u.c).padStart(11)+'원'+String(Math.round(u.c*100/TOT)).padStart(6)+'%'+won(u.c/u.k).padStart(8)+'원'));

console.log(`\n=== 최저가 규칙 대상이 이번 주에도 돈을 썼나 ===`);
const bad=K.filter(r=>why(r.kw));
console.log(`  대상 ${bad.length}개 · 클릭 ${bad.reduce((s,r)=>s+r.k,0)} · 소진 ${won(bad.reduce((s,r)=>s+r.c,0))}원 (전체의 ${Math.round(bad.reduce((s,r)=>s+r.c,0)*100/TOT)}%)`);
bad.forEach(r=>console.log(`   ${r.kw.slice(0,20).padEnd(22)}${won(r.c).padStart(9)}원 · 클릭 ${String(r.k).padStart(2)} · 현재 ${won(r.bid).padStart(7)}원  [${why(r.kw)}]  ${[...r.camps][0].slice(0,26)}`));
