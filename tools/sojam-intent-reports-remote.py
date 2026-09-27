import asyncio,base64,json,zlib,logging
logging.disable(logging.CRITICAL)
from database.naver_ad_db import get_ad_account_by_customer
from services.naver_ad_service import NaverAdApiClient

async def main():
    a=get_ad_account_by_customer(1,'1858907')
    assert a and str(a['customer_id'])=='1858907'
    c=NaverAdApiClient()
    c.customer_id=a['customer_id'];c.api_key=a['api_key'];c.secret_key=a['secret_key']
    tasks=[('stat','AD_DETAIL','20260913'),('stat','EXPKEYWORD','20260913')]+[('master',n,None)for n in ['Keyword','Adgroup','Ad']]+[('stat','AD_DETAIL','202609'+str(d).zfill(2))for d in range(7,13)]
    if globals().get('MODE')=='floor-census':tasks=[('master','Keyword',None)]
    try:
        if globals().get('MODE')=='discover':
            from urllib.parse import quote
            seeds=['아토피치료','만성습진','한포진치료','피부가려움','항문소양증','사타구니습진','외음부가려움','두피진물','지루성피부염','피부묘기증','백반증치료','모낭염재발','스테로이드리바운드','구순염','밤에가려움','피부한의원','다한증치료','유두습진']
            related={};errors=[]
            for seed in seeds:
                try:
                    r=await c._request('GET','/keywordstool?hintKeywords='+quote(seed)+'&showDetail=1')
                    assert isinstance(r.get('keywordList'),list)
                    for k in r['keywordList']:
                        rec=related.setdefault(k['relKeyword'],{**k,'seeds':[]})
                        rec['seeds'].append(seed)
                except Exception as e:errors.append({'seed':seed,'error':type(e).__name__})
                await asyncio.sleep(.3)
            data={'seeds':seeds,'keywords':list(related.values()),'errors':errors}
            out={'key':'discovery','text':json.dumps(data,ensure_ascii=False),'status':'BUILT'}
            print('SOJAM_REPORT:'+base64.b64encode(zlib.compress(json.dumps(out,ensure_ascii=False).encode())).decode(),flush=True)
            return
        for kind,name,day in tasks:
            ep='/master-reports' if kind=='master' else '/stat-reports'
            job=await c._request('POST',ep,{'item':name}if kind=='master' else {'reportTp':name,'statDt':day})
            jid=job.get('id')or job.get('reportJobId')
            for _ in range(90):
                job=await c._request('GET',ep+'/'+str(jid))
                if job['status']in ['BUILT','NONE','ERROR']:break
                await asyncio.sleep(1)
            assert job['status']in ['BUILT','NONE'],(name,day,job['status'])
            raw=await c.download_report_text(job['downloadUrl'])if job['status']=='BUILT' else ''
            key=kind+'_'+name+('_'+day if day else '')
            if globals().get('MODE')=='floor-census':key='floor_census_Keyword'
            out={'key':key,'text':raw,'status':job['status']}
            print('SOJAM_REPORT:'+base64.b64encode(zlib.compress(json.dumps(out,ensure_ascii=False).encode())).decode(),flush=True)
    finally:await c.close()
asyncio.run(main())
