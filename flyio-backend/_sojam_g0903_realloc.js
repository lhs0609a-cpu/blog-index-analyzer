// 축별 실효율 기반 재배분 — 지금 예산으로 신환 최대화
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const A=JSON.parse(fs.readFileSync(P('_sojam_g0903_audit.json'),'utf8'));
const U=JSON.parse(fs.readFileSync(P('_sojam_g0903_unlock.json'),'utf8')).blocked;
const AX=[['묘기증',/묘기증/],['피부염',/피부염(?!.*지루)|접촉성|화폐상/],['여드름',/여드름|뾰루지|화농/],
 ['아토피',/아토피|태열/],['습진',/습진|한포진/],['지루성',/지루성|두피염|비듬|두피/],
 ['가려움',/가려|간지|소양|양진/],['구순염',/구순|구내염|입술|입안|혀/],
 ['모낭염',/모낭염|종기|봉와직염|절종|옹종/],['무좀',/무좀|백선|칸디다|완선/],
 ['다한증',/다한증|땀띠|땀많|한증/],['백반증',/백반증/],['탈스',/탈스|스테로이드|리바운드/]];
const ax=k=>{for(const [n,re] of AX) if(re.test(k)) return n; return '기타';};
// 상담일지 역산 클릭→신환 (월). '기타피부' 6.1DB/2.1신환을 흔적없는 축에 분배
const EFF={'묘기증':.550,'피부염':.504,'여드름':.087,'아토피':.069,'습진':.062,'지루성':.044,
 '가려움':.020,'구순염':.011,'모낭염':.008,'무좀':.008,'다한증':.008,'백반증':.008,'탈스':.020,'기타':.020};
// 현재 축별 비용·클릭 (33일 → 월)
const cur={};
A.hit33.filter(k=>!k.v&&k.clk>0).forEach(k=>{const a=ax(k.kw);
 (cur[a]||={clk:0,cost:0,n:0});cur[a].clk+=k.clk*30/33;cur[a].cost+=k.cost*30/33;cur[a].n++;});
let TC=0,TK=0,TP=0;
console.log('══ 현재 축별 (월) ══');
console.log('축        키워드   클릭    비용         CPC     클릭→신환  기대신환  신환1명당');
Object.entries(cur).sort((a,b)=>b[1].cost-a[1].cost).forEach(([a,v])=>{
 const e=EFF[a]??.02, p=v.clk*e; TC+=v.cost;TK+=v.clk;TP+=p;
 console.log(`${a.padEnd(8)} ${String(v.n).padStart(5)} ${Math.round(v.clk).toString().padStart(6)} ${won(v.cost).padStart(10)}원 ${won(v.cost/v.clk).padStart(7)}원 ${(e*100).toFixed(1).padStart(8)}% ${p.toFixed(1).padStart(8)}명 ${won(p?v.cost/p:0).padStart(10)}원`);});
console.log(`합계            ${Math.round(TK).toString().padStart(6)} ${won(TC).padStart(10)}원 ${won(TC/TK).padStart(7)}원          ${TP.toFixed(1).padStart(8)}명 ${won(TC/TP).padStart(10)}원`);

// 풀: 현재 + 해제 (축 효율 반영)
const pool=[];
A.hit33.filter(k=>!k.v&&k.clk>0).forEach(k=>{const a=ax(k.kw);
 pool.push({kw:k.kw,src:'현재',a,clk:k.clk*30/33,cost:k.cost*30/33,cpc:k.cost/k.clk});});
U.forEach(k=>{if(!k.b3||!k.c3)return;const a=ax(k.kw);
 pool.push({kw:k.kw,src:'해제',a,clk:k.c3,cost:k.cost3,cpc:k.b3,vol:k.vol,cause:k.cause,id:k.id});});
pool.forEach(p=>{p.e=EFF[p.a]??.02;p.pat=p.clk*p.e;p.cpp=p.pat>0?p.cost/p.pat:1e12;});
pool.sort((a,b)=>a.cpp-b.cpp);
function fill(b){let cost=0,clk=0,pat=0,take=[];
 for(const p of pool){if(cost+p.cost>b)continue;cost+=p.cost;clk+=p.clk;pat+=p.pat;take.push(p);}
 return{cost,clk,pat,take};}
console.log('\n══ 축효율 반영 최적 배분 ══');
console.log('예산        클릭    기대신환   신환1명당    현재대비');
[3500000,4200000,4500000,5000000,6000000].forEach(b=>{const f=fill(b);
 console.log(`${won(b).padStart(10)}원 ${Math.round(f.clk).toString().padStart(6)} ${f.pat.toFixed(1).padStart(8)}명 ${won(f.cost/f.pat).padStart(10)}원 ${(f.pat/TP*100-100>=0?'+':'')+(f.pat/TP*100-100).toFixed(0)}%`);});
const F=fill(4200000);
const byA={};F.take.forEach(p=>{(byA[p.a]||={clk:0,cost:0,pat:0,n:0,cur:0,unl:0});
 const B=byA[p.a];B.clk+=p.clk;B.cost+=p.cost;B.pat+=p.pat;B.n++;p.src==='현재'?B.cur++:B.unl++;});
console.log('\n══ 420만원 최적 배분의 축별 구성 ══');
console.log('축        키워드(현재/해제)  클릭    비용        기대신환   현재대비 비용');
Object.entries(byA).sort((a,b)=>b[1].pat-a[1].pat).forEach(([a,v])=>{
 const c0=(cur[a]||{}).cost||0;
 console.log(`${a.padEnd(8)} ${String(v.n).padStart(4)}(${v.cur}/${v.unl})${' '.repeat(6)} ${Math.round(v.clk).toString().padStart(5)} ${won(v.cost).padStart(10)}원 ${v.pat.toFixed(1).padStart(8)}명  ${(c0?((v.cost/c0-1)*100>=0?'+':'')+((v.cost/c0-1)*100).toFixed(0)+'%':'신규')}`);});
const drop=pool.filter(p=>p.src==='현재'&&!F.take.includes(p));
const dropByA={};drop.forEach(p=>{(dropByA[p.a]||={cost:0,n:0,clk:0});dropByA[p.a].cost+=p.cost;dropByA[p.a].n++;dropByA[p.a].clk+=p.clk;});
console.log(`\n밀려나는 현재 키워드 ${drop.length}개 · 회수 ${won(drop.reduce((s,p)=>s+p.cost,0))}원`);
Object.entries(dropByA).sort((a,b)=>b[1].cost-a[1].cost).slice(0,8).forEach(([a,v])=>
 console.log(`  ${a.padEnd(8)} ${String(v.n).padStart(3)}개 · 클릭 ${Math.round(v.clk).toString().padStart(4)} · ${won(v.cost).padStart(9)}원`));
fs.writeFileSync(P('_sojam_g0903_realloc.json'),JSON.stringify({cur:{clk:TK,cost:TC,pat:TP},
 plan420:{clk:F.clk,cost:F.cost,pat:F.pat,take:F.take.map(p=>({kw:p.kw,src:p.src,a:p.a,cpc:p.cpc,clk:p.clk,cost:p.cost,pat:p.pat,id:p.id,cause:p.cause}))},
 drop:drop.map(p=>({kw:p.kw,a:p.a,cpc:p.cpc,cost:p.cost}))},null,0));
