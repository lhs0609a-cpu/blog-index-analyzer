"""Read all Sojam workbook tabs; export aggregate outcomes, never infer payments.
python flyio-backend/scripts/sojam_sheet_sync.py --download
No ad writes. Raw workbook and row identities remain in ignored data/sojam-private.
"""
import argparse,csv,hashlib,hmac,json,os,re,urllib.request
from collections import Counter,defaultdict
from datetime import datetime,date,timezone
from pathlib import Path
from openpyxl import load_workbook

ROOT=Path(__file__).resolve().parents[2]
PRIVATE=ROOT/'data'/'sojam-private'
OUT=ROOT/'reports'/'sojam-20260908'/'sheet-linked'
SHEET='1r_-Kzld7yuKSFf5Z-cOkLQrEx9GZn9UMfG2zsrf99G8'
def text(v):return '' if v is None else str(v).strip()
def split(v):return sorted(set(x.strip() for x in re.split(r'[,/\n]',text(v)) if x.strip()))
def writecsv(name,rows):
 if not rows:return
 with (OUT/name).open('w',encoding='utf-8-sig',newline='') as f:
  w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
def run(download=False):
 PRIVATE.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
 src=PRIVATE/'source.xlsx'
 if download:
  with urllib.request.urlopen(f'https://docs.google.com/spreadsheets/d/{SHEET}/export?format=xlsx',timeout=45)as response:raw=response.read()
  if raw[:2]!=b'PK':raise ValueError('Google did not return a workbook; previous results were not refreshed')
  tmp=PRIVATE/'source.next.xlsx';tmp.write_bytes(raw);os.replace(tmp,src)
 keypath=PRIVATE/'identity.key'
 if not keypath.exists():keypath.write_bytes(os.urandom(32))
 key=keypath.read_bytes();wb=load_workbook(src,read_only=True,data_only=True)
 tabs=[];records=[];exceptions=[]
 for sheet in wb:
  rows=list(sheet.values);headers=[(i,r)for i,r in enumerate(rows)if '유입일자'in r and '내원여부'in r]
  if len(headers)!=1:raise ValueError('Unexpected headers in '+sheet.title)
  hi,header=headers[0];col={text(v):j for j,v in enumerate(header)if v is not None}
  count=0
  for rn,row in enumerate(rows[hi+1:],hi+2):
   def at(n):j=col.get(n);return row[j]if j is not None and j<len(row)else None
   dt=at('유입일자');name=text(at('성명'))
   if not isinstance(dt,(datetime,date)):
    if name:exceptions.append({'tab':sheet.title,'row':rn,'reason':'name_without_valid_inquiry_date'})
    continue
   if not name:exceptions.append({'tab':sheet.title,'row':rn,'reason':'date_without_name'});continue
   count+=1;phone=re.sub(r'\D','',text(at('연락처')))
   identity=(phone+'|'+name)if phone else f'{sheet.title}|{rn}'
   pid=hmac.new(key,identity.encode(),hashlib.sha256).hexdigest()[:24]
   labels=split(at('질환명 (중복체크)'));quality=text(at('DB 퀄리티')).count('⭐')
   # Missing structured paid status is unknown, never false; consent is separate.
   paid_status=text(at('결제여부'));paid=True if paid_status in ('결제완료','결제 완료','완료')else False if paid_status in ('미결제','결제취소')else None
   amount=at('실결제금액');refund=at('환불금액')
   revenue=amount-refund if isinstance(amount,(int,float))and isinstance(refund,(int,float))else amount if isinstance(amount,(int,float))and refund is None else None
   records.append({'tab':sheet.title,'row':rn,'pid':pid,'identity_reliable':bool(phone),'inquiry_date':dt.date().isoformat()if isinstance(dt,datetime)else dt.isoformat(),'diseases':labels,'visited':text(at('내원여부'))=='내원','visit_status':text(at('내원여부'))or'미기재','quality_stars':quality or None,'agreement':text(at('동의여부'))or'미기재','paid':paid,'net_revenue':revenue,'keyword_id':text(at('키워드ID')),'campaign_id':text(at('캠페인ID')),'channel':text(at('유입경로 (중복체크)')or at('전화 인콜'))or'미기재','payment_note_flag':bool(re.search(r'결제|수납|입금|환불',text(at('비고 (상담내용 요약)'))))})
  tabs.append({'tab':sheet.title,'header_row':hi+1,'record_rows':count,'payment_status_column':'결제여부'in col,'net_payment_column':'실결제금액'in col,'keyword_id_column':'키워드ID'in col,'first_visit_date_column':'첫내원일'in col,'channel_header':'유입경로 (중복체크)'if'유입경로 (중복체크)'in col else'전화 인콜'if'전화 인콜'in col else'미확인'})
 wb.close()
 monthly=[]
 for tab in tabs:
  rr=[r for r in records if r['tab']==tab['tab']];monthly.append({'tab':tab['tab'],'inquiries':len(rr),'visit_marked_rows':sum(r['visited']for r in rr),'not_visited_rows':sum(r['visit_status']=='미내원'for r in rr),'visit_unknown':sum(r['visit_status']=='미기재'for r in rr),'paid_confirmed_rows':sum(r['paid']is True for r in rr),'payment_unknown_rows':sum(r['paid']is None for r in rr),'quality_3plus_rows':sum((r['quality_stars']or 0)>=3 for r in rr)})
 diseases=[]
 for a in sorted({a for r in records for a in r['diseases']}):
  for period in ['all','2026-06_to_08']:
   rr=[r for r in records if a in r['diseases']and(period=='all'or'2026-06-01'<=r['inquiry_date']<='2026-08-31')]
   if not rr:continue
   diseases.append({'disease':a,'period':period,'inquiries':len(rr),'visit_marked':sum(r['visited']for r in rr),'visit_rate':round(sum(r['visited']for r in rr)/len(rr),4),'quality_3plus':sum((r['quality_stars']or 0)>=3 for r in rr),'visited_quality_3plus':sum(r['visited']and(r['quality_stars']or 0)>=3 for r in rr),'paid_confirmed':sum(r['paid']is True for r in rr),'payment_unknown':sum(r['paid']is None for r in rr)})
 identities=Counter(r['pid']for r in records);missing=sum(not r['identity_reliable']for r in records)
 blockers=[]
 if any(r['paid']is None for r in records):blockers.append('결제 사실/금액 연결 미완료: 동의·별점으로 결제를 추정하지 않음')
 if any(not r['keyword_id']for r in records):blockers.append('환자 유입의 키워드ID 연결 미완료: 질환명을 실제 유입 키워드로 간주하지 않음')
 if not all(t['first_visit_date_column']for t in tabs if t['record_rows']):blockers.append('실제 첫 내원일 없음: 내원 표시를 월별 신환으로 확정할 수 없음')
 summary={'source_id':SHEET,'workbook_sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'source_file_modified_utc':datetime.fromtimestamp(src.stat().st_mtime,timezone.utc).isoformat(),'analyzed_at_utc':datetime.now(timezone.utc).isoformat(),'tabs':len(tabs),'records':len(records),'min_inquiry_date':min(r['inquiry_date']for r in records),'max_inquiry_date':max(r['inquiry_date']for r in records),'visit_marked_rows':sum(r['visited']for r in records),'distinct_phone_name_keys':len(identities),'repeat_identity_keys':sum(n>1 for n in identities.values()),'missing_phone_identity_rows':missing,'paid_confirmed_rows':sum(r['paid']is True for r in records),'payment_unknown_rows':sum(r['paid']is None for r in records),'notes_with_payment_terms':sum(r['payment_note_flag']for r in records),'agreement_counts':dict(Counter(r['agreement']for r in records)),'automatic_ad_write_enabled':False,'blockers':blockers,'monthly':monthly}
 (PRIVATE/'normalized.json').write_text(json.dumps(records,ensure_ascii=False),encoding='utf8')
 (OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf8')
 writecsv('tabs.csv',tabs);writecsv('monthly.csv',monthly);writecsv('diseases.csv',diseases);writecsv('data_exceptions.csv',exceptions)
 print(json.dumps(summary,ensure_ascii=False))
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--download',action='store_true');run(parser.parse_args().download)
