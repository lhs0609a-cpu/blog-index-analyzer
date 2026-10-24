// 현재 입찰가로 도달 가능한 노출순위를 네이버 순위별 예상입찰가로 역산한다.
// 실제 검색결과 순위 관측이 아니라 추정가 기준 도달 가능 순위다.
const fs=require('fs'),path=require('path');const {req,pool}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_bidreset_20260909');
const rows=JSON.parse(fs.readFileSync(path.join(D,'region_clinic_measurable.json'),'utf8'));
const POS=[1,2,3,4,5];
(async()=>{
 const jobs=[];
 for(const device of ['PC','MOBILE'])for(const position of POS)
  for(let i=0;i<rows.length;i+=100)jobs.push({device,position,rows:rows.slice(i,i+100)});
 const out=await pool(jobs,5,async j=>({device:j.device,position:j.position,
  data:(await req('POST','/estimate/average-position-bid/id',{device:j.device,items:j.rows.map(x=>({key:x.id,position:j.position}))},441986,4)).estimate}));
 if(out.some(x=>!Array.isArray(x.data)))throw Error('추정가 조회 실패');
 const est={};
 for(const b of out)for(const e of b.data)((est[e.nccKeywordId]=est[e.nccKeywordId]||{})[b.device]=est[e.nccKeywordId][b.device]||{})[b.position]=e.bid;
 fs.writeFileSync(path.join(D,'region_rank_estimates.json'),JSON.stringify(est));
 // 입찰가가 n위 예상입찰가 이상이면 n위 도달 가능으로 본다. 가장 높은(작은) n을 취한다.
 const res=rows.map(r=>{const e=est[r.id]||{};
  const reach=d=>{const t=e[d];if(!t)return null;let best=null;
   for(const p of POS)if(t[p]>0&&r.newBid>=t[p]&&(best===null||p<best))best=p;
   if(best===null){const p5=t[5];return p5>0?'5위밖':null;}return best;};
  return {...r,pc:reach('PC'),mo:reach('MOBILE'),
   pcNeed1:e.PC?.[1]??null,pcNeed3:e.PC?.[3]??null,pcNeed5:e.PC?.[5]??null,
   moNeed1:e.MOBILE?.[1]??null,moNeed3:e.MOBILE?.[3]??null,moNeed5:e.MOBILE?.[5]??null};});
 fs.writeFileSync(path.join(D,'region_rank.json'),JSON.stringify(res));
 const bucket=k=>{const b={};for(const r of res){const v=String(r[k]??'추정불가');b[v]=(b[v]||0)+1;}return b;};
 console.log('대상',res.length,'개');
 console.log('PC     도달 순위 분포',JSON.stringify(bucket('pc')));
 console.log('MOBILE 도달 순위 분포',JSON.stringify(bucket('mo')));
})().catch(e=>{console.error(e);process.exitCode=1;});
