"""Confirmed operational events, mature cohorts, and actual cash contribution.

Inputs stay in data/sojam-private. Blank values remain unknown. Website clicks
are deliberately not accepted as intake, booking, visit, or treatment events.
"""
from datetime import datetime,date,time,timedelta,timezone
from decimal import Decimal
from collections import defaultdict

KST=timezone(timedelta(hours=9))
SCHEMAS={
 'leads':['lead_id','patient_ref','received_at','inquiry_date','is_new','valid_lead','first_source','last_source','self_source','first_response_at','cost_explained_at','time_explained_at','financial_closed_through','legacy_visit_marked'],
 'bookings':['booking_id','lead_id','confirmed_at','scheduled_at','status','replaces_booking_id','cancel_reason'],
 'visits':['visit_id','lead_id','occurred_at','is_first','link_verified'],
 'treatments':['treatment_id','lead_id','started_at','clinician_approved'],
 'finance':['transaction_id','treatment_id','date','kind','amount','verified'],
 'costs':['cost_id','date','source','category','amount'],
 'touchpoints':['touch_id','lead_id','occurred_at','source','campaign_code','evidence'],
}
IDS={k:v[0]for k,v in SCHEMAS.items()}
def dt(value):
    if not value:return None
    v=datetime.fromisoformat(str(value).replace('Z','+00:00'))
    return v.replace(tzinfo=KST)if v.tzinfo is None else v.astimezone(KST)
def truth(v):
    if v in (None,''):return None
    if v is True or str(v).lower()in ['true','1','yes']:return True
    if v is False or str(v).lower()in ['false','0','no']:return False
    raise ValueError('Expected true, false, or blank')
def money(v):
    if v in (None,''):raise ValueError('Unknown amount cannot become zero')
    n=Decimal(str(v))
    if not n.is_finite()or n<0:raise ValueError('Amount must be finite and nonnegative')
    return n
def ratio(a,b):return round(a/b,4)if b else None
def dedupe(data):
    out={}
    for name,fields in SCHEMAS.items():
        seen={}
        for row in data.get(name,[]):
            if set(row)-set(fields):raise ValueError('Unexpected fields in '+name+'; free text and patient identifiers are not permitted in this ledger')
            key=row.get(IDS[name])
            if not key:raise ValueError('Missing record id in '+name)
            if key in seen and seen[key]!=row:raise ValueError('Conflicting duplicate in '+name)
            seen[key]=row
        out[name]=list(seen.values())
    leads={r['lead_id']for r in out['leads']};treatments={r['treatment_id']for r in out['treatments']}
    for name in ['bookings','visits','treatments','touchpoints']:
        if any(r['lead_id']not in leads for r in out[name]):raise ValueError('Missing lead reference in '+name)
    if any(r['treatment_id']not in treatments for r in out['finance']):raise ValueError('Missing treatment reference')
    for r in out['bookings']:
        if r['status']not in ['pending','confirmed','attended','no_show','cancelled','rescheduled']:raise ValueError('Unknown booking status')
        if r['status']!='pending'and not r.get('confirmed_at'):raise ValueError('Confirmed booking event required')
        if not r.get('scheduled_at'):raise ValueError('Booking time required')
    for r in out['finance']:
        if r['kind']not in ['receipt','refund','variable_cost']:raise ValueError('Unknown finance kind')
        money(r['amount'])
    for r in out['costs']:money(r['amount'])
    return out

def attribution(lead,touches,window_days):
    received=dt(lead.get('received_at'))
    if received is None:return None
    eligible=[t for t in touches if t['lead_id']==lead['lead_id']and t.get('evidence')=='tracked'and received-timedelta(days=window_days)<=dt(t['occurred_at'])<=received]
    return max(eligible,key=lambda t:dt(t['occurred_at']))['source']if eligible else None

def business_minutes(start,end,hours):
    """hours: weekday strings 0..6 -> [['09:00','13:00'],['14:00','18:00']]."""
    if not hours:return None
    start,end=dt(start),dt(end)
    if start is None or end is None:return None
    if end<start:raise ValueError('Response precedes inquiry')
    result=0.;day=start.date()
    while day<=end.date():
        for a,b in hours.get(str(day.weekday()),[]):
            lo=datetime.combine(day,time.fromisoformat(a),KST);hi=datetime.combine(day,time.fromisoformat(b),KST)
            if hi<=lo:raise ValueError('Invalid office interval')
            result+=max(0,(min(hi,end)-max(lo,start)).total_seconds()/60)
        day+=timedelta(days=1)
    return result

