// 엑셀에서 열 수 있게 CSV 두 장 (UTF-8 BOM)
const fs=require('fs'),path=require('path');
const D=path.join(__dirname,'../reports/sojam-20260921/');
const J=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const esc=v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
const out=(name,head,rows)=>{fs.writeFileSync(D+name,'﻿'+[head.join(',')].concat(rows.map(r=>r.map(esc).join(','))).join('\r\n'));console.log('  '+name+'  '+rows.length+'행');};

const q1=J(D+'q1.json'), seen=J(D+'q1_seen.json'), q2=J(D+'q2.json');
const cost=Object.fromEntries(J(D+'q1_cost.json').map(r=>[r.k,r]));
const se=J(D+'seen_est.json'), sp=J(D+'seen_perf.json');
out('소잠_내원중요_노출0_20260921.csv',
  ['키워드','축','내원가능성점수','월검색량','7일노출','막는원인','현재최고입찰','3위추정가','5위추정가','3위시_월예상클릭','3위시_월예상비용','등록수','도는등록수','대표그룹'],
  q1.filter(r=>!r.imp).sort((a,b)=>(b.vol||0)-(a.vol||0))
    .map(r=>{const c=cost[r.k]||{};return [r.k,r.axis,r.score,r.vol,r.imp,r.fix,r.bestEff,c.e3,c.e5,c.mClk,c.mCost,r.nReg,r.nRun,r.blocks[0]?r.blocks[0].gname:''];}));
out('소잠_노출되나_4위밖_20260921.csv',
  ['키워드','축','내원가능성점수','월검색량','7일노출','7일클릭','7일비용','실순위','현재최고입찰','3위추정가','3위시_월예상클릭','3위시_월예상비용'],
  seen.map(r=>[r.k,r.axis,r.score,r.vol,r.imp,r.clk,Math.round(r.cost),r.rank,r.bestEff,se['M3|'+r.k],sp[r.k]?sp[r.k].clk:'',sp[r.k]?sp[r.k].cost:'']));
const b=q2.buckets;
out('소잠_클릭_내원가능성낮음_20260921.csv',
  ['구분','키워드','축','내원가능성점수','7일클릭','7일비용','CPC','월검색량','실순위','사유'],
  ['제외','낮음','미분류'].flatMap(t=>b[t].map(r=>[t==='제외'?'①원장제외축·타지역':(t==='낮음'?'②내원가능성낮음':'③축미분류'),
    r.k,r.axis,r.score,r.clk,Math.round(r.cost),Math.round(r.cost/r.clk),r.vol,r.rank,r.why.join(' / ')])));
out('소잠_클릭_기준이상_20260921.csv',
  ['키워드','축','내원가능성점수','7일클릭','7일비용','CPC','월검색량','실순위'],
  b.ok.sort((a,b2)=>b2.cost-a.cost).map(r=>[r.k,r.axis,r.score,r.clk,Math.round(r.cost),Math.round(r.cost/r.clk),r.vol,r.rank]));
