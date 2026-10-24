import json,csv,math,io,gzip
from pathlib import Path
from collections import Counter,defaultdict
from sojam_intent_policy import classify
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'reports/sojam-20260909';SRC=OUT/'full/sojam-full-20260909';PLAN=OUT/'plan';PLAN.mkdir(exist_ok=True)
def read(n):return json.loads((SRC/n).read_text(encoding='utf-8'))
def save(n,x):(PLAN/n).write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf-8')
def csvout(n,rs):
 if not rs:return
 f=io.StringIO(newline='');w=csv.DictWriter(f,fieldnames=list(rs[0]));w.writeheader();w.writerows(rs)
 (PLAN/(n+'.gz')).write_bytes(gzip.compress(f.getvalue().encode('utf-8-sig')))
def main():
 cs={c['nccCampaignId']:c for c in read('campaigns.json')};gs={g['nccAdgroupId']:g for g in read('groups.json')}
 estimates={};negative=[]
 if (PLAN/'estimates.json').exists():
  parts=json.loads((PLAN/'estimates.json').read_text(encoding='utf-8'))
  expected=set(json.loads((PLAN/'estimate_keys.json').read_text(encoding='utf-8')))
  for dev in ['PC','MOBILE']:
   received={k for x in parts if x['device']==dev for k in x['keys']};assert received==expected,'estimates incomplete'
   estimates[dev]={r['keyword']:r['bid'] for x in parts if x['device']==dev for r in x['response']['estimate']}
 if (PLAN/'automation_profile.json').exists():negative=json.loads((PLAN/'automation_profile.json').read_text(encoding='utf-8'))['/keyword-pool/domain-profile']['profile']['negative_keywords']
 stats=defaultdict(lambda:defaultdict(float));cstats=defaultdict(lambda:defaultdict(float));gstats=defaultdict(lambda:defaultdict(float));unattributed=defaultdict(float);total=defaultdict(float)
 for f in sorted(SRC.glob('AD_DETAIL-*.tsv')):
  for line in f.read_text(encoding='utf-8').splitlines():
   r=line.split('\t');assert len(r)>=16 and r[1]=='1858907'
   for key,i in [('impressions',11),('clicks',12),('cost',13),('rank_sum',14)]:
    v=float(r[i] or 0);stats[r[4]][key]+=v;stats[r[4]][r[10]+'_'+key]+=v;cstats[r[2]][key]+=v;gstats[r[3]][key]+=v;total[key]+=v
    if r[4]=='-':unattributed[key]+=v
 rows=[];actions=[];grades=defaultdict(lambda:defaultdict(float));campaign_grade=defaultdict(lambda:defaultdict(float));group_grade=defaultdict(lambda:defaultdict(float));unknown=[]
 for line in (SRC/'keywords.tsv').read_text(encoding='utf-8').splitlines():
  r=line.split('\t');assert len(r)==13 and r[0]=='1858907'
  gid,kid,k=r[1:4];g=gs.get(gid);c=cs.get(g['nccCampaignId']) if g else None;p=classify(k);s=stats.get(kid,{})
  own=int(r[4]);inherited=r[9]=='1';bid=g['bidAmt'] if inherited and g else own;lock=r[7]=='1'
  pw=g.get('pcNetworkBidWeight',100) if g else 100;mw=g.get('mobileNetworkBidWeight',100) if g else 100;target=str((g or {}).get('targetSummary',{}).get('pcMobile','unknown')).lower()
  weight=mw if target=='mobile' else pw if target=='pc' else max(pw,mw)
  cap=p['effective_bid_cap'];basecap=max(70,math.floor(cap*100/weight/10)*10) if cap else None
  proposed=bid;action='KEEP';reason=p['reason'];active=bool(g and c and not lock and not g.get('userLock') and not c.get('userLock') and not r[11])
  if r[11]:reason+='; 삭제 기록 유지'
  elif not g or not c:reason+='; 상위 엔티티 누락 - 변경 금지'
  elif c['campaignTp']!='WEB_SITE':reason+='; 파워링크 외 유형 유지'
  elif not active:reason+='; 기존 OFF 또는 상위 OFF 보존'
  elif p['grade'].startswith('X_'):action='PAUSE'
  elif cap:
   proposed=min(bid,basecap)
   rank=s.get('rank_sum',0)/s['impressions'] if s.get('impressions') else None
   if p['grade'] in ['S','A'] and r[8] in ['20','30'] and not p['remote'] and s.get('impressions',0)>=20 and rank and rank>4 and bid<basecap:
    proposed=min(basecap,max(bid+10,math.ceil(bid*1.1/10)*10));reason+='; 20노출 이상·평균순위 4 초과, 10% 수준 제한 증액'
   if proposed<bid:action='BID_DOWN';reason+='; 중요도별 기기 적용입찰 상한 초과'
   elif proposed>bid:action='BID_UP'
   else:reason+='; 상한 이내, 증액 근거 부족으로 유지'
   if estimates and p['grade'] in ['S','A'] and r[8] in ['20','30'] and not p['remote'] and not s.get('impressions',0) and not any(n in k for n in negative):
    device='PC' if target=='pc' else 'MOBILE';w=pw if device=='PC' else mw;minimum=estimates.get(device,{}).get(k,0)
    needed=max(70,math.ceil(minimum*100/w/10)*10) if minimum else 70
    trial_limit=1500 if p['grade']=='S' else 1000
    if minimum>70 and bid<needed<=min(basecap,trial_limit):
     proposed=needed;action='BID_UP';reason=p['reason']+'; 최근 무노출, 네이버 28일 최소노출 추정입찰 내 소액 시험(S 1500/A 1000 기본입찰 이내)'
  row=dict(keyword_id=kid,keyword=k,group_id=gid,group_name=(g or {}).get('name'),campaign_id=(c or {}).get('nccCampaignId'),campaign_name=(c or {}).get('name'),grade=p['grade'],intent_score=p['intent_score'],action=action,reason=reason,before_own_bid=own,before_use_group_bid=inherited,before_effective_base=bid,proposed_base_bid=proposed,pc_weight=pw,mobile_weight=mw,device_target=target,before_pc_bid=bid*pw/100,after_pc_bid=proposed*pw/100,before_mobile_bid=bid*mw/100,after_mobile_bid=proposed*mw/100,effective_bid_cap=cap,before_lock=lock,active_parent_and_keyword=active,keyword_inspect_code=r[8],group_edit_tm=(g or {}).get('editTm'),campaign_edit_tm=(c or {}).get('editTm'),period_impressions=s.get('impressions',0),period_clicks=s.get('clicks',0),period_cost=s.get('cost',0),pc_cost=s.get('P_cost',0),mobile_cost=s.get('M_cost',0),period_avg_rank=(s.get('rank_sum',0)/s['impressions'] if s.get('impressions') else None),payment_attribution='미확인')
  rows.append(row)
  row['pc_min_exposure_estimate']=estimates.get('PC',{}).get(k)
  row['mobile_min_exposure_estimate']=estimates.get('MOBILE',{}).get(k)
  if action!='KEEP':actions.append(row)
  grades[p['grade']]['rows']+=1;grades[p['grade']]['active_rows']+=active;grades[p['grade']]['cost']+=s.get('cost',0);grades[p['grade']]['clicks']+=s.get('clicks',0)
  if c:
   campaign_grade[c['nccCampaignId']][p['grade']]+=s.get('cost',0);group_grade[gid][p['grade']]+=s.get('cost',0)
  if p['grade']=='U' and active:unknown.append(row)
 save('keyword_actions.json',actions)
 print('actions ready',len(actions),flush=True)
 csvout('전체키워드_조정판정.csv',rows);csvout('실제변경대상.csv',actions);csvout('의미미확정_지출순.csv',sorted(unknown,key=lambda r:-r['period_cost']))
 campaign_rows=[]
 for cid,c in cs.items():
  s=cstats[cid];gg=campaign_grade[cid];campaign_rows.append(dict(id=cid,name=c['name'],type=c['campaignTp'],lock=c.get('userLock'),status=c.get('status'),useDailyBudget=c.get('useDailyBudget'),dailyBudget=c.get('dailyBudget'),cost=s.get('cost',0),clicks=s.get('clicks',0),treatment_cost=sum(gg[z] for z in ['S','A','A_AUX']),low_intent_cost=sum(gg[z] for z in ['U','D_INFO','HOLD_SCOPE','MEDICAL','X_PRODUCT','X_OTHER','AUX_SCOPE','D_AUX']),grade_costs=json.dumps(gg,ensure_ascii=False)))
 csvout('캠페인예산_성과대조.csv',campaign_rows)
 group_rows=[]
 for gid,g in gs.items():
  if gstats[gid].get('cost',0)>0:group_rows.append(dict(id=gid,name=g['name'],campaign=cs[g['nccCampaignId']]['name'],budget=g.get('dailyBudget'),useDailyBudget=g.get('useDailyBudget'),cost=gstats[gid]['cost'],grade_costs=json.dumps(group_grade[gid],ensure_ascii=False)))
 csvout('지출그룹_등급대조.csv',sorted(group_rows,key=lambda r:-r['cost']))
 summary=dict(source=read('manifest.json'),rows=len(rows),unique_keywords=len(set(r['keyword'] for r in rows)),actions=dict(Counter(r['action'] for r in rows)),grades=dict(grades),total=dict(total),unattributed=dict(unattributed),daily_budget_total=sum(c['dailyBudget'] for c in cs.values() if c.get('useDailyBudget')))
 save('summary.json',summary);print(json.dumps(summary,ensure_ascii=False));print('TOP CHANGES')
 for r in sorted(actions,key=lambda r:-r['period_cost'])[:35]:print(r['keyword'],r['grade'],r['action'],r['before_effective_base'],r['proposed_base_bid'],r['period_cost'])
 print('CAMPAIGNS')
 for r in sorted(campaign_rows,key=lambda r:-r['cost'])[:18]:print(r['id'],r['name'],r['dailyBudget'],r['cost'],r['treatment_cost'],r['low_intent_cost'])
if __name__=='__main__':main()
