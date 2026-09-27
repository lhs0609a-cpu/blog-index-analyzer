// 콘텐츠 매체 제외가 API로 가능한지 시험 (소진 0원 그룹 1개)
// 가설: 1위 CTR 0.24% 는 노출 상당수가 검색이 아닌 콘텐츠 지면이기 때문
// 되돌리기: _sojam_h0904_media_test_ROLLBACK.json
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const APPLY=process.argv.includes('--apply');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,method='GET',body=null,tries=3){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method,body,customer_id:CID}),
  signal:AbortSignal.timeout(90000)});
 if(r.ok){const d=await r.json();if(d.success)return[true,d.response];return[false,String(d.error||'').slice(0,260)];}
 }catch(e){}await sleep(900);}return[false,'x'];}

(async()=>{
 const RB0=JSON.parse(fs.readFileSync(P('_sojam_h0904_landing_test_ROLLBACK.json'),'utf8'));
 const gid=RB0.gid;   // 소진 0원 · 아토피 100% 그룹
 const [o,t]=await raw(`/ncc/adgroups/${gid}/targets`);
 if(!o){console.log('타겟 조회 실패:',t);return;}
 const arr=Array.isArray(t)?t:Object.values(t||{});
 const media=arr.find(x=>x&&x.targetTp==='MEDIA_TARGET');
 console.log('그룹',gid);
 console.log('현재 MEDIA_TARGET:',JSON.stringify(media&&media.target));
 if(!media){console.log('MEDIA_TARGET 없음');return;}
 if(!APPLY){console.log('\ndry-run — 바꾸려면 --apply');return;}
 fs.writeFileSync(P('_sojam_h0904_media_test_ROLLBACK.json'),
  JSON.stringify({at:new Date().toISOString(),gid,before:media},null,1));
 // 검색 매체만 남긴다: type 2 = 지정 매체, contents 비움
 const attempts=[
  {label:'type2 search만', target:{type:2,search:['naver'],contents:[],black:{media:[],mediaGroup:[]},white:{media:null,mediaGroup:null}}},
  {label:'type2 contents null', target:{type:2,search:['naver'],contents:null,black:{media:[],mediaGroup:[]},white:{media:null,mediaGroup:null}}},
  {label:'type3', target:{type:3,search:['naver'],contents:[],black:{media:[],mediaGroup:[]},white:{media:null,mediaGroup:null}}},
 ];
 for(const a of attempts){
  const obj={...media,target:a.target};
  const [ok,e]=await raw(`/ncc/adgroups/${gid}?fields=targetMedia`,'PUT',{nccAdgroupId:gid,targets:[obj]});
  console.log(`시도[${a.label}] → ${ok?'수락':'거부 '+String(e).slice(0,130)}`);
  if(ok){
   await sleep(2500);
   const [o2,t2]=await raw(`/ncc/adgroups/${gid}/targets`);
   const arr2=Array.isArray(t2)?t2:Object.values(t2||{});
   const m2=arr2.find(x=>x&&x.targetTp==='MEDIA_TARGET');
   console.log('  사후 확인:',JSON.stringify(m2&&m2.target));
   const changed=JSON.stringify(m2&&m2.target)!==JSON.stringify(media.target);
   console.log(changed?'  ★ 실제로 반영됨 — 콘텐츠 매체 제외 가능':'  → 200 이지만 반영 안 됨(조용히 무시)');
   if(changed)return;
  }
  await sleep(800);
 }
 console.log('\n결론: 콘텐츠 매체 제외 불가');
})();
