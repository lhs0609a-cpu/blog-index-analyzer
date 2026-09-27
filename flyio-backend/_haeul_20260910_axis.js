// 원장 지정 3축(두통4 : 어지럼3 : 자율신경3) 기준으로 어제 설계와 실제 집행을 대조한다.
// 자율신경축은 불면·불안·공황·미주신경성실신·두근거림 등을 포함한다(원장 정의).
const fs=require('fs'),path=require('path');
const D9=path.join(__dirname,'reports','haeul_intent_20260909'),D0=path.join(__dirname,'reports','haeul_20260910');
const r9=n=>JSON.parse(fs.readFileSync(path.join(D9,n+'.json'),'utf8'));
const csv=(n,a)=>{if(!a.length)return;const cs=Object.keys(a[0]);fs.writeFileSync(path.join(D0,n+'.csv'),'﻿'+[cs,...a.map(r=>cs.map(c=>r[c]??''))].map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n'));console.log('CSV',n+'.csv',a.length);};

// 축 판정 — 순서가 곧 우선순위다. 미주신경성실신·기립성은 자율신경, 전정편두통·이석증은 어지럼.
function axis(kw){const k=String(kw).replace(/\s/g,'');
 if(/자율신경|미주신경성|미주신경|불면|잠이안|잠을못|수면장애|불안장애|불안감|공황|두근|심계|가슴이답답|과호흡|기립성|브레인포그|신경쇠약|화병|번아웃/.test(k))return '자율신경';
 if(/어지럼|어지러|어질|현훈|이석증|메니에르|전정|평형|빙글|휘청|중심을못/.test(k))return '어지럼';
 if(/두통|편두통|머리(가)?아[프플파픔]|머리통증|머리(가)?찌릿|머리지끈|뒷골|관자놀이|삼차신경통|후두신경통|머리가무겁|머리압박|정수리통증/.test(k))return '두통';
 return '기타';
}
const AX=['두통','어지럼','자율신경','기타'];
function tally(rows,label,keyOf,clickOf,costOf){
 const t={};for(const a of AX)t[a]={n:0,click:0,cost:0};
 for(const r of rows){const a=axis(keyOf(r));t[a].n++;t[a].click+=clickOf(r);t[a].cost+=costOf(r);}
 const tc=AX.reduce((s,a)=>s+t[a].click,0),tk=AX.reduce((s,a)=>s+t[a].cost,0),tn=rows.length;
 console.log('\n== '+label+' ==  키워드'+tn+'개 / 클릭'+tc+' / 비용'+Math.round(tk).toLocaleString()+'원');
 console.table(AX.map(a=>({축:a,키워드:t[a].n,'키워드%':tn?(t[a].n/tn*100).toFixed(1):'-',클릭:t[a].click,'클릭%':tc?(t[a].click/tc*100).toFixed(1):'-',비용:Math.round(t[a].cost),'비용%':tk?(t[a].cost/tk*100).toFixed(1):'-'})));
 return t;
}
const pct=(t,f)=>{const base=['두통','어지럼','자율신경'].reduce((s,a)=>s+t[a][f],0);return base?['두통','어지럼','자율신경'].map(a=>(t[a][f]/base*10).toFixed(1)).join(' : '):'—';};

// A. 어제 적용한 입찰 변경 148개 = 설계 의도
const plan=r9('change_plan').keywords;
const tPlan=tally(plan,'어제 입찰 증액 148개 (설계 의도)',r=>r.keyword,()=>0,r=>r.after);
console.log('  → 증액 후 입찰가 합 기준 3축 비율(10점 환산):',pct(tPlan,'cost'),' / 키워드 수 기준:',pct(tPlan,'n'));

// B. 어제(2026-09-09) 실제 집행
const raw=JSON.parse(fs.readFileSync(path.join(D0,'raw_20260909.json'),'utf8'));
const yKw=raw.clicked.filter(r=>r.keywordId!=='-').map(r=>({keyword:raw.kwtext[r.keywordId]?.keyword||'(불명)',click:r.click,cost:r.cost}));
const tYkw=tally(yKw,'어제 클릭 등록키워드 23개',r=>r.keyword,r=>r.click,r=>r.cost);
console.log('  → 3축 비율:',pct(tYkw,'click'),'(클릭) /',pct(tYkw,'cost'),'(비용)');
const yTerm=raw.terms.map(r=>({term:r.term,click:r.click,cost:r.cost}));
const tYterm=tally(yTerm,'어제 실제 검색어 56개',r=>r.term,r=>r.click,r=>r.cost);
console.log('  → 3축 비율:',pct(tYterm,'click'),'(클릭) /',pct(tYterm,'cost'),'(비용)');

// C. 최근 30일(08-10~09-08)
const c30=r9('clicked');
const t30=tally(c30,'30일 클릭 등록키워드 208개',r=>r.keyword,r=>r.click30,r=>r.cost30);
console.log('  → 3축 비율:',pct(t30,'click'),'(클릭) /',pct(t30,'cost'),'(비용)');
const s30=r9('search_clicked');
const tS30=tally(s30,'30일 실제 검색어 895개',r=>r.keyword,r=>r.click30,r=>r.cost30);
console.log('  → 3축 비율:',pct(tS30,'click'),'(클릭) /',pct(tS30,'cost'),'(비용)');

// 산출물: 어제 클릭 전부에 축을 붙인 표
const cm=new Map(raw.campaigns.map(c=>[c.nccCampaignId,c]));
const detail=raw.clicked.map(r=>{const t=raw.kwtext[r.keywordId]||{},g=raw.groups[r.gid]||{};
 const name=t.keyword||(r.keywordId==='-'?'(확장검색/미귀속)':'(조회불가)');
 return {축:r.keywordId==='-'?'(미귀속)':axis(name),키워드:name,캠페인:cm.get(r.cid)?.name||r.cid,그룹:g.name||r.gid,
  노출:r.imp,클릭:r.click,비용:Math.round(r.cost),CPC:Math.round(r.cost/r.click),입찰가:t.bid??''};})
 .sort((a,b)=>b.비용-a.비용);
csv('어제_클릭키워드_축분류_20260909',detail);
csv('어제_실제검색어_축분류_20260909',raw.terms.map(r=>({축:axis(r.term),검색어:r.term,캠페인:cm.get(r.cid)?.name||r.cid,그룹:raw.groups[r.gid]?.name||r.gid,클릭:r.click,비용:Math.round(r.cost)})).sort((a,b)=>b.비용-a.비용));
csv('입찰증액148개_축분류',plan.map(p=>({축:axis(p.keyword),키워드:p.keyword,tier:p.tier,이전:p.before,이후:p.after,최근7일노출:p.imp7,최근7일클릭:p.click7})).sort((a,b)=>b.이후-a.이후||a.축.localeCompare(b.축)));

// 30일 기준 자율신경축에서 돈이 큰 순서 — 지금 죽어 있는 것 포함
const auto30=c30.filter(r=>axis(r.keyword)==='자율신경').sort((a,b)=>b.cost30-a.cost30).slice(0,20)
 .map(r=>({키워드:r.keyword,클릭30:r.click30,비용30:r.cost30,상태:r.status,활성:r.enabled,입찰가:r.bid,캠페인:r.campaign}));
console.log('\n== 30일 자율신경축 상위 20 ==');console.table(auto30);
const dizzy30=c30.filter(r=>axis(r.keyword)==='어지럼').sort((a,b)=>b.cost30-a.cost30).slice(0,15)
 .map(r=>({키워드:r.keyword,클릭30:r.click30,비용30:r.cost30,상태:r.status,활성:r.enabled,입찰가:r.bid,캠페인:r.campaign}));
console.log('\n== 30일 어지럼축 상위 15 ==');console.table(dizzy30);
