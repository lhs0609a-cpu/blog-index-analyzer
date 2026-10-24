import json,csv
from pathlib import Path
from collections import Counter
D=Path(__file__).resolve().parents[1]/'output/haeul-all-discovery-20260914'
p=json.loads((D/'registration-plan.json').read_text(encoding='utf-8'))
out=[];groups=[];adstats=Counter();camp=None;rejected=[]
for gp in p['groups']:
 s=json.loads((D/f"registration-apply-{gp['index']}.json").read_text(encoding='utf-8'))
 assert s['complete'] and s['axis']==gp['axis']
 assert {r['keyword'] for r in s['results']}|{r['keyword'] for r in s.get('rejected',[])}=={r['keyword'] for r in gp['items']}
 rejected.extend({'axis':s['axis'],**r} for r in s.get('rejected',[]))
 g=s['group'];camp=s['campaign']
 assert g['userLock']==gp['hold'] and g['dailyBudget']==1000 and g['bidAmt']==70 and not g['useExpSearch']
 assert camp['dailyBudget']==60000 and camp['userLock']==p['campaignBefore']['userLock']
 for ad in s['ads']:
  b=ad['ad']['basic'];assert b['pc']['final'].rstrip('/')=='https://haeulclinic.com' and b['mobile']['final'].rstrip('/')=='https://haeulclinic.com'
  adstats[ad['inspectStatus']]+=1
 for r in s['results']:out.append({'axis':s['axis'],'group':g['name'],'group_id':g['nccAdgroupId'],'group_on':not g['userLock'],'hold_reason':s['holdReason'],**r})
 groups.append({'axis':s['axis'],'group':g['name'],'gid':g['nccAdgroupId'],'registered':len(s['results']),'priority300':sum(r['bidAmt']==300 for r in s['results']),'standard70':sum(r['bidAmt']==70 for r in s['results']),'group_on':not g['userLock'],'dailyBudget':g['dailyBudget'],'expSearch':g['useExpSearch'],'ad_inspect':';'.join(ad['inspectStatus'] for ad in s['ads']) or '소재없음','hold_reason':s['holdReason']})
assert len(out)+len(rejected)==sum(len(g['items']) for g in p['groups'])
assert len({r['id'] for r in out})==len(out)==len({r['keyword'] for r in out})
def write(name,rs):
 with (D/name).open('w',encoding='utf-8-sig',newline='') as f:
  w=csv.DictWriter(f,fieldnames=list(rs[0]));w.writeheader();w.writerows(rs)
write('대량등록_키워드결과.csv',out);write('대량등록_그룹결과.csv',groups);write('대량등록_소재준비대기.csv',[r for r in out if not r['group_on']])
if rejected:write('대량등록_등록거부.csv',rejected)
summary={'registered':len(out),'rejected':rejected,'groups':len(groups),'on_groups':sum(g['group_on'] for g in groups),'on_group_keywords':sum(r['group_on'] for r in out),'held_group_keywords':sum(not r['group_on'] for r in out),'priority300':sum(r['bidAmt']==300 for r in out),'standard70':sum(r['bidAmt']==70 for r in out),'keyword_inspect':dict(Counter(r['inspectStatus'] for r in out)),'keyword_status':dict(Counter(r['status'] for r in out)),'ad_inspect':dict(adstats),'campaign_status':camp['status'],'campaign_reason':camp.get('statusReason'),'campaign_dailyBudget':camp['dailyBudget'],'duplicates':len(p['skipped'])}
(D/'registration-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
md=f'''# 해울 전체 진료 분야 키워드 등록 결과

사용자의 “등록해줘” 지시에 따라 발굴 후보를 실제 네이버 광고 계정 3442423에 등록했다.

- 등록: {summary['registered']:,}개, 분야별 그룹 {len(groups)}개. 최신 계정 중복 제외 {len(p['skipped'])}개.
- 네이버 등록 거부: {len(rejected)}개. 사유는 `대량등록_등록거부.csv`에 기록했다. 금지어를 우회 등록하지 않았다.
- 키워드 개별 입찰: 우선 검토 {summary['priority300']}개 300원, 나머지 {summary['standard70']}개 70원. 모두 개별 입찰가 사용.
- 신규 그룹 일한도: 각 1,000원. 기존 메인 캠페인 일예산 60,000원 유지. 그룹 일한도 합산이 캠페인 예산에 추가되는 것은 아니다.
- 운영 켜진 그룹: {summary['on_groups']}개, 키워드 {summary['on_group_keywords']:,}개. 등록·운영 켜짐과 실제 노출은 다르다.
- 소재 준비 대기: {summary['held_group_keywords']:,}개. 과민성대장증후군·생리통·집중력저하·수험생우울증 4개 그룹은 해당 분야의 소재를 준비하기 전까지 중지했다. 키워드 등록 자체는 완료했다.
- 키워드 심사 상태: {json.dumps(summary['keyword_inspect'],ensure_ascii=False)}.
- 새 소재 심사 상태: {json.dumps(summary['ad_inspect'],ensure_ascii=False)}.
- 마지막 확인 시 캠페인 상태: {summary['campaign_status']} / {summary['campaign_reason']}. 예산 소진 상태인 경우 캠페인 예산 조건이 해제되어야 집행될 수 있다.
- 활성 대상에는 기존 승인 원본 `한83947`의 문구·이미지·홈페이지 연결을 그대로 사용했다. 새 소재 등록에 따른 네이버 검수는 별도이며, 새로운 의료광고 문구의 심의를 받은 것은 아니다.
- 신규 그룹 전부 확장검색 꺼짐. PC·모바일 소재 연결 `https://haeulclinic.com`. 기존 브레인포그 소재의 정리는 이번 작업 범위가 아니다.
- 그룹별 등록 후 키워드 ID·입찰가·개별입찰 사용·운영 상태, 그룹 예산·잠금·확장검색 및 캠페인 예산 유지 여부를 API 재조회로 검증했다.

| 진료 주제 | 등록 | 그룹 운영 | 소재 상태 |
|---|---:|---|---|
'''
for g in groups:md+=f"| {g['axis']} | {g['registered']} | {'켜짐' if g['group_on'] else '보류'} | {g['ad_inspect']} |\n"
md+='''
검색량이 미확인되었거나 `< 10`인 후보도 사용자 요청에 따라 포함했다. 검색량 응답·검수 승인·실제 노출·내원 성과는 각각 별도다. 이번 등록 수를 실수요 키워드 수나 성과 개선으로 해석하지 않는다.
'''
(D/'대량등록_결과.md').write_text(md,encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False))
