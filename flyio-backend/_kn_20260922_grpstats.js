const fs=require('fs'),path=require('path');const {req,pool}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_20260922');const CID=441986;
(async()=>{
 const live=JSON.parse(fs.readFileSync(path.join(D,'live.json')));
 const ids=live.groups.map(g=>g.id);
 const chunks=[];for(let i=0;i<ids.length;i+=50)chunks.push(ids.slice(i,i+50));
 const out={};
 await pool(chunks,6,async c=>{
  const r=await req('GET','/stats?ids='+encodeURIComponent(c.join(','))+'&fields='+encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt']))+'&timeRange='+encodeURIComponent(JSON.stringify({since:'2026-08-23',until:'2026-09-21'})),null,CID,4);
  for(const d of (r.data||[])) out[d.id]={i:d.impCnt||0,c:d.clkCnt||0,s:d.salesAmt||0};
 });
 fs.writeFileSync(path.join(D,'grpstats30.json'),JSON.stringify(out));
 console.log('groups with stats',Object.keys(out).length);
})().catch(e=>{console.error(e);process.exitCode=1});
