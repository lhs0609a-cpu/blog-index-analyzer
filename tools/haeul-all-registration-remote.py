import asyncio,json,logging,time,base64,zlib
logging.disable(logging.CRITICAL)
from database.naver_ad_db import get_ad_account_by_customer
from services.naver_ad_service import NaverAdApiClient
P=json.loads(zlib.decompress(base64.b64decode('__PAYLOAD__')))
async def main():
 a=get_ad_account_by_customer(1,'3442423');assert a and str(a['customer_id'])=='3442423'
 c=NaverAdApiClient();c.customer_id=a['customer_id'];c.api_key=a['api_key'];c.secret_key=a['secret_key']
 try:
  if P['mode']=='apply':
   assert P['customer_id']=='3442423' and len(P['groups'])==1
   assert time.time()-P['censusAt']<14400
   gp=P['groups'][0];campaign=await c._request('GET','/ncc/campaigns/'+P['campaignId'])
   for field in ['dailyBudget','useDailyBudget','userLock']:assert campaign[field]==P['campaignBefore'][field],field
   source=await c._request('GET','/ncc/ads/'+P['sourceAdId'])
   assert source['inspectStatus']=='APPROVED' and source['ad']['basic']==P['sourceBasic']
   def event(kind,**data):print('EVENT:'+json.dumps({'at':time.time(),'axis':gp['axis'],'index':gp['index'],'kind':kind,**data},ensure_ascii=False),flush=True)
   gs=await c._request('GET','/ncc/adgroups',{'nccCampaignId':P['campaignId']})
   assert isinstance(gs,list) and len(gs)<1000
   matches=[g for g in gs if g['name']==gp['name']];assert len(matches)<=1
   if matches:g=matches[0]
   else:
    g=await c._request('POST','/ncc/adgroups',{'nccCampaignId':P['campaignId'],'name':gp['name'],'adgroupType':'WEB_SITE','pcChannelId':P['pcChannelId'],'mobileChannelId':P['mobileChannelId'],'bidAmt':P['groupBid'],'contentsNetworkBidAmt':P['groupBid'],'useCntsNetworkBidAmt':False,'mobileNetworkBidWeight':100,'pcNetworkBidWeight':100,'dailyBudget':P['groupDailyBudget'],'useDailyBudget':True,'userLock':True,'useExpSearch':False})
    event('group_created',gid=g['nccAdgroupId'])
   gid=g['nccAdgroupId'];assert g['customerId']==3442423
   # 생성 시 무시될 수 있는 확장검색 값을 실제 조회값으로 검증한다.
   g=await c._request('GET','/ncc/adgroups/'+gid)
   assert g['name']==gp['name'] and g['nccCampaignId']==P['campaignId']
   if g.get('useExpSearch') or g['bidAmt']!=70 or g['dailyBudget']!=1000 or not g['useDailyBudget']:
    g=await c._request('PUT','/ncc/adgroups/'+gid,{**g,'useExpSearch':False,'bidAmt':70,'dailyBudget':1000,'useDailyBudget':True})
   ad=None
   if not gp['hold']:
    ads=await c._request('GET','/ncc/ads',{'nccAdgroupId':gid})
    ad=next((x for x in ads if x.get('ad',{}).get('basic')==P['sourceBasic']),None)
    if ad is None:
     ad=await c._request('POST','/ncc/ads',{'nccAdgroupId':gid,'type':'MEDICAL_AD','ad':{'basic':P['sourceBasic']}})
     event('ad_created',gid=gid,adId=ad.get('nccAdId'),inspect=ad.get('inspectStatus'))
   norm=lambda s:''.join(s.split()).lower()
   current=await c._request('GET','/ncc/keywords',{'nccAdgroupId':gid});assert isinstance(current,list)
   present={norm(k['keyword']) for k in current};todo=[x for x in gp['items'] if norm(x['keyword']) not in present]
   assert len(current)+len(todo)<=1000
   rejected={}
   for start in range(0,len(todo),100):
    chunk=todo[start:start+100];event('batch_requested',gid=gid,keywords=[x['keyword'] for x in chunk])
    response=await c._request('POST','/ncc/keywords?nccAdgroupId='+gid,[{'keyword':x['keyword'],'bidAmt':x['bidAmt'],'useGroupBidAmt':False,'userLock':False} for x in chunk])
    assert isinstance(response,list)
    for item in response:
     if not item.get('nccKeywordId') and item.get('resultStatus',{}).get('code'):
      rejected[norm(item['keyword'])]={'keyword':item['keyword'],'code':item['resultStatus']['code'],'reason':item['resultStatus'].get('message','')}
    event('batch_response',gid=gid,response=response)
    print('PROGRESS '+str(gp['index']+1)+' '+gp['axis']+' '+str(min(start+100,len(todo)))+'/'+str(len(todo)),flush=True)
    await asyncio.sleep(.25)
   after=await c._request('GET','/ncc/keywords',{'nccAdgroupId':gid});by={norm(x['keyword']):x for x in after}
   result=[]
   for x in gp['items']:
    k=by.get(norm(x['keyword']))
    if k is None and norm(x['keyword']) in rejected:continue
    assert k and k['bidAmt']==x['bidAmt'] and not k['useGroupBidAmt'] and not k['userLock'],x['keyword']
    result.append({'keyword':x['keyword'],'priority':x['priority'],'id':k['nccKeywordId'],'bidAmt':k['bidAmt'],'status':k['status'],'statusReason':k.get('statusReason'),'inspectStatus':k['inspectStatus']})
   g=await c._request('GET','/ncc/adgroups/'+gid)
   if g['userLock']!=gp['hold']:g=await c._request('PUT','/ncc/adgroups/'+gid+'?fields=userLock',{**g,'userLock':gp['hold']})
   g=await c._request('GET','/ncc/adgroups/'+gid)
   event('group_settings',settings={f:g.get(f) for f in ['userLock','useExpSearch','bidAmt','dailyBudget','useDailyBudget']})
   assert g['userLock']==gp['hold'] and not g['useExpSearch'] and g['bidAmt']==70 and g['dailyBudget']==1000 and g['useDailyBudget'],{f:g.get(f) for f in ['userLock','useExpSearch','bidAmt','dailyBudget','useDailyBudget']}
   finalads=await c._request('GET','/ncc/ads',{'nccAdgroupId':gid})
   if not gp['hold']:
    assert finalads and all(x['ad']['basic']['pc']['final'].rstrip('/')=='https://haeulclinic.com' and x['ad']['basic']['mobile']['final'].rstrip('/')=='https://haeulclinic.com' for x in finalads)
   finalcamp=await c._request('GET','/ncc/campaigns/'+P['campaignId'])
   for f in ['dailyBudget','useDailyBudget','userLock']:assert finalcamp[f]==campaign[f],f
   finalkeys=await c._request('GET','/ncc/keywords',{'nccAdgroupId':gid});fm={norm(k['keyword']):k for k in finalkeys}
   for r in result:
    k=fm[norm(r['keyword'])];r.update({f:k.get(f) for f in ['status','statusReason','inspectStatus']})
   out={'complete':True,'axis':gp['axis'],'index':gp['index'],'group':g,'ads':finalads,'campaign':finalcamp,'hold':gp['hold'],'holdReason':gp['holdReason'],'results':result,'rejected':list(rejected.values()),'at':time.time()}
   event('group_verified',gid=gid,count=len(result),hold=gp['hold'])
   print('RESULT:'+base64.b64encode(zlib.compress(json.dumps(out,ensure_ascii=False).encode())).decode(),flush=True)
  if P['mode']=='templates':
   out={}
   for gid in ['grp-a001-01-000000070294312','grp-a001-01-000000055073075','grp-a001-01-000000070440048']:
    out[gid]=await c._request('GET','/ncc/ads',{'nccAdgroupId':gid})
   print('RESULT:'+base64.b64encode(zlib.compress(json.dumps(out,ensure_ascii=False).encode())).decode(),flush=True)
  if P['mode']=='audit':
   out={'customer_id':'3442423','at':time.time()}
   for item in ['Keyword','Adgroup','Ad']:
    j=await c._request('POST','/master-reports',{'item':item})
    for _ in range(150):
     j=await c._request('GET','/master-reports/'+j['id'])
     if j['status'] in ['BUILT','ERROR','NONE']:break
     await asyncio.sleep(1)
    assert j['status']=='BUILT'
    raw=await c.download_report_text(j['downloadUrl']);rows=[r.split('\t') for r in raw.splitlines() if r.strip()]
    assert rows and all(r[0]=='3442423' for r in rows)
    out[item]=rows
    print('PROGRESS '+item+' '+str(len(rows)),flush=True)
   out['campaigns']=await c._request('GET','/ncc/campaigns')
   out['mainGroup']=await c._request('GET','/ncc/adgroups/grp-a001-01-000000049624428')
   signatures={}
   for r in out['Ad']:
    sig=tuple(r[3:8]);signatures.setdefault(sig,[]).append(r[2])
   out['creativeTypes']=[{'fields':list(sig),'count':len(ids),'ids':ids[:3]} for sig,ids in signatures.items()]
   out['mainAds']=await c._request('GET','/ncc/ads?nccAdgroupId=grp-a001-01-000000049624428')
   out['at']=time.time()
   print('RESULT:'+base64.b64encode(zlib.compress(json.dumps(out,ensure_ascii=False).encode())).decode(),flush=True)
 finally:await c.close()
asyncio.run(main())
