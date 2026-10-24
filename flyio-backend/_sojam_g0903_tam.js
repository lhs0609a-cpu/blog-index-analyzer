// 파워링크 천장 계산 — 내원권 검색량 총량 대비 현재 점유
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const {why}=require('./_sojam_d0828_rule.js');
const {isDerm}=require('./_sojam_e0831_derm.js');
let bare=()=>false;try{const b=require('./_sojam_e0831_bare.js');bare=b.isBare||b.bare||bare;}catch(e){}
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const S=JSON.parse(fs.readFileSync(P('_sojam_g0903_kwstats.json'),'utf8'));
const R2=JSON.parse(fs.readFileSync(P('_sojam_f0901_research2.json'),'utf8')).kw;

// 상담일지 내원율 상위 질환 = 우선 축
const AXIS={
 '아토피':[/아토피|태열/,70.9],'가려움':[/가려|간지|소양|양진/,64.6],
 '지루성':[/지루성|두피염|비듬|두피/,76.5],'습진':[/습진|한포진|주부습진/,61.4],
 '피부염':[/피부염(?!.*지루)|접촉성|화폐상/,60.9],'묘기증':[/묘기증|피부묘기/,88.9],
 '여드름':[/여드름|뾰루지|화농/,85.7],'두드러기':[/두드러기|담마진/,63.0],
 '건선':[/건선/,56.7],'백반증':[/백반증/,60],'모낭염':[/모낭염|종기|봉와직염/,60],
 '무좀':[/무좀|백선|칸디다|완선/,60],'구순염':[/구순|구내염|입술|입안/,60],
 '다한증':[/다한증|땀띠|땀많/,60],'탈스':[/탈스|스테로이드|리바운드/,60]};
const inScope=k=>!why(k)&&!bare(k)&&isDerm(k)&&!/대상포진|사마귀|홍조|검사|진단|예방접종|주사/.test(k);

// 등록 키워드 맵
const reg={};S.keywords.forEach(k=>{const e=reg[k.kw]||(reg[k.kw]={imp:0,clk:0,cost:0,bid:0,lock:true,rnk:0});
 e.imp+=k.imp33;e.clk+=k.clk33;e.cost+=k.cost33;e.bid=Math.max(e.bid,k.bid);
 if(!k.lock&&!k.glock&&!k.clock)e.lock=false; e.rnk=Math.max(e.rnk,k.rnk33||0);});

let T={vol:0,n:0},REG={vol:0,n:0,imp:0,clk:0,cost:0},ON={vol:0,n:0},UNREG={vol:0,n:0,list:[]};
const byAxis={};
for(const kw in R2){
 const v=(R2[kw].pc||0)+(R2[kw].mo||0);
 if(v<100||!inScope(kw))continue;
 let ax=null;for(const a in AXIS)if(AXIS[a][0].test(kw)){ax=a;break;}
 if(!ax)continue;
 T.vol+=v;T.n++;
 (byAxis[ax]||={vol:0,n:0,regVol:0,regN:0,onVol:0,onN:0,imp:0,clk:0,cost:0,unreg:0,unregN:0});
 const B=byAxis[ax];B.vol+=v;B.n++;
 const e=reg[kw];
 if(e){REG.vol+=v;REG.n++;REG.imp+=e.imp;REG.clk+=e.clk;REG.cost+=e.cost;
  B.regVol+=v;B.regN++;B.imp+=e.imp;B.clk+=e.clk;B.cost+=e.cost;
  if(!e.lock){ON.vol+=v;ON.n++;B.onVol+=v;B.onN++;}}
 else{UNREG.vol+=v;UNREG.n++;B.unreg+=v;B.unregN++;UNREG.list.push([kw,v,ax]);}
}
console.log('══ 내원권 검색 시장 (월 검색량 100 이상, 주력 15개 축) ══');
console.log(`전체        키워드 ${won(T.n).padStart(6)}개 · 월 검색량 ${won(T.vol).padStart(10)}`);
console.log(`등록됨      키워드 ${won(REG.n).padStart(6)}개 · 월 검색량 ${won(REG.vol).padStart(10)} (${(REG.vol/T.vol*100).toFixed(1)}%)`);
console.log(`  운영중    키워드 ${won(ON.n).padStart(6)}개 · 월 검색량 ${won(ON.vol).padStart(10)} (${(ON.vol/T.vol*100).toFixed(1)}%)`);
console.log(`미등록      키워드 ${won(UNREG.n).padStart(6)}개 · 월 검색량 ${won(UNREG.vol).padStart(10)} (${(UNREG.vol/T.vol*100).toFixed(1)}%)`);
const impShare=REG.imp/(REG.vol*33/30);
console.log(`\n현재 노출   33일 ${won(REG.imp)}회 → 노출 점유율 ${(impShare*100).toFixed(1)}%`);
console.log(`현재 클릭   33일 ${won(REG.clk)}회 · 소진 ${won(REG.cost)}원 · CPC ${won(REG.cost/REG.clk)}원`);

console.log('\n══ 축별 ══');
console.log('축         월검색량     등록%   운영%   33일노출  노출점유  클릭  내원율  미등록 검색량');
Object.entries(byAxis).sort((a,b)=>b[1].vol-a[1].vol).forEach(([a,B])=>{
 const sh=B.imp/(B.regVol*33/30||1);
 console.log(`${a.padEnd(8)} ${won(B.vol).padStart(9)} ${(B.regVol/B.vol*100).toFixed(0).padStart(5)}% ${(B.onVol/B.vol*100).toFixed(0).padStart(6)}% ${won(B.imp).padStart(9)} ${(sh*100).toFixed(1).padStart(7)}% ${String(B.clk).padStart(5)} ${AXIS[a][1].toFixed(1).padStart(6)}% ${won(B.unreg).padStart(10)} (${B.unregN}개)`);
});
console.log('\n══ 미등록 검색량 상위 40 ══');
UNREG.list.sort((a,b)=>b[1]-a[1]).slice(0,40).forEach(([k,v,a])=>console.log(`  ${won(v).padStart(7)}  [${a}]  ${k}`));
fs.writeFileSync(P('_sojam_g0903_tam.json'),JSON.stringify({T,REG,ON,UNREG:{vol:UNREG.vol,n:UNREG.n,list:UNREG.list.slice(0,3000)},byAxis},null,0));
