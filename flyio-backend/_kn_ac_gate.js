const fs=require('fs'),path=require('path');
const D=path.join(__dirname,'reports','kiness_20260922')+path.sep;
const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const PLACE=['맛집','카페','날씨','숙소','아파트','부동산','매매','지도','회','펜션','횟집','주차','근처','가는법','호텔','전세','분양','상가','술집','놀거리','시세','빌라','병원','학원','미용실','해수욕장','시장'];
async function ac(q){
  const u='https://ac.search.naver.com/nx/ac?q='+encodeURIComponent(q)+'&con=0&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&run=2&rev=4&q_enc=UTF-8&st=100';
  for(let t=0;t<3;t++){try{const r=await fetch(u,{headers:{'User-Agent':UA,'Referer':'https://m.search.naver.com/'},signal:AbortSignal.timeout(20000)});
    if(r.ok){const j=await r.json();return (j.items&&j.items[0]||[]).map(x=>x[0]).filter(Boolean);}}catch(e){}
    await sleep(600*(t+1));}
  return [];
}
(async()=>{
 const cand=JSON.parse(fs.readFileSync(D+'colloquial.json','utf8'));
 const res={};
 for(const c of cand){
  const items=await ac(c);
  const hits=items.filter(it=>PLACE.some(p=>it.includes(p)));
  res[c]={n:items.length,hits:hits.length,sample:items.slice(0,4)};
  await sleep(300);
 }
 fs.writeFileSync(D+'colloquial_gate.json',JSON.stringify(res,null,1));
 const pass=Object.keys(res).filter(k=>res[k].hits>=2);
 const fail=Object.keys(res).filter(k=>res[k].hits<2);
 console.log('통과',pass.length); console.log(pass.join(' '));
 console.log('\n탈락',fail.length);
 for(const k of fail) console.log(' ',k,'→',JSON.stringify(res[k].sample));
})().catch(e=>{console.error(e);process.exitCode=1});
