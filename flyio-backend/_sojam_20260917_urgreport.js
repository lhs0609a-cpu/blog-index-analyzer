const fs=require('fs'),path=require('path');
const D16=path.join(__dirname,'../reports/sojam-20260916/'),D17=path.join(__dirname,'../reports/sojam-20260917/');
const J=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const {rows:all}=require('./_urgcore.js');
const bytext=J(D16+'inv/bytext.json');
const day=J(D17+'urg_day16.json'), win=J(D17+'urg_win7.json');
const HI=all.filter(r=>r.score>=40);
const wavg=(regs,src)=>{let s=0,i=0,c=0,cost=0;for(const x of regs){const a=src[x.id];if(!a)continue;i+=a.imp;c+=a.clk;cost+=a.cost;if(a.rank&&a.imp)s+=a.rank*a.imp;}return{rank:i?+(s/i).toFixed(1):null,imp:i,clk:c,cost};};
const rows=HI.map(r=>{
  const regs=bytext[r.k]||[];
  const d=wavg(regs,day), w=wavg(regs,win);
  return{...r,nReg:regs.length,dImp:d.imp,dClk:d.clk,dCost:d.cost,dRank:d.rank,
    wImp:w.imp,wClk:w.clk,wCost:w.cost,wRank:w.rank,
    rank:w.rank!=null?w.rank:null, rankSrc:w.imp>=10?'7일':(w.imp>0?'7일(표본'+w.imp+')':null)};
});
fs.writeFileSync(D17+'urg_rows.json',JSON.stringify(rows));
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const W=s=>{let w=0;for(const c of String(s))w+=/[가-힣ㄱ-ㅎ·]/.test(c)?2:1;return w;};
const pad=(s,n)=>String(s)+' '.repeat(Math.max(0,n-W(s)));const padL=(s,n)=>' '.repeat(Math.max(0,n-W(s)))+String(s);
const sum=(l,f)=>l.reduce((a,r)=>a+(r[f]||0),0);
console.log('=== 간절도 기준(상담일지 기저 내원율 40.5%) 이상 전수 — 검색량 조건 없음 ===');
console.log('키워드 '+rows.length+'개 / 등록 '+rows.reduce((a,r)=>a+r.nReg,0).toLocaleString());
console.log('  볼륨 30+ '+rows.filter(r=>r.vol>=30).length+' · 1~29 '+rows.filter(r=>r.vol>0&&r.vol<30).length+' · 미측정(월 10 미만이거나 도구 미반환) '+rows.filter(r=>!r.vol).length);
const seen=rows.filter(r=>r.wImp>0);
console.log('7일(9/10~16) 한 번이라도 노출된 것 '+seen.length+'개 ('+(100*seen.length/rows.length).toFixed(1)+'%) · 노출 '+won(sum(seen,'wImp'))+' · 클릭 '+sum(seen,'wClk')+' · 소진 '+won(sum(seen,'wCost'))+'원');
console.log('7일 내내 노출 0 '+rows.filter(r=>!r.wImp).length+'개');
console.log('\n[7일 실순위 분포 · 노출 10회 이상만]');
const rel=rows.filter(r=>r.wImp>=10);
for(const [l,h,n] of [[0,2,'1위대'],[2,3,'2위대'],[3,4,'3위대'],[4,5,'4위대'],[5,7,'5~6위'],[7,99,'7위 밖']]){
  const b=rel.filter(r=>r.wRank>=l&&r.wRank<h);
  console.log('  '+pad(n,8)+padL(b.length,5)+'개 · 클릭 '+padL(sum(b,'wClk'),4)+' · 소진 '+padL(won(sum(b,'wCost')),10)+'원');
}
console.log('  '+pad('표본부족',8)+padL(rows.filter(r=>r.wImp>0&&r.wImp<10).length,5)+'개(노출 1~9)');
console.log('  '+pad('노출 0',8)+padL(rows.filter(r=>!r.wImp).length,5)+'개');
const head=(t,list,n)=>{console.log('\n■ '+t+' — '+list.length+'개');
 console.log('  '+pad('키워드',24)+pad('축',13)+padL('월검색',7)+padL('간절',6)+padL('입찰',7)+padL('7일순위',8)+padL('7일노출',8)+padL('클릭',5)+'  신호');
 for(const r of list.slice(0,n||30))console.log('  '+pad(r.k,24)+pad(r.axis,13)+padL(r.vol?won(r.vol):'-',7)+padL(r.score,6)+padL(won(r.bid),7)+padL(r.wRank==null?'-':r.wRank.toFixed(1),8)+padL(won(r.wImp),8)+padL(r.wClk,5)+'  '+r.sig.filter(s=>!s.startsWith('↓')).join('+'));};
const low=rows.filter(r=>!r.vol||r.vol<30);
console.log('\n--- 검색량이 작은(30 미만/미측정) 간절 키워드 '+low.length+'개 ---');
console.log('  7일 노출된 것 '+low.filter(r=>r.wImp>0).length+' · 클릭 '+sum(low,'wClk')+' · 소진 '+won(sum(low,'wCost'))+'원 · 노출 0 '+low.filter(r=>!r.wImp).length);
head('검색량 작지만 실제로 노출·클릭이 붙은 간절 키워드(7일 클릭순)',low.filter(r=>r.wClk>0).sort((a,b)=>b.wCost-a.wCost),40);
head('검색량 작고 노출은 있는데 5위 밖(노출 10+)',low.filter(r=>r.wImp>=10&&r.wRank>4).sort((a,b)=>b.wImp-a.wImp),30);
head('간절도 최상위(≥60)인데 7일 노출 0',rows.filter(r=>r.score>=60&&!r.wImp).sort((a,b)=>(b.vol||0)-(a.vol||0)||b.score-a.score),40);
head('간절도 최상위(≥60)인데 입찰 100원 이하',rows.filter(r=>r.score>=60&&r.nLive>0&&r.bid<=100).sort((a,b)=>(b.vol||0)-(a.vol||0)),30);
const axs={};for(const r of rows){const a=axs[r.axis]=axs[r.axis]||{n:0,imp:0,clk:0,cost:0,zero:0};a.n++;a.imp+=r.wImp;a.clk+=r.wClk;a.cost+=r.wCost;if(!r.wImp)a.zero++;}
console.log('\n[축별 — 7일 9/10~16]');
console.log('  '+pad('축',14)+padL('키워드',7)+padL('노출0',7)+padL('노출',9)+padL('클릭',5)+padL('소진',10));
for(const [k,a] of Object.entries(axs).sort((x,y)=>y[1].cost-x[1].cost))
 console.log('  '+pad(k,14)+padL(a.n,7)+padL(a.zero,7)+padL(won(a.imp),9)+padL(a.clk,5)+padL(won(a.cost),10));
