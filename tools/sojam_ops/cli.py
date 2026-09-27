import argparse,csv,json,hashlib
from pathlib import Path
from datetime import datetime,timezone,timedelta
from .metrics import SCHEMAS,compute
ROOT=Path(__file__).resolve().parents[2]
PRIVATE=ROOT/'data/sojam-private/ops'
OUT=ROOT/'reports/sojam-20260914/proposal-improvements'
def dump(path,obj):path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf8')
def initialize():
    PRIVATE.mkdir(parents=True,exist_ok=True)
    for name,fields in SCHEMAS.items():
        p=PRIVATE/(name+'.csv')
        if not p.exists():
            with p.open('w',encoding='utf-8-sig',newline='')as f:csv.writer(f).writerow(fields)
def readtables():
    return {n:list(csv.DictReader((PRIVATE/(n+'.csv')).open(encoding='utf-8-sig',newline='')))for n in SCHEMAS}
def legacy():
    initialize();source=ROOT/'data/sojam-private/normalized.json';data=json.loads(source.read_text(encoding='utf8'));p=PRIVATE/'leads.csv'
    rows=list(csv.DictReader(p.open(encoding='utf-8-sig',newline='')));seen={r['lead_id']for r in rows};added=0
    for r in data:
        key='legacy-'+hashlib.sha256((r['tab']+'|'+str(r['row'])+'|'+r['pid']).encode()).hexdigest()[:20]
        if key in seen:continue
        # A spreadsheet inquiry date is not a timestamp; a visit mark is not a first-visit event.
        new={k:''for k in SCHEMAS['leads']};new.update(lead_id=key,patient_ref=r['pid'],inquiry_date=r['inquiry_date'],self_source=r['channel']if r['channel']!='미기재'else'',legacy_visit_marked=str(r['visited']).lower())
        rows.append(new);seen.add(key);added+=1
    with p.open('w',encoding='utf-8-sig',newline='')as f:w=csv.DictWriter(f,fieldnames=SCHEMAS['leads']);w.writeheader();w.writerows(rows)
    print(json.dumps({'imported':added,'rows':len(rows),'unknown_first_visit_dates':True,'created_payment_events':0}))
def report(args):
    initialize();config=json.loads((Path(__file__).parent/'clinic.json').read_text(encoding='utf8'));r=compute(readtables(),args.as_of,args.since,args.until,config)
    dump(OUT/'operations-current.json',r)
    (OUT/'원내데이터_연결현황.md').write_text('# 원내 데이터 연결 현황\n\n'+f'문의행 {r["lead_rows"]}개, 신환 여부 미확인 {r["new_status_unknown"]}개, 과거 내원 표시 {r["legacy_visit_marks"]}개.\n\n'+'내원 표시를 실제 첫 내원 이벤트로 바꾸지 않았습니다. 확인된 첫 내원·치료 시작 이벤트가 없어 CAC와 공헌이익은 미확인으로 표시합니다.\n\n'+'예산 자동 증액 허용: '+str(r['budget_increase_allowed'])+'\n\n'+ '\n'.join('- '+x for x in r['budget_increase_blockers']),encoding='utf8')
    print(json.dumps(r,ensure_ascii=False))
def validate_publication():
    c=json.loads((Path(__file__).parent/'clinic.json').read_text(encoding='utf8'));required=['hours_confirmed','primary_channel_confirmed','clinical_review_confirmed','ad_review_confirmed','first_visit_cost','treatment_cost_range','included_items','separate_items','visit_frequency','review_interval','refund_policy','privacy_officer','privacy_contact','privacy_retention','privacy_processors','privacy_effective_date']
    missing=[k for k in required if c.get(k)is None or c.get(k)is False or c.get(k)=='']
    dump(OUT/'publication-readiness.json',{'ready':not missing,'missing':missing,'note':'No permission is requested by this check; it detects missing operational facts and review evidence.'});print(json.dumps({'ready':not missing,'missing':missing}))
    return not missing
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('command',choices=['init','import-legacy','report','check-publication']);p.add_argument('--as-of',default=datetime.now(timezone(timedelta(hours=9))).isoformat());p.add_argument('--since',default='2026-01-01');p.add_argument('--until',default='2026-09-14');a=p.parse_args()
    if a.command=='init':initialize()
    elif a.command=='import-legacy':legacy()
    elif a.command=='report':report(a)
    else:validate_publication()
