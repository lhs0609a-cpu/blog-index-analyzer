// Q2 — 7일(9/14~20) 클릭이 일어난 것 전수 · 내원가능성 판정
// 판정 3층: ① 원장 제외축(확정 누수) ② 모델상 내원가능성 낮음 ③ 축 미분류(상담일지에 실적이 없어 판정 불가)
const fs=require('fs'),path=require('path');
const D=path.join(__dirname,'../reports/sojam-20260921/');
const J=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const rows=J(D+'rows.json'), P=J(D+'perf.json'), vol=J(D+'vol.json');
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const wlen=s=>{let w=0;for(const c of String(s))w+=/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(c)?2:1;return w;};
const pad=(s,n)=>String(s)+' '.repeat(Math.max(0,n-wlen(s)));
const lpad=(s,n)=>' '.repeat(Math.max(0,n-wlen(s)))+String(s);
const mv=k=>{const v=vol[k];return v?(v.pc+v.mo):null;};
const vs=k=>{const v=mv(k);return v==null?'?':(v===0?'<10':won(v));};

// 최근 3일(9/18~20) = 9/16 인하·9/17 대량 ON 이후의 현재 세팅 구간
const W3=['20260918','20260919','20260920'];
const byId=new Map(P.kagg.map(r=>[r.kid,r]));
for(const r of rows){let c=0,k=0;for(const g of r.regs){const p=byId.get(g.id);if(!p)continue;for(const d of W3){const v=p.days&&p.days[d];if(v){k+=v[1];c+=v[2];}}}r.w3clk=k;r.w3cost=Math.round(c);}
const clicked=rows.filter(r=>r.clk>0).sort((a,b)=>b.cost-a.cost);
const tot=clicked.reduce((a,r)=>({clk:a.clk+r.clk,cost:a.cost+r.cost}),{clk:0,cost:0});

function bucket(r){
  const why=[];
  if(r.brand) return{tier:'ok',why:[]};              // 브랜드어는 판정 대상이 아니다
  if(r.excl.length)                         why.push(['제외','원장 제외축: '+r.excl.join(',')]);
  if(r.far)                                 why.push(['제외','타지역']);
  if(!r.axis)                               why.push(['미분류',r.note&&r.note.length?r.note.join(', '):'축 미분류(상담일지 실적 없음)']);
  if(r.axis&&r.score<40.5)                  why.push(['낮음','간절도 '+r.score+' < 기저 40.5']);
  if(r.info)                                why.push(['낮음','정보형 질의']);
  if(r.prod)                                why.push(['낮음','제품·자가해결']);
  if(!why.length) return{tier:'ok',why:[]};
  const t=why.some(w=>w[0]==='제외')?'제외':(why.some(w=>w[0]==='낮음')?'낮음':'미분류');
  return{tier:t,why:why.map(w=>w[1])};
}
const B={ok:[],'제외':[],'낮음':[],'미분류':[]};
for(const r of clicked){const b=bucket(r);B[b.tier].push({...r,why:b.why});}
const sum=a=>a.reduce((x,r)=>({n:x.n+1,clk:x.clk+r.clk,cost:x.cost+r.cost}),{n:0,clk:0,cost:0});

console.log('■ 7일(2026-09-14~20) 클릭이 난 등록 키워드 '+clicked.length+'개 · 클릭 '+won(tot.clk)+'회 · 비용 '+won(tot.cost)+'원\n');
const order=['ok','제외','낮음','미분류'];
const label={ok:'내원가능성 기준 이상',제외:'① 원장 제외축·타지역 (확정 누수)',낮음:'② 내원가능성 낮음 (간절도·정보형·제품)',미분류:'③ 축 미분류 (판정 불가, 원장 확인 필요)'};
const w3tot=clicked.reduce((a,r)=>a+r.w3cost,0);
for(const t of order){const s=sum(B[t]);const w3=B[t].reduce((a,r)=>a+r.w3cost,0);
  console.log('  '+pad(label[t],40)+lpad(s.n+'개',7)+lpad(won(s.clk),6)+'클릭'+lpad(won(s.cost),11)+'원 ('+(s.cost/tot.cost*100).toFixed(1)+'%)   최근3일 '+lpad(won(w3),9)+'원 ('+(w3tot?w3/w3tot*100:0).toFixed(1)+'%)');}
