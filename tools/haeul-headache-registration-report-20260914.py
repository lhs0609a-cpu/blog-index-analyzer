import csv,json
from pathlib import Path
d=Path(__file__).resolve().parents[1]/'output/haeul-headache-20260914'
s=json.loads((d/'registration-state.json').read_text(encoding='utf-8'))
p=json.loads((d/'registration-plan.json').read_text(encoding='utf-8'))
assert s['complete']
rows=s['results']
with (d/'등록결과.csv').open('w',encoding='utf-8-sig',newline='') as f:
    fields=['keyword','axis','priority','registered','id','status','inspectStatus','useGroupBidAmt','bidAmt','userLock']
    w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader();w.writerows(rows)
status={}
for r in rows:status[r['status']]=status.get(r['status'],0)+1
text=f'''# 해울 두통 키워드 등록 결과 — 2026-09-14

- 사용자 “등록해줘” 지시에 따라 추가 후보 141개를 검토했다.
- 등록 확인: {len(rows)}개. 그중 우선 검토 목록: {sum(r['priority'] for r in rows)}개.
- 제외: {len(p['skipped'])}개. 정보·상품 탐색 보류 또는 최신 계정의 중복 키워드.
- 계정: 3442423, 그룹: (모)해울한의원 파워링크_두통 (`{p['gid']}`).
- 입찰: 그룹 기본 입찰가 2,000원 상속. 실제 클릭 비용은 이 설정값과 다를 수 있다.
- 메인 캠페인 일예산 60,000원 및 그룹 설정을 전후 대조해 유지 확인. 확장검색 꺼짐.
- 활성 승인 소재의 PC·모바일 연결이 해울 홈페이지인 것을 확인했다.
- 등록 후 상태: {json.dumps(status,ensure_ascii=False)}. 실제 노출·클릭·내원 발생 확인과는 별개다.
- 42개는 APPROVED/ELIGIBLE, 96개는 UNDER_REVIEW/PAUSED(검수 대기)였다. 모두 키워드 운영은 켜져 있다.
- 등록 키워드 재조회로 ID·등록 상태·그룹 입찰가 사용·운영 켜짐을 검증했다.
- 최신 전수 원장 조회 시각(UTC): {p['censusAt']}.
- 검색량은 미확인 상태로 유지한다. 검색량이 적다는 이유로 후보를 제외하지 않았다.

## 제외 내역

| 키워드 | 사유 |
|---|---|
'''
for r in p['skipped']:text+=f"| {r['keyword']} | {r['reason']} |\n"
(d/'등록결과.md').write_text(text,encoding='utf-8')
print(json.dumps({'registered':len(rows),'status':status},ensure_ascii=False))
