import csv,json,re
from pathlib import Path
from collections import Counter
from datetime import datetime,timezone
D=Path(__file__).resolve().parents[1]/'output/haeul-all-discovery-20260914'
c=json.loads((D/'config.json').read_text(encoding='utf-8'));e=json.loads((D/'remote-evidence.json').read_text(encoding='utf-8'))
norm=lambda s:re.sub(r'\s+','',s).lower()
existing={norm(k) for k in e['existing']}
terms=sorted([(norm(t),a['axis']) for a in c['axes'] for t in a['terms']],key=lambda p:-len(p[0]))
bank={r['keyword']:{**r,'origins':{r['origin']},'evidence_seeds':set()} for r in c['candidates']}
vol={};queried=set();acwords=set();unrelated=set()
for batch in e['volume']:
    queried.update(norm(k) for k in batch['hints'])
    for r in batch['rows']:vol[norm(r['relKeyword'])]=r
def add(kw,origin,seeds):
    k=norm(kw)
    if not 2<=len(k)<=25:return
    if k not in bank:
        axis=next((a for t,a in terms if t in k),None)
        if axis is None:unrelated.add(k);return
        bank[k]={'keyword':k,'display':kw,'axis':axis,'origin':origin,'origins':set(),'evidence_seeds':set(),'clinic_source':c['clinic_source'],'priority':2}
    bank[k]['origins'].add(origin);bank[k]['evidence_seeds'].update(seeds)
for b in e['volume']:
    hints={norm(k) for k in b['hints']}
    for r in b['rows']:add(r['relKeyword'],'네이버 입력어 검색량 조회' if norm(r['relKeyword']) in hints else '네이버 연관 제안',b['hints'])
for b in e['autocomplete']:
    for k in b['words']:
        acwords.add(norm(k));add(k,'네이버 자동완성',[b['seed']])

emergency=re.compile('뇌출혈|뇌경색|뇌졸중|벼락|의식없|의식소실|응급실|119|자살|죽고싶|갑자기.*마비')
offering=re.compile('영양제|유산균|마그네슘|비타민|타이레놀|탁센|이지엔|나프록센|이미그란|나라믹|보톡스|엠갤러티|아조비|누리텍|리보트릴|인데놀|졸피뎀|멜라토닌|영양식|좋은음식|좋은차|지압|혈자리|마사지|논문|ppt|pdf|나무위키|디시|더쿠|만화|짤|코드|보험청구|산재|장애등급|군대|공익|면제')
faraway=re.compile('부산|대구|대전|광주|울산|제주|창원|청주|전주|천안|춘천|강릉|포항|김해|목포|순천|여수|구미|대학병원|서울대병원|아산병원|세브란스|삼성서울')
intent=re.compile('한의원|한방|한약|치료|상담|병원|진료|안들|안낫|약먹어도|먹어도|계속|반복|재발|몇달|매일|만성|못자|못해|비용|기간')
def bounds(v):
    if v is None:return None,None
    if isinstance(v,str) and '<' in v:return 0,9
    try:return int(v),int(v)
    except (ValueError,TypeError):return None,None
rows=[]
for k,r in bank.items():
    v=vol.get(k);pc=v.get('monthlyPcQcCnt') if v else None;mo=v.get('monthlyMobileQcCnt') if v else None
    pl,pu=bounds(pc);ml,mu=bounds(mo)
    verified=pl is not None and ml is not None
    low=pl+ml if verified else '';high=pu+mu if verified else ''
    volume_status=('조회확인_10미만포함' if '<' in str(pc)+str(mo) else '조회확인_정수') if verified else ('조회응답에없음' if k in queried else '미조회')
    reason=''
    if emergency.search(k):reason='응급·위기 탐색'
    elif faraway.search(k):reason='타지역·타병원 탐색'
    elif offering.search(k):reason='상품·타치료·일반정보 탐색'
    elif len(k)>25:reason='키워드 길이 초과'
    priority=1 if intent.search(k) else 3
    rows.append({'keyword':k,'display':r['display'],'axis':r['axis'],'priority':priority,'review':'보류' if reason else '후보','hold_reason':reason,'existing':'기존등록' if k in existing else '신규후보','evidence':';'.join(sorted(r['origins'])),'autocomplete':'확인' if k in acwords else '', 'monthly_pc':pc if pc is not None else '', 'monthly_mobile':mo if mo is not None else '', 'monthly_total_min':low,'monthly_total_max':high,'volume_status':volume_status,'clinic_source':r['clinic_source'],'evidence_seeds':';'.join(sorted(r['evidence_seeds']))})
