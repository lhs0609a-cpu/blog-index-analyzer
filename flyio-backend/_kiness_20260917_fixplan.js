const fs=require('fs'),path=require('path');const {req,pool}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_20260917');const CID=441986;
// 온스코프 + 실수요(월20+) + 7일 노출0 + 입찰 방치. 아동발달센터 축은 진료범위 미확인이라 제외.
const TARGETS=['키센터','성장운동센터','강북구성장클리닉','권선구성장클리닉','팔달구성장클리닉','기흥구성장클리닉',
 '수지성장클리닉추천','동탄성장센터','성장호르몬주사비용','성조숙증검사비용지원','창원성장판검사비용',
 '부천키성장센터','청라키성장클리닉','거제성장클리닉','신도림성장클리닉','전주키성장클리닉','서대문구성장클리닉',
 '고양시성장클리닉','반포키성장클리닉','부천키성장클리닉','성장호르몬주사병원','남아성조숙증검사병원','인천성조숙증병원추천'];
(async()=>{
 const flat=JSON.parse(fs.readFileSync(path.join(D,'keywords_flat.json')));
 const groups=JSON.parse(fs.readFileSync(path.join(D,'groups.json')));const gm=new Map(groups.map(g=>[g.nccAdgroupId,g]));
 const set=new Set(TARGETS);
 const inst=flat.filter(k=>!k.lock&&k.st==='ELIGIBLE'&&set.has(k.kw));
 console.log('대상 인스턴스',inst.length,'고유',new Set(inst.map(i=>i.kw)).size);
 const kws=[...new Set(inst.map(i=>i.kw))];
 const out={};
 for(const dev of ['PC','MOBILE']){
  try{const r=await req('POST','/estimate/exposure-minimum-bid/keyword',{device:dev,period:'MONTH',items:kws},CID,3);
   for(const e of (r.estimate||[])){out[e.keyword]=out[e.keyword]||{};out[e.keyword][dev]=e.bid;}
  }catch(e){console.log('min-bid',dev,'ERR',String(e).slice(0,200));}
 }
 let p1={};
 try{const r=await req('POST','/estimate/average-position-bid/keyword',{device:'PC',items:kws.map(k=>({key:k,position:1}))},CID,3);
  for(const e of (r.estimate||[]))p1[e.keyword]=e.bid;}catch(e){console.log('pos1 ERR',String(e).slice(0,150));}
 console.log('키워드\tPC최소노출\tMO최소노출\tPC1위추정\t현재입찰들');
 for(const k of kws){const bids=inst.filter(i=>i.kw===k).map(i=>i.bid);
  console.log([k,out[k]?.PC??'-',out[k]?.MOBILE??'-',p1[k]??'-',bids.join(',')].join('\t'));}
 fs.writeFileSync(path.join(D,'fix_estimates.json'),JSON.stringify({minBid:out,pos1:p1,inst}));
})().catch(e=>{console.error(e);process.exitCode=1});
