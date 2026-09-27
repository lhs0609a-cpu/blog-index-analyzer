// 랜딩 URL 변경이 재검수를 유발하는지 시험 — 소진 최소 아토피 순수 그룹 1개
// 목적: 질환별 랜딩 분리가 이번 달 안에 가능한지 판정
// 되돌리기: _sojam_h0904_landing_test_ROLLBACK.json 의 before 값으로 PUT
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const APPLY=process.argv.includes('--apply');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,method='GET',body=null,tries=3){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method,body,customer_id:CID}),
  signal:AbortSignal.timeout(90000)});
 if(r.ok){const d=await r.json();if(d.success)return[true,d.response];return[false,String(d.error||'').slice(0,300)];}
 }catch(e){}await sleep(900);}return[false,'x'];}

(async()=>{
 const S=JSON.parse(fs.readFileSync(P('_sojam_g0903_kwstats.json'),'utf8'));
 const g={};
 S.keywords.forEach(k=>{(g[k.gid]||={n:0,at:0,cost:0,name:k.g});
  const G=g[k.gid];G.n++;if(/아토피|태열/.test(k.kw))G.at++;G.cost+=k.cost33;});
 const cand=Object.entries(g)
  .filter(([id,v])=>v.n>=3&&v.at/v.n>=0.8&&v.cost<30000)
  .sort((a,b)=>a[1].cost-b[1].cost);
 if(!cand.length){console.log('조건에 맞는 시험 그룹 없음');return;}
 const [gid,info]=cand[0];
 console.log(`시험 그룹: ${info.name} · 키워드 ${info.n}개 · 아토피 순도 ${(info.at/info.n*100).toFixed(0)}% · 33일 소진 ${info.cost}원`);
 const [o,ads]=await raw(`/ncc/ads?nccAdgroupId=${gid}`);
 if(!o){console.log('소재 조회 실패:',ads);return;}
 const ad=(ads||[]).find(a=>a.inspectStatus==='APPROVED'&&!a.delFlag);
 if(!ad){console.log('승인된 소재 없음. 상태:',(ads||[]).map(a=>a.inspectStatus).join(', '));return;}
 const b0=(ad.ad||{}).basic||{};
 console.log(`대상 소재 ${ad.nccAdId} · 상태 ${ad.inspectStatus}`);
 console.log('  현재 pc :',JSON.stringify(b0.pc));
 console.log('  현재 mob:',JSON.stringify(b0.mobile));
 if(!APPLY){console.log('\ndry-run — 실제로 바꾸려면 --apply');return;}
 fs.writeFileSync(P('_sojam_h0904_landing_test_ROLLBACK.json'),
  JSON.stringify({at:new Date().toISOString(),gid,nccAdId:ad.nccAdId,before:ad.ad},null,1));
 const b=JSON.parse(JSON.stringify(b0));
 const NEW='https://sojam.co.kr/25';           // 아토피 질환 페이지
 if(b.pc&&typeof b.pc==='object')b.pc.final=NEW;
 if(b.mobile&&typeof b.mobile==='object')b.mobile.final=NEW;
 const bodies=[
  {label:'type+ad',       body:{nccAdId:ad.nccAdId,nccAdgroupId:gid,type:ad.type,ad:{basic:b}}},
  {label:'전체 echo',      body:{...ad,ad:{...ad.ad,basic:b}}},
  {label:'adAttr 포함',    body:{nccAdId:ad.nccAdId,nccAdgroupId:gid,type:ad.type,adAttr:ad.adAttr,ad:{basic:b}}},
 ];
 let o2=false,r2='';
 for(const t of bodies){
  const f=t.label==='전체 echo'?'ad':'ad';
  const [x,e]=await raw(`/ncc/ads/${ad.nccAdId}?fields=${f}`,'PUT',t.body);
  console.log(`  시도[${t.label}] → ${x?'수락':'거부 '+String(e).slice(0,120)}`);
  if(x){o2=true;r2=e;break;}
  await sleep(600);
 }
 console.log('\nURL 변경 요청 →',o2?'수락':'거부: '+r2);
 if(!o2)return;
 for(const w of [3,20,60]){
  await sleep(w*1000);
  const [o3,ads2]=await raw(`/ncc/ads?nccAdgroupId=${gid}`);
  const a2=(ads2||[]).find(x=>x.nccAdId===ad.nccAdId);
  if(!a2)continue;
  const bb=(a2.ad||{}).basic||{};
  console.log(`  +${w}s 상태 ${a2.inspectStatus} · pc ${JSON.stringify(bb.pc)} · mob ${JSON.stringify(bb.mobile)}`);
 }
})();
