# -*- coding: utf-8 -*-
"""소잠 15만원 재세팅 입력 생성 — 등급/노출이력/지역판정만 만든다. 실제 변경은 sojam_reset_150k.js."""
import collections, csv, gzip, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'reports/sojam-20260909/plan/전체키워드_조정판정.csv.gz')
OUT = os.path.join(ROOT, 'reports/sojam-20260909/reset-150k/input.json')

EXCLUDED = {'HOLD_SCOPE', 'AUX_SCOPE', 'PROVIDER_SCOPE', 'X_PRODUCT', 'X_OTHER'}
CORE = {'S', 'A', 'A_AUX', 'B'}

# 원장 지시: 본원 진료권은 강남권. 그 외 지역명 접두는 확대 대상에서 뺀다.
GANGNAM = ['강남역', '강남', '신논현', '논현동', '논현', '신사', '압구정', '청담', '삼성중앙', '삼성',
           '선릉', '역삼', '서초', '교대', '방배', '양재', '매봉', '도곡', '대치', '한티', '개포',
           '일원', '수서', '잠원', '반포', '고속터미널', '학동', '언주', '봉은사']
# _sojam_e0831_bare.js REGION 에서 강남권을 뺀 나머지 (접두 판정용)
OTHER_REGION = ['서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '제주', '강원',
 '충북', '충남', '전북', '전남', '경북', '경남', '수도권', '전국',
 '송파', '잠실', '석촌', '문정', '가락', '천호', '강동', '명일', '길동', '둔촌', '상일', '고덕', '암사',
 '광진', '건대', '구의', '자양', '아차산', '중곡', '군자', '성수', '왕십리', '성동', '옥수', '금호',
 '용산', '이태원', '한남', '청파', '마포', '홍대', '합정', '상암', '공덕', '서대문', '신촌', '충정로',
 '은평', '불광', '연신내', '종로', '혜화', '대학로', '동대문', '청량리', '중랑', '묵동', '면목', '상봉',
 '성북', '길음', '미아', '노원', '상계', '중계', '하계', '도봉', '창동', '방학', '강북', '수유', '번동',
 '영등포', '여의도', '당산', '구로', '신도림', '가산', '금천', '독산', '관악', '신림', '봉천', '동작',
 '사당', '이수', '노량진', '양천', '목동', '신정', '강서', '화곡', '까치산', '마곡', '발산', '우장산',
 '양평', '청학동', '원당', '신길', '대림', '보라매', '상도', '흑석', '회기', '석계', '태릉', '공릉',
 '수락', '불암', '분당', '판교', '정자', '서현', '수내', '야탑', '성남', '모란', '위례', '하남', '미사',
 '구리', '남양주', '다산', '별내', '의정부', '양주', '동두천', '포천', '파주', '운정', '일산', '고양',
 '화정', '행신', '능곡', '김포', '부천', '중동', '상동', '광명', '철산', '시흥', '안산', '상록수', '안양',
 '평촌', '범계', '인덕원', '군포', '산본', '의왕', '과천', '수원', '영통', '광교', '매탄', '권선', '장안',
 '팔달', '용인', '기흥', '수지', '동백', '죽전', '보정', '오산', '평택', '송탄', '안성', '이천', '여주',
 '화성', '동탄', '병점', '봉담', '향남', '남양', '시화', '정왕', '계양', '부평', '작전', '송도', '청라',
 '검단', '연수', '주안', '간석', '구월', '제물포', '동암', '천안', '아산', '서산', '당진', '논산', '공주',
 '청주', '오창', '충주', '제천', '유성', '전주', '익산', '군산', '정읍', '남원', '순창', '목포', '여수',
 '순천', '나주', '포항', '경주', '구미', '김천', '안동', '상주', '칠곡', '경산', '영주', '창원', '김해',
 '양산', '진주', '통영', '거제', '밀양', '사천', '서면', '해운대', '수성구', '동래', '부산진', '남포',
 '광안', '센텀', '기장', '일광', '정관', '원주', '춘천', '강릉', '속초', '동해', '삼척', '서귀포',
 '경성대', '부산대']
GANGNAM_S = sorted(GANGNAM, key=len, reverse=True)
OTHER_S = sorted(OTHER_REGION, key=len, reverse=True)


def region_of(keyword):
    """접두에서만 지역어를 본다. 중간 제거는 '유사천포창'류 파괴가 나므로 하지 않는다."""
    k = re.sub(r'[\s·\-_,.]', '', keyword)
    for t in GANGNAM_S:
        if k.startswith(t):
            return 'gangnam'
    for t in OTHER_S:
        if k.startswith(t):
            return 'other'
    return 'none'


# 2026-09-14 사용자 최신 지시: 백반증은 전부 최소입찰. 9/9의 백반증 유지 예외는 폐기한다.
# 다한증만 기존 유지 축으로 재분류한다.
REGRADE = re.compile(r'다한증')


def _regrader():
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import sojam_intent_policy as pol
    pol.PRIOR = pol.PRIOR.replace('|다한증', '')
    pol.CORE = pol.CORE + r'|다한증'
    assert '백반증' in pol.PRIOR and '다한증' not in pol.PRIOR
    return pol.classify


def main():
    regrade = _regrader()
    out = []
    seen = set()
    regraded = collections.Counter()
    for x in csv.DictReader(gzip.open(SRC, 'rt', encoding='utf-8')):
        kid = list(x.values())[0]
        if kid in seen:
            continue
        seen.add(kid)
        grade = x['grade']
        if grade == 'HOLD_SCOPE' and REGRADE.search(x['keyword']):
            grade = regrade(x['keyword'])['grade']
            regraded[grade] += 1
        imp = float(x['period_impressions'] or 0)
        cost = float(x['period_cost'] or 0)
        excluded = grade in EXCLUDED
        # 변경 후보가 아닌 행은 버려서 입력을 가볍게 유지한다
        if not excluded and not (imp >= 1 or grade in CORE):
            continue
        out.append({
            'keyword_id': kid, 'keyword': x['keyword'], 'group_id': x['group_id'],
            'campaign_id': x['campaign_id'], 'campaign_name': x['campaign_name'],
            'grade': grade, 'excluded': excluded, 'core': grade in CORE,
            'has_impression': imp >= 1, 'period_impressions': imp, 'period_cost': cost,
            'period_avg_rank': x['period_avg_rank'] or None,
            'region': region_of(x['keyword']),
        })
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False)
    print(json.dumps({'rows': len(out), 'regraded': dict(regraded),
                      'excluded': sum(1 for r in out if r['excluded']),
                      'with_impression': sum(1 for r in out if r['has_impression']),
                      'core_no_impression_gangnam_or_none': sum(
                          1 for r in out if r['core'] and not r['has_impression'] and r['region'] != 'other'),
                      'core_no_impression_other_region': sum(
                          1 for r in out if r['core'] and not r['has_impression'] and r['region'] == 'other')},
                     ensure_ascii=False))


if __name__ == '__main__':
    main()
