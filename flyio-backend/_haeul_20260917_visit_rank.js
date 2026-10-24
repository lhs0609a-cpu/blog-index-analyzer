// 내원 가능성 높은 키워드(9/15 실수요 550 + 9/16 신규 S·A 180)의 현재 입찰·상태·실순위.
// 순위는 /stats avgRnk (7일 노출가중). SERP 가 아니라 네이버가 잰 평균 노출순위.
const fs=require('fs'),path=require('path'),assert=require('assert');
const CID=3442423, SINCE='2026-09-10', UNTIL='2026-09-16';
const ROOT=path.join(__dirname,'..');
const D=path.join(__dirname,'reports','haeul_20260917');fs.mkdirSync(D,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const save=(n,x)=>fs.writeFileSync(path.join(D,n+'.json'),JSON.stringify(x));
const has=n=>fs.existsSync(path.join(D,n+'.json'));
const read=n=>JSON.parse(fs.readFileSync(path.join(D,n+'.json'),'utf8'));
const norm=s=>String(s).replace(/\s+/g,'').toLowerCase();
const chunks=(a,n)=>Array.from({length:Math.ceil(a.length/n)},(_,i)=>a.slice(i*n,i*n+n));
async function api(m,p,b=null){for(let t=0;t<4;t++){try{
 const r=await fetch('https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID,
  {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:String(CID),method:m,path:p,body:b}),signal:AbortSignal.timeout(60000)});
 const d=await r.json(); if(!r.ok||!d.success)throw Error('API '+r.status+' '+p.split('?')[0]+' '+String(d.error||d.detail||'').slice(0,200));
 return d.response;}catch(e){if(t===3)throw e;await sleep(3000);}}}
function parseCsv(p){const t=fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/);
 const h=t[0].split(',');return t.slice(1).map(l=>{const v=l.split(',');const o={};h.forEach((k,i)=>o[k]=v[i]);return o;});}
