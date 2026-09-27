// 발굴 결과 납품 CSV. 볼륨(keywordstool) + 자동완성 증거 + 어군 + 게이트 판정을 합친다.
const fs=require('fs'),path=require('path');
const D=path.join(__dirname,'reports','haeul_20260922');
const p=JSON.parse(fs.readFileSync(path.join(D,'final_cand.json'),'utf8'));
const vol=fs.existsSync(path.join(D,'vol595.json'))?JSON.parse(fs.readFileSync(path.join(D,'vol595.json'),'utf8')):{};
// ⚠️ keywordstool 은 10회 미만을 문자열 "< 10" 으로 준다. 숫자만 긁어내면 10 이 되어
// 전부 '실볼륨'으로 부풀어 오른다(첫 집계에서 586/586 이 10회+ 로 나왔다 — 전부 오류였다).
// 숫자형만 실측치로 인정하고, "< 10" 은 미확정(0 으로 하한 처리)으로 따로 센다.
const isLT = v => /</.test(String(v == null ? '' : v));
const num = v => { if (v == null || v === '') return null; if (isLT(v)) return 0;
  const t = String(v).replace(/[^0-9]/g, ''); return t ? parseInt(t, 10) : 0; };
const VEIN=[
 ['이비인후과·타과표류',/^(이비인후과|신경과|내과|응급실|대학병원|신경외과|가정의학과|정신과)/],
 ['품질수식어',/(잘보는|잘고치|잘하는|잘낫|명의|용한|유명|전문)/],
 ['양방실패',/(약먹|약부작용|약효과|내성|재발|검사정상|이상없|원인불명|원인모|정상인데|먹어도)/],
 ['시술·재활',/(이석치환|이석정복|이석유리|에플리|세몽|시몽|바베큐|바비큐|브란트|전정재활)/],
 ['공식질환명',/(양성돌발|양성발작|양성두위|양성체위|내림프|미로염|내이염|전정병증|전정신경병|전정기능저하|전실신|현훈|기립못견딤|기립불내|기립빈맥|하선|상륙증후군|가속도병)/],
 ['동반증상',/^(어지럽고|어지럽|머리가어지|걸을때어지|일어나면어지|돌아누울때|고개숙이면|고개돌리면|누우면|자다가어지|아침에일어)/],
 ['검사·진단',/(안진|온도자극|칼로릭|두부충동|두진|전정유발|회전의자|동적자세|기립경사|발살바|심박변이|평형기능검사|전정기능검사|딕스|홀파이크|프렌젤)/],
];
const lab=k=>{for(const [n,re] of VEIN)if(re.test(k))return n;return '기타';};
const rows=p.map(x=>{const v=vol[x.kw]||{};
 const pc=num(v.pc),mo=num(v.mo);
 const has=!(v.pc==null&&v.mo==null);
 const tot=has?((pc||0)+(mo||0)):null;                 // "< 10" 은 0 으로 하한 처리
 const lt=(isLT(v.pc)||isLT(v.mo))?1:0;
 const bothLT=has&&isLT(v.pc)&&isLT(v.mo);             // 양쪽 다 <10 = 사실상 수요 없음
 return {...x,vein:lab(x.kw),pc:v.pc??'',mo:v.mo??'',tot,lt10:lt,bothLT:bothLT?1:0,comp:v.comp||''};});
// 우선순위: 자기제안 + 내원 + 볼륨
const score=r=>(r.ev==='self'?1000:0)+(r.visit?500:0)+Math.min(r.tot||0,5000);
rows.sort((a,b)=>score(b)-score(a));
const q=s=>'"'+String(s==null?'':s).replace(/"/g,'""')+'"';
const H=['키워드','어군','버킷','내원의도','증거','월검색_PC','월검색_모바일','월검색_합_하한','10회미만포함','양쪽10미만','경쟁도','발굴채널','제안출처'];
const out=[H.map(q).join(',')].concat(rows.map(r=>[r.kw,r.vein,r.bucket,r.visit?'Y':'',r.ev==='self'?'자기제안(실검색확정)':'제안',r.pc,r.mo,r.tot??'',r.lt10?'Y':'',r.bothLT?'Y':'',r.comp,(r.src||[]).join('+'),r.from||''].map(q).join(',')));
fs.writeFileSync(path.join(D,'해울_어지럼축_발굴_20260922.csv'),'\uFEFF'+out.join('\r\n'));
// 통계
const withVol=rows.filter(r=>r.tot!=null);
const real=withVol.filter(r=>(r.tot||0)>=10);          // 숫자로 확인된 검색량만
const tiny=withVol.filter(r=>(r.tot||0)<10);
console.log('총',rows.length,'| 볼륨응답',withVol.length,'| **숫자로 확인된 월검색 10회+',real.length,'**| 10회미만·미확정',tiny.length,'| 무응답',rows.length-withVol.length);
console.log('  (양쪽 기기 모두 "< 10" =',withVol.filter(r=>r.bothLT).length,'개 — 사실상 수요 없음)');
console.log('내원 의도 중 월검색 10회+:',real.filter(r=>r.visit).length);
const byV={};for(const r of real)byV[r.vein]=(byV[r.vein]||{n:0,vol:0,visit:0}),byV[r.vein].n++,byV[r.vein].vol+=r.tot||0,byV[r.vein].visit+=r.visit?1:0;
console.log('\n=== 어군별 실볼륨(월 10회+) ===');
console.log('어군'.padEnd(22),'개수  내원  월검색합');
for(const [k,v] of Object.entries(byV).sort((a,b)=>b[1].vol-a[1].vol))
 console.log(k.padEnd(22),String(v.n).padStart(4),String(v.visit).padStart(5),String(v.vol).padStart(9));
console.log('\n=== 내원 의도 × 실볼륨 상위 45 ===');
for(const r of real.filter(r=>r.visit).sort((a,b)=>(b.tot||0)-(a.tot||0)).slice(0,45))
 console.log('  '+r.kw.padEnd(26),r.vein.padEnd(16),'월'+String(r.tot).padStart(6),r.ev==='self'?'★확정':'');
console.log('\nCSV: reports/haeul_20260922/해울_어지럼축_발굴_20260922.csv');