urgency=re.compile('약.*안들|먹어도|안낫|계속|반복|재발|몇달|매일|못자|못해|검사정상|검사.*정상|후유증|만성')
rows.sort(key=lambda r:(r['review']=='보류',r['priority'],not r['volume_status'].startswith('조회확인'),not bool(urgency.search(r['keyword'])),r['axis'],r['keyword']))
fields=list(rows[0])
def write(name,data,cols=fields):
    with (D/name).open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=cols,extrasaction='ignore');w.writeheader();w.writerows(data)
new=[r for r in rows if r['existing']=='신규후보' and r['review']=='후보']
known=[r for r in new if r['volume_status'].startswith('조회확인')]
low=[r for r in known if r['monthly_total_max']<100]
held=[r for r in rows if r['review']=='보류']
write('전체후보.csv',rows);write('신규후보.csv',new);write('검색량확인_신규후보.csv',known);write('저검색량_신규후보.csv',low);write('기존등록_재검토.csv',[r for r in rows if r['existing']=='기존등록']);write('보류후보.csv',held)
write('검색발생확인_신규후보.csv',[r for r in known if r['monthly_total_min']>0])
# 한 분야에 쏠리지 않도록 최대 25개씩 우선 검토; 실제 전환의 순위가 아니다.
short=[]
for a in c['axes']:short.extend([r for r in new if r['axis']==a['axis'] and r['priority']==1][:25])
write('분야별_우선검토.csv',short)
axisrows=[]
for a in c['axes']:
    axis=a['axis'];nr=[r for r in new if r['axis']==axis]
    axisrows.append({'분야':axis,'전체후보':sum(r['axis']==axis for r in rows),'신규후보':len(nr),'검색량확인신규':sum(r['volume_status'].startswith('조회확인') for r in nr),'월100미만신규':sum(r['axis']==axis for r in low),'우선검토':sum(r['axis']==axis for r in short),'예시':', '.join(r['keyword'] for r in nr[:3]),'근거':c['clinic_source']})
