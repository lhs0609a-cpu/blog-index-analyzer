# -*- coding: utf-8 -*-
"""소잠한의원(cid 1858907) — 구조 교정 3종. 되돌릴 수 있고, 지출을 늘리지 않는다.

왜 이 3개인가 (2026-09-06 실측):
  하루 ₩136,304 을 62클릭에 쓰고 있고, 그 클릭이 환자가 됐는지는 계정 안에 기록이 없다
  (30일 전 캠페인 ccnt=0 — 프리미엄 로그분석 미연동). 전환을 모르는 동안 할 수 있는 일은
  **새는 곳을 막고, 전환 경로를 열어두는 것**뿐이다. 소재·랜딩·예산은 여기서 건드리지 않는다
  (의료광고 심의·비즈채널 재검수·돈 결정이 각각 필요 — 아래 §미포함 참조).

  ① 차단어 키워드 일시정지
     2026-08-25 에 도메인 밖 43,623개를 정지했는데, **지출이 실제로 발생하는 그룹 안에**
     같은 기준의 차단어 키워드가 444개 아직 살아 있다. 그중 겨드랑이다한증·항문곤지름은
     입찰가가 ₩20,000·₩19,270 이다 — 클릭 한 번에 2만원이 나갈 수 있는 상태로 대기 중.
     기준은 새로 만들지 않는다. _sojam_pause_apply.py 의 ANCHOR/EXCLUDE 를 그대로 import 한다.

  ② 입찰가 상한 (진료축 ₩8,000 · 그 외 ₩4,000)
     활성 키워드 278개가 천장을 넘고 그중 여럿이 ₩20,000 이다. 2026-09-05 하루만 봐도
     6클릭이 ₩38,087 을 가져갔다(최고 「아기태열」 ₩10,692/클릭). 전환을 모르는 채로
     클릭당 1만원은 가격이 아니라 도박이라, 전환 데이터가 쌓일 때까지 천장을 둔다.
     ⚠️ 처음엔 일괄 ₩4,000 이었는데, 그러면 「강남아토피한의원」·「서초아토피」처럼
        이 계정이 반드시 이겨야 할 키워드까지 같이 내려간다. 그래서 두 단으로 나눴다.

  ③ 전화 확장소재 복제
     지출 상위 12개 그룹 중 전화 확장이 붙은 곳은 2개뿐이다. 전화 비즈채널
     (bsn-a001-00-000000003977495)은 ELIGIBLE 이고 기존 확장소재도 APPROVED 라
     그대로 복제하면 즉시 노출된다. 한의원 광고에서 가장 짧은 전환 경로다.

⚠️ 여기 없는 것 — 이 스크립트로 고칠 수 없다:
   · 질환별 소재 12종 / 질환별 랜딩 — 의료광고 심의번호가 소재마다 필요(현재 한42606 하나).
   · 위치·네이버예약 확장 — 비즈채널 2개가 BUSINESS_CHANNEL_DISAPPROVED. 광고주가 재검수 신청해야 한다.
   · 프리미엄 로그분석 — 사이트에 코드 설치. 이게 없으면 ①②의 효과도 측정되지 않는다.
   · 예산 재배분 — 지출이 늘어나는 결정이라 사람이 정한다.

실행:
    python _sojam_structure_fix.py --dry      대상만 계산해서 출력 (계정 변경 없음)
    python _sojam_structure_fix.py --apply    적용 + 변경 전 값을 백업 파일로 저장
    python _sojam_structure_fix.py --revert   백업 파일로 원상 복구

적용 범위를 좁히려면:
    python _sojam_structure_fix.py --dry --only pause      (pause | bid | phone, 콤마 구분)
"""
import argparse
import json
import os
import sys
import time
from collections import Counter

import requests

# 기준을 두 벌 두지 않는다 — 8월에 광고주가 승인한 그 리스트를 그대로 쓴다.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _sojam_pause_apply import ANCHOR, EXCLUDE  # noqa: E402

# 한 번 도는 데 몇 분 걸린다 — 진행 상황이 버퍼에 갇히면 멈춘 건지 도는 건지 알 수 없다.
try:
    sys.stdout.reconfigure(line_buffering=True)
except Exception:
    pass

