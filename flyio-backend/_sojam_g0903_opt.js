// 파워링크 최적 배분 — 예산 제약 하 기대 신환 최대화
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const A=JSON.parse(fs.readFileSync(P('_sojam_g0903_audit.json'),'utf8'));
const U=JSON.parse(fs.readFileSync(P('_sojam_g0903_unlock.json'),'utf8')).blocked;
// 상담일지 축별 내원율
const AX=[['아토피',/아토피|태열/,.709],['지루성',/지루성|두피염|비듬|두피/,.765],
 ['묘기증',/묘기증/,.889],['여드름',/여드름|뾰루지|화농/,.857],
 ['가려움',/가려|간지|소양|양진/,.646],['습진',/습진|한포진/,.614],
 ['피부염',/피부염|접촉성|화폐상/,.609],['구순염',/구순|구내염|입술|입안|혀/,.60],
 ['모낭염',/모낭염|종기|봉와직염/,.60],['무좀',/무좀|백선|칸디다|완선/,.60],
 ['다한증',/다한증|땀띠|땀많|한증/,.60],['백반증',/백반증/,.60],['탈스',/탈스|스테로이드/,.60]];
const AVG=.472; // 전체 DB→내원
const rate=k=>{for(const [n,re,r] of AX) if(re.test(k)) return [n,r]; return ['기타',AVG];};
const CLICK2DB=76/3465; // 8월 클릭당 DB (전 채널 DB 기준 상한)

// 풀 구성
const pool=[];
// (a) 현재 돈 나가는 내원권 키워드 (33일 실측 → 월)
A.hit33.filter(k=>!k.v&&k.clk>0).forEach(k=>{
 const [ax,r]=rate(k.kw);
 pool.push({kw:k.kw,src:'현재',ax,r,clk:k.clk*30/33,cost:k.cost*30/33,cpc:k.cost/k.clk});});
// (b) 막힌 키워드 (3위 진입가 기준)
U.forEach(k=>{ if(!k.b3||!k.c3) return; const [ax,r]=rate(k.kw);
 pool.push({kw:k.kw,src:'해제',ax,r,clk:k.c3,cost:k.cost3,cpc:k.b3,vol:k.vol,cause:k.cause,id:k.id});});
pool.forEach(p=>{p.pat=p.clk*CLICK2DB*p.r; p.cpp=p.pat>0?p.cost/p.pat:1e12;}); // 신환당 비용
pool.sort((a,b)=>a.cpp-b.cpp);

function fill(budget){
 let c=0,cost=0,pat=0,n=0,take=[];
 for(const p of pool){ if(cost+p.cost>budget) continue; cost+=p.cost;c+=p.clk;pat+=p.pat;n++;take.push(p); }
 return {n,c,cost,pat,take};
}
const CUR=pool.filter(p=>p.src==='현재');
const curC=CUR.reduce((s,p)=>s+p.clk,0), curCost=CUR.reduce((s,p)=>s+p.cost,0), curPat=CUR.reduce((s,p)=>s+p.pat,0);
console.log(`현재(파워링크 내원권만): 키워드 ${CUR.length} · 월클릭 ${Math.round(curC)} · 월비용 ${won(curCost)}원 · 기대 신환 ${curPat.toFixed(1)}명`);
console.log(`  ※ 상담일지 실측 월 신환 22.7명(전 채널). 아래 '기대 신환'은 파워링크 기여분 추정치.\n`);
console.log('예산        키워드  월클릭   기대신환  신환1명당    현재대비');
[3500000,4200000,5000000,6000000,7000000,8000000,10000000].forEach(b=>{
 const f=fill(b);
 console.log(`${won(b).padStart(10)}원 ${String(f.n).padStart(5)} ${Math.round(f.c).toString().padStart(7)} ${f.pat.toFixed(1).padStart(9)}명 ${won(f.cost/f.pat).padStart(9)}원 ${(f.pat/curPat*100-100>=0?'+':'')+(f.pat/curPat*100-100).toFixed(0)}%`);});

// 420만원(현행 유지) 상세
const f=fill(4200000);
console.log(`\n══ 예산 420만원(현행) 최적 배분 상세 ══`);
const bySrc={};f.take.forEach(p=>{(bySrc[p.src]||={n:0,c:0,cost:0,pat:0});bySrc[p.src].n++;bySrc[p.src].c+=p.clk;bySrc[p.src].cost+=p.cost;bySrc[p.src].pat+=p.pat;});
Object.entries(bySrc).forEach(([s,v])=>console.log(`  ${s}: 키워드 ${v.n} · 월클릭 ${Math.round(v.c)} · 비용 ${won(v.cost)}원 · 기대신환 ${v.pat.toFixed(1)}명`));
const drop=CUR.filter(p=>!f.take.includes(p)).sort((a,b)=>b.cost-a.cost);
console.log(`\n  예산에서 밀려나는 현재 키워드 ${drop.length}개 (비용 ${won(drop.reduce((s,p)=>s+p.cost,0))}원):`);
drop.slice(0,12).forEach(p=>console.log(`    CPC ${won(p.cpc).padStart(7)}원 · 월클릭 ${p.clk.toFixed(1).padStart(5)} · 신환당 ${won(p.cpp).padStart(9)}원  ${p.kw} [${p.ax}]`));
console.log(`\n  새로 들어오는 해제 키워드 상위 15 (신환당 비용순):`);
f.take.filter(p=>p.src==='해제').slice(0,15).forEach(p=>console.log(
 `    진입가 ${won(p.cpc).padStart(6)}원 · 검색량 ${won(p.vol).padStart(7)} · 월클릭 ${p.clk.toFixed(1).padStart(5)} · 신환당 ${won(p.cpp).padStart(9)}원  ${p.kw} [${p.ax}·${p.cause}]`));
fs.writeFileSync(P('_sojam_g0903_opt.json'),JSON.stringify({cur:{n:CUR.length,c:curC,cost:curCost,pat:curPat},
 plans:[3500000,4200000,5000000,6000000,7000000,8000000,10000000].map(b=>{const x=fill(b);return{budget:b,n:x.n,clicks:x.c,cost:x.cost,patients:x.pat};}),
 take420:f.take.map(p=>({kw:p.kw,src:p.src,ax:p.ax,cpc:p.cpc,clk:p.clk,cost:p.cost,pat:p.pat,id:p.id,cause:p.cause}))},null,0));
