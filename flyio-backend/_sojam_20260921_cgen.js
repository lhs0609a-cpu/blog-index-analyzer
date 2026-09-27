// c_plan.json → fly 안에서 돌릴 적용 페이로드(_sojam_20260921_capply.py)를 만든다.
// 가드는 여기(10원 단위·인상만)와 원격(잠금·목표 이상)에 이중으로 건다.
const fs=require('fs'),path=require('path'),zlib=require('zlib');
const D=path.join(__dirname,'../reports/sojam-20260921/');
const {plan}=JSON.parse(fs.readFileSync(D+'c_plan.json','utf8'));
const items=plan.map(r=>({nccKeywordId:r.id,nccAdgroupId:r.gid,bidAmt:r.newBid,useGroupBidAmt:false}));
const guard=plan.map(r=>({id:r.id,old:r.oldBid,neu:r.newBid}));
if(items.some(x=>x.bidAmt%10!==0)) throw Error('10원 단위 아님');
if(guard.some(g=>g.neu<=g.old)) throw Error('인상만 위반');
if(items.some(x=>x.bidAmt>15000)) throw Error('상한 초과');
const pack=a=>zlib.deflateSync(Buffer.from(JSON.stringify(a))).toString('base64');
const py=`import asyncio,base64,json,zlib,logging
logging.disable(logging.CRITICAL)
from database.naver_ad_db import get_ad_account_by_customer
from services.naver_ad_service import NaverAdApiClient
ITEMS=json.loads(zlib.decompress(base64.b64decode('${pack(items)}')))
async def main():
    a=get_ad_account_by_customer(1,'1858907')
    assert a and a['customer_id']=='1858907'
    c=NaverAdApiClient()
    c.customer_id=a['customer_id'];c.api_key=a['api_key'];c.secret_key=a['secret_key']
    out={'errors':[]}
    ids=[x['nccKeywordId'] for x in ITEMS]
    pre=await c._request('GET','/ncc/keywords',{'ids':','.join(ids)})
    out['pre']=[{k:x.get(k) for k in ('nccKeywordId','keyword','bidAmt','useGroupBidAmt','userLock')} for x in pre]
    prem={x['nccKeywordId']:x for x in pre}
    send=[]
    for it in ITEMS:
        p=prem.get(it['nccKeywordId'])
        if not p: out['errors'].append(['조회 안 됨',it['nccKeywordId']]); continue
        if p.get('userLock'): out['errors'].append(['OFF 상태',it['nccKeywordId']]); continue
        if int(p.get('bidAmt') or 0) >= it['bidAmt']:
            out['errors'].append(['이미 목표 이상',it['nccKeywordId'],p.get('bidAmt')]); continue
        send.append(it)
    out['sent']=len(send)
    if send:
        r=await c._request('PUT','/ncc/keywords?fields=bidAmt',send)
        out['put']=len(r) if isinstance(r,list) else str(r)[:300]
    post=await c._request('GET','/ncc/keywords',{'ids':','.join(ids)})
    out['post']=[{k:x.get(k) for k in ('nccKeywordId','keyword','bidAmt','useGroupBidAmt','userLock','status','statusReason')} for x in post]
    print('SOJAM_RESULT:'+base64.b64encode(zlib.compress(json.dumps(out,ensure_ascii=False).encode())).decode())
    await c.close()
asyncio.run(main())`;
fs.writeFileSync(path.join(__dirname,'_sojam_20260921_capply.py'),py);
console.log('대상',items.length,'· payload',py.length,'bytes');
