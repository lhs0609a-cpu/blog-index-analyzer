const fs=require('fs'),path=require('path');const {req,pool}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_20260917');const CID=441986;
const APPLY=process.argv.includes('--apply');
const round10=n=>Math.max(70,Math.round(n/10)*10);
// 범위 밖 — 끈다
const OFF_KW=new Set(['여자뱃살빼는운동','남자산전검사병원']);
// 최소노출가 미달 — 모바일 최소노출가 기준 +15%
const RAISE={'키센터':250,'성장운동센터':1600,'강북구성장클리닉':1330,'팔달구성장클리닉':1210,'기흥구성장클리닉':3900,'전주키성장클리닉':4500};
const RAISE_FLOOR={'전주키성장클리닉':4500};
(async()=>{
 const flat=JSON.parse(fs.readFileSync(path.join(D,'keywords_flat.json')));
 const live=flat.filter(k=>!k.lock&&k.st==='ELIGIBLE');
 const offs=live.filter(k=>OFF_KW.has(k.kw));
 const raises=[];
 for(const k of live){const t=RAISE[k.kw];if(t===undefined)continue;
  const want=round10(t); if(k.bid>=want)continue;
  raises.push({id:k.id,kw:k.kw,gid:k.gid,from:k.bid,to:want});}
 console.log('OFF 대상',offs.length,offs.map(o=>o.kw+'@'+o.bid).join(', '));
 console.log('입찰 상향',raises.length);
 for(const r of raises)console.log('  ',r.kw,r.from,'->',r.to);
 fs.writeFileSync(path.join(D,'apply_backup.json'),JSON.stringify({at:new Date().toISOString(),
  off:offs.map(o=>({id:o.id,kw:o.kw,bid:o.bid,gid:o.gid,userLock:o.lock})),raises}));
 if(!APPLY){console.log('DRY RUN');return;}
 // 1) OFF
 let offOk=0;const offErr=[];
 for(const o of offs){
  try{const r=await req('PUT','/ncc/keywords?fields='+encodeURIComponent('userLock'),[{nccKeywordId:o.id,userLock:true}],CID,3);
   if(Array.isArray(r)&&r[0]?.userLock===true)offOk++;else offErr.push({kw:o.kw,got:JSON.stringify(r).slice(0,150)});
  }catch(e){offErr.push({kw:o.kw,err:String(e).slice(0,180)});}
 }
 console.log('OFF 적용',offOk,'실패',offErr.length);for(const e of offErr)console.log('  ',JSON.stringify(e));
 // 2) 입찰
 let bidOk=0;const bidErr=[];
 for(let i=0;i<raises.length;i+=100){const chunk=raises.slice(i,i+100);
  try{const r=await req('PUT','/ncc/keywords?fields='+encodeURIComponent('bidAmt'),chunk.map(x=>({nccKeywordId:x.id,bidAmt:x.to,useGroupBidAmt:false})),CID,3);
   if(Array.isArray(r))bidOk+=r.filter(x=>x.bidAmt).length;else bidErr.push(JSON.stringify(r).slice(0,200));
  }catch(e){bidErr.push(String(e).slice(0,200));}
 }
 console.log('입찰 적용',bidOk,'실패',bidErr.length);for(const e of bidErr)console.log('  ',e);
 fs.writeFileSync(path.join(D,'applied.json'),JSON.stringify({at:new Date().toISOString(),
  protectedKeywordIds:raises.map(r=>r.id),raises,off:offs.map(o=>o.id),offOk,bidOk}));
})().catch(e=>{console.error(e);process.exitCode=1});
