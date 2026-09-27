import asyncio,json,logging,base64,zlib
logging.disable(logging.CRITICAL)
from database.naver_ad_db import get_ad_account_by_customer
from services.naver_ad_service import NaverAdApiClient

async def main():
    a=get_ad_account_by_customer(1,'3442423')
    assert a and str(a['customer_id'])=='3442423'
    c=NaverAdApiClient()
    c.customer_id=a['customer_id'];c.api_key=a['api_key'];c.secret_key=a['secret_key']
    try:
        job=await c._request('POST','/master-reports',{'item':'Keyword'})
        for _ in range(120):
            job=await c._request('GET','/master-reports/'+job['id'])
            if job['status'] in ['BUILT','ERROR','NONE']:break
            await asyncio.sleep(1)
        assert job['status']=='BUILT'
        raw=await c.download_report_text(job['downloadUrl'])
        rows=[r.split('\t') for r in raw.splitlines() if r.strip()]
        assert rows and all(len(r)>=10 and r[0]=='3442423' for r in rows)
        out={'customer_id':'3442423','count':len(rows),'keywords':[[r[3],r[1],r[2]] for r in rows]}
        print('HAEUL_RESULT:'+base64.b64encode(zlib.compress(json.dumps(out,ensure_ascii=False).encode())).decode())
    finally:await c.close()
asyncio.run(main())
