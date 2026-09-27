"""Produce a Korean, paginated improvement explanation with actual preview captures."""
import html,json
from pathlib import Path
from playwright.sync_api import sync_playwright
import fitz

ROOT=Path(__file__).resolve().parents[2]
D=ROOT/'reports/sojam-20260914/proposal-improvements'
P=D/'소잠한의원_개선작업_설명서_2026-09-14.pdf'
pages=[]
def page(kicker,title,body):
    pages.append(f'<section class="page"><div class="eyebrow">SOJAM • {kicker}</div><h1>{title}</h1>{body}<footer>소잠한의원 개선작업 설명서 · 2026.09.14 <span>{len(pages)+1:02d}</span></footer></section>')
def table(headers,rows):return '<table><thead><tr>'+''.join(f'<th>{x}</th>'for x in headers)+'</tr></thead><tbody>'+''.join('<tr>'+''.join(f'<td>{x}</td>'for x in row)+'</tr>'for row in rows)+'</tbody></table>'
def box(title,text):return f'<div class="box"><h3>{title}</h3><p>{text}</p></div>'

page('작업 범위와 결과','무엇을 개선했고,<br>어디까지 적용했는가', '''<p class="intro">성장전략 제안서 23쪽을 현재 광고 계정·홈페이지·원내 기록과 대조하고, 실제 운영에 사용할 화면·문안·집계 도구를 만들었습니다.</p>
<div class="stats"><div><b>19개</b><small>개선 과제 정리</small></div><div><b>2개</b><small>질환별 랜딩 시안</small></div><div><b>478행</b><small>기존 문의 기록 연결</small></div></div>
<h2>이번 작업의 중심</h2><p>광고 클릭 이후 환자가 비용과 시간을 이해하고 예약하도록 안내하고, 실제 첫 내원·치료 시작·수납과 환불을 구분해서 확인하는 구조를 만들었습니다.</p>
'''+table(['구분','이번 작업 결과'],[
('실제 광고 적용','별도 선행 지시인 백반증 694개 등록 기본입찰 70원 적용·재조회 검증 완료.'),
('도구 구현 완료','문의·예약·내원·치료·수납 집계 도구, 입력 양식, 클릭 이벤트 연결용 스크립트.'),
('검토안 제작 완료','랜딩 2개, 홈페이지·FAQ 교체안, 상담 문안, 콘텐츠 8편 초안.'),
('아직 남은 실행','홈페이지 게시, 원내 운영 개시, 실제 첫 내원·결제 데이터 보완, 향후 성과 검증.')])+'''<div class="notice">이 문서는 작업 결과 설명서입니다. 시안 제작을 실제 홈페이지 반영으로, 집계 도구 구현을 내원·매출 증가로 표현하지 않았습니다.</div><p class="source">기준: 2026년 9월 14일 작업 당시 조회·검증 자료. 이후 계정 변경이나 실적은 반영하지 않았습니다.</p>''')

page('01 • 홈페이지','첫 방문 전에 필요한 정보를<br>한 화면 흐름으로 정리', '''<p>성인 아토피와 습진·한포진 방문자를 위한 랜딩 시안을 각각 만들었습니다. 증상 소개 뒤에 초진 시간·비용 확인 항목·진료 과정·FAQ·위치·문의 버튼이 이어집니다.</p>
<div class="screens"><div><img src="pdf-p01.png"><strong>성인 아토피 시안</strong></div><div><img src="pdf-p02.png"><strong>습진·한포진 시안</strong></div></div>
'''+table(['개선한 부분','구체적인 변경'],[
('예약 전 정보','초진 약 2시간이라는 기존 FAQ 안내와 비용 포함·별도 항목을 먼저 확인하도록 구성.'),
('문의 동선','주요 버튼은 초진 일정·비용 문의, 보조 버튼은 전화 문의로 정리.'),
('기대 조정','상담 문의와 예약 확정을 구분하고, 개인별 기간·결과를 보장하지 않는 문안 사용.')])+'''<div class="notice">현재는 검토용 시안입니다. 확정 비용·운영시간과 관리자 연결이 필요합니다. 공식 가격을 임의로 만들지 않아 시안의 비용 항목은 문의 안내로 남아 있습니다.</div>''')

