import copy,unittest
from .metrics import compute,business_minutes,attribution,dedupe,SCHEMAS

def fixture():
    return {'leads':[{'lead_id':'test-lead-1','patient_ref':'test-patient-1','received_at':'2026-01-01T09:00:00+09:00','is_new':True,'valid_lead':True,'first_source':'naver_search','first_response_at':'2026-01-01T09:20:00+09:00','cost_explained_at':'2026-01-01T09:25:00+09:00','time_explained_at':'2026-01-01T09:25:00+09:00','financial_closed_through':'2026-06-01T23:59:59+09:00'}],
    'bookings':[{'booking_id':'test-book-1','lead_id':'test-lead-1','confirmed_at':'2026-01-01T10:00:00+09:00','scheduled_at':'2026-01-03T10:00:00+09:00','status':'attended'}],
    'visits':[{'visit_id':'test-visit-1','lead_id':'test-lead-1','occurred_at':'2026-01-03T10:00:00+09:00','is_first':True,'link_verified':True}],
    'treatments':[{'treatment_id':'test-treatment-1','lead_id':'test-lead-1','started_at':'2026-01-03T12:00:00+09:00','clinician_approved':True}],
    'finance':[{'transaction_id':'test-money-1','treatment_id':'test-treatment-1','date':'2026-01-03','kind':'receipt','amount':3000000,'verified':True},{'transaction_id':'test-money-2','treatment_id':'test-treatment-1','date':'2026-02-03','kind':'refund','amount':500000,'verified':True},{'transaction_id':'test-money-3','treatment_id':'test-treatment-1','date':'2026-01-03','kind':'variable_cost','amount':1000000,'verified':True}],
    'costs':[{'cost_id':'test-cost-1','date':'2026-01-01','source':'naver_search','category':'media','amount':100000},{'cost_id':'test-cost-2','date':'2026-01-01','source':'shared','category':'creative','amount':100000}],
    'touchpoints':[{'touch_id':'test-touch-1','lead_id':'test-lead-1','occurred_at':'2025-12-20T10:00:00+09:00','source':'naver_search','campaign_code':'c01','evidence':'tracked'}]}
CFG={'hours_confirmed':True,'hours':{'3':[['09:00','13:00'],['14:00','18:00']]},'costs_complete':True,'next_14day_new_slots':4,'clinical_review_confirmed':True,'acquisition_contribution_fraction':.3}
def run(d,config=None,asof='2026-06-01T23:59:59+09:00'):return compute(d,asof,'2026-01-01','2026-06-01'if asof.startswith('2026-06')else asof[:10],config or CFG)
class Metrics(unittest.TestCase):
    def test_cash_refunds_costs_and_maturity(self):
        r=run(fixture());self.assertEqual(r['mean_90day_contribution'],1500000);self.assertEqual(r['all_treatment_cac'],200000);self.assertEqual(r['allowed_treatment_cac'],450000);self.assertEqual(r['mature_visit_rate'],1);self.assertFalse(r['budget_increase_allowed'])
    def test_unknown_accounting_not_zero(self):
        d=fixture();d['leads'][0]['financial_closed_through']='';d['finance']=[];r=run(d);self.assertIsNone(r['mean_90day_contribution']);self.assertFalse(r['budget_increase_allowed'])
    def test_unmatured_not_extrapolated(self):
        r=run(fixture(),asof='2026-02-01T12:00:00+09:00');self.assertIsNone(r['mean_90day_contribution']);self.assertFalse(r['complete_90day_cohort'])
    def test_identical_duplicate_id_is_idempotent(self):
        d=fixture();d['finance'].append(dict(d['finance'][0]));self.assertEqual(run(d)['mean_90day_contribution'],1500000)
    def test_conflicting_id_rejected(self):
        d=fixture();d['finance'].append({**d['finance'][0],'amount':5});self.assertRaises(ValueError,run,d)
    def test_unknown_new_status_does_not_create_patient(self):
        d=fixture();d['leads'][0]['is_new']='';d['leads'][0]['legacy_visit_marked']=True;r=run(d);self.assertEqual(r['first_visits'],0);self.assertEqual(r['legacy_visit_marks'],1);self.assertEqual(r['new_status_unknown'],1)
    def test_revisit_does_not_count_first_visit(self):
        d=fixture();d['visits'][0]['is_first']=False;r=run(d);self.assertEqual(r['first_visits'],0);self.assertEqual(r['treatment_starts'],0)
    def test_two_first_visits_rejected(self):
        d=fixture();d['visits'].append({**d['visits'][0],'visit_id':'second'});self.assertRaises(ValueError,run,d)
    def test_future_booking_not_in_mature_denominator(self):
        d=fixture();d['bookings'][0]['scheduled_at']='2026-06-05T10:00:00+09:00';self.assertEqual(run(d)['mature_bookings_including_cancellations'],0)
    def test_reschedule_does_not_double_count(self):
        d=fixture();d['bookings'][0]['status']='rescheduled';d['bookings'].append({**d['bookings'][0],'booking_id':'replacement','status':'attended','replaces_booking_id':'test-book-1'});self.assertEqual(run(d)['mature_bookings_including_cancellations'],1)
    def test_cancelled_confirmed_booking_stays_in_denominator(self):
        d=fixture();d['bookings'][0]['status']='cancelled';d['visits']=[];d['treatments']=[];d['finance']=[];r=run(d);self.assertEqual(r['mature_visit_rate'],0);self.assertEqual(r['mature_outcome_unknown'],0)
    def test_unresolved_booking_is_disclosed(self):
        d=fixture();d['bookings'][0]['status']='confirmed';d['visits']=[];d['treatments']=[];d['finance']=[];self.assertEqual(run(d)['mature_outcome_unknown'],1)
    def test_7_30_90_and_future_touch(self):
        d=fixture();d['touchpoints'].append({**d['touchpoints'][0],'touch_id':'future','occurred_at':'2026-01-05T10:00:00+09:00','source':'wrong'});r=run(d);self.assertEqual(r['attribution_coverage'],{'7':0,'30':1,'90':1})
    def test_self_report_not_tracked(self):
        d=fixture();d['touchpoints'][0]['evidence']='self_reported';self.assertEqual(run(d)['attribution_coverage']['30'],0)
    def test_business_minutes_exclude_lunch(self):
        self.assertEqual(business_minutes('2026-01-01T12:50:00+09:00','2026-01-01T14:10:00+09:00',CFG['hours']),20)
    def test_click_cannot_be_intake(self):
        d=fixture();d['leads'][0]['contact_click']=True;self.assertRaises(ValueError,run,d)
    def test_patient_phone_cannot_enter_ledger_schema(self):
        d=fixture();d['leads'][0]['phone']='test-value';self.assertRaises(ValueError,run,d)
    def test_missing_costs_block_cac(self):
        c=dict(CFG,costs_complete=False);self.assertIsNone(run(fixture(),c)['all_treatment_cac'])
    def test_no_future_receipt(self):
        d=fixture();d['finance'].append({**d['finance'][0],'transaction_id':'future','date':'2027-01-01','amount':9000000});self.assertEqual(run(d)['mean_90day_contribution'],1500000)
    def test_cac_above_allowance_blocks(self):
        d=fixture();d['costs'][0]['amount']=1000000;self.assertIn('cac_above_allowance_or_unverified',run(d)['budget_increase_blockers'])
    def test_small_sources_suppressed(self):self.assertEqual(run(fixture())['shareable_sources'],{})
if __name__=='__main__':unittest.main()
