// 어제 정한 "최저가(70원)" 규칙을 계정 전체 인벤토리에 적용 — 어제는 rebalance 모집단(파워링크 계열)에만 걸렸다.
//   node _sojam_d0828_floor_all.js          (dry-run)
//   node _sojam_d0828_floor_all.js --apply
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const L=n=>JSON.parse(fs.readFileSync(P(n),'utf8'));
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const APPLY=process.argv.includes('--apply');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,method,body,tries=5){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method,body,customer_id:CID}),
  signal:AbortSignal.timeout(180000)});
 if(r.ok){const d=await r.json();if(d.success)return[true,d.response];
  if(/BAD_REQUEST|11001/.test(String(d.error)))return[false,d.error];}}catch(e){}
 await sleep(Math.min(2000*(t+1),12000));}return[false,'retry exhausted'];}

const OUT_OF_SCOPE=['피부과','성형외과','치과','탈모','하지정맥류','여드름','기미','비립종',
 '한관종','보톡스','필러','리프팅','제모','문신','다이어트','난임','비염','축농증',
 '변비','두통','어지럼','당뇨','고혈압','암치료','검정고시','풋살','청소','창업'];
const REGION=['천안','인천','부평','부산','대구','울산','광주','대전','제주','세종','경상','경남','경북',
 '전남','전북','충남','충북','강원','창원','김해','포항','전주','청주','원주','춘천','아산','평택','수원',
 '성남','분당','용인','화성','동탄','안양','광명','부천','일산','고양','파주','김포','시흥','안산','의정부',
 '남양주','하남','과천','군포','오산','노원','강북','도봉','중랑','성북','동대문','광진','성동','용산',
 '마포','서대문','은평','종로','영등포','구로','금천','관악','동작','양천','강서','강동','송파','잠실',
 '천호','목동','신촌','홍대','여의도','왕십리','건대','익산','군산','당진','서산','논산','목포','여수'];
const why=kw=>(kw.includes('두드러기')||kw.includes('건선'))?'두드러기·건선'
 :REGION.some(t=>kw.startsWith(t))?'타지역'
 :OUT_OF_SCOPE.some(t=>kw.includes(t))?'진료범위 밖':null;

const inv=L('_sojam_d0828_inv_hot.json');
const done=new Set(L('_sojam_c0827_rebalance.json').map(r=>r.id)); // 어제 PUT 모집단
const sel=inv.map(r=>({...r,why:why(r.kw)})).filter(r=>r.why);
const hi=sel.filter(r=>r.eff>70);
const won=n=>(n||0).toLocaleString('ko-KR');

console.log(`계정 전체 키워드 인스턴스 ${won(inv.length)}개 · 규칙 대상 ${won(sel.length)}개 (고유 ${won(new Set(sel.map(r=>r.kw)).size)}개)`);
console.log(`그중 아직 70원 초과 = 실제로 내려갈 것 ${won(hi.length)}개 (고유 ${won(new Set(hi.map(r=>r.kw)).size)}개)`);
const newly=hi.filter(r=>!done.has(r.id));
console.log(`  · 어제 모집단 안에 있었는데 아직 높음 ${won(hi.length-newly.length)}개 (적용 실패/되돌아감)`);
console.log(`  · 어제 모집단 밖이라 손도 안 댄 것 ${won(newly.length)}개  ← 이번에 새로 잡히는 것\n`);

const byWhy={};for(const r of hi)(byWhy[r.why]||=[]).push(r);
for(const[w,a]of Object.entries(byWhy))
 console.log(`${w.padEnd(12)} 인스턴스 ${String(a.length).padStart(5)} · 고유 ${String(new Set(a.map(r=>r.kw)).size).padStart(4)} · 입찰가합 ${won(a.reduce((s,r)=>s+r.eff,0)).padStart(10)}원`);

console.log(`\n=== 캠페인별 (내려갈 인스턴스 상위 15) ===`);
const byC={};for(const r of hi)(byC[r.camp]||=[]).push(r);
Object.entries(byC).sort((a,b)=>b[1].length-a[1].length).slice(0,15)
 .forEach(([c,a])=>console.log(`  ${c.slice(0,42).padEnd(44)}${String(a.length).padStart(5)}개 · 최고 ${won(Math.max(...a.map(r=>r.eff))).padStart(7)}원`));

console.log(`\n=== 입찰가 높은 순 상위 40 (고유 키워드) ===`);
const seen=new Set();
for(const r of hi.sort((a,b)=>b.eff-a.eff)){
 if(seen.has(r.kw))continue;seen.add(r.kw);if(seen.size>40)break;
 console.log(`  ${r.kw.slice(0,20).padEnd(22)}${won(r.eff).padStart(8)}원 → 70원  [${r.why}]  ${r.camp.slice(0,26)}`);}

const items=sel.map(r=>({nccKeywordId:r.id,nccAdgroupId:r.gid,bidAmt:70,useGroupBidAmt:false}));
fs.writeFileSync(P('_sojam_d0828_floor_all_plan.json'),JSON.stringify(hi,null,1));
fs.writeFileSync(P('_sojam_d0828_floor_all_ROLLBACK.json'),
 JSON.stringify(Object.fromEntries(sel.map(r=>[r.id,{gid:r.gid,bid:r.bid,ugb:r.ugb,eff:r.eff}]))));
console.log(`\n롤백 스냅샷 ${sel.length}개 저장 · PUT 인스턴스 ${items.length}개`);
if(!APPLY){console.log('\ndry-run — 적용하려면 --apply');process.exit(0);}
(async()=>{let ok=0,bad=0;
 for(let i=0;i<items.length;i+=100){const b=items.slice(i,i+100);
  const[o,e]=await raw('/ncc/keywords?fields=bidAmt','PUT',b);
  if(o)ok+=b.length;else{bad+=b.length;console.log('  실패',String(e).slice(0,90));}
  if((i/100)%10===0)console.log(`  ${i+b.length}/${items.length}`);await sleep(200);}
 console.log(`완료 — 성공 ${ok} / 실패 ${bad}`);})();
