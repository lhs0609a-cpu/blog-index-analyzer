const fs=require('fs'),path=require('path');const D=path.join(__dirname,'reports','kiness_bidreset_20260909');
const camps=JSON.parse(fs.readFileSync(path.join(D,'campaigns.json'),'utf8'));
const groups=JSON.parse(fs.readFileSync(path.join(D,'groups.json'),'utf8'));
const cm=new Map(camps.map(c=>[c.nccCampaignId,c]));
const cs={};
for(const c of camps){const k=(c.userLock?'lock ':'on   ')+c.campaignTp+' -> '+(c.sharedBudgetName||('자체 '+(c.useDailyBudget?c.dailyBudget:'무제한')));cs[k]=(cs[k]||0)+1;}
console.log('캠페인:');for(const [k,v] of Object.entries(cs).sort())console.log('  ',k,'x'+v);
const act=groups.filter(g=>!g.userLock&&!cm.get(g.nccCampaignId).userLock&&g.adgroupType==='WEB_SITE');
const gs={};
for(const g of act){const k=g.sharedBudgetName||('자체 '+(g.useDailyBudget?g.dailyBudget:'무제한'));gs[k]=(gs[k]||0)+1;}
console.log('활성 WEB_SITE 그룹:');for(const [k,v] of Object.entries(gs).sort())console.log('  ',k,'x'+v);
