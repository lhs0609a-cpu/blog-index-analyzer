// 라이브 상태가 내가 남긴 흔적으로 전부 설명되는지 본다.
const fs=require('fs'),path=require('path');const D=path.join(__dirname,'reports','kiness_bidreset_20260909');
const after=JSON.parse(fs.readFileSync(path.join(D,'inventory_after.json'),'utf8'));
const am=new Map(after.flatMap(x=>x.keywords).map(k=>[k.nccKeywordId,k.bidAmt]));
const plan=JSON.parse(fs.readFileSync(path.join(D,'plan_vol.json'),'utf8'));  // oldBid = 현재 라이브
const caps=new Map(JSON.parse(fs.readFileSync(path.join(D,'alloc2.json'),'utf8')).caps);
const diff=plan.filter(p=>am.get(p.id)!==p.oldBid);
const overCap=diff.filter(p=>p.oldBid>(caps.get(p.id)??70));
console.log('1차 적용 검증 시점 대비 달라진 키워드',diff.length,'(모니터가 09:33에 366건 조정)');
console.log('그중 티어 상한을 넘는 값',overCap.length);
console.log('예시',JSON.stringify(diff.slice(0,5).map(p=>({kw:p.keyword,검증시점:am.get(p.id),현재:p.oldBid,상한:caps.get(p.id)}))));
