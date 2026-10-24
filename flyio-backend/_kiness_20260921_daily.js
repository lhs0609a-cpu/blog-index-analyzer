const fs=require('fs'),path=require('path');const {req,pool,sleep}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_20260921');fs.mkdirSync(D,{recursive:true});
const CID=441986, DAY='20260920', SINCE='2026-09-20', UNTIL='2026-09-20';
const save=(n,v)=>fs.writeFileSync(path.join(D,n+'.json'),JSON.stringify(v));
const call=async p=>{const r=await req('GET',p,null,CID,4);if(r===undefined)throw Error('Missing '+p);return r;};
(async()=>{
 // 0) 광고주 확인
 const ch=await call('/ncc/channels?channelTp=SITE');save('channels',ch);
 console.log('광고주 CID',CID,'비즈채널',ch.length,'건');
 for(const c of ch) console.log(' CH',c.nccBusinessChannelId,c.name,c.channelKey,c.status);
 // 1) 공유예산 현황
 const sb=await call('/ncc/shared-budgets');save('shared_budgets',sb);
 console.log('SHARED BUDGETS');
 for(const b of sb) console.log([b.sharedBudgetId,b.name,b.dailyBudget,b.deliveryMethod,b.ownerType,'inUse='+b.numberInUse,b.status].join('\t'));
 // 2) 캠페인 단위 어제 실적
 const camps=await call('/ncc/campaigns');save('campaigns',camps);
 const data=[];
 for(let i=0;i<camps.length;i+=50){
  const r=await call('/stats?ids='+encodeURIComponent(camps.slice(i,i+50).map(c=>c.nccCampaignId).join(','))+'&fields='+encodeURIComponent(JSON.stringify(['salesAmt','clkCnt','impCnt','ccnt']))+'&timeRange='+encodeURIComponent(JSON.stringify({since:SINCE,until:UNTIL})));
  if(!Array.isArray(r.data))throw Error('Stats missing');data.push(...r.data);
 }
 const cm=new Map(camps.map(c=>[c.nccCampaignId,c]));
 const rows=data.map(x=>({id:x.id,name:cm.get(x.id)?.name,type:cm.get(x.id)?.campaignTp,sbId:cm.get(x.id)?.sharedBudgetId||null,dailyBudget:cm.get(x.id)?.dailyBudget,lock:cm.get(x.id)?.userLock,cost:x.salesAmt||0,clicks:x.clkCnt||0,imps:x.impCnt||0})).filter(x=>x.cost>0||x.clicks>0||x.imps>0).sort((a,b)=>b.cost-a.cost);
 const tot=rows.reduce((a,x)=>({cost:a.cost+x.cost,clicks:a.clicks+x.clicks,imps:a.imps+x.imps}),{cost:0,clicks:0,imps:0});
 save('campaign_day',{day:DAY,total:tot,rows});
 console.log('\nDAY',DAY,JSON.stringify(tot));
 console.log('비용\t클릭\t노출\t유형\t캠페인');
 console.log(rows.map(r=>`${r.cost}\t${r.clicks}\t${r.imps}\t${r.type}\t${r.name}`).join('\n'));
 // 3) 최근 7일 일별 합계 (추세)
 const byDay=[];
 for(const d of ['2026-09-14','2026-09-15','2026-09-16','2026-09-17','2026-09-18','2026-09-19','2026-09-20']){
  const acc={cost:0,clicks:0,imps:0};
  for(let i=0;i<camps.length;i+=50){
   const r=await call('/stats?ids='+encodeURIComponent(camps.slice(i,i+50).map(c=>c.nccCampaignId).join(','))+'&fields='+encodeURIComponent(JSON.stringify(['salesAmt','clkCnt','impCnt']))+'&timeRange='+encodeURIComponent(JSON.stringify({since:d,until:d})));
   for(const x of r.data||[]){acc.cost+=x.salesAmt||0;acc.clicks+=x.clkCnt||0;acc.imps+=x.impCnt||0;}
  }
  byDay.push({d,...acc});console.log('DAILY',d,acc.cost,acc.clicks,acc.imps);
 }
 save('by_day',byDay);
 // 4) 보고서
 for(const type of ['AD_DETAIL','EXPKEYWORD']){
  let job=await req('POST','/stat-reports',{reportTp:type,statDt:DAY},CID,3);
  if(!job?.reportJobId){console.log(type,'no job',JSON.stringify(job));continue;}
  for(let i=0;i<45;i++){job=await req('GET','/stat-reports/'+job.reportJobId,null,CID,4);if(job.status==='BUILT'||job.status==='NONE')break;if(job.status==='ERROR')throw Error('Report failed '+type);await sleep(2000);}
  if(job.status!=='BUILT'){console.log(type,'status',job.status);continue;}
  const u=new URL(job.downloadUrl);if(u.hostname!=='api.searchad.naver.com')throw Error('bad host');
  const content=await req('GET',u.pathname+u.search,null,CID,4);
  fs.writeFileSync(path.join(D,type+'.tsv'),content);
  console.log(type,'chars',String(content).length);
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
