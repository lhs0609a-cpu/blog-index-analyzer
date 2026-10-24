// 조합뱅크 부분검증(19,000개)에서 건진 실볼륨 신규어를 같은 그룹 규칙으로 추가 등록.
// 제외: 타지역(강남역 병원 무의미) + 뇌수막염·뇌수막종(응급·신경외과 축 — 해울 운영메모상 확장 금지)
const CID=3442423,fs=require('fs');
const GBID=70;
const KW={
 '01_두통 일반':['머리아프면병원','뒷머리통증병원','후두부통증병원','뇌압병원','뇌압치료','고혈압두통병원','신경과두통명의','머리아플때한의원','서울두통클리닉','성남두통한의원','수원두통한의원','수원두통클리닉','의정부두통병원','영등포두통한의원'],
 '02_긴장성두통':['뒷목통증치료','뒷목찌릿병원','뒷골찌릿병원','뒷골땡김한의원'],
 '03_편두통':['안구편두통치료','서울편두통병원'],
 '06_삼차신경통':['후두신경통명의'],
 '09_소아두통':['아이두통병원'],
};
async function api(m,p,b=null){for(let n=0;n<3;n++)try{
 const r=await fetch('https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID,
  {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:String(CID),method:m,path:p,body:b}),signal:AbortSignal.timeout(60000)});
 const d=await r.json(); if(!r.ok||!d.success)throw Error(String(d.error||'').slice(0,300)); return d.response;
}catch(e){if(n===2)throw e;await new Promise(r=>setTimeout(r,2500));}}
(async()=>{
 const dry=!process.argv.includes('--apply');
 const gs=(await api('GET','/ncc/adgroups?nccCampaignId=cmp-a001-01-000000009310428')).filter(g=>/^해울_0914_/.test(g.name));
 const by={};for(const g of gs)by[g.name.replace(/^해울_0914_/,'')]=g;
 let done=0,bad=0;
 for(const [k,arr] of Object.entries(KW)){
  const g=by[k]; if(!g){console.log('그룹없음 '+k);continue}
  const ads=await api('GET','/ncc/ads?nccAdgroupId='+g.nccAdgroupId);
  if(!ads.some(a=>a.inspectStatus==='APPROVED')){console.log('소재 미승인 — 건너뜀 '+k);continue}
  const live=new Set((await api('GET','/ncc/keywords?nccAdgroupId='+g.nccAdgroupId)).map(x=>x.keyword.toLowerCase()));
  const send=arr.filter(x=>!live.has(x.toLowerCase()));
  console.log(k+': 대상 '+send.length+'개'+(send.length<arr.length?' (중복 '+(arr.length-send.length)+' 제외)':''));
  if(dry||!send.length)continue;
  const r=await api('POST','/ncc/keywords?nccAdgroupId='+g.nccAdgroupId,
    send.map(x=>({keyword:x,bidAmt:GBID,useGroupBidAmt:true,userLock:false})));
  const ok=r.filter(x=>x.nccKeywordId);done+=ok.length;bad+=r.length-ok.length;
  for(const x of r.filter(x=>!x.nccKeywordId))console.log('   거부 '+x.keyword+' '+JSON.stringify(x.resultStatus));
  await new Promise(r=>setTimeout(r,1200));
 }
 console.log(dry?'\n--dry: 등록 안 함':'\n등록 '+done+'개 / 거부 '+bad+'개');
})();
