import faulthandler
faulthandler.dump_traceback_later(30,repeat=True)
print("STARTING",flush=True)
"""Explicit treatment-intent policy. Scores are operating hypotheses, never payment predictions."""
import re
CORE=r'아토피|태열|한포진|습진|지루성|피부염|두피염|묘기증|가려|간지|소양|구순염|구각염|양진|태선|안면홍조|주사피부염|로사세아|모낭염|피부건조|어린선|피부질환|피부병|피부한의원|피부전문한의원|피부발진|피부알레르기|피부알러지|피부.*(?:한의원|한방|진료|치료|한약)|(?:한의원|한방).*피부'
CARE=r'한의원|한방|한약|병원|진료|상담|예약|치료(?!제)|완치'
PERSIST=r'만성|재발|반복|안낫|낫지|낫질|난치|수년|몇년|계속'
BURDEN=r'진물|출혈|갈라|수면|잠못|잠을못|밤에|야간(?!진료)|통증|따가|화끈|극심|심한|중증|전신'
INFO=r'원인|증상|사진|음식|연고|약국|치료제|의약품|치료법|치료방법|치료하는법|완치가능|자가치료|자가진단|집에서|민간요법|없애는법|없애는방법|관리법|바세린|비타민|좋은음식'
SHOP=r'(?:샴푸|로션|바디로션|보습제|항균비누|비누|스프레이|앰플|영양제|세정제|고약패치|크림|화장품|유산균|수딩젤|토닉|세럼|에센스|광선치료기기|광선치료기)(?:추천|내돈내산|올리브영|가격|구매|효과)?$|올리브영|쿠팡'
OTHER=r'검정고시|사무실|풋살|가터벨트|창업|수건선물|수건선반|물건선물|한의원가운|채용|자격증|구순구개열|구순열|타투|반영구|보톡스|필러|성형외과|제모|마사지샵|다이어트|난임|불임|비염|축농증|치과|임플란트|하지정맥류|속옷|스타킹|크리스마스|헤드레스트|다리받침|테이블|교통사고|경옥고|후두염|피부관리사'
PRIOR=r'두드러기|두더러기|두두러기|담마진|콜린성|한냉알|건선|백반증|여드름|뾰루지|면포|사마귀|곤지름|대상포진|다한증|액취증|겨드랑이.*냄새'
MEDICAL=r'봉와직염|농양|스티븐스존슨|독성표피|피부암|흑색종|천포창|괴저|호흡곤란|아나필락시스|루푸스|베체트|경화성태선|화농성한선염|혈관염|자반증|할리퀸어린선'
REMOTE=r'부산|대구|대전|광주|제주|청주|전주|창원|김해|포항|울산|춘천|원주|강릉|천안|센텀|해운대|사상(?!체질)'
def classify(keyword):
 k=re.sub(r'\s+','',keyword)
 flags={n:bool(re.search(p,k)) for n,p in [('care',CARE),('persistent',PERSIST),('burden',BURDEN),('core',CORE+r'|비듬|두피(?:각질|진물|건조|통증|한의원)|발진'),('info',INFO),('remote',REMOTE)]}
 if '소잠' in k:grade,score,cap,why='BRAND',80,None,'브랜드 수요 유지; 신규 비브랜드와 분리'
 elif re.search(SHOP,k) and not re.search(r'부작용|알레르기|접촉.*피부염|패치검사',k):grade,score,cap,why='X_PRODUCT',0,70,'제품 탐색; 치료 상담 운영에서 제외'
 elif re.search(OTHER,k) or re.search(r'쌍꺼풀|발톱무좀기계',k):grade,score,cap,why='X_OTHER',0,70,'명시적 타진료·비관련 탐색 제외'
 elif re.search(MEDICAL,k):grade,score,cap,why='MEDICAL',10,300,'전문·긴급 진료 적합성 우선; 패키지 확대 제외'
 elif re.search(PRIOR,k):grade,score,cap,why='HOLD_SCOPE',15,500,'이전 운영 제한 질환; 신규 확대 및 재개 금지'
 elif re.search(r'대학병원|종합병원|의료원|세브란스|아산병원|광선치료',k):grade,score,cap,why='PROVIDER_SCOPE',30,1000,'특정 기관·치료방식 탐색; 한의원 진료와의 적합성 확인 전 제한'
 elif re.search(r'눈가려|눈간지|안구',k):grade,score,cap,why='AUX_SCOPE',20,500,'안과 증상 가능성; 피부 치료 탐색으로 자동 확대하지 않음'
 elif re.search(r'무좀|백선|완선|어루러기',k):grade,score,cap,why=('A_AUX',60,2000,'진균성 피부질환 치료 탐색; 핵심 검증군보다 제한') if flags['care'] and not flags['info'] else ('D_AUX',30,700,'진균성 피부질환 정보·증상 탐색')
 elif re.search(r'질염|질입구|회음부|소음순|구강|구내염|설염|입안',k):grade,score,cap,why='AUX_SCOPE',20,500,'구강·부인과 등 피부 핵심 진료 외 범위 확인 전 제한'
 elif not flags['core'] and re.search(r'단순포진|입술포진|헤르페스|장미색비강진|침독|옴진드기|수포|물집|피지낭종|종기|알러지|알레르기|칸디다|피지샘|피부근염|땀띠',k):grade,score,cap,why=('A_AUX',60,2000,'기타 피부질환 진료 탐색; 진료 적합성 추가 확인') if flags['care'] and not flags['info'] else ('D_OTHER_SKIN',30,1000,'기타 피부질환·증상 탐색; 장기치료 의도 미확인')
 elif flags['core'] and flags['care'] and not flags['info'] and (flags['persistent'] or flags['burden']):grade,score,cap,why='S',95,4500,'지속·부담 증상과 치료 탐색 동시 확인'
 elif flags['core'] and flags['care'] and not flags['info']:grade,score,cap,why='A',80,3500,'피부질환 치료기관·진료 탐색'
 elif flags['core'] and (flags['persistent'] or flags['burden']):grade,score,cap,why='B',65,2200,'지속·생활 불편 신호; 치료기관 선택은 미확인'
 elif flags['core'] and not flags['info']:grade,score,cap,why='C_DISEASE',45,1500,'질환·증상명; 치료 선택 의도는 미확인'
 elif flags['core']:grade,score,cap,why='D_INFO',25,900,'원인·자가관리·약물 정보 탐색'
 else:grade,score,cap,why='U',20,500,'핵심 피부 치료 의도가 명확하지 않음; 증액하지 않고 제한 운영'
 if flags['remote'] and grade in ['S','A','B','C_DISEASE','D_INFO']:
  cap=min(cap,1500);why+='; 원거리 지역 탐색은 진료권 적합성 미확인으로 제한'
 return dict(grade=grade,intent_score=score,effective_bid_cap=cap,reason=why,**flags)

