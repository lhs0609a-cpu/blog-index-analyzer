const fs=require('fs'),path=require('path');const {req}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_20260922');const CID=441986;
const APPLY=process.argv.includes('--apply');
const N=parseInt(process.argv[2]||'24',10);
const LOG=path.join(D,'new_groups.jsonl');
(async()=>{
 const live=JSON.parse(fs.readFileSync(path.join(D,'live.json')));
 const pool=live.groups.filter(g=>/^(07|08|09|10|11|12)_지역_/.test(g.name)&&!g.off);
 const camps=[...new Set(pool.map(g=>g.cid))];
 const src=pool.find(g=>g.name==='07_지역_서울_1');
 const tpl=await req('GET','/ncc/adgroups/'+src.id,null,CID,3);
 const ads=await req('GET','/ncc/ads?nccAdgroupId='+src.id,null,CID,3);
 const srcAd=await req('GET','/ncc/ads/'+ads[0].nccAdId,null,CID,3);
 const assets=srcAd.assets.map(a=>({assetType:a.assetType,assetData:a.assetData,linkType:a.linkType,...(a.pin?{pin:a.pin}:{})}));
 console.log('템플릿 그룹',tpl.name,'캠페인',camps.length,'소재 assets',assets.length);
 const done=new Set();
 if(fs.existsSync(LOG)) for(const l of fs.readFileSync(LOG,'utf8').split('\n')) if(l.trim()) done.add(JSON.parse(l).name);
 const want=[];
 for(let i=1;i<=N;i++){const nm='13_지역_확장_'+String(i).padStart(2,'0'); if(!done.has(nm)) want.push({nm,cid:camps[(i-1)%camps.length]});}
 console.log('생성할 그룹',want.length,'APPLY=',APPLY);
 if(!APPLY){console.log(want.slice(0,4)); return;}
 const fd=fs.openSync(LOG,'a');let ok=0;
 for(const w of want){
  const body={nccCampaignId:w.cid,name:w.nm,pcChannelId:tpl.pcChannelId,mobileChannelId:tpl.mobileChannelId,
              bidAmt:tpl.bidAmt,adgroupType:tpl.adgroupType,useDailyBudget:false,
              mobileNetworkBidWeight:100,pcNetworkBidWeight:100,useCntsNetworkBidAmt:false};
  let g;
  try{ g=await req('POST','/ncc/adgroups',body,CID,3); }
  catch(e){ console.log('그룹 실패',w.nm,String(e).slice(0,200)); continue; }
  let adId=null;
  try{
   const a=await req('POST','/ncc/ads?nccAdgroupId='+g.nccAdgroupId,
     {nccAdgroupId:g.nccAdgroupId,type:'RSA_AD',ad:{pc:{final:srcAd.ad.pc.final,display:srcAd.ad.pc.display},
      mobile:{final:srcAd.ad.mobile.final,display:srcAd.ad.mobile.display}},assets},CID,3);
   adId=a.nccAdId;
  }catch(e){ console.log('소재 실패',w.nm,String(e).slice(0,250)); }
  fs.writeSync(fd,JSON.stringify({name:w.nm,gid:g.nccAdgroupId,cid:w.cid,adId})+'\n'); ok++;
  console.log('생성',w.nm,g.nccAdgroupId,adId?'소재OK':'소재없음');
 }
 fs.closeSync(fd); console.log('완료',ok);
})().catch(e=>{console.error(e);process.exitCode=1});
