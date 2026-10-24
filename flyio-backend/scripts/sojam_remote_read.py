"""Run in existing backend; export only this customer's advertising data to /tmp."""
import asyncio,json,sys,logging,hashlib
from pathlib import Path
sys.path.insert(0,'/app');logging.disable(logging.CRITICAL)
from database.naver_ad_db import get_ad_account_by_customer
from services.naver_ad_service import NaverAdApiClient
from services.ad_report_collector import _build_and_download
CID='1858907';OUT=Path('/tmp/sojam-full-20260909');OUT.mkdir(exist_ok=True)
def save(n,v): (OUT/n).write_text(json.dumps(v,ensure_ascii=False),encoding='utf-8')
async def main():
 a=get_ad_account_by_customer(1,CID)
 if not a or str(a['customer_id'])!=CID:raise RuntimeError('account missing')
 c=NaverAdApiClient();c.customer_id=CID;c.api_key=a['api_key'];c.secret_key=a['secret_key']
 try:
  master,meta=await _build_and_download(c,'master','Keyword');(OUT/'keywords.tsv').write_text(master,encoding='utf-8');save('keyword_meta.json',meta);print('master rows',len(master.splitlines()),flush=True)
  async def pages(p,id):
   all=[];seen=set();base=''
   for i in range(100):
    q=p+('&' if '?' in p else '?')+'recordSize=1000'+('&baseSearchId='+base if base else '')
    rs=await c._request('GET',q)
    if not rs:return all
    if not isinstance(rs,list) or any(r[id] in seen for r in rs):raise RuntimeError('pagination mismatch')
    all.extend(rs);seen.update(r[id] for r in rs);base=rs[-1][id]
   raise RuntimeError('pagination bound')
  camps=await pages('/ncc/campaigns','nccCampaignId');save('campaigns.json',camps)
  groups=[]
  for i,ca in enumerate(camps):
   groups.extend(await pages('/ncc/adgroups?nccCampaignId='+ca['nccCampaignId'],'nccAdgroupId'))
   await asyncio.sleep(.35)
   if i%30==0:print('campaign groups',i+1,len(camps),flush=True)
  save('groups.json',groups)
  for day in range(1,9):
   for kind in ['AD_DETAIL','EXPKEYWORD']:
    fname=f'{kind}-202609{day:02}.tsv'
    if (OUT/fname).exists():continue
    txt,meta=await _build_and_download(c,'stat',kind,f'2026-09-{day:02}')
    (OUT/fname).write_text(txt,encoding='utf-8');print(fname,len(txt.splitlines()),flush=True)
  from datetime import datetime,timezone
  save('manifest.json',dict(at=datetime.now(timezone.utc).isoformat(),customer_id=CID,campaigns=len(camps),groups=len(groups),keyword_rows=len(master.splitlines()),complete=True,adWrites=0))
  print('complete',flush=True)
 finally:await c.close()
try:asyncio.run(main())
except Exception as e:print('FAILED',type(e).__name__,flush=True);sys.exit(1)
