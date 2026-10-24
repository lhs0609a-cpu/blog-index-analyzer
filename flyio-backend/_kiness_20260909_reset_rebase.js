// 라이브 입찰가를 새 기준선으로 삼는다. 내가 적용한 값 외의 변경이 있으면 드러난다.
const fs=require('fs'),path=require('path'),assert=require('assert');const {req,pool}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_bidreset_20260909');
(async()=>{
 const plan=JSON.parse(fs.readFileSync(path.join(D,'plan_vol.json'),'utf8'));
 const prev=new Map(JSON.parse(fs.readFileSync(path.join(D,'alloc2.json'),'utf8')).bids);
 const gids=[...new Set(plan.map(p=>p.gid))];
 const inv=await pool(gids,6,async gid=>({gid,keywords:await req('GET','/ncc/keywords?nccAdgroupId='+gid,null,441986,4)}));
 assert(inv.every(x=>Array.isArray(x.keywords)),'키워드 조회 실패');
 const km=new Map(inv.flatMap(x=>x.keywords).map(k=>[k.nccKeywordId,k]));
 let missing=0,unexpected=[];
 for(const p of plan){const k=km.get(p.id);
  if(!k){missing++;continue;}
  p.oldBid=k.bidAmt;p.useGroupBid=!!k.useGroupBidAmt;}
 // 라이브 값이 내가 마지막으로 넣은 값과 다른 것은 외부 변경 후보다.
 for(const p of plan){const k=km.get(p.id);if(!k)continue;
  const mine=prev.get(p.id);
  if(mine!==undefined&&k.bidAmt!==mine)unexpected.push({keyword:p.keyword,mine,live:k.bidAmt});}
 fs.writeFileSync(path.join(D,'plan_vol.json'),JSON.stringify(plan));
 fs.writeFileSync(path.join(D,'rebase.json'),JSON.stringify({at:new Date().toISOString(),missing,unexpected:unexpected.length,sample:unexpected.slice(0,10)}));
 console.log('기준선 갱신. 조회 실패',missing,'| 직전 적용값과 다른 키워드',unexpected.length);
 if(unexpected.length)console.log(JSON.stringify(unexpected.slice(0,8)));
})().catch(e=>{console.error(e);process.exitCode=1;});
