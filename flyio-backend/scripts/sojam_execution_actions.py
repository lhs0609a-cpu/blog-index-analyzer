"""Build a narrowly scoped shopping-keyword pause proposal from fresh snapshots."""
import csv,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'reports/sojam-20260908/execution'
def read(n): return json.loads((OUT/(n+'.json')).read_text(encoding='utf-8'))
def write_csv(name,rows):
    if rows:
        with (OUT/name).open('w',encoding='utf-8-sig',newline='') as f:
            w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
groups={g['nccAdgroupId']:g for g in read('groups')}
campaigns={c['nccCampaignId']:c for c in read('campaigns')['items']}
rows=[]; proposals=[]; ads_summary=[]
for d in read('details'):
    if 'error' in d: continue
    g=groups[d['gid']];c=campaigns[g['nccCampaignId']]
    ads=[a for a in d['ads'] if a.get('status')=='ELIGIBLE' and not a.get('userLock') and a.get('inspectStatus')=='APPROVED']
    ads_summary.append(dict(group_id=d['gid'],group_name=g['name'],campaign_name=c['name'],group_status=g.get('status'),campaign_status=c.get('status'),approved_eligible_ads=len(ads),keywords=len(d['keywords'])))
    for k in d['keywords']:
        base=g['bidAmt'] if k.get('useGroupBidAmt') else k['bidAmt']
        product=bool(re.search(r'(샴푸|로션|바디로션|보습제|항균비누|비누|스프레이|앰플|영양제|세정제|고약패치|패치|크림추천|화장품)(추천|내돈내산|올리브영)?$',k['keyword']))
        eligible=all(x.get('status')=='ELIGIBLE' and not x.get('userLock') for x in [k,g,c]) and bool(ads)
        row=dict(keyword_id=k['nccKeywordId'],keyword=k['keyword'],group_id=g['nccAdgroupId'],group_name=g['name'],campaign_id=c['nccCampaignId'],campaign_name=c['name'],keyword_status=k.get('status'),userLock=k.get('userLock'),base_bid=base,pc_weight=g.get('pcNetworkBidWeight',100),pc_effective_bid=round(base*g.get('pcNetworkBidWeight',100)/100),pc_mobile_target=g.get('targetSummary',{}).get('pcMobile'),campaign_status=c.get('status'),group_status=g.get('status'),approved_eligible_ads=len(ads),delivery_prerequisites=eligible,shopping_query=product,editTm=k.get('editTm'),fetched_at=d['fetchedAt'])
        rows.append(row)
        if product and eligible and c.get('campaignTp')=='WEB_SITE': proposals.append(row)
write_csv('live_keywords.csv',rows);write_csv('ad_delivery_groups.csv',ads_summary);write_csv('shopping_pause_candidates.csv',proposals)
(OUT/'shopping_pause_candidates.json').write_text(json.dumps(proposals,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(dict(rows=len(rows),groups=len(ads_summary),shopping_candidates=len(proposals),campaign_types=sorted(set(c.get('campaignTp','') for c in campaigns.values()))),ensure_ascii=False))
for r in proposals: print(r['keyword_id'],r['keyword'],r['pc_effective_bid'])
