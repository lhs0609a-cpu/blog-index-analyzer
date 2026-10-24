// 네이버가 측정한 평균 노출순위 (9/2~9/8, 입찰 재설정 이전 상태). 기기별로 나눈다.
const fs=require('fs'),path=require('path');const D=path.join(__dirname,'reports','kiness_bidreset_20260909');
const list=JSON.parse(fs.readFileSync(path.join(D,'region_clinic_measurable.json'),'utf8'));
const ids=new Map(list.map(r=>[r.id,r]));
const agg=new Map();
for(const f of fs.readdirSync(D).filter(x=>/^AD_\d+\.tsv$/.test(x)))
 for(const line of fs.readFileSync(path.join(D,f),'utf8').split('\n')){
  if(!line.trim())continue;const c=line.split('\t');const r=ids.get(c[4]);if(!r)continue;
  const dev=c[8]==='P'?'pc':'mo',imp=+c[9]||0,clk=+c[10]||0,cost=+c[11]||0,rs=+c[12]||0;
  const a=agg.get(c[4])||agg.set(c[4],{pc:{imp:0,rs:0,clk:0,cost:0},mo:{imp:0,rs:0,clk:0,cost:0}}).get(c[4]);
  a[dev].imp+=imp;a[dev].rs+=rs;a[dev].clk+=clk;a[dev].cost+=cost;}
const out=[];
for(const r of list){const a=agg.get(r.id);
 out.push({keyword:r.keyword,vol:r.vol,bid:r.newBid,
  pcRank:a&&a.pc.imp?+(a.pc.rs/a.pc.imp).toFixed(1):null,pcImp:a?a.pc.imp:0,
  moRank:a&&a.mo.imp?+(a.mo.rs/a.mo.imp).toFixed(1):null,moImp:a?a.mo.imp:0,
  clk:a?a.pc.clk+a.mo.clk:0,cost:a?a.pc.cost+a.mo.cost:0});}
fs.writeFileSync(path.join(D,'region_rank_measured.json'),JSON.stringify(out));
const b=(k,f)=>{const o={};for(const x of out){const v=x[k];const g=v===null?'노출없음':v<=1.5?'1위권':v<=2.5?'2위권':v<=3.5?'3위권':v<=5.5?'4~5위':v<=10.5?'6~10위':'10위밖';o[g]=(o[g]||0)+1;}return o;};
console.log('9/2~9/8 네이버 측정 평균노출순위 (재설정 이전)');
console.log('  PC    ',JSON.stringify(b('pcRank')));
console.log('  모바일 ',JSON.stringify(b('moRank')));
console.log('--- 월검색량 상위 25');
console.log('키워드'.padEnd(14),'검색량'.padStart(6),'입찰'.padStart(7),'PC순위'.padStart(7),'PC노출'.padStart(6),'모바일순위'.padStart(9),'모바일노출'.padStart(8));
for(const x of out.sort((a,b)=>(b.vol||0)-(a.vol||0)).slice(0,25))
 console.log(x.keyword.padEnd(14),String(x.vol??'-').padStart(6),String(x.bid).padStart(7),
  String(x.pcRank??'-').padStart(7),String(x.pcImp).padStart(6),String(x.moRank??'-').padStart(9),String(x.moImp).padStart(8));
