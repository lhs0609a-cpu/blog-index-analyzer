const fs=require('fs'),path=require('path');const {classify}=require('./_haeul_20260909_analyze');
const D=path.join(__dirname,'reports','haeul_intent_20260909'),read=n=>JSON.parse(fs.readFileSync(path.join(D,n+'.json'))),save=(n,x)=>fs.writeFileSync(path.join(D,n+'.json'),JSON.stringify(x));
const rows=read('core_rows'),est=read('core_estimates'),inv=read('core_inventory'),km=new Map(inv.flatMap(x=>x.keywords).map(k=>[k.nccKeywordId,k])),groups=read('groups'),gm=new Map(groups.map(g=>[g.nccAdgroupId,g]));
const excluded=/대학병원|대학|아산병원|삼성병원|세브란스|서울대|부산|대구|대전|광주|울산|제주|창원|청주|전주|천안|울릉|김해|김포|안산|분당|일산|어린이|소아|임산부|임신|유아|청소년|치료제|전문의약품|전문약|병원약|음식|지압|마사지|타이레놀|냉방병|완치율|완치사례|발치|부비동염|비염|대상포진|편도염|식중독|갑자기심한두통|수마트립탄|두통약$|카페|뜻|입원|이비인후과|전문신경과/;
const keywords=[];
for(const r of rows){const cls=classify(r.keyword),g=gm.get(r.gid),k=km.get(r.id);if(!r.enabled||cls.priority<3||excluded.test(r.keyword)||keywords.some(x=>x.keyword===r.keyword))continue;const e=est[r.keyword];if(!e)continue;
 const deviceTargets=(g.targets||[]).find(t=>t.targetTp==='PC_MOBILE_TARGET')?.target;const devices=deviceTargets?.pc===false?['MOBILE']:deviceTargets?.mobile===false?['PC']:['PC','MOBILE'];
 const primary=r.gid==='grp-a001-01-000000049624428';const cap=primary?10000:cls.tier.startsWith('연관')?5000:6000;
 const quoted=Math.max(...devices.map(d=>(e[d]||70)*100/(d==='PC'?(g.pcNetworkBidWeight||100):(g.mobileNetworkBidWeight||100))));
 const floor=cls.priority===4?800:600;
 let bid=Math.max(r.bid,Math.min(cap,Math.ceil(Math.max(floor,quoted*1.05)/10)*10));
 if(r.impCnt>=10&&r.avgRnk>0&&r.avgRnk<=3&&r.bid>=floor)bid=r.bid;
 if(bid<=r.bid)continue;
 keywords.push({id:r.id,gid:r.gid,keyword:r.keyword,tier:cls.tier,before:r.bid,oldBid:k.bidAmt,oldGroup:k.useGroupBidAmt,after:bid,imp7:r.impCnt||0,click7:r.clkCnt||0,rank7:r.avgRnk||0,estimates:e,devices,cap,reason:quoted>cap?'상위3위 추정가가 상한 초과: 단계적 증액':'의도 강도 및 상위3위 추정가 반영'});
}
const campaignBudgets=[{id:'cmp-a001-01-000000009310428',before:18000,after:60000},{id:'cmp-a001-01-000000009798456',before:30000,after:45000},{id:'cmp-a001-01-000000010949342',before:2500,after:15000}].map(p=>({...p,name:read('campaigns').find(c=>c.nccCampaignId===p.id).name}));
const groupBudgets=[{id:'grp-a001-01-000000049624428',before:50000,after:60000},{id:'grp-a001-01-000000054603422',before:6000,after:18000}].map(p=>({...p,name:gm.get(p.id).name}));
const out={createdAt:new Date().toISOString(),customerId:3442423,campaignBudgets,groupBudgets,keywords,previousAccountDailyCap:read('campaigns').reduce((s,c)=>s+c.dailyBudget,0)};out.newAccountDailyCap=out.previousAccountDailyCap+campaignBudgets.reduce((s,c)=>s+c.after-c.before,0);save('change_plan',out);console.log(JSON.stringify({campaignBudgets,groupBudgets,keywords:keywords.length,before:out.previousAccountDailyCap,after:out.newAccountDailyCap}));console.log(JSON.stringify(keywords.map(k=>({keyword:k.keyword,before:k.before,after:k.after,rank:k.rank7}))));
