import asyncio,json,sys,logging,math
from pathlib import Path
from datetime import datetime,timezone
from urllib.parse import quote
sys.path.insert(0,'/app');logging.disable(logging.CRITICAL)
from database.naver_ad_db import get_ad_account_by_customer
from services.naver_ad_service import NaverAdApiClient
OUT=Path('/tmp/sojam-campaign-expand-20260909');OUT.mkdir(exist_ok=True)
def save(n,x):(OUT/n).write_text(json.dumps(x,ensure_ascii=False),encoding='utf-8')
async def main():
 a=get_ad_account_by_customer(1,'1858907');c=NaverAdApiClient();c.customer_id='1858907';c.api_key=a['api_key'];c.secret_key=a['secret_key']
 async def get(p):
  await asyncio.sleep(.3)
  return await c._request('GET',p)
 try:
  campaigns=await get('/ncc/campaigns?recordSize=1000');assert isinstance(campaigns,list) and len(campaigns)<1000
  total={k:0 for k in ['salesAmt','clkCnt','impCnt']};metas=[]
  for i in range(0,len(campaigns),50):
   ids=quote(','.join(x['nccCampaignId'] for x in campaigns[i:i+50]))
   s=await get('/stats?ids='+ids+'&fields='+quote(json.dumps(list(total)))+'&timeRange='+quote(json.dumps({'since':'2026-09-09','until':'2026-09-09'})))
   for row in s['data']:
    for k in total:total[k]+=row.get(k,0)
   metas.append({k:s.get(k) for k in ['compTm','cycleBaseTm']})
  spend=dict(at=datetime.now(timezone.utc).isoformat(),total=total,meta=metas);save('spend.json',spend);print('SPEND',json.dumps(spend),flush=True)
  if '--read' in sys.argv:return
  if '--prepare' in sys.argv:
   assert not (OUT/'result.json').exists()
   candidates=json.loads(Path('/tmp/sojam-campaign-input.json').read_text());qualified={};snapshots={};groups={};ads={};keywords={};skipped=[]
   for item in candidates:
    cid=item['id'];ca=next(x for x in campaigns if x['nccCampaignId']==cid)
    if ca['userLock'] or not ca.get('useDailyBudget') or ca.get('campaignTp')!='WEB_SITE':continue
    for sample in item['samples']:
     gid=sample['group_id'];g=await get('/ncc/adgroups/'+gid);ks=await get('/ncc/keywords?ids='+quote(sample['keyword_id']));k=ks[0];ad=await get('/ncc/ads?nccAdgroupId='+gid)
     groups[gid]=g;keywords[k['nccKeywordId']]=k;ads[gid]=ad
     assert k['customerId']==1858907 and k['keyword']==sample['keyword'] and k['nccAdgroupId']==gid and g['nccCampaignId']==cid
     if not g['userLock'] and not k['userLock'] and any(not x.get('userLock') and x.get('inspectStatus')=='APPROVED' for x in ad):
      qualified[cid]=item;break
    if cid not in qualified:skipped.append(cid)
    print('CHECKED',len(qualified),cid,flush=True)
   plan=[]
   for ca in campaigns:
    cid=ca['nccCampaignId']
    if cid not in qualified:continue
    n=qualified[cid]['count'];floor=10000 if n>=100 else 5000 if n>=20 else 2000
    after=max(floor,math.ceil(ca['dailyBudget']*1.5/100)*100)
    overrides={'cmp-a001-01-000000002808841':200000,'cmp-a001-01-000000002783671':50000,'cmp-a001-01-000000010852057':40000,'cmp-a001-01-000000009918300':20000}
    after=overrides.get(cid,after)
    if after>ca['dailyBudget']:plan.append(dict(id=cid,name=ca['name'],before=ca['dailyBudget'],after=after,treatment_count=n))
   before=sum(x['dailyBudget'] for x in campaigns if x.get('useDailyBudget'));after=before+sum(x['after']-x['before'] for x in plan)
   save('before.json',dict(at=datetime.now(timezone.utc).isoformat(),campaigns=campaigns,groups=groups,keywords=keywords,ads=ads))
   save('plan.json',dict(budgets=plan,total_before=before,total_after=after,skipped=skipped))
   print('PLAN',json.dumps(dict(count=len(plan),before=before,after=after,from70=sum(x['before']==70 for x in plan),budgets=plan),ensure_ascii=False),flush=True);return
  assert '--apply' in sys.argv and not (OUT/'result.json').exists()
  before=json.loads((OUT/'before.json').read_text());plan=json.loads((OUT/'plan.json').read_text());assert (datetime.now(timezone.utc)-datetime.fromisoformat(before['at'])).total_seconds()<3600
  result=dict(started=datetime.now(timezone.utc).isoformat(),budgets=[],complete=False);save('result.json',result)
  for b in sorted(plan['budgets'],key=lambda x:x['after'],reverse=True):
   ca=await get('/ncc/campaigns/'+b['id']);old=next(x for x in before['campaigns'] if x['nccCampaignId']==b['id']);assert ca['editTm']==old['editTm'] and ca['dailyBudget']==b['before'] and not ca['userLock'] and ca['useDailyBudget']
   try:await c.update_campaign_budget(b['id'],b['after'],ca)
   except Exception:pass
   ca=await get('/ncc/campaigns/'+b['id']);ok=ca['dailyBudget']==b['after'] and ca['useDailyBudget'] and not ca['userLock'];result['budgets'].append({**b,'verified':ok});save('result.json',result);assert ok
   print('VERIFIED',len(result['budgets']),len(plan['budgets']),flush=True)
  cs=await get('/ncc/campaigns?recordSize=1000');save('campaigns_after.json',cs);result['total_after']=sum(x['dailyBudget'] for x in cs if x.get('useDailyBudget'));assert result['total_after']==plan['total_after'];result['complete']=True;result['finished']=datetime.now(timezone.utc).isoformat();save('result.json',result);print('COMPLETE',len(result['budgets']),result['total_after'],flush=True)
 finally:await c.close()
try:asyncio.run(main())
except Exception as e:print('FAILED',type(e).__name__,flush=True);sys.exit(1)
