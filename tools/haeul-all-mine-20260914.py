import asyncio,json,logging,base64,zlib,time
logging.disable(logging.CRITICAL)
import httpx
from database.naver_ad_db import get_ad_account_by_customer
from services.naver_ad_service import NaverAdApiClient
CONFIG=json.loads(zlib.decompress(base64.b64decode('__CONFIG__')))
async def main():
    a=get_ad_account_by_customer(1,'3442423');assert a and str(a['customer_id'])=='3442423'
    c=NaverAdApiClient();c.customer_id=a['customer_id'];c.api_key=a['api_key'];c.secret_key=a['secret_key']
    out={'customer_id':'3442423','startedAt':time.time(),'volume':[],'autocomplete':[],'errors':[]}
    try:
        job=await c._request('POST','/master-reports',{'item':'Keyword'})
        for _ in range(150):
            job=await c._request('GET','/master-reports/'+job['id'])
            if job['status'] in ['BUILT','ERROR','NONE']:break
            await asyncio.sleep(1)
        assert job['status']=='BUILT'
        raw=await c.download_report_text(job['downloadUrl']);rows=[r.split('\t') for r in raw.splitlines() if r.strip()]
        assert rows and all(len(r)>=10 and r[0]=='3442423' for r in rows)
        out['existing']=[r[3] for r in rows];out['censusAt']=time.time()
        print('PROGRESS census '+str(len(rows)),flush=True)
        hints=CONFIG['volume_hints'];chunks=[hints[i:i+5] for i in range(0,len(hints),5)]
        gate=asyncio.Semaphore(2)
        async def vol(chunk):
            async with gate:
                for attempt in range(2):
                    try:
                        res=await c._request('GET','/keywordstool',{'hintKeywords':','.join(chunk),'showDetail':'1'})
                        assert isinstance(res.get('keywordList'),list)
                        slim=[{k:r.get(k) for k in ['relKeyword','monthlyPcQcCnt','monthlyMobileQcCnt','compIdx']} for r in res['keywordList']]
                        out['volume'].append({'hints':chunk,'rows':slim});break
                    except Exception as e:
                        if attempt==1:out['errors'].append({'stage':'volume','hints':chunk,'error':type(e).__name__})
                        else:await asyncio.sleep(2)
                await asyncio.sleep(.4)
        for start in range(0,len(chunks),20):
            await asyncio.gather(*(vol(chunk) for chunk in chunks[start:start+20]))
            print('PROGRESS volume '+str(min(start+20,len(chunks)))+'/'+str(len(chunks)),flush=True)
        async with httpx.AsyncClient(timeout=12) as h:
            ag=asyncio.Semaphore(3)
            async def ac(root):
                async with ag:
                    try:
                        r=await h.get('https://ac.search.naver.com/nx/ac',params={'q':root['keyword'],'con':'0','frm':'nv','ans':'2','r_format':'json','r_enc':'UTF-8','r_unicode':'0','t_koreng':'1','run':'2','rev':'4','q_enc':'UTF-8','st':'100'})
                        r.raise_for_status();data=r.json();words=[]
                        for group in data.get('items',[]):
                            for entry in group:
                                kw=entry[0] if isinstance(entry,list) and entry else entry
                                if isinstance(kw,str):words.append(kw)
                        out['autocomplete'].append({'seed':root['keyword'],'axis':root['axis'],'words':words})
                    except Exception as e:out['errors'].append({'stage':'autocomplete','seed':root['keyword'],'error':type(e).__name__})
                    await asyncio.sleep(.15)
            await asyncio.gather(*(ac(root) for root in CONFIG['roots']))
        out['finishedAt']=time.time()
        print('HAEUL_RESULT:'+base64.b64encode(zlib.compress(json.dumps(out,ensure_ascii=False).encode())).decode(),flush=True)
    finally:await c.close()
asyncio.run(main())
