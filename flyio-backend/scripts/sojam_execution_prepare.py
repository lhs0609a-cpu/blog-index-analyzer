"""Select bounded live-audit scope from saved inventory; does not change ads."""
import csv,json
from pathlib import Path
P=Path(__file__).resolve().parents[2];O=P/'reports/sojam-20260908/execution';O.mkdir(parents=True,exist_ok=True)
rows=list(csv.DictReader((P/'reports/sojam-20260908/package-plan/전체등록행_판정.csv').open(encoding='utf-8-sig')))
top=sorted(rows,key=lambda r:-float(r['historical_0901_0906_spend_all_devices']or 0))[:200]
scope={r['gid']:'historical_top_spend'for r in top if float(r['historical_0901_0906_spend_all_devices']or 0)>0}
for r in rows:
 if r['live_verified']=='True'and all(r[k]=='False'for k in ['kw_lock','group_lock','camp_lock']):
  if r['category'].startswith('X'):scope[r['gid']]='product_or_unrelated_review'
  if r['category'].startswith('A1'):scope[r['gid']]='persistent_treatment_review'
(O/'scope.json').write_text(json.dumps(scope,ensure_ascii=False,indent=2),encoding='utf8')
print('Selected groups',len(scope),'Reasons', {v:list(scope.values()).count(v)for v in set(scope.values())})