page('02 • 홈페이지 문안','확인된 문제에 맞춰<br>교체할 문안을 준비',table(['확인한 문제','준비한 개선안','현재 상태'],[
('페이지별 동일한 제목','/26 성인 아토피, /31 습진, /32 한포진별 제목과 검색 설명 작성.','교체안 준비'),
('약 중단을 치료의 목적으로 표현한 FAQ','기존 약 목록을 준비하고 변경·중단은 해당 의료진과 상의하도록 수정.','의료진 검토·게시 필요'),
('특정 기간에 대한 과도한 기대','결제 단위, 관리기간, 재평가 시점을 구분하는 FAQ 작성.','교체안 준비'),
('개인정보 안내의 회사명·OOO·20XX 예시','실제 수집 항목·보유기간·수탁자·책임자를 확인하는 교체 골격 작성.','사실 확인 필요'),
('진료시간 정보 불일치','홈페이지·플레이스·카카오를 같은 운영정보 원본으로 맞추는 대조 절차 작성.','요일별 시간 확인 필요')])+'''<h2>FAQ 교체 문안 예시</h2><div class="quote">“사용 중인 먹는 약과 바르는 약의 이름 또는 처방 내용을 준비해 주세요. 약 변경이나 중단은 해당 의료진과 상의해 결정해 주세요.”</div><div class="quote">“현재 상태와 이전 치료, 경과에 따라 필요한 관리기간과 재평가 시점이 달라집니다. 특정 일수나 결제 기간이 치료 완료를 뜻하지 않습니다.”</div>
<p>아임웹의 기존 페이지를 백업하고 비공개 복제 페이지에서 검토한 후 반영하는 순서로 정리했습니다. /27은 성장기 아토피 페이지이므로 습진 페이지로 덮어쓰지 않습니다.</p><p class="source">모바일 가로 넘침은 검사에서 발견하지 못했습니다. 확인되지 않은 문제까지 개선 성과로 포함하지 않았습니다. 개인정보 안내는 완성된 처리방침이 아니라 실제 운영정보를 채워야 하는 초안입니다.</p>''')

page('03 • 상담과 예약','예약 전에 설명하고,<br>확정 이후에는 놓치지 않도록', '''<p>상담 담당자가 바로 검토할 수 있는 첫 응답, 비용·시간 설명, 예약 확정, 변경, 24시간 전 알림, 미내원 후 1회 확인 문안을 만들었습니다.</p>
<div class="flow">문의 접수 → 비용·시간 설명 → 예약 확정 → 첫 내원 확인</div>
'''+table(['단계','직원이 하는 일','기록할 내용'],[
('첫 응답','영업시간 내 30분 응답을 목표로 담당자가 확인.','실제 접수·첫 응답 시각'),
('예약 전 설명','초진 시간·비용·포함/별도 항목·방문 빈도·환불 절차 안내.','비용 설명·시간 설명 시각'),
('예약 확정','가능한 초진 슬롯과 방문 일정을 확인한 뒤 확정 안내.','확정 시각·예약 시각'),
('변경·취소','새 예약에 이전 예약 ID 연결, 취소는 기록 유지.','변경 연결·취소 상태'),
('내원·치료 확인','첫 내원인지 원내 기록 대조, 치료 시작은 별도 확인.','실제 첫 내원일·치료 시작일')])+'''<h2>설명 문안 예시</h2><div class="quote">“초진 예상 소요시간은 [확인 시간], 초진 비용은 [금액]입니다. [포함항목]이 포함되고 [별도항목]은 별도입니다. 진료 후 계획과 비용을 설명받고 치료 시작 여부를 결정하실 수 있습니다.”</div>
<div class="notice">문안과 기록 양식을 준비한 상태이며 실제 메시지를 발송하지 않았습니다. 대괄호 값은 원내 확정 정보로 채우고, 연락 가능 여부와 선호 채널을 확인한 뒤 사용합니다.</div><p class="source">30분 응답·예약 전 설명 95%·성숙 예약 내원율 65%는 검증할 운영 목표입니다. 현재 달성한 성과가 아닙니다.</p>''')

