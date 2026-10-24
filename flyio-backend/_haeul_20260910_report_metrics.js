// 해울 효율 보고서(2026-08-15~09-09)용 수치 집계. 결과: reports/haeul_20260910/report_metrics.json
const fs=require('fs'),path=require('path'),assert=require('assert');
const D0=path.join(__dirname,'reports','haeul_20260910'),D9=path.join(__dirname,'reports','haeul_intent_20260909');
const J=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const daily=J(path.join(D0,'daily_0815_0909.json'));
const terms=J(path.join(D9,'search_clicked.json'));
const full=J(path.join(D9,'search_reports_full.json'));
const camps=J(path.join(D0,'campaigns.json'));
const typeOf=new Map(camps.map(c=>[c.nccCampaignId,c.campaignTp]));

// 1. 일별: 플레이스 / 메인 파워링크(해울한의원·파워링크#2) / 자동풀
const kind=r=>r.type==='PLACE'?'place':(/자동풀|auto_/.test(r.name)?'pool':'main');
const days=[...new Set(daily.map(r=>r.day))].sort();
const byDay=days.map(day=>{const rs=daily.filter(r=>r.day===day);const o={day};
 for(const k of ['place','main','pool'])o[k]={imp:0,clk:0,cost:0};
 for(const r of rs){const t=o[kind(r)];t.imp+=r.imp;t.clk+=r.clk;t.cost+=r.cost;}
 o.total={imp:rs.reduce((s,r)=>s+r.imp,0),clk:rs.reduce((s,r)=>s+r.clk,0),cost:rs.reduce((s,r)=>s+r.cost,0),conv:rs.reduce((s,r)=>s+r.conv,0)};
 return o;});
assert.equal(days.length,26);

// 2. 기간: P1 소재 부착 전(8/15-18) / P2 소재 부착 후(8/19-9/8) / P3 재설계 당일(9/9)
const PER=[['P1','8/15~8/18','소재 부착 전','2026-08-15','2026-08-18'],['P2','8/19~9/8','소재 3,783개 부착 후','2026-08-19','2026-09-08'],['P3','9/9','예산·입찰 재설계 당일','2026-09-09','2026-09-09']];
const periods=PER.map(([id,label,desc,a,b])=>{const ds=byDay.filter(d=>d.day>=a&&d.day<=b),n=ds.length;
 const s=k=>({imp:ds.reduce((x,d)=>x+d[k].imp,0),clk:ds.reduce((x,d)=>x+d[k].clk,0),cost:ds.reduce((x,d)=>x+d[k].cost,0)});
 const t=s('total'),pl=s('place'),pw={imp:s('main').imp+s('pool').imp,clk:s('main').clk+s('pool').clk,cost:s('main').cost+s('pool').cost};
 const f=x=>({...x,perDayCost:Math.round(x.cost/n),perDayClk:+(x.clk/n).toFixed(1),cpc:x.clk?Math.round(x.cost/x.clk):0,ctr:x.imp?+(x.clk/x.imp*100).toFixed(2):0});
 return {id,label,desc,days:n,total:f(t),place:f(pl),power:f(pw)};});

// 3. 검색어 품질(30일 8/10~9/8, 파워링크 실제 검색어 895개)
function axis(k){k=k.replace(/\s/g,'');
 if(/자율신경|미주신경|불면|잠이안|수면장애|불안|공황|두근|심계|가슴이답답|과호흡|기립성|브레인포그|신경쇠약|화병|번아웃|우울/.test(k))return '자율신경';
 if(/어지럼|어지러|어질|현훈|이석증|메니에르|전정|평형/.test(k))return '어지럼';
 if(/두통|편두통|머리(가)?아[프플파픔]|머리통증|머리(가)?찌릿|머리지끈|뒷골|관자놀이|삼차신경통|후두신경통|머리가무겁/.test(k))return '두통';
 return '축밖';}
