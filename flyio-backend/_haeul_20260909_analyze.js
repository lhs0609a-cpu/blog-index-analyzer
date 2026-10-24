const fs=require('fs'),path=require('path');const D=path.join(__dirname,'reports','haeul_intent_20260909');
const read=n=>JSON.parse(fs.readFileSync(path.join(D,n+'.json'),'utf8')),save=(n,x)=>fs.writeFileSync(path.join(D,n+'.json'),JSON.stringify(x));
function classify(kw){const k=kw.replace(/\s/g,'');
 if(/해울/.test(k))return {tier:'브랜드',priority:1};
 if(/뇌출혈|뇌졸중|뇌경색|뇌종양|응급|벼락두통|마비|수술|주사|보톡스|가격|구매|판매|구인|채용|논문|학회|자격증/.test(k))return {tier:'별도검토',priority:0};
 const head=/두통|머리통증|머리(가)?아[프플파픔]|머리(가)?찌릿|머리지끈|관자놀이통증|뒷골통증|삼차신경통|후두신경통/.test(k),adj=/어지럼|어지러|자율신경|브레인포그|전정편두통|이석증|메니에르|미주신경성실신/.test(k),visit=/병원|한의원|치료|전문|잘하는|진료|클리닉|어느과|무슨과/.test(k)&&!/치료제|전문의약품|전문약|음식|지압|타이레놀|약국/.test(k),severe=/만성|심한|심할|심해|극심|지속|계속|매일|안낫|안듣|안들|약먹어도|난치|재발|군발|신경통/.test(k)&&!/음식|지압|타이레놀/.test(k);
 if(head&&visit)return {tier:'두통_내원치료의도',priority:4};
 if(head&&severe)return {tier:'두통_지속심한통증',priority:3};
 if(adj&&visit)return {tier:'연관질환_내원치료의도',priority:3};
 if(head)return {tier:'두통_일반증상정보',priority:2};
 if(adj)return {tier:'연관질환_일반',priority:1};
 return {tier:'기타_검토대상',priority:0};
}
function csv(name,rows){if(!rows.length)return;const cols=Object.keys(rows[0]);fs.writeFileSync(path.join(D,name+'.csv'),'\ufeff'+[cols,...rows.map(r=>cols.map(c=>r[c]??''))].map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n'));}
function analyze(){const camps=read('campaigns'),groups=read('groups'),gm=new Map(groups.map(g=>[g.nccAdgroupId,g])),cm=new Map(camps.map(c=>[c.nccCampaignId,c]));
 const inv=fs.existsSync(path.join(D,'inventory.json'))?read('inventory'):fs.readFileSync(path.join(D,'inventory.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
 const partial=n=>{const f=path.join(D,'keyword_'+n+'.json');if(fs.existsSync(f))return read('keyword_'+n);const p=path.join(D,'stats_'+n);return fs.existsSync(p)?fs.readdirSync(p).filter(x=>x.endsWith('.json')).flatMap(x=>JSON.parse(fs.readFileSync(path.join(p,x)))):[];};
 const month=partial('month'),week=partial('week'),mm=new Map(month.map(s=>[s.id,s])),wm=new Map(week.map(s=>[s.id,s]));const rows=[];
 for(const x of inv){const g=gm.get(x.gid),c=cm.get(g.nccCampaignId);for(const k of x.keywords){const m=mm.get(k.nccKeywordId)||{},w=wm.get(k.nccKeywordId)||{};rows.push({id:k.nccKeywordId,keyword:k.keyword,...classify(k.keyword),campaign:c.name,group:g.name,gid:g.nccAdgroupId,cid:c.nccCampaignId,bid:k.useGroupBidAmt?g.bidAmt:k.bidAmt,ownBid:k.bidAmt,useGroupBid:k.useGroupBidAmt,enabled:!k.userLock&&!g.userLock&&!c.userLock,status:k.status,qi:k.nccQi?.qiGrade,imp30:m.impCnt||0,click30:m.clkCnt||0,cost30:m.salesAmt||0,rank30:m.avgRnk||0,conv30:m.ccnt||0,imp7:w.impCnt||0,click7:w.clkCnt||0,cost7:w.salesAmt||0,rank7:w.avgRnk||0,statsQueried:fs.existsSync(path.join(D,'keyword_month.json'))||mm.has(k.nccKeywordId)});}}
 const clicked=rows.filter(r=>r.click30>0).sort((a,b)=>b.click30-a.click30);csv('클릭발생_등록키워드_전체_30일',clicked);save('clicked',clicked);save('analysis_rows',rows);const core=rows.filter(r=>r.priority>=3);csv('두통_내원의도_우선검토',core);
 const summary={inventoryGroups:inv.length,inventoryKeywords:rows.length,statsReturned:month.length,complete:fs.existsSync(path.join(D,'keyword_month.json')),clickedInstances:clicked.length,clicks:clicked.reduce((s,r)=>s+r.click30,0),cost:clicked.reduce((s,r)=>s+r.cost30,0),tiers:{}};for(const r of rows){const t=summary.tiers[r.tier]||={keywords:0,imp:0,clicks:0,cost:0,zeroImpression:0};t.keywords++;t.imp+=r.imp30;t.clicks+=r.click30;t.cost+=r.cost30;if(!r.imp30)t.zeroImpression++;}save('analysis_summary',summary);console.log(JSON.stringify(summary));console.log('TOP',JSON.stringify(clicked.slice(0,45)));console.log('PRIORITY_CLICKED',JSON.stringify(clicked.filter(r=>r.priority>=3).slice(0,35)));}
if(require.main===module)analyze();module.exports={classify};
