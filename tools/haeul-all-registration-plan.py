import json,csv,re,time
from pathlib import Path
D=Path(__file__).resolve().parents[1]/'output/haeul-all-discovery-20260914'
a=json.loads((D/'registration-audit.json').read_text(encoding='utf-8'))
assert a['customer_id']=='3442423'
norm=lambda k:re.sub(r'\s+','',k).lower()
existing={norm(r[3]) for r in a['Keyword']}
with (D/'신규후보.csv').open(encoding='utf-8-sig',newline='') as f:rows=list(csv.DictReader(f))
with (D/'분야별_우선검토.csv').open(encoding='utf-8-sig',newline='') as f:priority={r['keyword'] for r in csv.DictReader(f)}
assert len(rows)==5664 and len(priority)==525
source=next(x for x in a['mainAds'] if x['inspectStatus']=='APPROVED' and x['status']=='ELIGIBLE' and x.get('ad',{}).get('basic',{}).get('medicalNo')=='한83947')
basic=source['ad']['basic'];assert basic['pc']['final'].rstrip('/')=='https://haeulclinic.com' and basic['mobile']['final'].rstrip('/')=='https://haeulclinic.com'
campaign=next(x for x in a['campaigns'] if x['nccCampaignId']=='cmp-a001-01-000000009310428');assert not campaign['userLock'] and campaign['dailyBudget']==60000
hold={'과민성대장증후군','생리통','집중력저하','수험생우울증'}
config=json.loads((D/'config.json').read_text(encoding='utf-8'))
groups=[];skipped=[]
for index,axis in enumerate(x['axis'] for x in config['axes']):
 items=[]
 for r in rows:
  if r['axis']!=axis:continue
  if norm(r['keyword']) in existing:skipped.append({'keyword':r['keyword'],'axis':axis,'reason':'latest duplicate'});continue
  assert 2<=len(r['keyword'])<=25 and r['review']=='후보'
  items.append({'keyword':r['keyword'],'bidAmt':300 if r['keyword'] in priority else 70,'priority':r['keyword'] in priority})
 assert len(items)<1000
 groups.append({'index':index,'axis':axis,'name':f'해울_0914_{index+1:02d}_{axis}','hold':axis in hold,'holdReason':'해당 분야 승인 소재 준비 필요' if axis in hold else '', 'items':items})
p={'customer_id':'3442423','createdAt':time.time(),'censusAt':a['at'],'campaignId':campaign['nccCampaignId'],'campaignBefore':campaign,'pcChannelId':a['mainGroup']['pcChannelId'],'mobileChannelId':a['mainGroup']['mobileChannelId'],'sourceAdId':source['nccAdId'],'sourceBasic':basic,'groupBid':70,'groupDailyBudget':1000,'groups':groups,'skipped':skipped,'candidateTotal':len(rows)}
(D/'registration-plan.json').write_text(json.dumps(p,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'planned':sum(len(g['items']) for g in groups),'groups':len(groups),'duplicate':len(skipped),'heldKeywords':sum(len(g['items']) for g in groups if g['hold']),'heldAxes':list(hold),'priority':sum(x['priority'] for g in groups for x in g['items'])},ensure_ascii=False))
