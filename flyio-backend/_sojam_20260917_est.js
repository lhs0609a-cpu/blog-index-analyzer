// 간절도 60+ 중 안 도는 것들의 5위 추정가 + 전환 시 월 예상비용
const fs=require('fs'),path=require('path');
const {req,sleep}=require('./_sojam_naver');
const D=path.join(__dirname,'../reports/sojam-20260917/');
const J=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const cls=J(D+'on_class.json');
const need=cls.filter(r=>r.nRun===0&&['입찰 바닥','키워드 OFF'].includes(r.fix));
const texts=[...new Set(need.map(r=>r.k))];
(async()=>{
  const F=D+'on_est.json';
  const est=fs.existsSync(F)?J(F):{};
  for(const dev of ['MOBILE','PC'])for(const pos of [3,5]){
    const todo=texts.filter(t=>est[dev+'|'+pos+'|'+t]===undefined);
    if(!todo.length){console.error(dev,pos,'캐시');continue;}
    console.error(dev,pos,'조회',todo.length);
    for(let i=0;i<todo.length;i+=100){
      try{const r=await req('POST','/estimate/average-position-bid/keyword',{device:dev,items:todo.slice(i,i+100).map(k=>({key:k,position:pos}))},3808925,3);
        for(const e of (r&&r.estimate)||[])est[dev+'|'+pos+'|'+e.keyword]=e.bid;}catch(e){}
      await sleep(220);
    }
    for(const t of todo)if(est[dev+'|'+pos+'|'+t]===undefined)est[dev+'|'+pos+'|'+t]=null;
    fs.writeFileSync(F,JSON.stringify(est));
  }
  // 5위가로 갔을 때 월 예상 비용
  const pfF=D+'on_perf.json';
  const pf=fs.existsSync(pfF)?J(pfF):{};
  const items=[];
  for(const r of need)for(const dev of ['MOBILE','PC']){
    const b=est[dev+'|5|'+r.k]; if(!b||b<70)continue;
    const key=dev+'|p5|'+r.k; if(pf[key]===undefined)items.push({key,device:dev,keyword:r.k,bid:Math.min(100000,Math.max(70,Math.round(b/10)*10))});
  }
  console.error('perf 조회',items.length);
  for(let i=0;i<items.length;i+=100){
    const b=items.slice(i,i+100);
    try{const r=await req('POST','/estimate/performance-bulk',{items:b.map(x=>({device:x.device,keywordplus:false,keyword:x.keyword,bid:x.bid}))},3808925,3);
      const o=(r&&r.items)||[];for(let j=0;j<b.length;j++){const x=o[j]||{};pf[b[j].key]={clk:x.clicks??null,cost:x.cost??null,imp:x.impressions??null};}}catch(e){}
    if((i/100)%20===0){fs.writeFileSync(pfF,JSON.stringify(pf));console.error('  perf',i,'/',items.length);}
    await sleep(280);
  }
  fs.writeFileSync(pfF,JSON.stringify(pf));
  const won=n=>Math.round(n||0).toLocaleString('ko-KR');
  let cost=0,clk=0,imp=0,n=0;
  for(const r of need){let c=0,k=0,i2=0,got=false;
    for(const dev of ['MOBILE','PC']){const x=pf[dev+'|p5|'+r.k];if(x){c+=x.cost||0;k+=x.clk||0;i2+=x.imp||0;got=true;}}
    if(got){cost+=c;clk+=k;imp+=i2;n++;}}
  console.log('대상',need.length,'어 · 추정 나온 것',n);
  console.log('전부 5위가로 켰을 때(네이버 추정, 전국): 월 '+won(cost)+'원 (일 '+won(cost/30)+') · 월 클릭 '+won(clk)+' · 월 노출 '+won(imp));
  console.log('5위 추정가 없음:',need.filter(r=>!est['MOBILE|5|'+r.k]).length);
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