BASE = 'https://blog-index-analyzer.fly.dev'
RAW = BASE + '/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=1858907'
CUSTOMER_ID = '1858907'

# 천장은 두 단이다. 일괄 ₩4,000 으로 눌렀더니 「강남아토피한의원」·「서초아토피」처럼
# 이 계정이 반드시 이겨야 할 키워드까지 같이 내려갔다(실측: 상한 대상 278개 안에 섞여 있었다).
# 앵커(진료 질환어)를 가진 키워드는 더 높은 천장을 준다. 전환 데이터가 생기면 둘 다 다시 연다.
BID_CAP = 4000                  # 일반
BID_CAP_ANCHOR = 8000           # 진료 질환어를 포함한 키워드
PHONE_MIN_SPEND = 5000          # 30일 지출이 이 밑인 그룹까지 확장소재를 달지는 않는다
PHONE_CHANNEL = 'bsn-a001-00-000000003977495'   # 전화 비즈채널(ELIGIBLE, 025985358)
WINDOW_DAYS = 30
BACKUP = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                      '_sojam_structure_fix_backup.json')

STEPS = ('pause', 'bid', 'phone')


# ─────────────────────────────────────────────────────────────
# 네이버 API — 서버가 자격증명을 들고 있고, 이 PC 는 허용 IP 라 프록시로 부른다
# ─────────────────────────────────────────────────────────────
RETRY_SLEEPS = (2, 5, 10, 20, 40, 60)


def naver(method, path, body=None, timeout=180):
    """프록시 호출 + 재시도.

    ⚠️ 재시도가 넉넉해야 한다. 한 번 도는 데 300콜 이상을 부르는데, 그 부하가 걸리면
    fly 앞단이 TLS 를 끊는다(실측: SSLEOFError. 1.5·3·4.5초 백오프 4회로는 못 넘겼고,
    같은 요청이 잠시 뒤에는 그냥 성공했다). 그래서 최대 60초까지 물러났다 다시 붙는다.

    쓰기도 같은 경로로 재시도한다 — userLock/bidAmt PUT 은 같은 body 를 다시 받아도
    결과가 같다(멱등). 멱등이 아닌 확장소재 생성만 아래에서 기존 유무를 먼저 확인한다."""
    last = None
    for i, nap in enumerate((0,) + RETRY_SLEEPS):
        if nap:
            time.sleep(nap)
        try:
            r = requests.post(RAW, json={'customer_id': CUSTOMER_ID, 'method': method,
                                         'path': path, 'body': body},
                              timeout=timeout, headers={'Connection': 'close'})
            r.raise_for_status()
            d = r.json()
            if not d.get('success'):
                # 네이버가 돌려준 오류는 재시도 대상이 아니다 — 요청 자체가 틀린 것이다.
                raise RuntimeError(f"{method} {path} 실패: {str(d.get('error'))[:300]}")
            resp = d.get('response')
            if isinstance(resp, dict) and 'data' in resp:
                return resp['data']
            return resp
        except (requests.exceptions.RequestException, ValueError) as e:
            last = e
            if i:
                print(f'    (재시도 {i}/{len(RETRY_SLEEPS)}) {path} — {type(e).__name__}')
    raise RuntimeError(f"{method} {path} — 재시도 소진: {str(last)[:200]}")


def as_list(x):
    if isinstance(x, list):
        return x
    if isinstance(x, dict):
        return x.get('data') or x.get('list') or []
    return []


def window():
    from datetime import date, timedelta
    end = date.today() - timedelta(days=1)      # 어제까지가 확정 데이터
    return (end - timedelta(days=WINDOW_DAYS - 1)).isoformat(), end.isoformat()


