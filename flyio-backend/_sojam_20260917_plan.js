// 간절도 60+ 전부 켜기 — 계획. 계정 기존 원칙 2개만 가드로 유지한다.
//  ① 원거리 지역 접두는 상한 1,000원 (9/9 재세팅 이후 계속 지켜온 값) — 끄지 않고 켜되 돈을 안 태운다
//  ② 상품·시술 탐색(클렌징·팩·레이저·압출 등)은 진료가 아니라 이전에 중지한 축 — 켜지 않는다
const fs=require('fs'),path=require('path');
const D=path.join(__dirname,'../reports/sojam-20260917/');
const J=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const cls=J(D+'on_class.json'),est=J(D+'on_est.json'),pf=J(D+'on_perf.json');
const FAR=/^(용인|동탄|수원|성남|창원|천안|대전|대구|부산|광주|인천|분당|일산|청주|전주|울산|제주|김해|포항|구미|원주|춘천|평택|화성|안산|안양|부천|의정부|남양주|파주|김포|시흥|광명|군포|이천|세종|목포|여수|순천|진주|양산|경주|아산|서산|공주|익산|군산|강릉|거제|통영|사천|밀양|나주|광양)/;
const PRODUCT=/클렌징|폼클렌|클렌저|바디워시|워시|스크럽|토너|앰플|마스크팩|팩$|비누|샴푸|화장품|화장|레이저|압출|필링|필러|보톡스|아그네스|기기|올리브영|추천템|파데|메이크업|선크림|쿠션|패드|세럼|크림|로션|연고|영양제|음식|약국|약$|약추천|짜는도구|스티커|패치/;
const CAP=10000, CAP_FAR=1000;
const need=cls.filter(r=>r.nRun===0&&['입찰 바닥','키워드 OFF'].includes(r.fix));
const acts=[],held=[];
for(const r of need){
  const t=est['MOBILE|5|'+r.k];
  if(PRODUCT.test(r.k)){held.push({...r,why:'상품·시술 탐색(진료 아님)'});continue;}
  const far=FAR.test(r.k);
  if(!t){held.push({...r,why:'5위 추정가 없음'});continue;}
  const cap=far?CAP_FAR:CAP;
  const target=Math.min(t,cap);
  // 등록 중 가장 나은 하나를 고른다: 소재 있고 그룹·캠페인 살아있는 것 우선
  const cands=r.regs.filter(x=>x.adOk>0&&['키워드 OFF','입찰 바닥',null].includes(x.block));
  const pick=(cands.length?cands:r.regs).sort((a,b)=>b.adOk-a.adOk||b.eff-a.eff)[0];
  if(!pick){held.push({...r,why:'등록 없음'});continue;}
  if(pick.adOk===0){held.push({...r,why:'그룹에 승인 소재 0'});continue;}
  const mw=pick.eff&&pick.bid?pick.eff/(pick.ugb?pick.eff:pick.bid):1;
  const bidAmt=Math.max(70,Math.round(target/(mw||1)/10)*10);
  let c=0,k=0;for(const dev of ['MOBILE','PC']){const x=pf[dev+'|p5|'+r.k];if(x){c+=x.cost||0;k+=x.clk||0;}}
  acts.push({k:r.k,axis:r.axis,score:r.score,vol:r.vol,fix:r.fix,far,id:pick.id,gid:pick.gid,gname:pick.gname,
    fromBid:pick.bid,fromEff:pick.eff,ugb:pick.ugb,target,bidAmt,needOn:r.fix==='키워드 OFF',estCost:far?Math.min(c,c*CAP_FAR/Math.max(t,1)):c,estClk:k});
}
fs.writeFileSync(D+'on_plan.json',JSON.stringify({acts,held}));
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
console.log('실행 대상',acts.length,'· 보류',held.length);
const by={};for(const h of held)by[h.why]=(by[h.why]||0)+1;
console.log('보류 사유:',JSON.stringify(by,null,0));
console.log('  ON 필요',acts.filter(a=>a.needOn).length,'· 입찰만',acts.filter(a=>!a.needOn).length,'· 원거리(1,000원 상한)',acts.filter(a=>a.far).length);
const tot=acts.reduce((a,b)=>({c:a.c+b.estCost,k:a.k+b.estClk}),{c:0,k:0});
console.log('  월 예상비용 '+won(tot.c)+'원 (일 '+won(tot.c/30)+') · 월 클릭 '+won(tot.k));
const ax={};for(const a of acts){const x=ax[a.axis]=ax[a.axis]||{n:0,c:0,vol:0};x.n++;x.c+=a.estCost;x.vol+=a.vol||0;}
console.log('\n축'.padEnd(14)+'개수'.padStart(7)+'월검색'.padStart(9)+'월예상비용'.padStart(12));
for(const [k,v] of Object.entries(ax).sort((a,b)=>b[1].c-a[1].c))console.log(k.padEnd(14)+String(v.n).padStart(7)+won(v.vol).padStart(9)+won(v.c).padStart(12));
console.log('\n보류된 상품·시술어 상위:',held.filter(h=>h.why.startsWith('상품')).sort((a,b)=>(b.vol||0)-(a.vol||0)).slice(0,15).map(h=>h.k).join(', '));