page('04 • 성과 집계','클릭부터 결제까지<br>서로 다른 사건을 분리', '''<p>기존 시트의 문의 478행을 비공개 운영 장부로 연결했습니다. 그중 과거 ‘내원’ 표시 195행은 그대로 보존하고, 확인되지 않은 첫 내원일이나 결제 기록으로 바꾸지 않았습니다.</p>
'''+table(['기존 판단의 한계','집계 도구에서 바꾼 방식'],[
('문의 버튼 클릭을 실제 접수로 오인할 수 있음','버튼 이벤트와 실제 문의·예약 테이블을 분리.'),
('신환·재진과 실제 첫 내원일이 불명확','신환 여부와 검증된 첫 내원 이벤트가 있을 때만 집계.'),
('예약 변경으로 같은 사람을 중복 집계','이전 예약 ID를 연결하고 최종 예약만 계산.'),
('결제 미기재를 0원으로 볼 수 있음','모르는 값은 미확인으로 유지. 실제 수납·환불·변동비를 구분.'),
('관찰기간이 짧은 고객의 수익을 과대평가','30/60/90일 경과와 장부 마감이 확인되어야 해당 기간 손익 표시.')])+'''<h2>7개 입력 장부</h2><p>문의 / 예약 / 방문 / 치료 시작 / 수납·환불·변동비 / 획득 비용 / 확인된 유입 접점으로 나눴습니다. 원내 담당자는 같은 가명 참조값으로 기록을 연결합니다.</p>
<div class="formula">공헌이익 = 실제 수납 − 환불 − 직접 변동비</div><p>매체비만 계산한 획득비용과 제작·대행비까지 포함한 전체 획득비용도 구분합니다. 추적된 유입과 환자의 자기보고 경로는 별도로 관리합니다.</p>
<div class="notice">현재 첫 내원·치료 시작·수납의 확정 기록이 부족해 실제 전환율과 환자 획득비용을 확정할 수 없습니다. 기록이 없다는 것을 실제 환자나 매출이 0이라는 뜻으로 해석하지 않습니다.</div>''')

page('05 • 검증과 콘텐츠','도구가 잘못 집계하지 않는지<br>확인하고, 콘텐츠를 준비', '''<h2>작동 검증</h2>'''+table(['검증 항목','확인 결과'],[
('집계 규칙 테스트','21개 통과. 중복 내원, 재진, 예약 변경·취소, 미확인 결제, 환불, 미성숙 기간 등을 검사.'),
('랜딩 브라우저 검사','2페이지 × 모바일 390px·PC 1280px 검사 통과. 가로 넘침, 제목, 버튼 이벤트 확인.'),
('클릭 정보 처리','전화·질환·전체 URL을 수집하지 않고 허용된 코드만 사용하도록 구성. 외부 분석 수신기는 미연결.'),
('장부 배포','9개 시트의 빈 엑셀 입력 양식 확인. 실제 문의 행은 Git 제외 비공개 폴더에 보관.')])+'''<h2>콘텐츠 자산을 사용하는 방법</h2><p>기존 블로그 4,221건을 제목 기준으로 분류해 검토대기열을 만들었습니다. 본문·사용권·의학적 근거는 별도 확인하도록 표시했고, 원본을 삭제하거나 게시 상태를 바꾸지 않았습니다.</p>'''+table(['주차','초안 주제'],[
('1–2주','첫 방문 시간 준비 / 비용 문의 시 확인할 다섯 가지'),
('3–4주','성인 아토피 진료 전 준비 / 손발 피부 불편 상담 질문'),
('5–6주','치료 계획의 재평가 시점 / 한약 관련 질문 준비'),
('7–8주','기존 약 목록 준비 / 원거리 초진 방문 체크')])+'''<p>각 편에 본문 초안, 촬영 구성, 원내에서 확인할 사실을 함께 적었습니다. 8편 모두 아직 게시하지 않았습니다.</p><p class="source">제목 규칙상 검토 표현 포함 221건을 표시했습니다. 제안서의 299건과 산식이 달라 직접 비교하지 않습니다. 이 분류는 위법 판정이나 본문 검토 결과가 아닙니다.</p>''')