# ─────────────────────────────────────────────────────────────
# 현재 상태 읽기
# ─────────────────────────────────────────────────────────────
def spending_groups():
    """최근 30일에 돈이 나간 광고그룹만 추린다.

    전체 그룹(6,900여개)을 키워드까지 열거하면 Fly→네이버 outbound 가 먼저 죽는다.
    돈이 안 나간 그룹은 어차피 고칠 게 없으므로 /stats 로 먼저 거른다(그룹 100개당 1콜)."""
    since, until = window()
    camps = as_list(naver('GET', '/ncc/campaigns'))
    print(f'  캠페인 {len(camps)}개')

    gids, gname = [], {}
    for c in camps:
        for g in as_list(naver('GET', '/ncc/adgroups',
                               {'nccCampaignId': c.get('nccCampaignId')})):
            gid = g.get('nccAdgroupId')
            if gid:
                gids.append(gid)
                gname[gid] = f"{c.get('name')} / {g.get('name')}"
    print(f'  광고그룹 {len(gids)}개 — 최근 {WINDOW_DAYS}일 지출 확인 중')

    fields = json.dumps(['impCnt', 'clkCnt', 'salesAmt'])
    trange = json.dumps({'since': since, 'until': until})
    cost = {}
    for i in range(0, len(gids), 100):
        rows = as_list(naver('GET', '/stats', {'ids': gids[i:i + 100],
                                               'fields': fields, 'timeRange': trange}))
        for r in rows:
            c = int(float(r.get('salesAmt') or 0))
            if c > 0:
                cost[r.get('id')] = c
    print(f'  지출 발생 그룹 {len(cost)}개 ({since} ~ {until})')
    return cost, gname


def live_keywords(gids):
    out = []
    for i, g in enumerate(gids, 1):
        for k in as_list(naver('GET', '/ncc/keywords', {'nccAdgroupId': g})):
            out.append({'id': k.get('nccKeywordId'), 'group': g,
                        'kw': k.get('keyword') or '',
                        'bid': int(k.get('bidAmt') or 0),
                        'use_group_bid': bool(k.get('useGroupBidAmt')),
                        'lock': bool(k.get('userLock'))})
        if i % 40 == 0:
            print(f'    ..{i}/{len(gids)} 그룹, 키워드 {len(out)}개')
    return out


def phone_extension_owners(gids):
    """이미 전화 확장이 있는 그룹 — 중복 생성하지 않는다."""
    have = set()
    for g in gids:
        for e in as_list(naver('GET', '/ncc/ad-extensions', {'ownerId': g})):
            if e.get('type') == 'PHONE' and not e.get('delFlag'):
                have.add(g)
    return have


# ─────────────────────────────────────────────────────────────
# 대상 계산
# ─────────────────────────────────────────────────────────────
def build_plan(only):
    print('[1/2] 계정 현재 상태 읽는 중')
    cost, gname = spending_groups()
    gids = sorted(cost, key=lambda g: -cost[g])

    print('[2/2] 지출 그룹의 키워드 열거 중')
    kws = live_keywords(gids)
    active = [k for k in kws if not k['lock']]
    print(f'  키워드 {len(kws)}개 (활성 {len(active)}개)')

    plan = {'window': window(), 'groups': len(gids), 'keywords': len(kws),
            'active': len(active), 'pause': [], 'bid': [], 'phone': []}

    if 'pause' in only:
        for k in active:
            x = [e for e in EXCLUDE if e in k['kw']]
            if x:
                plan['pause'].append({**k, 'excl': x[:3],
                                      'anchor': [a for a in ANCHOR if a in k['kw']][:2]})

    if 'bid' in only:
        paused = {p['id'] for p in plan['pause']}
        for k in active:
            if k['id'] in paused or k['use_group_bid']:
                continue          # 정지될 것·그룹입찰 상속분은 건드리지 않는다
            is_anchor = any(a in k['kw'] for a in ANCHOR)
            cap = BID_CAP_ANCHOR if is_anchor else BID_CAP
            if k['bid'] > cap:
                plan['bid'].append({**k, 'target': cap, 'anchor': is_anchor})

    if 'phone' in only:
        targets = [g for g in gids if cost[g] >= PHONE_MIN_SPEND]
        print(f'  전화 확장 후보 그룹 {len(targets)}개 — 기존 확장 확인 중')
        have = phone_extension_owners(targets)
        plan['phone'] = [{'group': g, 'name': gname.get(g, g), 'cost30': cost[g]}
                         for g in targets if g not in have]
        plan['phone_already'] = len(have)

    return plan