from collections import Counter

def existing_server_candidates(source):
 groups={g['nccAdgroupId']:g for g in json.loads((source/'groups.json').read_text())}
 campaigns={c['nccCampaignId']:c for c in json.loads((source/'campaigns.json').read_text())}
 rows=[]
 for line in (source/'keywords.tsv').read_text().splitlines():
  r=line.split('\t');assert len(r)==13 and r[0]=='1858907'
  g=groups.get(r[1]);c=campaigns.get(g['nccCampaignId']) if g else None
  if not g or not c or r[7]=='1' or r[11] or g.get('userLock') or c.get('userLock'):continue
  p=classify(r[3])
  if p['grade'] not in ['S','A'] or p['effective_bid_cap']<3500:continue
  rows.append(dict(campaign_id=c['nccCampaignId'],group_id=r[1],keyword_id=r[2],keyword=r[3]))
 result=[]
 for cid in sorted(set(r['campaign_id'] for r in rows)):
  rs=[r for r in rows if r['campaign_id']==cid]
  gs=[g for g,n in Counter(r['group_id'] for r in rs).most_common(2)]
  result.append(dict(id=cid,count=len(rs),samples=[next(r for r in rs if r['group_id']==g) for g in gs]))
 return result

import asyncio,json,sys,logging,math
from pathlib import Path
from datetime import datetime,timezone
from urllib.parse import quote
sys.path.insert(0,'/app');logging.disable(logging.CRITICAL)
print('IMPORT_DATABASE',flush=True)
from database.naver_ad_db import get_ad_account_by_customer
print('IMPORT_CLIENT',flush=True)
from services.naver_ad_service import NaverAdApiClient
print('IMPORTED',flush=True)
OUT=Path('/tmp/sojam-campaign-expand-20260909');OUT.mkdir(exist_ok=True)
def save(n,x):(OUT/n).write_text(json.dumps(x,ensure_ascii=False),encoding='utf-8')
async def main():
 print('ACCOUNT_LOOKUP',flush=True);a=get_ad_account_by_customer(1,'1858907');c=NaverAdApiClient();c.customer_id='1858907';c.api_key=a['api_key'];c.secret_key=a['secret_key']
 async def get(p):
  await asyncio.sleep(.3)
  return await asyncio.wait_for(c._request('GET',p),timeout=60)
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
   candidates=existing_server_candidates(Path('/tmp/sojam-full-20260909'));qualified={};snapshots={};groups={};ads={};keywords={};skipped=[]
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