page('06 • 광고와 예산','실제 광고 변경과<br>예산 검토안을 구분', '''<h2>백반증 최소입찰 — 실제 적용 완료</h2><div class="stats"><div><b>694개</b><small>등록 전수 확인</small></div><div><b>160개</b><small>입찰 인하</small></div><div><b>70원</b><small>키워드 기본입찰</small></div></div><p>기존 70원이던 534개는 유지했습니다. 적용 후 694개 모두 재조회하여 기본입찰 70원과 그룹입찰 상속 해제를 확인했습니다. ON 306개·OFF 388개 상태는 보존했습니다.</p><p class="source">별도 선행 요청으로 2026.09.14 14:14:58 KST 적용 검증 완료. 70원은 기본입찰이며 기기 가중치 반영 입찰이나 실제 클릭 비용을 70원으로 보장하지 않습니다.</p>
<h2>제안서의 예산은 아직 적용하지 않음</h2>'''+table(['항목','확인한 값'],[
('기존 계정 설정','공유예산 일 300,000원, 연결 134캠페인 / 전체 137캠페인'),
('9월 1~13일 실적','873클릭 · 1,986,895원 지출'),
('제안서 월 예산','총 4,000,000원 중 검색 2,200,000원·플레이스 300,000원'),
('남은 확인','월 예산 기준 선택, 오늘까지 지출, 세금·기존 계약·다른 매체비 대조')])+'''<p>일 상한과 월 총비용은 다른 기준입니다. 사용자에게 적용 기준을 요청했고, 이번 제안서 작업에서 추가 예산·입찰 변경은 하지 않았습니다.</p><div class="notice">손익·추적·사전 설명·수용량이 확인되지 않으면 증액을 허용하지 않는 판정 도구를 구현했습니다. 이 도구는 광고 API에 연결된 자동 증액·중지 기능이 아닙니다.</div>''')

page('07 • 실제 운영으로 옮기기','남은 일과 담당 역할',table(['순서','할 일','담당 역할·완료 조건'],[
('1. 운영 사실 확정','요일별 진료시간·휴진일, 초진 비용·포함/별도 항목, 방문 빈도·환불, 수용량 확정.','원내 책임자 / 공식 안내 원본 작성'),
('2. 웹 반영','관리자 연결 후 백업, 비공개 시안 확인, FAQ·제목·개인정보·랜딩 반영.','웹 담당자·의료진 / 실제 게시 및 연결 확인'),
('3. 상담 운영 시작','담당 배정, 비용·시간 설명, 예약 변경·취소·내원 기록 운영.','상담 책임자 / 실제 문의부터 일일 기록'),
('4. 원내 실적 대조','신환·첫 내원·치료 시작·수납·환불·변동비를 원장과 연결.','원내·회계 책임자 / 누락 대조 완료'),
('5. 주간 점검','유입 경로·설명률·예약·첫 내원을 확인하고 예산 기준 결정.','운영·마케팅 / 변경 근거 기록'),
('6. 30/60/90일 검증','같은 치료 시작 집단의 기간별 손익을 확인하고 증액 여부 검토.','운영·회계 / 관찰기간·장부 마감 충족')])+'''<h2>현재 전달할 수 있는 파일</h2><ul><li>랜딩 2개와 홈페이지 교체 문안</li><li>상담·예약 운영 문안과 8주 콘텐츠 초안</li><li>운영 장부 엑셀, 집계 도구 사용법, 원내 데이터 연결 현황</li><li>문제 19개별 상태·담당 역할·남은 조건을 기록한 실행표</li></ul><div class="notice">관리자 연결, 확정 운영 정보, 실제 원내 실적이 남아 있습니다. 홈페이지 게시 완료나 내원·매출 개선 효과는 아직 확인되지 않았습니다.</div><p class="source">모든 산출물 위치: reports/sojam-20260914/proposal-improvements/<br>전체 연결 문서: 개선현황.md · 입력 양식: 소잠_운영개선_실행도구.xlsx</p>''')

rows=[]
for line in (D/'개선현황.md').read_text(encoding='utf8').splitlines():
    if line.startswith('|'):
        v=line.strip('|').split('|')
        if len(v)==5 and v[0]not in ['문제','---']:rows.append(v)
for idx,part in enumerate([rows[:10],rows[10:]],1):
    page(f'부록 {idx} • 전체 과제','개선 과제별 상태 확인',table(['과제','현재 상태와 만든 개선물','남은 조건'],[(html.escape(r[0]),html.escape(r[1])+'<br><span class="muted">'+html.escape(r[2])+'</span>',html.escape(r[4]))for r in part])+('<p class="source">자료 근거: 사용자 제공 성장전략 제안서(23쪽), 현장 조회 결과 live-account.json·site-before/audit.json, operations-current.json, landing-preview/browser-check.json, vitiligo-floor/after.json 및 운영 메모. 환자 이름·연락처·개별 상담·수납 기록은 이 문서에 포함하지 않았습니다.</p>'if idx==2 else''))

