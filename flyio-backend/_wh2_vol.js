// 위례해오름 — 지정 키워드들의 실검색량 조회 (READ-ONLY, /keywordstool, 로컬 키)
const fs=require('fs'),path=require('path');
const {req,pool}=require('./_sojam_naver');
const CID=3808925, OUT=path.join(__dirname,process.argv[3]||'_wh2_vol.json');
const src=JSON.parse(fs.readFileSync(path.join(__dirname,process.argv[2]),'utf8'));
const KWS=[...new Set((Array.isArray(src)?src:Object.keys(src)).map(s=>s.trim()).filter(Boolean))];
const store=fs.existsSync(OUT)?JSON.parse(fs.readFileSync(OUT,'utf8')):{};
const todo=KWS.filter(k=>!(k in store));
console.log(`대상 ${KWS.length} / 미조회 ${todo.length}`);
function num(v){ // "< 10" 은 0 으로. 절대 숫자만 뽑지 않는다.
  if(v==null) return {n:0,lt:false};
  const s=String(v);
  if(s.indexOf('<')>=0) return {n:0,lt:true};
  const d=s.replace(/[^0-9]/g,'');
  return {n:d?parseInt(d,10):0,lt:false};
}
const chunk=(a,n)=>{const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;};
(async()=>{
  const B=chunk(todo,5); let done=0;
  await pool(B,4,async b=>{
    const q=encodeURIComponent(b.join(','));
    let r;
    try{ r=await req('GET',`/keywordstool?hintKeywords=${q}&showDetail=1`,null,CID,3); }catch(e){ r=null; }
    const list=(r&&r.keywordList)||[];
    const byKw={}; for(const k of list) byKw[(k.relKeyword||'').trim()]=k;
    for(const kw of b){
      const k=byKw[kw.replace(/\s+/g,'')]||byKw[kw];
      if(k){ const pc=num(k.monthlyPcQcCnt),mo=num(k.monthlyMobileQcCnt);
        store[kw]={pc:pc.n,mo:mo.n,pcLt:pc.lt,moLt:mo.lt,comp:k.compIdx||'',adCnt:k.plAvgDepth||0}; }
      else store[kw]=null;                  // 조회 자체가 안 되는 어구
    }
    if(++done%100===0){ console.log(`  ${done}/${B.length}`); fs.writeFileSync(OUT,JSON.stringify(store)); }
  });
  fs.writeFileSync(OUT,JSON.stringify(store));
  const ok=Object.values(store).filter(Boolean).length;
  console.log(`저장 ${Object.keys(store).length} (볼륨 확보 ${ok})`);
})();
