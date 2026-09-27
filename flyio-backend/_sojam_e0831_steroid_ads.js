// 스테로이드 계열 키워드가 든 그룹에 실제 광고 소재가 있는지
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method:'GET',body:null,customer_id:CID}),
  signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(700*(t+1));}return null;}
const won=n=>(n||0).toLocaleString('ko-KR');
const rows=JSON.parse(fs.readFileSync(P('_sojam_e0831_steroid.json'),'utf8'));
const gids=[...new Set(rows.map(r=>r.gid))];
(async()=>{
 console.error(`그룹 ${gids.length}개 소재 조회…`);
 const ads={},grp={};
 let i=0;await Promise.all(Array.from({length:12},async()=>{while(i<gids.length){const g=gids[i++];
  const a=await raw(`/ncc/ads?nccAdgroupId=${g}`);
  ads[g]=Array.isArray(a)?a.filter(x=>!x.delFlag):null;
  const ag=await raw(`/ncc/adgroups?ids=${g}`);
  grp[g]=Array.isArray(ag)?ag[0]:null;}}));
 const byG={};for(const r of rows)(byG[r.gid]||=[]).push(r);
 let noAd=0,okAd=0,pausedAd=0;
 const bad=[];
 console.log('\n그룹                                                 키워드  소재  노출가능소재  캠페인');
 for(const g of gids){
  const A=ads[g],G=grp[g]||{},ks=byG[g]||[];
  const live=(A||[]).filter(x=>x.status==='ELIGIBLE'&&!x.userLock).length;
  const camp=ks[0]?ks[0].camp:'';
  if(A===null){bad.push([g,'조회실패',ks.length,camp]);continue;}
  if(A.length===0){noAd++;bad.push([g,'소재 0개',ks.length,camp]);}
  else if(live===0){pausedAd++;bad.push([g,`소재 ${A.length}개 전부 중지`,ks.length,camp]);}
  else okAd++;
  console.log(`  ${(G.name||g).slice(0,34).padEnd(36)}${String(ks.length).padStart(6)}${String(A.length).padStart(6)}${String(live).padStart(12)}   ${camp.slice(0,26)}`);
 }
 console.log(`\n=== 요약 ===`);
 console.log(`  소재 살아있는 그룹 ${okAd} · 소재 0개 ${noAd} · 소재 전부중지 ${pausedAd} · 조회실패 ${bad.filter(b=>b[1]==='조회실패').length}`);
 const kwNoAd=bad.reduce((s,b)=>s+b[2],0);
 console.log(`  ▶ 소재 문제 그룹에 들어있는 스테로이드 키워드 인스턴스 ${kwNoAd}개 / 전체 ${rows.length}개`);
 if(bad.length){console.log('\n=== 문제 그룹 ===');
  bad.forEach(([g,w,n,c])=>console.log(`  ${w.padEnd(18)} 키워드 ${String(n).padStart(3)}개 · ${c.slice(0,34)} · ${g}`));}
})();
