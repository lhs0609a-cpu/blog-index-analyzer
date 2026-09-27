"""Bounded keyword/budget edits, with fresh preflight, full before snapshots and GET verification."""
import asyncio,json,sys,logging,hashlib
from pathlib import Path
from datetime import datetime,timezone
from urllib.parse import quote
sys.path.insert(0,'/app');logging.disable(logging.CRITICAL)
from database.naver_ad_db import get_ad_account_by_customer
from services.naver_ad_service import NaverAdApiClient
CID='1858907';OUT=Path('/tmp/sojam-apply-20260909');OUT.mkdir(exist_ok=True)
def now():return datetime.now(timezone.utc).isoformat()
def save(n,v):(OUT/n).write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf-8')
async def main():
 plan=json.loads((OUT/'plan.json').read_text());actions=plan['keywords'];budgets=plan['budgets']
 digest=hashlib.sha256((OUT/'plan.json').read_bytes()).hexdigest()
 a=get_ad_account_by_customer(1,CID);assert a and str(a['customer_id'])==CID
 c=NaverAdApiClient();c.customer_id=CID;c.api_key=a['api_key'];c.secret_key=a['secret_key']
 async def get(p):await asyncio.sleep(.3);return await c._request('GET',p)
 try:
  if '--preflight' in sys.argv:
   assert len(set(x['keyword_id'] for x in actions))==len(actions)
   all_campaigns=await get('/ncc/campaigns?recordSize=1000')
   assert isinstance(all_campaigns,list) and len(all_campaigns)<1000
   assert sum(x['dailyBudget'] for x in all_campaigns if x.get('useDailyBudget'))==plan['daily_budget_total_before']
   groups={};campaigns={};keywords={};ads={}
   for cid in sorted(set(r['campaign_id'] for r in actions)):
    campaigns[cid]=await get('/ncc/campaigns/'+cid)
    base='';seen=set()
    while True:
     rs=await get('/ncc/adgroups?nccCampaignId='+cid+'&recordSize=1000'+('&baseSearchId='+base if base else ''))
     assert isinstance(rs,list) and not any(g['nccAdgroupId'] in seen for g in rs)
     for g in rs:groups[g['nccAdgroupId']]=g;seen.add(g['nccAdgroupId'])
     if len(rs)<1000:break
     base=rs[-1]['nccAdgroupId']
   checked=set()
   for i,r in enumerate(actions):
    gid=r['group_id'];cid=r['campaign_id']
    if cid not in campaigns:campaigns[cid]=await get('/ncc/campaigns/'+cid)
    if gid not in checked:
     g=groups[gid];checked.add(gid)
     assert g['customerId']==int(CID) and not g['userLock'] and g['nccCampaignId']==cid
     assert g.get('pcNetworkBidWeight',100)==r['pc_weight'] and g.get('mobileNetworkBidWeight',100)==r['mobile_weight']
     if any(x['action']=='BID_UP' for x in actions if x['group_id']==gid):
      ads[gid]=await get('/ncc/ads?nccAdgroupId='+gid)
      assert any(ad.get('status')=='ELIGIBLE' and ad.get('inspectStatus')=='APPROVED' and not ad.get('userLock') for ad in ads[gid])
   for b in budgets:
    cid=b['id'];campaigns[cid]=await get('/ncc/campaigns/'+cid)
    assert campaigns[cid]['dailyBudget']==b['before'] and campaigns[cid]['useDailyBudget'] and not campaigns[cid]['userLock']
   for i in range(0,len(actions),100):
    part=actions[i:i+100];ks=await get('/ncc/keywords?ids='+quote(','.join(r['keyword_id'] for r in part)))
    assert isinstance(ks,list) and len(ks)==len(part)
    km={k['nccKeywordId']:k for k in ks}
    for r in part:
     k=km[r['keyword_id']];g=groups[r['group_id']];ca=campaigns[r['campaign_id']]
     assert k['customerId']==int(CID) and k['keyword']==r['keyword'] and k['nccAdgroupId']==r['group_id'] and not k['userLock'] and not ca['userLock']
     assert k['bidAmt']==r['before_own_bid'] and k['useGroupBidAmt']==r['before_use_group_bid']
     assert (g['bidAmt'] if k['useGroupBidAmt'] else k['bidAmt'])==r['before_effective_base']
     keywords[k['nccKeywordId']]=k
    if i%500==0:print('preflight',i+len(part),len(actions),flush=True)
   save('before.json',dict(at=now(),plan_sha256=digest,groups=groups,campaigns=campaigns,all_campaigns=all_campaigns,keywords=keywords,ads=ads))
   print('PREFLIGHT_OK',len(keywords),len(groups),len(budgets),flush=True);return
  assert '--apply' in sys.argv and not (OUT/'result.json').exists()
  before=json.loads((OUT/'before.json').read_text());assert before['plan_sha256']==digest
  assert (datetime.now(timezone.utc)-datetime.fromisoformat(before['at'])).total_seconds()<1800
  result=dict(started=now(),plan_sha256=digest,keywords=[],budgets=[],errors=[]);save('result.json',result)
  async def edit_budget(b):
   old=before['campaigns'][b['id']];fresh=await get('/ncc/campaigns/'+b['id'])
   assert fresh['editTm']==old['editTm'] and fresh['dailyBudget']==b['before'] and fresh['useDailyBudget']
   await c.update_campaign_budget(b['id'],b['after'],fresh)
   after=await get('/ncc/campaigns/'+b['id']);ok=after['dailyBudget']==b['after'] and after['useDailyBudget'] and after['userLock']==old['userLock']
   result['budgets'].append(dict(id=b['id'],before=b['before'],after=after['dailyBudget'],verified=ok));save('result.json',result);assert ok
  # Decreases first so transient configured budget never exceeds the original sum.
  for b in sorted(budgets,key=lambda b:b['after']-b['before']):
   if b['after']<b['before']:await edit_budget(b)
  for action in ['PAUSE','BID_DOWN','BID_UP']:
   rs=[r for r in actions if r['action']==action]
   for i in range(0,len(rs),50):
    part=rs[i:i+50];ids=quote(','.join(r['keyword_id'] for r in part));fresh=await get('/ncc/keywords?ids='+ids);km={k['nccKeywordId']:k for k in fresh};body=[]
    for r in part:
     k=km[r['keyword_id']];b=before['keywords'][r['keyword_id']]
     assert k['editTm']==b['editTm'] and k['bidAmt']==b['bidAmt'] and k['userLock']==b['userLock'] and k['useGroupBidAmt']==b['useGroupBidAmt']
     body.append({**k,**({'userLock':True} if action=='PAUSE' else {'bidAmt':r['proposed_base_bid'],'useGroupBidAmt':False})})
    fields='userLock' if action=='PAUSE' else 'bidAmt'
    # PUT is idempotent; any uncertain outcome is resolved by a separate GET below.
    write_error=None
    try:await c._request('PUT','/ncc/keywords?fields='+fields,body)
    except Exception as e:write_error=type(e).__name__
    after={k['nccKeywordId']:k for k in await get('/ncc/keywords?ids='+ids)}
    for r in part:
     a=after[r['keyword_id']];b=before['keywords'][r['keyword_id']]
     ok=(a['userLock'] is True and a['bidAmt']==b['bidAmt'] and a['useGroupBidAmt']==b['useGroupBidAmt']) if action=='PAUSE' else (a['bidAmt']==r['proposed_base_bid'] and not a['useGroupBidAmt'] and a['userLock']==b['userLock'])
     result['keywords'].append(dict(id=r['keyword_id'],keyword=r['keyword'],action=action,before_bid=b['bidAmt'],after_bid=a['bidAmt'],after_lock=a['userLock'],verified=ok,editTm=a['editTm']))
    save('result.json',result)
    assert all(x['verified'] for x in result['keywords'])
    if i%500==0:print(action,i+len(part),len(rs),flush=True)
  for b in budgets:
   if b['after']>b['before']:await edit_budget(b)
  all_after=await get('/ncc/campaigns?recordSize=1000');save('campaigns_after.json',all_after)
  result['daily_budget_total_after']=sum(x['dailyBudget'] for x in all_after if x.get('useDailyBudget'))
  assert result['daily_budget_total_after']==plan['daily_budget_total_after']
  result['finished']=now();result['complete']=True;save('result.json',result);print('APPLY_OK',len(result['keywords']),len(result['budgets']),flush=True)
 finally:await c.close()
try:asyncio.run(main())
except Exception as e:
 import traceback
 frames=traceback.extract_tb(e.__traceback__)
 print('FAILED',type(e).__name__,[(Path(f.filename).name,f.lineno) for f in frames],flush=True);sys.exit(1)
