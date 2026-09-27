const fs=require('fs'),path=require('path');const {req,pool}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_20260922');const CID=441986;
(async()=>{
 const live=JSON.parse(fs.readFileSync(path.join(D,'live.json')));
 const gs=live.groups.filter(g=>/^(07|08|09|10|11|12)_지역_/.test(g.name)&&!g.off);
 const out=[];
 await pool(gs,4,async g=>{
  const ads=await req('GET','/ncc/ads?nccAdgroupId='+g.id,null,CID,4);
  const full=await req('GET','/ncc/adgroups/'+g.id,null,CID,4);
  out.push({id:g.id,name:g.name,ads:(ads||[]).map(a=>({t:a.type,ins:a.inspectStatus,off:a.userLock?1:0})),
            tgts:(full.targets||[]).map(t=>t.targetTp),pcw:full.pcNetworkBidWeight,mw:full.mobileNetworkBidWeight,
            ch:full.nccBusinessChannelId,bid:full.bidAmt,ul:full.userLock?1:0,ext:full.useCntAdRelKwdPlus});
 });
 fs.writeFileSync(path.join(D,'pool_groups.json'),JSON.stringify(out));
 for(const g of out.sort((a,b)=>a.name<b.name?-1:1))
   console.log(g.name, 'ads='+g.ads.length, JSON.stringify(g.ads.map(a=>a.t+':'+a.ins+(a.off?':OFF':''))), 'tgt='+JSON.stringify(g.tgts), 'bid='+g.bid);
})().catch(e=>{console.error(e);process.exitCode=1});
