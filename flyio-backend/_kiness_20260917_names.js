const fs=require('fs'),path=require('path');const {req,pool}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_20260917');const CID=441986;
(async()=>{
 const rows=fs.readFileSync(path.join(D,'clicked_keywords_raw.tsv'),'utf8').trim().split('\n').map(l=>l.split('\t'));
 const ids=[...new Set(rows.map(r=>r[0]).filter(x=>x.startsWith('nkw-')))];
 const out={};
 for(let i=0;i<ids.length;i+=50){
  const r=await req('GET','/ncc/keywords?ids='+encodeURIComponent(ids.slice(i,i+50).join(',')),null,CID,4);
  if(!Array.isArray(r))throw Error('bad '+JSON.stringify(r).slice(0,200));
  for(const k of r) out[k.nccKeywordId]={kw:k.keyword,bid:k.bidAmt,useGroupBid:k.useGroupBidAmt,status:k.status,reason:k.statusReason,lock:k.userLock,gid:k.nccAdgroupId,qi:k.qualityIndex};
 }
 const camps=JSON.parse(fs.readFileSync(path.join(D,'campaigns.json')));const cm=new Map(camps.map(c=>[c.nccCampaignId,c.name]));
 const gids=[...new Set(Object.values(out).map(v=>v.gid))];
 const gmap={};
 for(let i=0;i<gids.length;i+=50){const r=await req('GET','/ncc/adgroups?ids='+encodeURIComponent(gids.slice(i,i+50).join(',')),null,CID,4);for(const g of r)gmap[g.nccAdgroupId]=g.name;}
 const lines=rows.map(r=>{const o=out[r[0]]||{};return [o.kw||'(확장검색)',r[1],r[2],r[3],o.bid||'',o.status||'',cm.get(r[4])||r[4],gmap[o.gid]||''].join('\t');});
 fs.writeFileSync(path.join(D,'clicked_keywords.tsv'),'키워드\t클릭\t노출\t비용\t입찰\t상태\t캠페인\t그룹\n'+lines.join('\n'));
 console.log('키워드\t클릭\t노출\t비용\t입찰\t캠페인');
 console.log(lines.join('\n'));
})().catch(e=>{console.error(e);process.exitCode=1});
