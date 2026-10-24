// 2026-08-15 ~ 2026-09-09 캠페인별 일별 실적. 프록시 OOM 방지로 하루 1콜·순차·간격을 둔다.
const fs=require('fs'),path=require('path'),assert=require('assert');
const CID=3442423,D0=path.join(__dirname,'reports','haeul_20260910');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(method,p){for(let t=0;t<4;t++){try{
 const r=await fetch('https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:String(CID),method,path:p}),signal:AbortSignal.timeout(45000)});
 const d=await r.json();if(!r.ok||!d.success)throw Error(String(d.error||JSON.stringify(d)).slice(0,300));return d.response;
}catch(e){if(t===3)throw e;await sleep(2500);}}}
(async()=>{
 const camps=JSON.parse(fs.readFileSync(path.join(D0,'campaigns.json'),'utf8'));
 const ids=camps.map(c=>c.nccCampaignId);
 const out=[];
 for(let d=new Date('2026-08-15T00:00:00Z');d<=new Date('2026-09-09T00:00:00Z');d.setUTCDate(d.getUTCDate()+1)){
  const day=d.toISOString().slice(0,10);
  const r=await api('GET','/stats?ids='+encodeURIComponent(ids.join(','))+'&fields='+encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt','ccnt','avgRnk']))+'&timeRange='+encodeURIComponent(JSON.stringify({since:day,until:day})));
  assert(Array.isArray(r.data),'stats shape '+day);
  for(const x of r.data){const c=camps.find(c=>c.nccCampaignId===x.id);out.push({day,cid:x.id,name:c?.name,type:c?.campaignTp,imp:x.impCnt,clk:x.clkCnt,cost:x.salesAmt,conv:x.ccnt,rank:x.avgRnk});}
  const tot=r.data.reduce((s,x)=>({imp:s.imp+x.impCnt,clk:s.clk+x.clkCnt,cost:s.cost+x.salesAmt,conv:s.conv+x.ccnt}),{imp:0,clk:0,cost:0,conv:0});
  console.log(day,'노출',tot.imp,'클릭',tot.clk,'비용',tot.cost,'전환',tot.conv);
  await sleep(700);
 }
 fs.writeFileSync(path.join(D0,'daily_0815_0909.json'),JSON.stringify(out));
 console.log('저장 daily_0815_0909.json 행',out.length);
})().catch(e=>{console.error('ERR',e.message);process.exitCode=1;});
