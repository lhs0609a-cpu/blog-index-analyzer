const fs=require('fs'),path=require('path');const {req}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_bidreset_20260909');
const rows=JSON.parse(fs.readFileSync(path.join(D,'region_clinic_measurable.json'),'utf8'));
const pick=['대구성장클리닉','잠실성장클리닉','성장클리닉','인천성장클리닉','분당성장클리닉'].map(w=>rows.find(r=>r.keyword===w)).filter(Boolean);
(async()=>{
 const seen=new Set();
 for(const p of pick){
  if(!seen.has(p.gid)){const g=await req('GET','/ncc/adgroups/'+p.gid,null,441986,4);
   console.log('그룹',g.name,'품질지수 관련 필드:',JSON.stringify(Object.fromEntries(Object.entries(g).filter(([k])=>/qual|index|rank|score/i.test(k)))));seen.add(p.gid);}
  const list=await req('GET','/ncc/keywords?nccAdgroupId='+p.gid,null,441986,4);
  const k=list.find(x=>x.nccKeywordId===p.id);
  console.log(p.keyword,'→',JSON.stringify(Object.fromEntries(Object.entries(k).filter(([kk])=>/qual|index|rank|score|bid|status/i.test(kk)))));
 }
})().catch(e=>console.error(String(e)));
