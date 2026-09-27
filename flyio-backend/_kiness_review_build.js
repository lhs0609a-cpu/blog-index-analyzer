// Read-only analytical join. No credentials and no API calls.
const fs=require('fs'),path=require('path'),assert=require('assert');
const {evaluate,CATEGORIES}=require('./_kiness_review_rubric');
const D=path.join(__dirname,'reports','kiness_review_20260908');
const read=n=>JSON.parse(fs.readFileSync(path.join(D,n+'.json'),'utf8'));
const save=(n,v)=>fs.writeFileSync(path.join(D,n+'.json'),JSON.stringify(v));
const meta=read('meta');assert(meta.completedAt,'Wait for census completion');
const inventory=read('inventory'),groups=read('groups'),campaigns=read('campaigns');
const gm=new Map(groups.map(x=>[x.nccAdgroupId,x])),cm=new Map(campaigns.map(x=>[x.nccCampaignId,x]));
const win={};for(const w of ['month','week','today']){const s=read('keyword_'+w),active=new Set(read('group_'+w).filter(x=>x.impCnt>0||x.clkCnt>0||x.salesAmt>0||x.ccnt>0).map(x=>x.id));win[w]={raw:s,by:new Map(s.data.map(x=>[x.id,x])),queried:new Set(s.queriedIds),zero:new Set(groups.filter(g=>g.adgroupType==='WEB_SITE'&&!active.has(g.nccAdgroupId)).map(g=>g.nccAdgroupId))};}
const vols=JSON.parse(fs.readFileSync(path.join(__dirname,'_kiness_20260908_volumes.json'),'utf8')).data;
const estimates=JSON.parse(fs.readFileSync(path.join(__dirname,'_kiness_20260908_estimates.json'),'utf8')).data;
const placements=[],unique=new Map(),seen=new Set(),groupMix=new Map();
for(const item of inventory){
 const g=gm.get(item.gid),c=cm.get(g.nccCampaignId);
 const approved=item.ads.filter(a=>!a.userLock&&!a.delFlag&&a.inspectStatus==='APPROVED');
 for(const k of item.keywords){
  assert(!seen.has(k.nccKeywordId),'Duplicate instance ID');seen.add(k.nccKeywordId);
  let u=unique.get(k.keyword);if(!u){const e=evaluate(k.keyword);u={...e,instances:0,enabled_instances:0,ready_instances:0,eligible_instances:0,pc_bid_min:null,pc_bid_max:null,pc_volume:vols[k.keyword]?.monthlyPcQcCnt??null,mobile_volume:vols[k.keyword]?.monthlyMobileQcCnt??null,pc5_text_estimate_previous:estimates[k.keyword]?.PC5??null,volume_basis:'2026-09-08 기존 조회; 미조회는 공란, <10은 범위값',month_cost:0,month_clicks:0,month_impressions:0,month_conversions:0,week_cost:0,week_clicks:0,week_impressions:0,week_conversions:0,today_cost:0,today_clicks:0,today_impressions:0,today_conversions:0,stats_missing:0,current_pools:new Set(),enabled_groups:[],manual_review:'규칙 기반 전수 평가'};unique.set(k.keyword,u);}
  const enabled=!k.userLock&&!g.userLock&&!c.userLock&&!k.delFlag&&!g.delFlag&&!c.delFlag;
  const ready=enabled&&k.inspectStatus==='APPROVED'&&approved.length>0;
  const eligible=ready&&k.status==='ELIGIBLE'&&g.status==='ELIGIBLE'&&c.status==='ELIGIBLE'&&approved.some(a=>a.status==='ELIGIBLE');
  const bid=k.useGroupBidAmt?g.bidAmt:k.bidAmt,pcBid=Math.round(bid*(g.pcNetworkBidWeight??100)/100);
  const row={keyword:k.keyword,keyword_id:k.nccKeywordId,category:u.category,category_label:u.category_label,priority_score:u.priority_score,geo_zone:u.geo_zone,branch:u.branch,pc5_protected:u.pc5_protected,campaign:c.name,campaign_id:c.nccCampaignId,group:g.name,group_id:g.nccAdgroupId,group_type:g.adgroupType,enabled,ready,eligible,keyword_status:k.status,group_status:g.status,campaign_status:c.status,approved_unlocked_ads:approved.length,pc_landing:[...new Set(approved.map(a=>a.ad?.pc?.final||a.ad?.pc?.landingUrl||'').filter(Boolean))].join(' | '),keyword_bid:bid,pc_weight:g.pcNetworkBidWeight??100,effective_pc_bid:pcBid,group_budget_pool:g.sharedBudgetName||'',campaign_budget_pool:c.sharedBudgetName||'',snapshot_at:item.collectedAt,reason:u.reason,review_flags:u.review_flags};
  u.instances++;u.enabled_instances+=+enabled;u.ready_instances+=+ready;u.eligible_instances+=+eligible;
  if(enabled){u.pc_bid_min=u.pc_bid_min===null?pcBid:Math.min(u.pc_bid_min,pcBid);u.pc_bid_max=Math.max(u.pc_bid_max??0,pcBid);u.current_pools.add(g.sharedBudgetName||'공유예산 없음');u.enabled_groups.push(g.nccAdgroupId);}
  for(const w of Object.keys(win)){const s=win[w],v=s.by.get(k.nccKeywordId);const known=g.adgroupType==='WEB_SITE'&&(v||s.queried.has(k.nccKeywordId)||s.zero.has(item.gid));row[w+'_basis']=known?(v?'키워드 실제 통계':s.queried.has(k.nccKeywordId)?'조회 결과 활동 없음':'광고그룹 활동 없음'):'통계 미확인';
   for(const [out,key] of [['cost','salesAmt'],['clicks','clkCnt'],['impressions','impCnt'],['conversions','ccnt']]){row[w+'_'+out]=known?Number(v?.[key]||0):null;if(known)u[w+'_'+out]+=row[w+'_'+out];}
   u[w+'_known_instances']=(u[w+'_known_instances']||0)+(+!!known);if(!known)u.stats_missing++;row[w+'_cpc']=row[w+'_clicks']?Math.round(row[w+'_cost']/row[w+'_clicks']):null;
  }
  placements.push(row);
  if(!groupMix.has(item.gid))groupMix.set(item.gid,{group:g.name,group_id:g.nccAdgroupId,campaign:c.name,pool:g.sharedBudgetName||'',enabled:!g.userLock&&!c.userLock,categories:{},enabled_categories:{},month_cost:0,week_cost:0,today_cost:0});
  const m=groupMix.get(item.gid);m.categories[u.category]=(m.categories[u.category]||0)+1;if(enabled)m.enabled_categories[u.category]=(m.enabled_categories[u.category]||0)+1;for(const w of Object.keys(win))m[w+'_cost']+=row[w+'_cost']||0;
 }
}
let uniques=[...unique.values()].map(u=>{for(const w of Object.keys(win))if(!u[w+'_known_instances'])for(const f of ['cost','clicks','impressions','conversions'])u[w+'_'+f]=null;return {...u,current_pools:[...u.current_pools].join(' | '),enabled_groups:u.enabled_groups.join(' | '),duplicate_enabled:u.enabled_instances>1,month_cpc:u.month_clicks?Math.round(u.month_cost/u.month_clicks):null,week_cpc:u.week_clicks?Math.round(u.week_cost/u.week_clicks):null};});
// Explicitly record which high-expenditure rows have been reviewed in this session.
const manualFile=path.join(D,'manual_review.json');const manual=fs.existsSync(manualFile)?JSON.parse(fs.readFileSync(manualFile,'utf8')):[];const mm=new Map(manual.map(x=>[x.keyword,x]));
for(const u of uniques)if(mm.has(u.keyword)){u.manual_review='개별 검토: '+mm.get(u.keyword).note;}
const cats={};for(const key of Object.keys(CATEGORIES))cats[key]={category:key,label:CATEGORIES[key],unique:0,instances:0,enabled_unique:0,enabled_instances:0,month_cost:0,week_cost:0,today_cost:0,month_clicks:0,week_clicks:0,today_clicks:0};
for(const u of uniques){const a=cats[u.category];a.unique++;a.instances+=u.instances;a.enabled_unique+=+(u.enabled_instances>0);a.enabled_instances+=u.enabled_instances;for(const w of Object.keys(win)){a[w+'_cost']+=u[w+'_cost'];a[w+'_clicks']+=u[w+'_clicks'];}}
const totals={};for(const w of Object.keys(win)){const cs=read('campaign_'+w),gs=read('group_'+w),webC=new Set(campaigns.filter(c=>c.campaignTp==='WEB_SITE').map(c=>c.nccCampaignId)),webG=new Set(groups.filter(g=>g.adgroupType==='WEB_SITE').map(g=>g.nccAdgroupId));const sum=(a,f)=>a.reduce((s,x)=>s+Number(x[f]||0),0);const kw=placements.filter(x=>x[w+'_cost']!==null);
 totals[w]={range:meta.windows[w],all_campaign_cost:sum(cs,'salesAmt'),website_campaign_cost:sum(cs.filter(x=>webC.has(x.id)),'salesAmt'),website_group_cost:sum(gs.filter(x=>webG.has(x.id)),'salesAmt'),keyword_cost:sum(kw,w+'_cost'),keyword_clicks:sum(kw,w+'_clicks'),keyword_conversions:sum(kw,w+'_conversions'),missing_instances:placements.length-kw.length};totals[w].unattributed_website_cost=totals[w].website_campaign_cost-totals[w].keyword_cost;totals[w].other_campaign_cost=totals[w].all_campaign_cost-totals[w].website_campaign_cost;
}
const daily=Object.entries(read('daily')).map(([date,rows])=>({date,cost:rows.reduce((s,x)=>s+Number(x.salesAmt||0),0),clicks:rows.reduce((s,x)=>s+Number(x.clkCnt||0),0),partial_day:date===meta.today}));
const mixes=[...groupMix.values()].map(m=>({...m,category_count:Object.keys(m.enabled_categories).length,contains_high_and_info:!!((m.enabled_categories.A||m.enabled_categories.B)&&m.enabled_categories.E),categories:JSON.stringify(m.categories),enabled_categories:JSON.stringify(m.enabled_categories)}));
const summary={meta,instances:placements.length,unique:uniques.length,categories:Object.values(cats),enabled_instances:placements.filter(x=>x.enabled).length,ready_instances:placements.filter(x=>x.ready).length,eligible_instances:placements.filter(x=>x.eligible).length,enabled_unique:uniques.filter(x=>x.enabled_instances).length,duplicate_enabled_unique:uniques.filter(x=>x.duplicate_enabled).length,pc5_protected_unique:uniques.filter(x=>x.pc5_protected).length,unknown_unique:cats.J.unique,manual_reviewed_unique:uniques.filter(x=>mm.has(x.keyword)).length,low_confidence_unique:uniques.filter(x=>x.confidence==='낮음').length,mixed_high_info_groups:mixes.filter(x=>x.contains_high_and_info).length,totals,daily,validation:{group_count:inventory.length,expected_group_count:groups.length,unique_keyword_ids:seen.size,classified_instances:placements.length,missing_evaluation:0,score_range_valid:uniques.every(x=>x.priority_score>=0&&x.priority_score<=100),account_mutations_in_this_evaluation:0}};
assert(inventory.length===groups.length);assert(placements.length===seen.size);assert(Object.values(cats).reduce((s,x)=>s+x.instances,0)===placements.length);assert(Object.values(cats).reduce((s,x)=>s+x.unique,0)===uniques.length);
uniques.sort((a,b)=>b.priority_score-a.priority_score||b.week_cost-a.week_cost||b.month_cost-a.month_cost);
save('evaluation_summary',summary);save('evaluation_unique',uniques);save('evaluation_instances',placements);save('evaluation_group_mix',mixes);
console.log(JSON.stringify(summary,null,2));