const INTENT=/병원|한의원|치료(?!제)|클리닉|잘하는|전문|진료|어디로|어느과|무슨과|명의/;
const DRUG=/약$|약은|약이|치료제|정$|정\d|mg|타이레놀|인데놀|게보린|진통제|영양제|한약재/i;
const LOCAL=/강남|서초|역삼|교대|양재|방배|반포|논현|선릉|삼성동|잠원|사당/;
const REG=/서울|부산|대구|인천|광주|대전|울산|세종|제주|수원|성남|분당|용인|고양|일산|부천|안산|안양|평택|의정부|파주|김포|화성|시흥|광명|하남|구리|남양주|천안|청주|전주|창원|포항|김해|춘천|원주|강릉|목포|여수|순천|진주|구미|경주|익산|군산|당진|아산|배곧|장곡|청라|송도|목동|연신내|노원|강서|마포|송파|잠실|건대|홍대|신촌|종로|명동|판교|동탄|위례|미사|평촌|산본|제천|충주|거제|양산|속초|울진/;
const q={};const add=(k,r)=>{const x=q[k]||={terms:0,clk:0,cost:0};x.terms++;x.clk+=r.click30;x.cost+=r.cost30;};
const examples={};const ex=(k,r)=>{(examples[k]||=[]).push([r.keyword,r.click30,Math.round(r.cost30)]);};
for(const r of terms){const ax=axis(r.keyword);let g;
 if(/해울/.test(r.keyword))g='브랜드';
 else if(REG.test(r.keyword)&&!LOCAL.test(r.keyword))g='타지역';
 else if(DRUG.test(r.keyword))g='약·제품';
 else if(ax==='축밖')g='진료축 밖';
 else if(INTENT.test(r.keyword))g='내원의도';
 else g='증상·정보';
 add(g,r);ex(g,r);}
for(const k in examples)examples[k]=examples[k].sort((a,b)=>b[2]-a[2]).slice(0,8);
const qTot=Object.values(q).reduce((s,x)=>({clk:s.clk+x.clk,cost:s.cost+x.cost}),{clk:0,cost:0});

// 4. 30일 캠페인유형×기기, 미귀속
const dev={};for(const a of full.adKeywords){const k=(typeOf.get(a.cid)==='PLACE'?'플레이스':'파워링크')+'/'+(a.device==='M'?'모바일':'PC');const x=dev[k]||={clk:0,cost:0};x.clk+=a.click30;x.cost+=a.cost30;}

// 5. 내원 추정 — 해울 실측 없음. 소잠 실측(클릭 46건당 문의 1, 문의→내원 47.2%)을 빌려 범위로만.
const P=byDay.reduce((s,d)=>({pw:s.pw+d.main.clk+d.pool.clk,pl:s.pl+d.place.clk,cost:s.cost+d.total.cost,clk:s.clk+d.total.clk}),{pw:0,pl:0,cost:0,clk:0});
const goodShare=((q['내원의도']?.clk||0)+(q['브랜드']?.clk||0))/qTot.clk;
const goodBroad=goodShare+(q['증상·정보']?.clk||0)/qTot.clk;
const est={
 powerClicks:P.pw,placeClicks:P.pl,totalClicks:P.clk,totalCost:P.cost,
 bench:{clkPerInquiry:46,inquiryToVisit:0.472,source:'소잠한의원 상담일지 실측(2026-01~09-02)'},
 naive:{inquiries:+(P.clk/46).toFixed(1),visits:+(P.clk/46*0.472).toFixed(1)},
 qualityShare:+(goodShare*100).toFixed(1),qualityBroadShare:+(goodBroad*100).toFixed(1),
 adjustedLow:{inquiries:+(P.pw*goodShare/46+P.pl/46).toFixed(1)},
};
est.adjustedLow.visits=+(est.adjustedLow.inquiries*0.472).toFixed(1);
est.costPerVisitNaive=Math.round(P.cost/est.naive.visits);
est.costPerVisitAdj=Math.round(P.cost/est.adjustedLow.visits);

const out={generatedAt:new Date().toISOString(),byDay,periods,quality:{groups:q,total:qTot,examples},device30:dev,estimate:est};
fs.writeFileSync(path.join(D0,'report_metrics.json'),JSON.stringify(out,null,1));
console.log('기간');console.table(periods.map(p=>({기간:p.label,일수:p.days,'일평균 비용':p.total.perDayCost,'일평균 클릭':p.total.perDayClk,CPC:p.total.cpc,CTR:p.total.ctr,'파워링크 CPC':p.power.cpc,'플레이스 CPC':p.place.cpc,'플레이스 비중%':+(p.place.cost/p.total.cost*100).toFixed(1)})));
console.log('검색어 품질(30일)');console.table(Object.entries(q).map(([k,v])=>({구분:k,검색어:v.terms,클릭:v.clk,'클릭%':+(v.clk/qTot.clk*100).toFixed(1),비용:Math.round(v.cost),'비용%':+(v.cost/qTot.cost*100).toFixed(1)})));
console.log('예시',JSON.stringify(examples));
console.log('기기',JSON.stringify(dev));
console.log('추정',JSON.stringify(est,null,1));
