const fs=require('fs'),path=require('path');const {req,pool}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_20260921');fs.mkdirSync(D,{recursive:true});const CID=441986;
const save=(n,v)=>fs.writeFileSync(path.join(D,n+'.json'),JSON.stringify(v));
const call=async p=>{const r=await req('GET',p,null,CID,5);if(r===undefined)throw Error('Missing '+p);return r;};
(async()=>{
 const camps=JSON.parse(fs.readFileSync(path.join(D,'campaigns.json')));
 const gb=await pool(camps,6,c=>call('/ncc/adgroups?nccCampaignId='+c.nccCampaignId));
 if(gb.some(x=>!Array.isArray(x)))throw Error('Incomplete groups');
 const groups=gb.flat();save('groups',groups);
 const cm=new Map(camps.map(c=>[c.nccCampaignId,c]));
 // group list API returns status PAUSED for all -> only userLock is usable
 const live=groups.filter(g=>!g.userLock&&!cm.get(g.nccCampaignId).userLock);
 console.log('campaigns',camps.length,'groups',groups.length,'live',live.length);
 let done=0;
 const inv=await pool(live,6,async g=>{const ks=await call('/ncc/keywords?nccAdgroupId='+g.nccAdgroupId);
   if(++done%200===0)console.log('groups done',done,'/',live.length);
   return {gid:g.nccAdgroupId,cid:g.nccCampaignId,keywords:ks};});
 if(inv.some(x=>!Array.isArray(x.keywords)))throw Error('Incomplete inventory');
 const flat=[];
 for(const g of inv) for(const k of g.keywords) flat.push({id:k.nccKeywordId,kw:k.keyword,gid:g.gid,cid:g.cid,bid:k.bidAmt,ugb:k.useGroupBidAmt,lock:k.userLock,st:k.status,rsn:k.statusReason,qi:k.qualityIndex});
 fs.writeFileSync(path.join(D,'keywords_flat.json'),JSON.stringify(flat));
 console.log('keyword instances',flat.length,'unique',new Set(flat.map(x=>x.kw)).size);
})().catch(e=>{console.error(e);process.exitCode=1});
