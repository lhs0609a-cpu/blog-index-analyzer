const fs=require('fs'),path=require('path');const {req,pool}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_20260921');const CID=441986;
(async()=>{
 const gap=JSON.parse(fs.readFileSync(path.join(D,'gap_A.json')));
 const flat=JSON.parse(fs.readFileSync(path.join(D,'keywords_flat.json')));
 const byId=new Map(flat.map(k=>[k.id,k]));
 const groups=JSON.parse(fs.readFileSync(path.join(D,'groups.json')));
 const gm=new Map(groups.map(g=>[g.nccAdgroupId,g]));
 const camps=JSON.parse(fs.readFileSync(path.join(D,'campaigns.json')));
 const cm=new Map(camps.map(c=>[c.nccCampaignId,c]));
 const rows=[];
 for(const x of gap){
  for(const id of x.ids){const k=byId.get(id);if(!k)continue;const g=gm.get(k.gid),c=cm.get(k.cid);
   rows.push({kw:x.kw,vol:x.v,tier:x.t,bid:k.bid,ugb:k.ugb,st:k.st,rsn:k.rsn,qi:k.qi,
     grp:g?.name,grpLock:g?.userLock,tgt:g?.targets?g.targets.map(t=>t.targetTp).join('|'):'',
     mobileBid:g?.mobileChannelKey?1:0, camp:c?.name, campLock:c?.userLock, gid:k.gid});}
 }
 fs.writeFileSync(path.join(D,'gap_diag.json'),JSON.stringify(rows));
 // group targeting detail
 const gids=[...new Set(rows.map(r=>r.gid))];
 const det=await pool(gids,6,async gid=>{const t=await req('GET','/ncc/adgroups/'+gid+'?fields='+encodeURIComponent(JSON.stringify(['targets'])),null,CID,4);return {gid,t};});
 fs.writeFileSync(path.join(D,'gap_groups.json'),JSON.stringify(det));
 const tm=new Map(det.map(d=>[d.gid,d.t]));
 console.log('키워드\t월볼륨\t입찰\t상태\t그룹\t지역타기팅');
 for(const r of rows){const t=tm.get(r.gid);
  const tg=(t?.targets||[]).filter(x=>x.targetTp==='REGION').length;
  const age=(t?.targets||[]).filter(x=>x.targetTp==='PERIOD'||x.targetTp==='AGE').length;
  console.log([r.kw,r.vol,r.bid,r.st+(r.rsn?'/'+r.rsn:''),r.grp,'REGION:'+tg,'QI'+r.qi].join('\t'));}
})().catch(e=>{console.error(e);process.exitCode=1});
