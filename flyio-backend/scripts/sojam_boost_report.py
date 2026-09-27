import json,csv,io
from pathlib import Path
from collections import Counter
from datetime import datetime
from zoneinfo import ZoneInfo
from openpyxl import Workbook
root=Path(__file__).resolve().parents[2]
out=root/'reports/sojam-20260909/afternoon-boost'
r=json.loads((out/'result.json').read_text(encoding='utf-8'))
assert r['complete'] and all(x['verified'] for x in r['keywords']+r['budgets'])
wb=Workbook();ws=wb.active;ws.title='입찰 변경 검증'
ks=r['keywords'];cols=list(ks[0]);ws.append(cols)
for k in ks:ws.append([k.get(c) for c in cols])
ws.freeze_panes='C2';ws.auto_filter.ref=ws.dimensions
bs=wb.create_sheet('예산 변경 검증');cols=list(r['budgets'][0]);bs.append(cols)
for b in r['budgets']:bs.append([b.get(c) for c in cols])
wb.save(out/'오후_증액_검증.xlsx')
t=datetime.fromisoformat(r['finished'].replace('Z','+00:00')).astimezone(ZoneInfo('Asia/Seoul')).strftime('%Y-%m-%d %H:%M:%S KST')
counts=Counter(x['grade'] for x in ks)
text=f'''# 소잠한의원 오후 증액 결과

적용 완료: {t}. 사용자의 오늘 실제 소진 15만원 목표 및 핵심 캠페인 예산·입찰 대폭 증액 지시로 실행.

치료형 키워드 {len(ks):,}등록 증액 및 재조회 검증 완료. 등급별 {dict(counts)}. A 기본입찰 약 75%, S 최대 100% 증액(10원 단위 내림, 기기 가중치 반영 상한 A 7,000원/S 9,000원). 실제 CPC와 입찰 설정은 다르다.

주력 파워링크 92,600→120,000원, 대표키워드 7,500→20,000원. 전체 일예산 설정 156,750→196,650원, 2개 변경 검증 완료. 15만원은 실제 소진 목표이며 자동 중지 기준을 설정한 것은 아니다. 15만원 초과 소진 가능성이 있고 일예산 변경은 오늘 이후에도 지속된다.

사전 확인된 보고서 소진 40,839원(13:43 갱신, 14:35 조회). 변경 이후 추가 소진·내원·결제 증가는 아직 검증되지 않았다. 이전 중지, 원거리 제한, 소재와 타기팅은 유지했다.

원본 before.json, 계획 plan.json, 결과 result.json, 캠페인 재조회 campaigns_after.json을 같은 폴더에 보관했다.
'''
(out/'결과.md').write_text(text,encoding='utf-8')
memory=root/'docs/advertisers/sojam-operating-memory.md'
with memory.open('a',encoding='utf-8') as f:f.write('\n\n'+text.replace('# 소잠한의원 오후 증액 결과','2026-09-09 오후 추가 증액:')+'\n')
print(json.dumps({'finished':t,'count':len(ks),'grades':dict(counts),'budgets':r['budgets'],'total_after':r['total_after']},ensure_ascii=False))