def show(plan, only):
    print()
    print('=' * 78)
    print(f"소잠한의원 구조 교정 — 대상 (기간 {plan['window'][0]} ~ {plan['window'][1]})")
    print('=' * 78)

    if 'pause' in only:
        p = plan['pause']
        print(f"\n① 차단어 키워드 일시정지 : {len(p)}개")
        if p:
            c = Counter(e for r in p for e in r['excl'])
            print('   적중 차단어:', ', '.join(f'{k}×{v}' for k, v in c.most_common(10)))
            both = [r for r in p if r['anchor']]
            print(f"   이 중 앵커도 가진 것 {len(both)}개 — 규칙상 차단어가 우선한다"
                  f"(예: 모낭염로션·지루성두피염샴푸추천 = 제품 의도)")
            for r in sorted(p, key=lambda x: -x['bid'])[:12]:
                print(f"     {r['kw'][:26]:<26} bid {r['bid']:>6,}  ← {'/'.join(r['excl'])}")

    if 'bid' in only:
        b = plan['bid']
        anc = [r for r in b if r['anchor']]
        gen = [r for r in b if not r['anchor']]
        print(f"\n② 입찰가 상한 : {len(b)}개"
              f"  (진료축 ₩{BID_CAP_ANCHOR:,} {len(anc)}개 · 그 외 ₩{BID_CAP:,} {len(gen)}개)")
        if b:
            print(f"   현재 입찰 합계 ₩{sum(r['bid'] for r in b):,}"
                  f" → 상한 후 ₩{sum(r['target'] for r in b):,}")
            for r in sorted(b, key=lambda x: -x['bid'])[:14]:
                tag = '진료축' if r['anchor'] else '일반  '
                print(f"     [{tag}] {r['kw'][:24]:<24} bid {r['bid']:>6,} → {r['target']:,}")

    if 'phone' in only:
        f = plan['phone']
        print(f"\n③ 전화 확장소재 복제 : {len(f)}개 그룹"
              f" (이미 있는 그룹 {plan.get('phone_already', 0)}개는 제외)")
        for r in sorted(f, key=lambda x: -x['cost30'])[:10]:
            print(f"     {r['name'][:52]:<52} 30일지출 ₩{r['cost30']:>8,}")

    print()
    print('되돌리기: --apply 가 변경 전 값을 백업에 남기고, --revert 가 그대로 복구한다.')
    print(f'백업 파일: {BACKUP}')


# ─────────────────────────────────────────────────────────────
# 적용
# ─────────────────────────────────────────────────────────────
def put_keywords(items, fields):
    """PUT /ncc/keywords?fields=... — 배열 body, 100개/콜."""
    done = failed = 0
    for i in range(0, len(items), 100):
        batch = items[i:i + 100]
        try:
            naver('PUT', f'/ncc/keywords?fields={fields}', batch)
            done += len(batch)
        except Exception as e:
            failed += len(batch)
            print(f'    batch 실패({i}): {str(e)[:160]}')
        time.sleep(0.2)
    return done, failed


def apply_plan(plan, only):
    backup = {'ts': time.strftime('%Y-%m-%d %H:%M:%S'), 'window': plan['window'],
              'pause': [], 'bid': [], 'phone': []}

    if 'pause' in only and plan['pause']:
        backup['pause'] = [{'keyword_id': r['id'], 'group_id': r['group'],
                            'kw': r['kw'], 'was_lock': r['lock']} for r in plan['pause']]
        _save(backup)   # 쓰기 전에 먼저 남긴다 — 중간에 죽어도 되돌릴 수 있게
        items = [{'nccKeywordId': r['id'], 'nccAdgroupId': r['group'], 'userLock': True}
                 for r in plan['pause']]
        print(f"① 일시정지 {len(items)}개 적용 중")
        d, f = put_keywords(items, 'userLock')
        print(f"   완료 {d} / 실패 {f}")

    if 'bid' in only and plan['bid']:
        backup['bid'] = [{'keyword_id': r['id'], 'group_id': r['group'], 'kw': r['kw'],
                          'was_bid': r['bid'], 'was_use_group_bid': r['use_group_bid']}
                         for r in plan['bid']]
        _save(backup)
        items = [{'nccKeywordId': r['id'], 'nccAdgroupId': r['group'],
                  'bidAmt': int(r['target']), 'useGroupBidAmt': False} for r in plan['bid']]
        print(f"② 입찰 상한 {len(items)}개 적용 중")
        d, f = put_keywords(items, 'bidAmt')
        print(f"   완료 {d} / 실패 {f}")

    if 'phone' in only and plan['phone']:
        print(f"③ 전화 확장소재 {len(plan['phone'])}개 생성 중")
        made, failed = [], 0
        for r in plan['phone']:
            try:
                res = naver('POST', '/ncc/ad-extensions',
                            {'ownerId': r['group'], 'ownerType': 'ADGROUP', 'type': 'PHONE',
                             'pcChannelId': PHONE_CHANNEL, 'mobileChannelId': PHONE_CHANNEL})
                eid = (res or {}).get('nccAdExtensionId')
                if eid:
                    made.append({'ext_id': eid, 'group_id': r['group'], 'name': r['name']})
            except Exception as e:
                failed += 1
                print(f"    {r['name'][:40]} 실패: {str(e)[:140]}")
            time.sleep(0.15)
            backup['phone'] = made
            _save(backup)
        print(f"   생성 {len(made)} / 실패 {failed}")

    _save(backup)
    print(f"\n백업 저장: {BACKUP}")


