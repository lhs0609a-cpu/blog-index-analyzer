"""Explicit treatment-intent policy. Scores are operating hypotheses, never payment predictions."""
import re
CORE=r'아토피|태열|한포진|습진|지루성|피부염|두피염|묘기증|가려|간지|소양|구순염|구각염|양진|태선|안면홍조|주사피부염|로사세아|모낭염|피부건조|어린선|피부질환|피부병|피부한의원|피부전문한의원|피부발진|피부알레르기|피부알러지|피부.*(?:한의원|한방|진료|치료|한약)|(?:한의원|한방).*피부'
CARE=r'한의원|한방|한약|병원|진료|상담|예약|치료(?!제)|완치'
PERSIST=r'만성|재발|반복|안낫|낫지|낫질|난치|수년|몇년|계속'
BURDEN=r'진물|출혈|갈라|수면|잠못|잠을못|밤에|야간(?!진료)|통증|따가|화끈|극심|심한|중증|전신'
INFO=r'원인|증상|사진|음식|연고|약국|치료제|의약품|치료법|치료방법|치료하는법|완치가능|자가치료|자가진단|집에서|민간요법|없애는법|없애는방법|관리법|바세린|비타민|좋은음식'
SHOP=r'(?:샴푸|로션|바디로션|보습제|항균비누|비누|스프레이|앰플|영양제|세정제|고약패치|크림|화장품|유산균|수딩젤|토닉|세럼|에센스|광선치료기기|광선치료기)(?:추천|내돈내산|올리브영|가격|구매|효과)?$|올리브영|쿠팡'
OTHER=r'검정고시|사무실|풋살|가터벨트|창업|수건선물|수건선반|물건선물|한의원가운|채용|자격증|구순구개열|구순열|타투|반영구|보톡스|필러|성형외과|제모|마사지샵|다이어트|난임|불임|비염|축농증|치과|임플란트|하지정맥류|속옷|스타킹|크리스마스|헤드레스트|다리받침|테이블|교통사고|경옥고|후두염|피부관리사'
PRIOR=r'두드러기|두더러기|두두러기|담마진|콜린성|한냉알|건선|백반증|여드름|뾰루지|면포|사마귀|곤지름|대상포진|다한증|액취증|겨드랑이.*냄새'
MEDICAL=r'봉와직염|농양|스티븐스존슨|독성표피|피부암|흑색종|천포창|괴저|호흡곤란|아나필락시스|루푸스|베체트|경화성태선|화농성한선염|혈관염|자반증|할리퀸어린선'
REMOTE=r'부산|대구|대전|광주|제주|청주|전주|창원|김해|포항|울산|춘천|원주|강릉|천안|센텀|해운대|사상(?!체질)'
def classify(keyword):
 k=re.sub(r'\s+','',keyword)
 flags={n:bool(re.search(p,k)) for n,p in [('care',CARE),('persistent',PERSIST),('burden',BURDEN),('core',CORE+r'|비듬|두피(?:각질|진물|건조|통증|한의원)|발진'),('info',INFO),('remote',REMOTE)]}
 if re.search(r'백반증|vitiligo|백납',k,re.I) or re.search(r'^백반(?:$|관리법|따가움|명의|심해요|없애는법|완치|원인|잘하는곳|재발|치료|한방|한약|후기)',k):grade,score,cap,why='HOLD_SCOPE',0,70,'2026-09-14 사용자 지시: 백반증 전부 최소 기본입찰 70원 유지'
 elif '소잠' in k:grade,score,cap,why='BRAND',80,None,'브랜드 수요 유지; 신규 비브랜드와 분리'
 elif re.search(SHOP,k) and not re.search(r'부작용|알레르기|접촉.*피부염|패치검사',k):grade,score,cap,why='X_PRODUCT',0,70,'제품 탐색; 치료 상담 운영에서 제외'
 elif re.search(OTHER,k) or re.search(r'쌍꺼풀|발톱무좀기계',k):grade,score,cap,why='X_OTHER',0,70,'명시적 타진료·비관련 탐색 제외'
 elif re.search(MEDICAL,k):grade,score,cap,why='MEDICAL',10,300,'전문·긴급 진료 적합성 우선; 패키지 확대 제외'
 elif re.search(PRIOR,k):grade,score,cap,why='HOLD_SCOPE',15,500,'이전 운영 제한 질환; 신규 확대 및 재개 금지'
 elif re.search(r'대학병원|종합병원|의료원|세브란스|아산병원|광선치료',k):grade,score,cap,why='PROVIDER_SCOPE',30,1000,'특정 기관·치료방식 탐색; 한의원 진료와의 적합성 확인 전 제한'
 elif re.search(r'눈가려|눈간지|안구',k):grade,score,cap,why='AUX_SCOPE',20,500,'안과 증상 가능성; 피부 치료 탐색으로 자동 확대하지 않음'
 elif re.search(r'무좀|백선|완선|어루러기',k):grade,score,cap,why=('A_AUX',60,2000,'진균성 피부질환 치료 탐색; 핵심 검증군보다 제한') if flags['care'] and not flags['info'] else ('D_AUX',30,700,'진균성 피부질환 정보·증상 탐색')
 elif re.search(r'질염|질입구|회음부|소음순|구강|구내염|설염|입안',k):grade,score,cap,why='AUX_SCOPE',20,500,'구강·부인과 등 피부 핵심 진료 외 범위 확인 전 제한'
 elif not flags['core'] and re.search(r'단순포진|입술포진|헤르페스|장미색비강진|침독|옴진드기|수포|물집|피지낭종|종기|알러지|알레르기|칸디다|피지샘|피부근염|땀띠',k):grade,score,cap,why=('A_AUX',60,2000,'기타 피부질환 진료 탐색; 진료 적합성 추가 확인') if flags['care'] and not flags['info'] else ('D_OTHER_SKIN',30,1000,'기타 피부질환·증상 탐색; 장기치료 의도 미확인')
 elif flags['core'] and flags['care'] and not flags['info'] and (flags['persistent'] or flags['burden']):grade,score,cap,why='S',95,4500,'지속·부담 증상과 치료 탐색 동시 확인'
 elif flags['core'] and flags['care'] and not flags['info']:grade,score,cap,why='A',80,3500,'피부질환 치료기관·진료 탐색'
 elif flags['core'] and (flags['persistent'] or flags['burden']):grade,score,cap,why='B',65,2200,'지속·생활 불편 신호; 치료기관 선택은 미확인'
 elif flags['core'] and not flags['info']:grade,score,cap,why='C_DISEASE',45,1500,'질환·증상명; 치료 선택 의도는 미확인'
 elif flags['core']:grade,score,cap,why='D_INFO',25,900,'원인·자가관리·약물 정보 탐색'
 else:grade,score,cap,why='U',20,500,'핵심 피부 치료 의도가 명확하지 않음; 증액하지 않고 제한 운영'
 if flags['remote'] and grade in ['S','A','B','C_DISEASE','D_INFO']:
  cap=min(cap,1500);why+='; 원거리 지역 탐색은 진료권 적합성 미확인으로 제한'
 return dict(grade=grade,intent_score=score,effective_bid_cap=cap,reason=why,**flags)