(async()=>{
 // 1) 대상 어휘
 const A=parseCsv(path.join(ROOT,'output','haeul-visit-intent-20260915','내원의도_키워드_20260915.csv'));
 const Bf=fs.readdirSync(path.join(ROOT,'output','haeul-visit-discovery-20260916')).find(f=>f.endsWith('.csv'));
 const B=parseCsv(path.join(ROOT,'output','haeul-visit-discovery-20260916',Bf));
 const want=new Map();
 for(const r of A){const k=norm(r.키워드);if(!want.has(k))want.set(k,{kw:r.키워드,src:'0915',grade:r.등급,vol:+r.월검색||0,sig:r.신호||''});}
 for(const r of B){if(!['S','A'].includes(r.내원등급))continue;const k=norm(r.키워드);
  if(!want.has(k))want.set(k,{kw:r.키워드,src:'0916',grade:r.내원등급,vol:+r.월검색||0,sig:r.신호||'',특성:r.해울특성});}
 console.log('대상 어휘',want.size,'(0915',A.length,'행 /0916 S·A',B.filter(r=>['S','A'].includes(r.내원등급)).length,')');

 // 2) 키워드ID 확보: 9/15 뱅크 kid + 9/16 등록 그룹 전수조회
 let cand;
 if(has('rank_cand'))cand=read('rank_cand');
 else{
  const bankPath='C:/Users/leegu/AppData/Local/Temp/claude/D--developer-blog-index-analyzer/a35fa72c-0379-4cf7-b931-65c42fdccb9e/scratchpad/visit_rows.json';
  const bank=JSON.parse(fs.readFileSync(bankPath,'utf8'));
  const kids=new Set(bank.filter(x=>want.has(norm(x.kw))).map(x=>x.kid));
  console.log('뱅크에서 kid',kids.size,'개');
  // 9/16 등록 그룹 전수
  const ev=fs.readFileSync(path.join(__dirname,'reports','haeul_20260916','register_events.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  const gids=[...new Set(ev.map(e=>e.gid))];
  console.log('9/16 등록 그룹',gids.length,'곳 전수조회');
  const live=[];
  for(const gid of gids){const r=await api('GET','/ncc/keywords?nccAdgroupId='+gid);assert(Array.isArray(r));
   live.push(...r.filter(k=>want.has(norm(k.keyword))));await sleep(500);}
  console.log('그룹조회 매칭',live.length,'개');
  const all=new Map();
  for(const k of live)all.set(k.nccKeywordId,{kid:k.nccKeywordId,gid:k.nccAdgroupId,kw:k.keyword,bid:k.bidAmt,useGroupBid:!!k.useGroupBidAmt,off:!!k.userLock,status:k.status});
  const need=[...kids].filter(id=>!all.has(id));
  console.log('추가 ID 조회',need.length,'개');
  for(const c of chunks(need,20)){const r=await api('GET','/ncc/keywords?ids='+c.join(','));
   for(const k of r)all.set(k.nccKeywordId,{kid:k.nccKeywordId,gid:k.nccAdgroupId,kw:k.keyword,bid:k.bidAmt,useGroupBid:!!k.useGroupBidAmt,off:!!k.userLock,status:k.status});
   await sleep(400);}
  cand=[...all.values()];save('rank_cand',cand);
 }
 console.log('등록 인스턴스',cand.length,'개 / 고유어휘',new Set(cand.map(x=>norm(x.kw))).size);

 // 3) 그룹 정보
 const groups=read('adgroups');const gm=new Map(groups.map(g=>[g.id,g]));
 const camps=read('campaigns');const cm=new Map(camps.map(c=>[c.nccCampaignId,c]));

 // 4) 7일 실적
 let st;
 if(has('rank_stats'))st=read('rank_stats');
 else{st=[];const cs=chunks(cand.map(x=>x.kid),40);
  for(let i=0;i<cs.length;i++){const r=await api('GET','/stats?ids='+encodeURIComponent(cs[i].join(','))
    +'&fields='+encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt','avgRnk','ccnt']))
    +'&timeRange='+encodeURIComponent(JSON.stringify({since:SINCE,until:UNTIL})));
   assert(Array.isArray(r.data));st.push(...r.data);
   if(i%10===0)console.log('  stats',i+1,'/',cs.length);await sleep(900);}
  save('rank_stats',st);}
 const sm=new Map(st.map(x=>[x.id,x]));

 const rows=cand.map(x=>{const s=sm.get(x.kid)||{},g=gm.get(x.gid)||{},w=want.get(norm(x.kw))||{};
  return{키워드:x.kw,등급:w.grade,월검색:w.vol,발굴:w.src,
   캠페인:cm.get(g.cid)?.name||'',그룹:g.name||'',
   입찰가:x.useGroupBid?(g.bidAmt||0):x.bid,그룹입찰:x.useGroupBid?'Y':'',
   상태:x.off?'OFF':(g.userLock?'그룹OFF':'ON'),소재상태:x.status,
   '7일노출':s.impCnt||0,'7일클릭':s.clkCnt||0,'7일비용':s.salesAmt||0,
   평균순위:s.impCnt?s.avgRnk:'',kid:x.kid,gid:x.gid};});
 save('rank_rows',rows);
 const csv=(n,a)=>{const c=Object.keys(a[0]);fs.writeFileSync(path.join(D,n+'.csv'),'\uFEFF'+[c,...a.map(r=>c.map(x=>r[x]??''))].map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n'));};
 csv('내원의도_순위_20260916',rows.sort((a,b)=>b.월검색-a.월검색));
 console.log('\n저장:',path.join(D,'내원의도_순위_20260916.csv'));
 const on=rows.filter(r=>r.상태==='ON');
 const shown=on.filter(r=>r['7일노출']>0);
 console.log('ON',on.length,'/ 7일 노출 있는 것',shown.length,'/ 노출 0',on.length-shown.length);
})().catch(e=>{console.error('ERR',String(e));process.exitCode=1;});
