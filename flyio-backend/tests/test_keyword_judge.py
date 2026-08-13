# -*- coding: utf-8 -*-
"""
키워드 판정층 회귀 테스트 — docs/AUTO_KEYWORD_ENGINE_SPEC.md P0 완료 판정.

여기 있는 함정은 전부 **프로덕션에서 실제로 오판된 것**이다.
앞으로 판정기를 어떻게 고치든 이것들이 다시 깨지면 안 된다.

실행: python flyio-backend/tests/test_keyword_judge.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

from services.keyword_judge import (  # noqa: E402
    Mode,
    Verdict,
    find_matches,
    judge,
    judge_batch,
)

failures = []


def check(name, cond, detail=''):
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}" + (f'  — {detail}' if detail else ''))
    if not cond:
        failures.append(name)


# 소잠한의원(피부 전문) 기준
SKIN_ON = ['피부', '여드름', '아토피', '건선', '탈모', '습진', '두드러기', '무좀', '완선',
           '두피', '모공', '각질', '트러블', '뾰루지', '포피염', '어린선', '한의원', '한방',
           '한약', '약침', '피부과', '주사', '화병', '우울', '마사지', '태열', '알레르기']
SKIN_OFF = ['청바지', '슬랙스', '스커트', '치마', '패딩', '원피스', '항공권', '호텔', '여행',
            '목걸이', '팔찌', '가방', '시계', '선물', '택배', '청소', '치킨', '맥주', '골드',
            '코트', '투어', '배구공', '키보드', '받침', '파쇄', '분양', '아파트', '임플란트',
            '크로스핏', '환풍기', '러닝화', '스마트워치', '용접']

print('=' * 72)
print('1. ★프로덕션 오판 사례 — 삭제 판정에서 살아남아야 한다')
print('=' * 72)
# (키워드, 기대, 실제로 뭐였나)
MUST_KEEP = [
    ('코트러블',        '코 트러블 — 피부. `코트`(의류)로 잡혔었다'),
    ('치킨여드름',      '여드름 — `치킨`으로 잡혔었다'),
    ('골드PTT피부과',   '피부과 — `골드`로 잡혔었다'),
    ('탈모맥주효모',    '탈모 — `맥주`로 잡혔었다'),
    ('탈모보조제',      '탈모'),
    ('한약택배',        '한약 — `택배`로 잡혔었다'),
    ('다이어트한약택배', '한약'),
    ('어린선물섭취',    '어린선(피부병) — `선물`로 잡혔었다'),
    ('경면주사팔찌',    '경면주사(한약재) — `팔찌`로 잡혔었다'),
    ('화병병원',        '화병(火病) — 꽃병으로 오인됐었다'),
    ('청소년우울증',    '우울 — `청소`로 잡혔었다'),
    ('팔꿈치마사지',    '마사지 — `치마`로 잡혔었다'),
    ('컨투어핏주사',    '주사 시술 — `투어`로 잡혔었다'),
    ('얼굴뾰루지',      '뾰루지 — 감사가 무관으로 셌었다'),
    ('귀두포피염',      '포피염 — 감사가 무관으로 셌었다'),
]
for kw, why in MUST_KEEP:
    j = judge(kw, SKIN_ON, SKIN_OFF, mode=Mode.DELETE)
    check(f'{kw} 보존', j.verdict is not Verdict.OFF, f'{j.verdict.value} / {why}')

print()
print('=' * 72)
print('2. 확실한 무관은 삭제 판정을 받아야 한다')
print('=' * 72)
MUST_DELETE = ['하체비만청바지', '하체비만슬랙스', '도쿄항공권', '보라카이항공권',
               '엠제이드가방', '아기미아방지목걸이', '대전호텔', '미카사 배구공 추천',
               '키보드손목받침', '북해도여행']
for kw in MUST_DELETE:
    j = judge(kw, SKIN_ON, SKIN_OFF, mode=Mode.DELETE)
    check(f'{kw} 삭제', j.verdict is Verdict.OFF, f'{j.verdict.value} — {j.reason}')

print()
print('=' * 72)
print('3. 등록 판정 — 오염을 막는 쪽으로 보수적이어야 한다')
print('=' * 72)
# 등록 게이트에서 실제로 통과해버렸던 것들
MUST_NOT_REGISTER = ['푸마러닝화', '용접봉종류', '혈압스마트워치', '계양아파트분양',
                     '문서파쇄비용', '키보드손목받침', '물방울다이아목걸이', '하남크로스핏',
                     '무소음환풍기', '마곡임플란트']
for kw in MUST_NOT_REGISTER:
    j = judge(kw, SKIN_ON, SKIN_OFF, mode=Mode.REGISTER)
    check(f'{kw} 등록 안 됨', j.verdict is not Verdict.ON, f'{j.verdict.value} — {j.reason}')

print()
MUST_REGISTER = ['아토피한의원', '분당아토피', '무좀치료한의원', '여드름흉터',
                 '두드러기원인', '완선치료', '지루성두피염']
for kw in MUST_REGISTER:
    j = judge(kw, SKIN_ON, SKIN_OFF, mode=Mode.REGISTER)
    check(f'{kw} 등록 허용', j.verdict is Verdict.ON, f'{j.verdict.value} — {j.reason}')

print()
print('=' * 72)
print('4. 지역 토큰 함정 (도곡성장 160개 사고)')
print('=' * 72)
GROWTH_ON = ['성장', '키성장', '성장판', '소아', '한의원']
REGION_TRAP = ['곡성', '고양', '광주']
for kw, want_keep in [('도곡성장클리닉', True), ('곡성성장클리닉', True),
                      ('고양이주름', False), ('물광주사', True)]:
    j = judge(kw, GROWTH_ON if want_keep else [], REGION_TRAP, mode=Mode.DELETE)
    ok = (j.verdict is not Verdict.OFF) if want_keep else True
    check(f'{kw} {"보존" if want_keep else "판정"}', ok, f'{j.verdict.value} — {j.reason}')

print()
print('=' * 72)
print('5. 위치 강도 판정')
print('=' * 72)
m = find_matches('하체비만청바지', ['청바지'])
check('맨 뒤 → STRONG', m and m[0].strong)
m = find_matches('코트러블', ['코트'])
check('뒤에 한글 이어짐 → WEAK', m and not m[0].strong, '코[트러블]')
m = find_matches('청바지쇼핑몰', ['청바지'])
check('중간 → WEAK', m and not m[0].strong)
m = find_matches('미카사 배구공 추천', ['배구공'])
check('공백 앞 → STRONG', m and m[0].strong)
m = find_matches('두통약', ['두통'])
check('조사/접미 앞 → 판정됨', bool(m))

print()
print('=' * 72)
print('6. 판정불가를 숨기지 않는다 (미분류 0%는 가짜 지표)')
print('=' * 72)
res = judge_batch(['얼굴뾰루지', '하체비만청바지', '문서파쇄비용', '용접봉종류'],
                  SKIN_ON, SKIN_OFF, mode=Mode.DELETE)
check('unknown 이 별도로 나온다', 'unknown' in res and isinstance(res['unknown'], list))
check('serp_queue 로 넘어간다', res['serp_queue'] == res['unknown'])
check('decided_rate 가 1.0 이 아니다', res['decided_rate'] < 1.0,
      f"decided={res['decided_rate']} unknown={res['unknown']}")

print()
print('=' * 72)
print('7. 방향별 비대칭 — 같은 키워드가 모드에 따라 달라야 한다')
print('=' * 72)
kw = '탈모맥주효모'
jd = judge(kw, SKIN_ON, SKIN_OFF, mode=Mode.DELETE)
jr = judge(kw, SKIN_ON, SKIN_OFF, mode=Mode.REGISTER)
check('삭제 판정에선 보존', jd.verdict is not Verdict.OFF, jd.verdict.value)
check('등록 판정에선 통과 못 함', jr.verdict is not Verdict.ON, jr.verdict.value)

print()
if failures:
    print(f'FAILED {len(failures)}건: {failures}')
    sys.exit(1)
print('전부 통과 — P0 완료 판정 충족')
