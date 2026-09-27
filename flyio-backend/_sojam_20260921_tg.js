// '도는데 노출 0' 인 것들의 그룹 타기팅을 단건 조회한다 — 목록 조회로는 targets 가 안 온다.
const fs=require('fs'),path=require('path'),cp=require('child_process'),zlib=require('zlib');
const D=path.join(__dirname,'../reports/sojam-20260921/');
const J=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const F=D+'targets.json';
const tg=fs.existsSync(F)?J(F):{};
const q1=J(D+'q1.json');
const gids=[...new Set(q1.filter(r=>!r.imp&&(r.vol||0)>=30&&r.fix==='도는데 노출 0')
  .flatMap(r=>r.blocks.filter(b=>!b.block).map(b=>b.gid)))].filter(g=>!tg[g]);
const pack=a=>zlib.deflateSync(Buffer.from(JSON.stringify(a))).toString('base64');
const SRC=g=>`import asyncio,base64,json,zlib,logging
logging.disable(logging.CRITICAL)
from database.naver_ad_db import get_ad_account_by_customer
from services.naver_ad_service import NaverAdApiClient
G=json.loads(zlib.decompress(base64.b64decode('${pack(g)}')))
async def main():
    a=get_ad_account_by_customer(1,'1858907')
    c=NaverAdApiClient()
    c.customer_id=a['customer_id'];c.api_key=a['api_key'];c.secret_key=a['secret_key']
    sem=asyncio.Semaphore(6)
    async def get(g):
        async with sem:
            for t in range(2):
                try: return await c._request('GET','/ncc/adgroups/'+g)
                except Exception:
                    if t==1: return None
                    await asyncio.sleep(0.5)
    res=await asyncio.gather(*[get(x) for x in G])
    out={'t':{g:({'name':r.get('name'),'lock':1 if r.get('userLock') else 0,'st':r.get('status'),'sr':r.get('statusReason'),
        'mw':r.get('mobileNetworkBidWeight'),'bid':r.get('bidAmt'),
        'tg':[{'tp':x.get('targetTp'),'v':x.get('target')} for x in (r.get('targets') or [])]} if isinstance(r,dict) else None) for g,r in zip(G,res)}}
    print('SOJAM_RESULT:'+base64.b64encode(zlib.compress(json.dumps(out,ensure_ascii=False).encode())).decode())
    await c.close()
asyncio.run(main())`;
function runPy(src){
  const quoted="'"+src.replace(/\r/g,'').replace(/'/g,`'"'"'`)+"'";
  const r=cp.spawnSync('C:/Users/leegu/.fly/bin/fly.exe',['ssh','console','-a','blog-index-analyzer','-C','python -c '+quoted],
    {encoding:'utf8',maxBuffer:256*1024*1024,timeout:600000,windowsHide:true});
  const line=(r.stdout||'').split(/\r?\n/).find(l=>l.startsWith('SOJAM_RESULT:'));
  if(!line)throw Error('FAIL '+(r.stderr||'').slice(-300));
  return JSON.parse(zlib.inflateSync(Buffer.from(line.slice(13),'base64')).toString('utf8'));
}
console.error('타기팅 조회 그룹',gids.length);
for(let i=0;i<gids.length;i+=150){
  const o=runPy(SRC(gids.slice(i,i+150)));
  Object.assign(tg,o.t);
  fs.writeFileSync(F+'.tmp',JSON.stringify(tg));fs.renameSync(F+'.tmp',F);
  console.error('  ',Math.min(i+150,gids.length),'/',gids.length);
}
console.error('완료',Object.keys(tg).length);