console.log('');
console.log('  ※ 9/16 무좀·검사축 인하와 9/14 백반증 70원 적용이 이 창 안에서 일어났다 — 7일 합계는 조치 전 지출을 포함한다.');
console.log('  ※ 최근3일(9/18~20) 클릭비용 합계 '+won(w3tot)+'원 = 지금 세팅에서 실제로 나가는 돈.');

for(const t of ['제외','낮음','미분류']){
  const list=B[t].sort((a,b)=>b.cost-a.cost);
  console.log('\n\n■ '+label[t]+' — 비용 순 전수 '+list.length+'개');
  console.log('  '+pad('키워드',26)+pad('축',13)+lpad('클릭',4)+lpad('비용',10)+lpad('CPC',8)+lpad('최근3일',9)+lpad('월검색',8)+lpad('순위',6)+'  사유');
  for(const r of list)
    console.log('  '+pad(r.k,26)+pad(r.axis||'-',13)+lpad(r.clk,4)+lpad(won(r.cost),10)+lpad(won(r.cost/r.clk),8)+lpad(r.w3cost?won(r.w3cost):'-',9)+lpad(vs(r.k),8)+lpad(r.rank==null?'-':(r.rank>50?'>50':r.rank.toFixed(1)),6)+'  '+r.why.join(' / '));
  const by={};for(const r of list){const k=r.why[0];by[k]=by[k]||{n:0,clk:0,cost:0};by[k].n++;by[k].clk+=r.clk;by[k].cost+=r.cost;}
  console.log('  ── 사유별 합계');
  for(const [k,v] of Object.entries(by).sort((a,b)=>b[1].cost-a[1].cost))
    console.log('    '+pad(k,40)+lpad(v.n+'개',6)+lpad(won(v.clk),6)+'클릭'+lpad(won(v.cost),10)+'원');
}

// 실제 검색어(EXPKEYWORD) — 등록어와 다른 질의로 들어온 클릭
const norm=s=>String(s).replace(/\s+/g,'');
const byQuery={};
for(const e of P.exp){ if(!e.clk)continue; const q=norm(e.c4); const d=byQuery[q]=byQuery[q]||{clk:0,cost:0}; d.clk+=e.clk; d.cost+=e.cost; }
const known=new Set(rows.map(r=>r.k));
const qrows=Object.entries(byQuery).map(([q,d])=>({q,...d}));
const qtot=qrows.reduce((a,r)=>({clk:a.clk+r.clk,cost:a.cost+r.cost}),{clk:0,cost:0});
console.log('\n\n■ 실제 검색어(EXPKEYWORD) 클릭 '+won(qtot.clk)+'회 / '+won(qtot.cost)+'원 · 고유 검색어 '+qrows.length+'개');
const unreg=qrows.filter(r=>!known.has(r.q)).sort((a,b)=>b.cost-a.cost);
console.log('  등록어에 없는 질의(확장검색 유입) '+unreg.length+'개 / '+won(unreg.reduce((a,r)=>a+r.cost,0))+'원');
for(const r of unreg)console.log('    '+pad(r.q,30)+lpad(r.clk,3)+'클릭'+lpad(won(r.cost),9)+'원');

fs.writeFileSync(D+'q2.json',JSON.stringify({tot,buckets:Object.fromEntries(order.map(t=>[t,B[t].map(r=>({k:r.k,axis:r.axis,score:r.score,clk:r.clk,cost:r.cost,vol:mv(r.k),rank:r.rank,why:r.why}))])),unreg}));
