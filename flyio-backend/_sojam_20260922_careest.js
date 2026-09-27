const fs=require('fs'),path=require('path');
const {req,sleep}=require('./_sojam_naver');
const D=path.join(__dirname,'../reports/');
const C=JSON.parse(fs.readFileSync(D+'sojam-20260922_care.json','utf8'));
const OUT=D+'sojam-20260922_careest.json';
const st=fs.existsSync(OUT)?JSON.parse(fs.readFileSync(OUT,'utf8')):{bid:{},perf:{}};
const save=()=>{fs.writeFileSync(OUT+'.tmp',JSON.stringify(st));fs.renameSync(OUT+'.tmp',OUT);};
const keys=Object.keys(C);
(async()=>{
  for(const pos of [1,3,5]){
    const left=keys.filter(k=>st.bid['M'+pos+'|'+k]===undefined);
    for(let i=0;i<left.length;i+=100){
      const b=left.slice(i,i+100);
      try{const r=await req('POST','/estimate/average-position-bid/keyword',
        {device:'MOBILE',items:b.map(k=>({key:k.replace(/\s+/g,''),position:pos}))},3808925,3);
        const m={};for(const x of (r&&r.estimate)||[])m[x.keyword]=x.bid;
        for(const k of b) st.bid['M'+pos+'|'+k]=m[k.replace(/\s+/g,'')]??null;
      }catch(e){for(const k of b) st.bid['M'+pos+'|'+k]=null;}
      save();await sleep(250);
    }
    console.error('bid',pos,'done');
  }
  for(const pos of [1,3]){
    const need=keys.filter(k=>st.perf[pos+'|'+k]===undefined&&st.bid['M'+pos+'|'+k]);
    for(let i=0;i<need.length;i+=40){
      const b=need.slice(i,i+40);
      try{const r=await req('POST','/estimate/performance-bulk',
        {items:b.map(k=>({device:'MOBILE',keywordplus:false,keyword:k.replace(/\s+/g,''),bid:st.bid['M'+pos+'|'+k]}))},3808925,3);
        const arr=(r&&(r.items||r.estimate))||[];
        arr.forEach((x,j)=>{st.perf[pos+'|'+b[j]]={imp:x.impressions,clk:x.clicks,cost:x.cost};});
      }catch(e){}
      for(const k of b) if(st.perf[pos+'|'+k]===undefined) st.perf[pos+'|'+k]=null;
      save();await sleep(280);
    }
    console.error('perf',pos,'done');
  }
  console.error('완료');
})();