write('진료분야별_요약.csv',axisrows,list(axisrows[0]))
s={'axes':len(axisrows),'generated':len(c['candidates']),'all':len(rows),'new':len(new),'verified_new':len(known),'low_under100_new':len(low),'existing':sum(r['existing']=='기존등록' for r in rows),'held':len(held),'shortlist':len(short),'census_rows':len(e['existing']),'volume_batches':len(e['volume']),'returned_unique_volume':len(vol),'autocomplete_seeds':len(e['autocomplete']),'unrelated_filtered':len(unrelated),'errors':e['errors'],'censusAt':datetime.fromtimestamp(e['censusAt'],timezone.utc).isoformat()}
s['positive_volume_new']=sum(r['monthly_total_min']>0 for r in known)
s['both_below10_new']=sum(r['monthly_total_min']==0 and r['monthly_total_max']==18 for r in known)
(D/'summary.json').write_text(json.dumps(s,ensure_ascii=False,indent=2),encoding='utf-8')
report=f'''# 해울한의원 전체 진료 분야 키워드 발굴 — 2026-09-14

공식 홈페이지에 명시된 21개 진료 주제를 범위로 삼았다. 법정 진료과목 수가 아닌 홈페이지 진료 주제의 세분류다. 일반 한의원에서 취급할 수 있다는 이유로 다른 질환을 추가하지 않았다. 홈페이지의 치료 이론·효과 주장을 의학적 사실이나 광고 카피로 전용하지 않았다.

- 수동·조합 후보: {s['generated']:,}개. 실제 검색이 확인된 표현과는 구분한다.
- 네이버 연관키워드·자동완성 합류 후 관련 후보: {s['all']:,}개.
- 최신 계정 원장: {s['census_rows']:,}행, 조회 시각 UTC {s['censusAt']}.
- 중복·보류 제외 신규 후보: {s['new']:,}개.
- 그중 PC·모바일 검색량 응답 확인: {s['verified_new']:,}개. 합계 상한 기준 월 100 미만: {s['low_under100_new']:,}개.
- 검색량 하한이 0보다 큰 신규 후보: {s['positive_volume_new']:,}개. 양쪽 모두 `< 10`인 {s['both_below10_new']:,}개는 실제 검색이 있었다고 확정하지 않는다. 입력어가 응답에 그대로 포함된 경우 연관 추천과 구분했다.
- 분야별 우선 검토: {s['shortlist']:,}개. 실제 내원 확률이나 성과 순위가 아닌 검색 의도에 따른 정렬이다.
- 검색량 조회 배치 {s['volume_batches']}회, 자동완성 시드 {s['autocomplete_seeds']}개, 오류 {len(s['errors'])}건.
- 범위 밖 연관어 {s['unrelated_filtered']:,}개를 합류시키지 않았고, 상품·타지역·위기 의도 등 {s['held']:,}개를 보류 파일로 분리했다.

## 분야별 수량

| 분야 | 신규 후보 | 검색량 확인 신규 | 월100 미만 신규 |
|---|---:|---:|---:|
'''
for r in axisrows:report+=f"| {r['분야']} | {r['신규후보']} | {r['검색량확인신규']} | {r['월100미만신규']} |\n"
report+='''
## 적용 기준과 제한

- 검색량 최소 기준을 두지 않았다. `< 10`은 정확한 0이나 10으로 치환하지 않고 기기별 0~9 범위로 보존했다. 응답에 없는 키워드와 조회 실패·미조회도 구분했다.
- 미조회 조합은 제안 가설이다. 0회 검색, 실제 검색, 내원 의도 확정을 뜻하지 않는다. 진료명과 의도 조합도 실제 등록 전 문구 자연스러움과 진료 적합성을 검토한다.
- 홈페이지 진료 메뉴에 포함된 브레인포그/집중력 저하는 해당 분야 후보로 유지했다. 다른 질환 광고를 브레인포그 페이지로 연결한다는 뜻이 아니다.
- 세부 질환 페이지는 범위 근거이며, 신규 광고의 연결 승인이나 의료광고 심의가 완료된 주소가 아니다. 기존 승인 소재로 다루지 않는 분야는 소재·심의·연결 검토가 먼저 필요하다.
- 의약품·영양제·경혈·타지역 병원 연관어를 무차별 확장하지 않는다. 특히 전정신경염을 이유로 모든 이비인후과 질환, 집중력 저하를 이유로 ADHD·치매 치료까지 확장하지 않았다.
- 이번 작업은 대량 발굴과 파일 작성이다. 신규 광고 등록, 기존 광고 수정, 입찰·예산 변경을 실행하지 않았다.

## 공개 근거

- [해울 공식 진료 메뉴(불면증 페이지 내 전체 메뉴)](https://haeulclinic.com/Insomnia)
- [해울 홈페이지 주요 진료 안내](https://haeulclinic.com/)
- [수험생 우울증 진료 안내](https://haeulclinic.com/Exam-InducedDepression)
- 네이버 SearchAd `/keywordstool` 응답과 네이버 검색 자동완성 조회. 개별 시드는 CSV에 기록했다.
'''
(D/'발굴결과.md').write_text(report,encoding='utf-8')
assert len({r['keyword'] for r in rows})==len(rows)
assert all(r['keyword'] not in existing for r in new)
assert all(any(r['axis']==a['axis'] for r in new) for a in c['axes'])
print(json.dumps({k:v for k,v in s.items() if k!='errors'},ensure_ascii=False))
