import json,csv,hashlib,tarfile
from pathlib import Path
from collections import Counter
P=Path(__file__).resolve().parents[2]/'reports/sojam-20260909';D=P/'plan'
cs={c['nccCampaignId']:c for c in json.loads((P/'full/sojam-full-20260909/campaigns.json').read_text(encoding='utf-8'))}
changes={
 'cmp-a001-01-000000002808841':92600,
 'cmp-a001-01-000000002783671':7500,
 'cmp-a001-01-000000010654286':11100,
 'cmp-a001-01-000000010654255':4300,
 'cmp-a001-01-000000009918300':10000,
 'cmp-a001-01-000000010645676':2400,
 'cmp-a001-01-000000009918301':1000,
}
budgets=[dict(id=k,name=cs[k]['name'],before=cs[k]['dailyBudget'],after=v,reason='중요도별 입찰 조정과 함께 치료 탐색어를 운영하는 주력 캠페인으로 총액 내 재배분') for k,v in changes.items()]
assert sum(b['before'] for b in budgets)==sum(b['after'] for b in budgets)
ks=json.loads((D/'keyword_actions.json').read_text(encoding='utf-8'))
assert all(not r['before_lock'] and r['active_parent_and_keyword'] for r in ks)
assert all(r['proposed_base_bid']>=70 and r['proposed_base_bid']%10==0 for r in ks if r['action']!='PAUSE')
plan=dict(customer_id='1858907',keywords=ks,budgets=budgets,policy='sojam_intent_policy.py',daily_budget_total_before=156750,daily_budget_total_after=156750)
(D/'plan.json').write_text(json.dumps(plan,ensure_ascii=False),encoding='utf-8')
with (D/'캠페인예산_변경안.csv').open('w',encoding='utf-8-sig',newline='') as f:
 w=csv.DictWriter(f,fieldnames=list(budgets[0]));w.writeheader();w.writerows(budgets)
print('actions',dict(Counter(x['action'] for x in ks)),'budgets',len(budgets),'sha256',hashlib.sha256((D/'plan.json').read_bytes()).hexdigest())
for b in budgets:print(b['name'],b['before'],'->',b['after'])
with tarfile.open(P/'apply-input.tar.gz','w:gz') as t:
 t.add(D/'plan.json',arcname='sojam-apply-20260909/plan.json')
 t.add(Path(__file__).parent/'sojam_remote_apply.py',arcname='sojam-apply-20260909/apply.py')
