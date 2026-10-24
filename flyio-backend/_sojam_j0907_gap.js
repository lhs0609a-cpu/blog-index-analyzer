// 부족한 것 전수 — ① 막혀 있는 등록 키워드 ② 아예 없는 키워드
const fs=require('fs'),P=n=>require('path').join(__dirname,n);
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const U=JSON.parse(fs.readFileSync(P('_sojam_g0903_unlock.json'),'utf8')).blocked;
const T=JSON.parse(fs.readFileSync(P('_sojam_g0903_tam.json'),'utf8'));
// 9/4에 정한 축별 CPC 상한
const AXDEF=[['묘기증',/묘기증|피부묘기/,6000],['지루성',/지루성|두피염|비듬|두피/,5000],
 ['아토피',/아토피|태열/,6000],['두드러기',/두드러기|담마진|두드레기/,4500],['건선',/건선/,4000],
 ['여드름',/여드름|뾰루지|화농|면포/,2500],['습진',/습진|한포진/,3500],
 ['피부염',/피부염|접촉성|화폐상/,4000],['백반증',/백반증/,70],['다한증',/다한증|땀띠|땀많|한증/,70],
 ['모낭염',/모낭염|종기|봉와직염|절종|옹종/,1500],['무좀',/무좀|백선|칸디다|완선/,1500],
 ['구순염',/구순|구내염|입술|입안|혀|설염/,1500],['탈스',/탈스|스테로이드|리바운드/,1500],
 ['가려움',/가려|간지|소양|양진/,1800]];
const ax=k=>{for(const [n,re] of AXDEF) if(re.test(k)) return n; return '기타'};
const cap=a=>a==='기타'?3000:(AXDEF.find(x=>x[0]===a)||[,,3000])[2];
// 제품 구매 의도 — 내원으로 안 이어진다
const GOODS=/로션|크림|보습제|비누|세정제|워시|샴푸|린스|화장품|앰플|세럼|에센스|토닉|팩$|마사지기|브러쉬|스프레이|타투|반영구|점빼기|성형|수술|타투|스케일링|스파|관리샵|케어샵|영양제|유산균|패치|올리브영/;

console.log('══ ① 등록돼 있는데 막혀 있는 키워드 (해제만 하면 됨) ══');
const blocked=U.map(k=>({...k,a:ax(k.kw)}))
 .filter(k=>!GOODS.test(k.kw)&&k.b3&&k.b3<=cap(k.a)&&k.c3>0)
 .sort((a,b)=>b.c3-a.c3);
const bt=blocked.reduce((s,k)=>({c:s.c+k.c3,m:s.m+k.cost3,v:s.v+(k.vol||0)}),{c:0,m:0,v:0});
console.log(`대상 ${blocked.length}개 · 월 검색량 ${won(bt.v)} · 3위 진입 시 월클릭 +${Math.round(bt.c)} · 월비용 ${won(bt.m)}원 · CPC ${won(bt.m/bt.c)}원\n`);
console.log('  검색량   진입가   월클릭    월비용   축      사유         키워드');
blocked.slice(0,30).forEach(k=>console.log(
 `  ${won(k.vol).padStart(7)} ${won(k.b3).padStart(7)} ${k.c3.toFixed(1).padStart(7)} ${won(k.cost3).padStart(9)}  ${k.a.padEnd(6)} ${String(k.cause).padEnd(12)} ${k.kw}`));
const byA={};blocked.forEach(k=>{(byA[k.a]||={n:0,c:0,m:0,v:0});byA[k.a].n++;byA[k.a].c+=k.c3;byA[k.a].m+=k.cost3;byA[k.a].v+=k.vol||0;});
console.log('\n  축별 합계');
Object.entries(byA).sort((a,b)=>b[1].c-a[1].c).forEach(([a,v])=>
 console.log(`    ${a.padEnd(7)} ${String(v.n).padStart(3)}개 · 검색 ${won(v.v).padStart(8)} · 월클릭 +${Math.round(v.c).toString().padStart(4)} · ${won(v.m).padStart(9)}원`));

console.log('\n\n══ ② 계정에 아예 없는 키워드 (신규 등록 대상) ══');
const unreg=T.UNREG.list.map(([kw,vol,a0])=>({kw,vol,a:ax(kw),a0}))
 .filter(k=>!GOODS.test(k.kw)).sort((a,b)=>b.vol-a.vol);
const ut=unreg.reduce((s,k)=>s+k.vol,0);
console.log(`대상 ${unreg.length}개 · 월 검색량 ${won(ut)}  (제품·시술 의도 ${T.UNREG.list.length-unreg.length}개 제외)\n`);
console.log('  검색량   축      키워드');
unreg.slice(0,30).forEach(k=>console.log(`  ${won(k.vol).padStart(7)}  ${k.a.padEnd(7)} ${k.kw}`));
const byU={};unreg.forEach(k=>{(byU[k.a]||={n:0,v:0});byU[k.a].n++;byU[k.a].v+=k.vol;});
console.log('\n  축별 합계');
Object.entries(byU).sort((a,b)=>b[1].v-a[1].v).forEach(([a,v])=>
 console.log(`    ${a.padEnd(7)} ${String(v.n).padStart(3)}개 · 검색 ${won(v.v).padStart(8)}`));
