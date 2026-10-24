// 위례해오름 — 실볼륨 있는 코어 키워드의 순위별 추정입찰가 (READ-ONLY)
const fs=require('fs'),path=require('path');
const {req,pool}=require('./_sojam_naver');
const CID=3808925;
const rows=JSON.parse(fs.readFileSync(path.join(__dirname,'_wh2_core_actionable.json'),'utf8'));
const kws=[...new Set(rows.map(r=>r.kw))];
const out={};
const chunk=(a,n)=>{const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;};
(async()=>{
  for(const dev of ['MOBILE','PC']){
    for(const pos of [1,2,3]){
      const B=chunk(kws,50);
      const res=await pool(B,2,async b=>{
        try{ return await req('POST','/estimate/average-position-bid/keyword',
              {device:dev,items:b.map(k=>({key:k,position:pos}))},CID,3); }catch(e){ return null; }
      });
      for(const r of res) for(const e of ((r&&r.estimate)||[]))
        (out[e.keyword]=out[e.keyword]||{})[`${dev}_${pos}`]=e.bid;
      console.log(`${dev} ${pos}위 완료`);
    }
  }
  fs.writeFileSync(path.join(__dirname,'_wh2_estbid.json'),JSON.stringify(out));
  console.log('추정가 확보',Object.keys(out).length);
})();
