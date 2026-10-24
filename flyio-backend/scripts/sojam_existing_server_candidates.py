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
