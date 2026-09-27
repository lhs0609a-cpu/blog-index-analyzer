// 동의 축 강화 계획 — 일 +5만원(월 150만) 한도, 추가 클릭당 비용이 싼 순.
// 대상: 동의 9건이 달고 있는 8개 축. 승인축 5개(가려움·아토피·습진·한포진·모낭염) + 원장 제외축 3개(건선·두드러기·여드름).
// 목표 순위는 모바일 3위가, 유효입찰 상한 10,000원, 인상만 한다(인하 금지 — 9/9 대량 인하로 소진이 무너진 전력).
const fs=require('fs'),path=require('path');
const D=path.join(__dirname,'../reports/sojam-20260915/');
const J=n=>JSON.parse(fs.readFileSync(D+n,'utf8'));
const est=J('est.json'), pf=J('perf.json');
const CAP_MONTH=1500000, CAP_BID=10000;
const PRODUCT=/연고|크림|로션|세안제|비누|샴푸|패치|에센스|화장품|영양제|음식|짜는|도구|기구|추천템|가격|비용|보험/;

const AG={'가려움·소양':1,'아토피':1,'습진':1,'한포진':1,'모낭염·한선염':1};
const core=J('rows.json').filter(r=>AG[r.axis]).map(r=>({k:r.k,axis:r.axis,vol:r.vol2,rank:r.rank,imp:r.imp,bid:r.bid,per:r.per,group:'승인축'}));
const ex=J('exax_rows.json').map(r=>({k:r.k,axis:r.axis,vol:r.vol2,rank:r.rank,imp:r.imp,bid:r.bid,on:r.on,group:'제외축'}));

const cand=[];
for(const r of [...core,...ex]){
  const t=est['MOBILE|3|'+r.k];
  if(!t||t<=r.bid||t>CAP_BID) continue;
  if(PRODUCT.test(r.k)) continue;   // 제품·정보어는 결제로 가지 않는다(9/11 배분과 동일 규칙)
  let cc=0,ck=0,tc=0,tk=0,got=false;
  for(const dev of ['MOBILE','PC']){
    const a=pf[dev+'|cur|'+r.k], b=pf[dev+'|p3|'+r.k];
    if(a){cc+=a.cost||0;ck+=a.clk||0;}
    if(b){tc+=b.cost||0;tk+=b.clk||0;got=true;}
  }
  if(!got) continue;
  const dc=tc-cc, dk=tk-ck;
  if(dc<=0||dk<=0) continue;
  cand.push({...r,target:Math.round(t/10)*10,dc,dk,cpc:dc/dk});
}
cand.sort((a,b)=>a.cpc-b.cpc);
let cost=0,clk=0; const take=[];
for(const c of cand){ if(cost+c.dc<=CAP_MONTH){cost+=c.dc;clk+=c.dk;take.push(c);} }
fs.writeFileSync(D+'plan_final.json',JSON.stringify({cap:CAP_MONTH,cost,clk,take},null,1));
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const pad=(s,n)=>{s=String(s);let w=0;for(const c of s)w+=/[가-힣ㄱ-힣]/.test(c)?2:1;return s+' '.repeat(Math.max(0,n-w));};
console.log('후보',cand.length,'→ 채택',take.length,'| 월 추가비용',won(cost),'(일',won(cost/30)+') | 월 추가클릭 +'+won(clk),'| 추가 클릭당',won(cost/clk)+'원');
const by={};for(const t of take){const a=by[t.axis]=by[t.axis]||{n:0,dc:0,dk:0};a.n++;a.dc+=t.dc;a.dk+=t.dk;}
console.log('\n축별:');
for(const [k,v] of Object.entries(by).sort((a,b)=>b[1].dc-a[1].dc)) console.log('  '+pad(k,14)+pad(v.n+'개',7)+pad('월 +'+won(v.dc)+'원',16)+'클릭 +'+won(v.dk));
console.log('\n채택 상위 30 (추가 클릭 많은 순):');
console.log('  '+pad('키워드',20)+pad('축',12)+pad('월검색',8)+pad('현순위',8)+pad('입찰',14)+pad('월클릭',8)+'월비용');
for(const t of [...take].sort((a,b)=>b.dk-a.dk).slice(0,30))
  console.log('  '+pad(t.k,20)+pad(t.axis,12)+pad(won(t.vol||0),8)+pad(t.rank==null?'미노출':t.rank.toFixed(1),8)+pad(won(t.bid)+'→'+won(t.target),14)+pad('+'+won(t.dk),8)+'+'+won(t.dc));
const left=cand.filter(c=>!take.includes(c)).sort((a,b)=>b.dk-a.dk).slice(0,12);
console.log('\n예산 밖으로 밀린 것 상위 12:');
for(const t of left) console.log('  '+pad(t.k,20)+pad(t.axis,12)+pad('월'+won(t.vol||0),10)+pad(won(t.bid)+'→'+won(t.target),14)+'클릭 +'+won(t.dk)+' / 월 +'+won(t.dc)+'원');