def compute(data,as_of,cohort_since,cohort_until,config=None):
    data=dedupe(data);config=config or {};asof=dt(as_of);since=date.fromisoformat(cohort_since);until=date.fromisoformat(cohort_until)
    if since>until or until>asof.date():raise ValueError('Invalid cohort dates')
    leads=[]
    for r in data['leads']:
        received=dt(r.get('received_at'));day=received.date()if received else date.fromisoformat(r['inquiry_date'])
        if since<=day<=until and (not received or received<=asof):leads.append(r)
    # is_new must be explicitly established. A blank is not a new patient.
    cohort={r['lead_id']:r for r in leads if truth(r.get('is_new'))is True and truth(r.get('valid_lead'))is True}
    pts=[r.get('patient_ref')for r in cohort.values()if r.get('patient_ref')]
    if len(pts)!=len(set(pts)):raise ValueError('Repeated patient marked as multiple new leads; reconcile first')
    bookings=[r for r in data['bookings']if r['lead_id']in cohort and r.get('confirmed_at')and dt(r['confirmed_at'])<=asof]
    replacements={r['replaces_booking_id']for r in bookings if r.get('replaces_booking_id')}
    final=[r for r in bookings if r['booking_id']not in replacements and r['status']!='rescheduled']
    bylead=defaultdict(list)
    for r in final:bylead[r['lead_id']].append(r)
    # At most one final first-visit appointment per lead; multiple records need reconciliation.
    if any(len(v)>1 for v in bylead.values()):raise ValueError('Multiple final first-visit bookings; link reschedules')
    mature=[r for r in final if dt(r['scheduled_at'])+timedelta(hours=24)<=asof]
    matureids={r['lead_id']for r in mature}
    first_events=[r for r in data['visits']if r['lead_id']in cohort and truth(r.get('is_first'))is True and truth(r.get('link_verified'))is True and dt(r['occurred_at'])<=asof]
    visits={r['lead_id']:r for r in first_events}
    if len(visits)!=len(first_events):raise ValueError('Multiple first-visit events; reconcile duplicates')
    treatments=[r for r in data['treatments']if r['lead_id']in visits and truth(r.get('clinician_approved'))is True and dt(r['started_at'])<=asof]
    treatment_by_lead={r['lead_id']:r for r in treatments}
    if len(treatment_by_lead)!=len(treatments):raise ValueError('Multiple initial treatments per new lead')
    for r in treatments:
        if dt(r['started_at'])<dt(visits[r['lead_id']]['occurred_at']):raise ValueError('Treatment precedes first visit')
    for r in visits.values():
        lead=cohort[r['lead_id']];received=dt(lead.get('received_at'))
        if received and dt(r['occurred_at'])<received:raise ValueError('First visit precedes inquiry')
    trace=sum(bool(r.get('first_source')or r.get('last_source')or r.get('self_source'))and truth(r.get('is_new'))is not None and truth(r.get('valid_lead'))is not None for r in leads)
    explained=sum(bool(cohort[r['lead_id']].get('cost_explained_at'))and bool(cohort[r['lead_id']].get('time_explained_at'))and dt(cohort[r['lead_id']]['cost_explained_at'])<=dt(r['confirmed_at'])and dt(cohort[r['lead_id']]['time_explained_at'])<=dt(r['confirmed_at'])for r in final)
    response=[]
    if config.get('hours_confirmed'):
        for r in cohort.values():
            if r.get('first_response_at')and dt(r['first_response_at'])<=asof:
                m=business_minutes(r.get('received_at'),r['first_response_at'],config.get('hours'))
                if m is not None:response.append(m)
    costs=[r for r in data['costs']if since<=date.fromisoformat(r['date'])<=until]
    cash=sum((money(r['amount'])for r in costs),Decimal(0));media=sum((money(r['amount'])for r in costs if r['category']=='media'),Decimal(0))
    cost_complete=config.get('costs_complete')is True
    # Never turn absence of accounting rows into zero acquisition cost.
    financial=[]
    for t in treatments:
        start=dt(t['started_at']);r=cohort[t['lead_id']];closed=dt(r.get('financial_closed_through'))
        horizons={}
        for days in [30,60,90]:
            end=start+timedelta(days=days);matured=end<=asof;complete=bool(matured and closed and closed>=end)
            entries=[x for x in data['finance']if x['treatment_id']==t['treatment_id']and start.date()<=date.fromisoformat(x['date'])<end.date()and date.fromisoformat(x['date'])<=asof.date()]
            complete=complete and all(truth(x.get('verified'))is True for x in entries)
            totals={kind:sum((money(x['amount'])for x in entries if x['kind']==kind and truth(x.get('verified'))is True),Decimal(0))for kind in ['receipt','refund','variable_cost']}
            horizons[str(days)]={'mature':matured,'complete':complete,'receipt':float(totals['receipt'])if complete else None,'refund':float(totals['refund'])if complete else None,'variable_cost':float(totals['variable_cost'])if complete else None,'contribution':float(totals['receipt']-totals['refund']-totals['variable_cost'])if complete else None}
        financial.append(horizons)
    mature90=[x['90']for x in financial if x['90']['complete']]
    all90=bool(financial)and len(mature90)==len(financial)
    contribution90=sum(x['contribution']for x in mature90)/len(mature90)if all90 else None
    missing_outcomes=sum(r['lead_id']not in visits and r['status']not in ['no_show','cancelled']for r in mature)
    observation={'as_of':as_of,'cohort':[cohort_since,cohort_until],'lead_rows':len(leads),'confirmed_new_valid_leads':len(cohort),'new_status_unknown':sum(truth(r.get('is_new'))is None for r in leads),'legacy_visit_marks':sum(truth(r.get('legacy_visit_marked'))is True for r in leads),'tracking_complete_n':trace,'tracking_complete_rate':ratio(trace,len(leads)),'confirmed_final_bookings':len(final),'mature_bookings_including_cancellations':len(mature),'mature_first_visits':len(matureids&set(visits)),'mature_visit_rate':ratio(len(matureids&set(visits)),len(mature)),'mature_outcome_unknown':missing_outcomes,'first_visits':len(visits),'treatment_starts':len(treatments),'cost_time_explained_n':explained,'cost_time_explained_rate':ratio(explained,len(final)),'responses_measured':len(response),'response_within_30_business_minutes_rate':ratio(sum(m<=30 for m in response),len(response)),'response_missing_n':len(cohort)-len(response),'media_cost':float(media)if cost_complete else None,'all_acquisition_cost':float(cash)if cost_complete else None,'media_visit_cac':float(media)/len(visits)if cost_complete and visits else None,'all_treatment_cac':float(cash)/len(treatments)if cost_complete and treatments else None,'complete_90day_cohort':all90,'mean_90day_contribution':contribution90,'finance_complete_counts':{str(n):sum(x[str(n)]['complete']for x in financial)for n in [30,60,90]},'attribution_coverage':{str(n):sum(attribution(r,data['touchpoints'],n)is not None for r in cohort.values())for n in [7,30,90]}}
    blockers=[]
    if observation['tracking_complete_rate']is None or observation['tracking_complete_rate']<.9:blockers.append('tracking_under_90pct_or_unknown')
    if observation['cost_time_explained_rate']is None or observation['cost_time_explained_rate']<.95:blockers.append('cost_time_explanation_under_95pct_or_unknown')
    if not all90 or contribution90 is None or contribution90<=0:blockers.append('positive_mature_90day_economics_unverified')
    if not cost_complete:blockers.append('acquisition_cost_incomplete')
    allocation=config.get('acquisition_contribution_fraction')
    allowed=contribution90*allocation if contribution90 is not None and isinstance(allocation,(int,float))and 0<allocation<=1 else None
    observation['allowed_treatment_cac']=allowed
    if allowed is None or observation['all_treatment_cac']is None or observation['all_treatment_cac']>allowed:blockers.append('cac_above_allowance_or_unverified')
    month_completeness=defaultdict(list)
    for t,f in zip(treatments,financial):month_completeness[dt(t['started_at']).strftime('%Y-%m')].append(f['90']['complete'])
    mature_months=sum(all(v)for v in month_completeness.values())
    observation['complete_treatment_month_cohorts']=mature_months
    if mature_months<2:blockers.append('two_mature_monthly_cohorts_unverified')
    if config.get('next_14day_new_slots')is None or config.get('next_14day_new_slots',0)<=0:blockers.append('capacity_unconfirmed_or_full')
    if not config.get('clinical_review_confirmed'):blockers.append('clinical_scope_unconfirmed')
    observation['budget_increase_allowed']=not blockers;observation['budget_increase_blockers']=blockers
    # Small groups are suppressed in shareable reports. Totals are still useful.
    source_counts=defaultdict(int)
    for r in cohort.values():source_counts[attribution(r,data['touchpoints'],30)or'source_unknown']+=1
    observation['shareable_sources']={s:n for s,n in source_counts.items()if n>=5}
    observation['suppressed_source_groups']=sum(n<5 for n in source_counts.values())
    return observation
