# -*- coding: utf-8 -*-
"""sojam_reset_150k.js --apply 결과를 검증표(xlsx) + 요약(md)로 만든다. 실제 적용된 값만 쓴다."""
import collections, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DIR = os.path.join(ROOT, 'reports/sojam-20260909/reset-150k')

GRADE_LABEL = {
    'S': 'S 치료의도 최상', 'A': 'A 치료·진료 탐색', 'A_AUX': 'A_AUX 기타 피부질환 진료',
    'B': 'B 지속·생활불편', 'C_DISEASE': 'C 질환·증상명', 'D_OTHER_SKIN': 'D 기타 피부',
    'D_AUX': 'D 진균 등 보조', 'D_INFO': 'D 정보 탐색', 'MEDICAL': '전문·긴급 진료',
    'U': 'U 의도 미확정', 'HOLD_SCOPE': '진료범위 제외', 'AUX_SCOPE': '범위 확인 전 제한',
    'PROVIDER_SCOPE': '기관·치료방식 제한', 'X_PRODUCT': '제품 탐색 제외', 'X_OTHER': '비관련 제외',
}


def main():
    result = json.load(open(os.path.join(DIR, 'result.json'), encoding='utf-8'))
    plan = json.load(open(os.path.join(DIR, 'plan.json'), encoding='utf-8'))
    kws = result['keywords']
    assert all(k['verified'] for k in kws), '검증 실패 행이 있다'
    assert all(b['verified'] for b in result['budgets']), '예산 검증 실패 행이 있다'

    import openpyxl
    wb = openpyxl.Workbook()

    ws = wb.active
    ws.title = '캠페인예산'
    ws.append(['캠페인', '유형', '변경전 일예산', '변경후 일예산', '증감', '적용검증'])
    applied = {b['id']: b for b in result['budgets']}
    for b in sorted(plan['budgets'], key=lambda b: -b['after']):
        ws.append([b['name'], b['tp'], b['before'], b['after'], b['after'] - b['before'],
                   '적용·재조회 확인' if b['id'] in applied else ('변경 없음' if b['before'] == b['after'] else '미적용')])
    ws.append(['합계', '', plan['budget_total_before'], plan['budget_total_after'],
               plan['budget_total_after'] - plan['budget_total_before'], ''])

    ws = wb.create_sheet('키워드입찰')
    ws.append(['키워드', '중요도 등급', '조정 유형', '캠페인', '지역판정',
               '변경전 기본입찰', '변경후 기본입찰', 'PC 적용입찰', '모바일 적용입찰',
               '9/1~8 노출', '9/1~8 지출', '9/1~8 평균순위', '적용검증'])
    for k in sorted(kws, key=lambda k: -k['period_cost']):
        ws.append([k['keyword'], GRADE_LABEL.get(k['grade'], k['grade']), k['kind'], k['campaign_name'],
                   k['region'], k['before_base'], k['after_base'], k['pc_after'], k['mobile_after'],
                   k['period_impressions'], k['period_cost'],
                   round(float(k['period_avg_rank']), 2) if k['period_avg_rank'] else None,
                   '적용·재조회 확인'])

    ws = wb.create_sheet('등급별집계')
    ws.append(['중요도 등급', '조정 유형', '건수', '평균 변경전', '평균 변경후', '9/1~8 지출합'])
    agg = collections.defaultdict(list)
    for k in kws:
        agg[(k['grade'], k['kind'])].append(k)
    for (g, kind), rs in sorted(agg.items(), key=lambda kv: -sum(r['period_cost'] for r in kv[1])):
        ws.append([GRADE_LABEL.get(g, g), kind, len(rs),
                   round(sum(r['before_base'] for r in rs) / len(rs)),
                   round(sum(r['after_base'] for r in rs) / len(rs)),
                   round(sum(r['period_cost'] for r in rs))])

    for sheet in wb:
        for col in sheet.columns:
            width = max(len(str(c.value or '')) for c in col[:400])
            sheet.column_dimensions[col[0].column_letter].width = min(46, max(10, width + 2))
        sheet.freeze_panes = 'A2'
    out = os.path.join(DIR, '전체재세팅_검증.xlsx')
    wb.save(out)

    up = [k for k in kws if k['after_base'] > k['before_base']]
    down = [k for k in kws if k['after_base'] < k['before_base']]
    print(json.dumps({
        'xlsx': out, 'keywords': len(kws), 'up': len(up), 'down': len(down),
        'budgets_changed': len(result['budgets']),
        'budget_total_after': result.get('total_after'),
        'excluded_cut_cost_8d': round(sum(k['period_cost'] for k in kws if k['kind'] == '제외축_70원')),
        'finished': result.get('finished'),
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
