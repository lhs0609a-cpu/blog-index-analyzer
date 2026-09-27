import json
from pathlib import Path
from collections import Counter
from datetime import datetime
from zoneinfo import ZoneInfo
from openpyxl import Workbook
root=Path(__file__).resolve().parents[2]
out=root/'reports/sojam-20260909/afternoon-boost-2'
r=json.loads((out/'result.json').read_text(encoding='utf-8'))
assert r['complete'] and all(x['verified'] for x in r['keywords']+r['budgets'])
wb=Workbook();wb.remove(wb.active)
for name,rows in [('입찰 변경 검증',r['keywords']),('예산 변경 검증',r['budgets'])]:
 ws=wb.create_sheet(name);cols=list(rows[0]);ws.append(cols)
 for row in rows:ws.append([row.get(c) for c in cols])
 ws.freeze_panes='C2';ws.auto_filter.ref=ws.dimensions
wb.save(out/'2차_증액_검증.xlsx')
t=datetime.fromisoformat(r['finished'].replace('Z','+00:00')).astimezone(ZoneInfo('Asia/Seoul')).strftime('%Y-%m-%d %H:%M:%S KST')
counts=dict(Counter(x['grade'] for x in r['keywords']))
text=f'''2026-09-09 오후 2차 증액 완료: {t}.

사용자가 1차 증액 이후 다시 중요한 키워드부터 예산과 입찰을 대폭 올리라고 명시 지시했다. 최신 상태와 소재 승인 확인 및 변경 전 백업 후 S 등급 우선, A 등급 순서로 실제 적용했다. {len(r['keywords'])}등록 입찰 및 2캠페인 예산 모두 재조회 검증 완료. 등급별 {counts}.

직전 값에서 S 최대 100%, A 약 50% 증액(10원 내림, 기기 가중치 반영 상한 S 15,000원/A 10,500원). 이 상한은 실제 CPC나 노출 보장이 아니다. 주력 일예산 120,000→160,000원, 대표 20,000→40,000원. 전체 일예산 196,650→256,650원. 사용자에게 적용 전 총액과 15만원 초과 소진 가능성을 설명했다. 15만원 자동중지는 없고 설정은 다음 날도 유지된다.

적용 전 최신 보고서 41,636원(14:43 갱신, 15:13 조회). 1차 증액의 성과가 충분히 집계되기 전 사용자 요청에 따라 추가 확대했으며, 문의·내원·결제 증가가 입증된 조정은 아니다. 과거 중지 및 원거리 제한을 해제하지 않았다.

백업·계획·검증·엑셀: reports/sojam-20260909/afternoon-boost-2/ (before.json, plan.json, result.json, campaigns_after.json, 2차_증액_검증.xlsx). 이 폴더가 이전 afternoon-boost/보다 최신 설정이다.
'''
(out/'결과.md').write_text(text,encoding='utf-8')
with (root/'docs/advertisers/sojam-operating-memory.md').open('a',encoding='utf-8') as f:f.write('\n\n'+text)
print(json.dumps({'finished':t,'count':len(r['keywords']),'grades':counts,'total':r['total_after']},ensure_ascii=False))
