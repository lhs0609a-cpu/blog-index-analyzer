// 키워드 ON/OFF·검수상태와 소재상태를 fly 머신 안에서 조각내어 받는다.
// ⚠️ 7,098그룹 한 번에 돌리면 원격 python 이 죽는다(3GB·swap0) — 200그룹씩 끊고 매 조각마다 저장한다.
const fs=require('fs'),path=require('path'),cp=require('child_process'),zlib=require('zlib');
const D=path.join(__dirname,'../reports/sojam-20260921/');
const J=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const F=D+'state.json';
const st=fs.existsSync(F)?J(F):{kw:{},ads:{},doneG:[],doneA:[]};
const save=()=>{fs.writeFileSync(F+'.tmp',JSON.stringify(st));fs.renameSync(F+'.tmp',F);};
const {gids}=J(D+'cand_ids.json');
const needA=J(path.join(__dirname,'_sojam_20260921_needg.json'));
const pack=a=>zlib.deflateSync(Buffer.from(JSON.stringify(a))).toString('base64');

function runPy(src){
  const quoted="'"+src.replace(/\r/g,'').replace(/'/g,`'"'"'`)+"'";
  const r=cp.spawnSync('C:/Users/leegu/.fly/bin/fly.exe',['ssh','console','-a','blog-index-analyzer','-C','python -c '+quoted],
    {encoding:'utf8',maxBuffer:512*1024*1024,timeout:600000,windowsHide:true});
  const line=(r.stdout||'').split(/\r?\n/).find(l=>l.startsWith('SOJAM_RESULT:'));
  if(!line)throw Error('FAIL '+(r.stderr||'').slice(-300));
  return JSON.parse(zlib.inflateSync(Buffer.from(line.slice(13),'base64')).toString('utf8'));
}
const HEAD=`import asyncio,base64,json,zlib,logging
logging.disable(logging.CRITICAL)
from database.naver_ad_db import get_ad_account_by_customer
from services.naver_ad_service import NaverAdApiClient
G=json.loads(zlib.decompress(base64.b64decode('%B64%')))
async def main():
    a=get_ad_account_by_customer(1,'1858907')
    assert a and a['customer_id']=='1858907'
    c=NaverAdApiClient()
    c.customer_id=a['customer_id'];c.api_key=a['api_key'];c.secret_key=a['secret_key']
    sem=asyncio.Semaphore(6)
    async def get(ep,g):
        async with sem:
            for t in range(2):
                try: return await c._request('GET',ep,{'nccAdgroupId':g})
                except Exception:
                    if t==1: return None
                    await asyncio.sleep(0.5)
    res=await asyncio.gather(*[get('%EP%',g) for g in G])
    out=%BODY%
    print('SOJAM_RESULT:'+base64.b64encode(zlib.compress(json.dumps(out,ensure_ascii=False).encode())).decode())
    await c.close()
asyncio.run(main())`;
const KWBODY=`{'kw':{k['nccKeywordId']:[1 if k.get('userLock') else 0,k.get('status'),k.get('statusReason'),k.get('inspectStatus'),1 if k.get('delFlag') else 0] for r in res if isinstance(r,list) for k in r},'bad':[g for g,r in zip(G,res) if not isinstance(r,list)]}`;
const ADBODY=`{'ads':{g:([len([x for x in r if not x.get('delFlag')]),
        len([x for x in r if not x.get('delFlag') and not x.get('userLock') and x.get('inspectStatus')=='APPROVED' and x.get('status')=='ELIGIBLE']),
        len([x for x in r if not x.get('delFlag') and x.get('inspectStatus') in ('UNDER_REVIEW','PENDING') and x.get('statusReason')!='AD_DISAPPROVED']),
        len([x for x in r if not x.get('delFlag') and x.get('statusReason')=='AD_DISAPPROVED'])] if isinstance(r,list) else 'ERR') for g,r in zip(G,res)},'bad':[g for g,r in zip(G,res) if not isinstance(r,list)]}`;

(async()=>{
  const doneG=new Set(st.doneG),doneA=new Set(st.doneA);
  const todoG=gids.filter(g=>!doneG.has(g)), todoA=needA.filter(g=>!doneA.has(g));
  console.error('키워드 조회 그룹',todoG.length,'· 소재 조회 그룹',todoA.length);
  const CH=200;
  for(let i=0;i<todoG.length;i+=CH){
    const b=todoG.slice(i,i+CH);
    const src=HEAD.replace('%B64%',pack(b)).replace('%EP%','/ncc/keywords').replace('%BODY%',KWBODY);
    const o=runPy(src);
    Object.assign(st.kw,o.kw);
    st.doneG.push(...b.filter(g=>!(o.bad||[]).includes(g)));
    save();
    console.error('  kw',Math.min(i+CH,todoG.length),'/',todoG.length,'· 누적 키워드',Object.keys(st.kw).length,'· 실패',(o.bad||[]).length);
  }
  for(let i=0;i<todoA.length;i+=CH){
    const b=todoA.slice(i,i+CH);
    const src=HEAD.replace('%B64%',pack(b)).replace('%EP%','/ncc/ads').replace('%BODY%',ADBODY);
    const o=runPy(src);
    Object.assign(st.ads,o.ads);
    st.doneA.push(...b.filter(g=>!(o.bad||[]).includes(g)));
    save();
    console.error('  ads',Math.min(i+CH,todoA.length),'/',todoA.length,'· 누적 그룹',Object.keys(st.ads).length,'· 실패',(o.bad||[]).length);
  }
  console.error('완료 · 키워드',Object.keys(st.kw).length,'· 소재그룹',Object.keys(st.ads).length);
})().catch(e=>{console.error('중단:',e.message);process.exitCode=1;});
