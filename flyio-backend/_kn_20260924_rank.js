const fs=require('fs'),path=require('path');const {req,pool}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_20260923');const CID=441986;
const [since,until,out]=process.argv.slice(2);
const F=encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt','avgRnk']));
const T=encodeURIComponent(JSON.stringify({since,until}));
(async()=>{
 const t=JSON.parse(fs.readFileSync(path.join(D,'rank_targets.json')));
 const chunks=[];for(let i=0;i<t.length;i+=50)chunks.push(t.slice(i,i+50));
 console.log(since,'~',until,'| 배치',chunks.length);
 let n=0;const rows=[];
 await pool(chunks,6,async c=>{
  try{const r=await req('GET','/stats?'+c.map(x=>'ids='+x.kid).join('&')+'&fields='+F+'&timeRange='+T,null,CID,4);
   for(const x of (r&&r.data)||[])rows.push(x);}catch(e){}
  if(++n%150===0)console.log(n,'/',chunks.length,'행',rows.length);
 });
 fs.writeFileSync(path.join(D,out),JSON.stringify(rows));
 console.log('완료 행',rows.length);
})().catch(e=>{console.error(e);process.exitCode=1});
