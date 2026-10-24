"""Exhaustive rule-based triage of saved inventory; no purchase probability inference."""
import csv,json,re,importlib.util
from pathlib import Path
from collections import Counter,defaultdict
P=Path(__file__).resolve().parents[2];OUT=P/'reports/sojam-20260908/package-plan';OUT.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('old',P/'flyio-backend/_sojam_0908_analysis.py');old=importlib.util.module_from_spec(spec);spec.loader.exec_module(old)
RULES={
'burden':r'진물|피가나|출혈|갈라|수면|잠못|잠을못|밤에|야간(?!진료)|통증|따가|화끈|극심|심한|중증|전신|일상|업무',
'persistent':r'만성|재발|반복|안낫|낫지|낫질|난치|몇년|수년|계속',
'care':r'치료|한의원|한방|병원|진료|상담|예약|완치',
'price':r'비용|가격|얼마|보험|실비|실손',
'product':r'화장품|샴푸|보습제|수딩젤|마사지기|앰플|브러쉬|괄사|토닉|스프레이|에센스|올리브영|쿠팡|로션|비누|세정제|세럼|유산균|영양제|크림추천|크림가격|크림구매|크림효과|패치|팩추천|트리트먼트|에스트라|설화수|마몽드|이니스프리|빌리프|멀티비타민|아토베리어',
'other':r'검정고시|청소(?!년)|사무실|풋살|가터벨트|창업|수건선|물건선|한의원가운|채용|학원|자격증|구순구개열|구순열|타투|반영구|보톡스|필러|성형|제모|마사지샵|스케일링|스파|다이어트|난임|불임|비염|축농증|치과|임플란트|탈모|하지정맥류|기미|비립종|속옷|스타킹|크리스마스|헤드레스트|다리받침|테이블|교통사고|경옥고|후두염|피부관리사',
'acute':r'봉와직염|피부농양|스티븐스존슨|독성표피|피부암|흑색종|천포창|괴저|호흡곤란|아나필락시스',
'info':r'연고|약$|음식|원인|증상|사진|자가|집에서|민간요법|없애는법|관리법|좋은|바세린',
'region':old.REGION}
def classify(k):
 f={n:bool(re.search(p,k))for n,p in RULES.items()};axis,tier,scope=old.axis(k)
 if axis=='기타'and re.search(r'피부한의원|피부질환|피부병|피부발진|피부병원',k):axis,scope='피부진료일반','질환 상세 미지정'
 if '소잠'in k:cat='B 브랜드';why='기존 인지 수요; 비브랜드 신규획득과 분리'
 elif f['other']:cat='X 비관련·타진료';why='상품 또는 진료 목적 불일치; 수동검토 후 제외'
 elif f['acute']:cat='M 의료적합성 우선';why='긴급/전문 진료 적합성 검토; 패키지 획득 대상으로 자동 배정하지 않음'
 elif f['product']:cat='X 상품구매';why='제품 탐색 문구; 의료기관 치료 의도와 분리'
 elif '기존'in scope:cat='H 기존 운영보류';why=scope
 elif '피부과'in k:cat='J 진료기관 재검토';why='피부과 진료 탐색; 한의원 선택 의도는 추가 검토'
 elif f['region']:cat='R 진료권 재검토';why='지역 문구가 기존 진료권과 다를 수 있음; 지역만으로 결제력 판단 금지'
 elif axis in ('기타','비관련'):cat='U 의미 수동검토';why='질환 일치 불명확; 전수 규칙분류만으로 집행 불가'
 elif f['care']and(f['burden']or f['persistent']):cat='A1 고부담·치료탐색';why='지속/부담 표현과 진료 탐색이 함께 있음; 결제의향은 미확인'
 elif f['care']:cat='A2 치료기관·치료탐색';why='진료 탐색 확인; 중증도/장기치료 필요/결제의향은 미확인'
 elif f['burden']or f['persistent']:cat='C1 부담·재발 증상';why='불편 신호 있으나 의료기관 선택 의도 미확인'
 elif f['price']:cat='C2 비용정보';why='비용 비교는 지불의사/지불능력의 증거가 아님'
 else:cat='C3 질환·자가관리정보';why='질환명/정보만으로 고통 강도나 장기치료 의도 알 수 없음'
 return dict(category=cat,reason=why,axis=axis,clinical_scope=scope,burden_signal=f['burden'],persistence_signal=f['persistent'],care_signal=f['care'],price_signal=f['price'],payment500_intent='미확인',clinical_package_fit='의료진 상담 후 판단')
def write(name,rows):
 with(OUT/name).open('w',encoding='utf-8-sig',newline='')as f:
  w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
def main():
 rows=list(csv.DictReader((P/'reports/sojam-20260908/keywords_pc.csv').open(encoding='utf-8-sig')));kw={};detail=[]
 for r in rows:
  k=r['keyword'];c=classify(k);d=kw.setdefault(k,dict(keyword=k,**c,registered_rows=0,live_verified_rows=0,live_unlocked_rows=0,historical_matched_rows=0,historical_spend_all_devices=0,historical_clicks_all_devices=0,live_pc_bids=set()))
  d['registered_rows']+=1;live=r['live_verified']=='True';on=live and all(r[z]=='False'for z in ['kw_lock','group_lock','camp_lock']);d['live_verified_rows']+=live;d['live_unlocked_rows']+=on
  if on and r['pc_effective_arithmetic']:d['live_pc_bids'].add(float(r['pc_effective_arithmetic']))
  if r['historical_0901_0906_spend_all_devices']!='':
   d['historical_matched_rows']+=1;d['historical_spend_all_devices']+=float(r['historical_0901_0906_spend_all_devices']);d['historical_clicks_all_devices']+=float(r['historical_0901_0906_clicks_all_devices']or 0)
  detail.append({**r,**c})
 for d in kw.values():d['live_pc_bids']=' / '.join(str(int(x))for x in sorted(d['live_pc_bids']))
 unique=sorted(kw.values(),key=lambda r:(r['category'],-r['historical_spend_all_devices'],r['keyword']))
 agg=[]
 for c in sorted({r['category']for r in unique}):
  rr=[r for r in unique if r['category']==c];agg.append(dict(category=c,unique_keywords=len(rr),registered_rows=sum(r['registered_rows']for r in rr),live_unlocked_unique=sum(r['live_unlocked_rows']>0 for r in rr),historical_matched_unique=sum(r['historical_matched_rows']>0 for r in rr),historical_spend=sum(r['historical_spend_all_devices']for r in rr),historical_clicks=sum(r['historical_clicks_all_devices']for r in rr)))
 write('전체등록행_판정.csv',detail);write('고유키워드_판정.csv',unique);write('분류별요약.csv',agg)
 write('치료형_우선검토.csv',[r for r in unique if r['category'].startswith('A')]);write('지출상위_검토.csv',sorted(unique,key=lambda r:-r['historical_spend_all_devices'])[:200])
 summary=dict(inventory_rows=len(rows),unique_keywords=len(unique),categories=agg,method='규칙 기반 전수 선별. 수동 검토 및 결제 연동 검증 전 집행 판정 아님.',historical_period='2026-09-01~06, 기기 합산, 매칭된 보관 실적만 합산. 미매칭은 0으로 확정하지 않음.',payment_inference='모든 검색어 500만원 결제의향 미확인')
 (OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(summary,ensure_ascii=False))
if __name__=='__main__':main()
