const fs=require('fs'),path=require('path');
const D=path.join(__dirname,'reports','haeul_20260921');
const d=JSON.parse(fs.readFileSync(path.join(D,'day_0921.json'),'utf8'));
const I=require('./_haeul_20260921_intent.js');

const kwById={};for(const r of d.kw_master)kwById[r[0]]={kid:r[0],gid:r[1],kw:r[2],bid:+r[3],lock:+r[4]};
const grp={};for(const g of d.adgroups)grp[g.id]=g;
const cmp={};for(const c of d.campaigns)cmp[c.id]=c;

// 1) campaign level
const cs={};for(const s of d.campaign_stats)cs[s.id]=s;
console.log('=== 9/21 캠페인 ===');
let tc=0,tk=0,ti=0;
for(const c of d.campaigns){const s=cs[c.id]||{};const cost=Math.round(s.salesAmt||0);tc+=cost;tk+=s.clkCnt||0;ti+=s.impCnt||0;
 if((s.impCnt||0)===0&&cost===0)continue;
 console.log([c.name.padEnd(28),String(cost).padStart(7),'원  예산',String(c.budget).padStart(6),(cost/c.budget*100).toFixed(0)+'%','클릭',String(s.clkCnt||0).padStart(3),'노출',String(s.impCnt||0).padStart(6),c.delivery,c.status].join(' '));}
console.log('합계',tc,'원 / 클릭',tk,'/ 노출',ti,' CPC',Math.round(tc/Math.max(tk,1)));

// 2) clicked keywords
const clicked=d.ad_detail.filter(x=>x.clk>0).map(x=>{const k=kwById[x.kid];const g=grp[x.gid];return{...x,kw:k?k.kw:'(비귀속)',bid:k?k.bid:null,gname:g?g.name:'',cname:cmp[x.cid]?cmp[x.cid].name:'',rnk:x.imp?x.rsum/x.imp:0};}).sort((a,b)=>b.cost-a.cost);
console.log('\n=== 9/21 클릭 발생 키워드',clicked.length,'개 ===');
let vcost=0,vclk=0,ncost=0,nclk=0;
const rows=[];
for(const x of clicked){const b=x.kw==='(비귀속)'?{b:'-',visit:0}:I.bucket(x.kw);
 rows.push({kw:x.kw,bucket:b.b,visit:b.visit,clk:x.clk,cost:Math.round(x.cost),cpc:Math.round(x.cost/x.clk),imp:x.imp,rnk:+x.rnk.toFixed(1),bid:x.bid,gname:x.gname,cname:x.cname,kid:x.kid});
 if(b.visit){vcost+=x.cost;vclk+=x.clk}else{ncost+=x.cost;nclk+=x.clk}}
for(const r of rows.slice(0,40))console.log([r.kw.padEnd(20),r.bucket.padEnd(16),'클릭'+String(r.clk).padStart(3),String(r.cost).padStart(7)+'원','CPC'+String(r.cpc).padStart(6),'노출'+String(r.imp).padStart(5),'순위'+String(r.rnk).padStart(5),'입찰'+String(r.bid).padStart(6),r.gname].join(' '));
console.log('...총',rows.length,'행');
console.log('\n내원의도 클릭',vclk,'비용',Math.round(vcost),'|비내원 클릭',nclk,'비용',Math.round(ncost),'|내원비중 클릭',(vclk/(vclk+nclk)*100).toFixed(1)+'% 비용',(vcost/(vcost+ncost)*100).toFixed(1)+'%');
const byB={};for(const r of rows){const t=byB[r.bucket]=byB[r.bucket]||{clk:0,cost:0,n:0};t.clk+=r.clk;t.cost+=r.cost;t.n++;}
console.log('\n=== 버킷별 ===');
for(const [k,v] of Object.entries(byB).sort((a,b)=>b[1].cost-a[1].cost))console.log(k.padEnd(20),String(v.n).padStart(3),'개 클릭',String(v.clk).padStart(3),String(v.cost).padStart(7)+'원',(v.cost/tc*100).toFixed(1)+'%');

// 3) plan applied?
const csv=fs.readFileSync(path.join(D,'개선_입찰계획_20260921.csv'),'utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/);
const plan=csv.slice(1).map(l=>{const c=l.match(/"([^"]*)"/g).map(s=>s.slice(1,-1));return{kid:c[0],kw:c[1],bucket:c[2],cur:+c[3],neo:+c[4]};});
let same=0,applied=0,other=0,missing=0;
for(const p of plan){const k=kwById[p.kid];if(!k){missing++;continue}
 if(k.bid===p.neo&&p.neo!==p.cur)applied++;else if(k.bid===p.cur)same++;else other++;}
console.log('\n=== 9/21 입찰계획 426건 적용여부 ===');
console.log('신입찰과 일치(적용됨)',applied,'/ 현재입찰 그대로(미적용)',same,'/ 제3의값',other,'/ 마스터에 없음',missing);
fs.writeFileSync(path.join(D,'clicked_0921.json'),JSON.stringify(rows,null,0));
