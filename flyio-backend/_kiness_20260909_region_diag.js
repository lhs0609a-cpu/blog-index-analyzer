const fs=require('fs'),path=require('path');const {req,pool}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_bidreset_20260909');
const rows=JSON.parse(fs.readFileSync(path.join(D,'region_clinic_measurable.json'),'utf8'));
const want=['부산성장클리닉','반포성장클리닉','대구성장클리닉','성장클리닉','목동성장클리닉','강남성장클리닉','수원성장클리닉','창원성장클리닉','일산성장클리닉'];
const pick=want.map(w=>rows.find(r=>r.keyword===w)).filter(Boolean);
(async()=>{
 const gids=[...new Set(pick.map(p=>p.gid))];
 const groups=new Map((await pool(gids,4,g=>req('GET','/ncc/adgroups/'+g,null,441986,4))).map(g=>[g.nccAdgroupId,g]));
 const ads=new Map((await pool(gids,4,async g=>[g,await req('GET','/ncc/ads?nccAdgroupId='+g,null,441986,4)])));
 const kws=new Map();
 for(const g of gids){const list=await req('GET','/ncc/keywords?nccAdgroupId='+g,null,441986,4);
  for(const k of list)kws.set(k.nccKeywordId,k);}
 for(const p of pick){const k=kws.get(p.id),g=groups.get(p.gid),ad=ads.get(p.gid)||[];
  console.log('■',p.keyword,'| 입찰',k?.bidAmt,'| 키워드상태',k?.status,'/',k?.statusReason,'| 잠김',k?.userLock);
  console.log('   그룹',g?.name,'| 상태',g?.status,'/',g?.statusReason,'| 기본입찰',g?.bidAmt,'| PC가중',g?.pcNetworkBidWeight,'모바일가중',g?.mobileNetworkBidWeight);
  console.log('   공유예산',g?.sharedBudgetName,g?.sharedDailyBudget,'| 소재',ad.length,'개 →',ad.map(a=>a.status+(a.userLock?'/잠김':'')+(a.inspectStatus?'/'+a.inspectStatus:'')).join(', '));
  console.log('   채널 PC',g?.pcChannelKey,'| 모바일',g?.mobileChannelKey);
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