def _save(backup):
    with open(BACKUP, 'w', encoding='utf-8') as f:
        json.dump(backup, f, ensure_ascii=False, indent=1)


# ─────────────────────────────────────────────────────────────
# 되돌리기
# ─────────────────────────────────────────────────────────────
def revert(only):
    if not os.path.exists(BACKUP):
        print(f'백업 파일이 없다: {BACKUP}')
        return
    b = json.load(open(BACKUP, encoding='utf-8'))
    print(f"백업 시각 {b.get('ts')} 기준으로 복구")

    if 'pause' in only and b.get('pause'):
        items = [{'nccKeywordId': r['keyword_id'], 'nccAdgroupId': r['group_id'],
                  'userLock': bool(r.get('was_lock'))} for r in b['pause']]
        print(f"① 일시정지 해제 {len(items)}개")
        d, f = put_keywords(items, 'userLock')
        print(f"   완료 {d} / 실패 {f}")

    if 'bid' in only and b.get('bid'):
        # 키워드마다 원래 입찰가가 다르다 — 배열 body 라 한 번에 개별값으로 되돌린다.
        items = [{'nccKeywordId': r['keyword_id'], 'nccAdgroupId': r['group_id'],
                  'bidAmt': int(r['was_bid']),
                  'useGroupBidAmt': bool(r.get('was_use_group_bid'))} for r in b['bid']]
        print(f"② 입찰가 원복 {len(items)}개")
        d, f = put_keywords(items, 'bidAmt')
        print(f"   완료 {d} / 실패 {f}")

    if 'phone' in only and b.get('phone'):
        print(f"③ 생성한 전화 확장소재 {len(b['phone'])}개 삭제")
        ok = bad = 0
        for r in b['phone']:
            try:
                naver('DELETE', f"/ncc/ad-extensions/{r['ext_id']}")
                ok += 1
            except Exception as e:
                bad += 1
                print(f"    {r['ext_id']} 실패: {str(e)[:140]}")
            time.sleep(0.15)
        print(f"   삭제 {ok} / 실패 {bad}")


def main():
    ap = argparse.ArgumentParser(description='소잠한의원 구조 교정 3종')
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--dry', action='store_true', help='대상만 계산 (계정 변경 없음)')
    g.add_argument('--apply', action='store_true', help='적용 + 변경 전 값 백업')
    g.add_argument('--revert', action='store_true', help='백업으로 원상 복구')
    ap.add_argument('--only', default=','.join(STEPS),
                    help='pause,bid,phone 중 골라서 (기본: 전부)')
    a = ap.parse_args()

    only = {s.strip() for s in a.only.split(',') if s.strip() in STEPS}
    if not only:
        print(f'--only 값이 잘못됐다. 가능: {", ".join(STEPS)}')
        return

    if a.revert:
        revert(only)
        return

    plan = build_plan(only)
    show(plan, only)

    if a.apply:
        n = len(plan['pause']) + len(plan['bid']) + len(plan['phone'])
        if not n:
            print('\n바꿀 게 없다.')
            return
        print(f'\n[APPLY] 총 {n}건을 실제 계정에 적용한다. 5초 뒤 시작 — 중단하려면 Ctrl+C')
        time.sleep(5)
        apply_plan(plan, only)
    else:
        print('\n[DRY] 계정은 바뀌지 않았다. 적용하려면 --apply')


if __name__ == '__main__':
    main()