css='''@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;font-family:"Malgun Gothic",sans-serif;color:#203b36;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{width:210mm;height:297mm;padding:18mm 18mm 20mm;position:relative;page-break-after:always;overflow:hidden}.page:last-child{page-break-after:auto}.eyebrow{font-size:10px;letter-spacing:1.5px;color:#688674;border-top:3px solid #244d40;padding-top:12px}h1{font-size:31px;line-height:1.4;letter-spacing:-1.5px;margin:18px 0 20px}h2{font-size:18px;margin:22px 0 10px}h3{font-size:15px}p,li{font-size:12px;line-height:1.85;word-break:keep-all}p{margin:10px 0}.intro{font-size:15px}.stats{display:flex;gap:12px;margin:23px 0}.stats>div{flex:1;background:#edf2e9;padding:19px;border-radius:10px}.stats b{display:block;font-size:29px}.stats small{font-size:11px;color:#587164;display:block;margin-top:7px}table{width:100%;border-collapse:collapse;font-size:11px;line-height:1.7;margin:12px 0;table-layout:fixed;word-break:keep-all}th{text-align:left;background:#244d40;color:white;padding:10px}td{padding:11px 10px;vertical-align:top;border-bottom:1px solid #dce3db}tbody tr:nth-child(even){background:#f6f8f3}th:first-child{width:26%}.notice{border-left:4px solid #a08044;background:#f8f2e7;padding:14px 17px;font-size:12px;line-height:1.8;margin:18px 0}.quote{background:#edf2e9;border-radius:8px;padding:16px;font-size:13px;line-height:1.85;margin:12px 0}.source{font-size:10px;color:#6e7d72;line-height:1.8}.formula,.flow{padding:18px;background:#edf2e9;font-size:15px;font-weight:bold;text-align:center;border-radius:8px;margin:16px 0}.screens{display:flex;gap:22px;justify-content:center;margin:17px 0}.screens>div{width:42%;text-align:center}.screens img{width:100%;height:330px;object-fit:contain;object-position:top;border:1px solid #ccd9cb;border-radius:10px}.screens strong{display:block;font-size:11px;margin-top:6px}footer{position:absolute;bottom:12mm;left:18mm;right:18mm;border-top:1px solid #dce3db;padding-top:9px;color:#718377;font-size:9px}footer span{float:right}.muted{color:#60766b}ul{padding-left:20px}'''
with sync_playwright()as p:
    browser=p.chromium.launch(headless=True)
    tab=browser.new_page(viewport={'width':390,'height':750},device_scale_factor=2)
    for code in ['p01','p02']:
        tab.goto((D/'landing-preview'/f'{code}.html').as_uri());tab.locator('.fixed').evaluate('(e)=>e.remove()');tab.screenshot(path=str(D/f'pdf-{code}.png'))
    doc='<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>소잠한의원 개선작업 설명서</title><style>'+css+'</style></head><body>'+''.join(pages)+'</body></html>'
    h=D/'개선작업_설명서.html';h.write_text(doc,encoding='utf8');tab.goto(h.as_uri());tab.evaluate('document.fonts.ready');tab.emulate_media(media='print')
    checks=tab.locator('.page').evaluate_all('(els)=>els.map((e,i)=>({page:i+1,overflow:e.scrollHeight>e.clientHeight,lastBottom:Math.max(...[...e.children].filter(x=>x.tagName!=="FOOTER").map(x=>x.getBoundingClientRect().bottom-e.getBoundingClientRect().top)),footerTop:e.querySelector("footer").getBoundingClientRect().top-e.getBoundingClientRect().top}))')
    assert all(not r['overflow']and r['lastBottom']<r['footerTop']-8 for r in checks),checks
    tab.pdf(path=str(P),prefer_css_page_size=True,print_background=True);browser.close()
pdf=fitz.open(P);assert len(pdf)==len(pages),(len(pdf),len(pages))
for i,p in enumerate(pdf):
    assert len(p.get_text())>120
    if i in [0,1,8,9]:p.get_pixmap(matrix=fitz.Matrix(1,1)).save(str(D/f'pdf-check-{i+1:02d}.png'))
(D/'pdf-check.json').write_text(json.dumps({'pages':len(pdf),'layout':checks,'bytes':P.stat().st_size},indent=2),encoding='utf8')
print(json.dumps({'pdf':str(P),'pages':len(pdf),'bytes':P.stat().st_size},ensure_ascii=False))
