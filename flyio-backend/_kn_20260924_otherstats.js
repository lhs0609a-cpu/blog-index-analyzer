const fs=require('fs'),path=require('path');const {req,pool}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_20260923');
const F=encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt']));
const T=encodeURIComponent(JSON.stringify({since:'2026-06-26',until:'2026-09-23'}));
const AX=['키성장클리닉','성장클리닉','키성장','체형교정','자세교정'];
(async()=>{
 const kw=JSON.parse(fs.readFileSync(path.join(D,'inv_real.json')));
 const other=kw.filter(r=>!AX.some(a=>r[2].endsWith(a)));
 const chunks=[];for(let i=0;i<other.length;i+=50)chunks.push(other.slice(i,i+50));
 console.log('대상 인스턴스',other.length,'배치',chunks.length);
 let n=0;const rows=[];
 await pool(chunks,6,async c=>{
  try{const r=await req('GET','/stats?'+c.map(x=>'ids='+x[1]).join('&')+'&fields='+F+'&timeRange='+T,null,441986,4);
   for(const x of (r&&r.data)||[])rows.push(x);}catch(e){}
  if(++n%200===0)console.log(n,'/',chunks.length,'행',rows.length);
 });
 fs.writeFileSync(path.join(D,'other_stats90.json'),JSON.stringify(rows));
 console.log('완료 실적행',rows.length,'(나머지는 90일 노출 0)');
})().catch(e=>{console.error(e);process.exitCode=1});
