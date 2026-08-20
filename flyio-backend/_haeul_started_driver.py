# -*- coding: utf-8 -*-
"""ack 확인형 등록 드라이버 — python _haeul_started_driver.py <seedfile> <statefile> [label]

기존 `_haeul_run_driver.py` 의 치명적 결함 교정:
  그 드라이버는 `started` OR `queued` 를 성공으로 보고 커서를 전진시킨다. 그런데 `queued`
  는 오프로드 프록시가 8s ReadTimeout 후 반환하는 **합성 ack** 이고, 이때 httpx 가 닫히면
  worker 쪽 요청이 끊겨 Starlette 가 BackgroundTask 를 건너뛴다 → **잡이 아예 안 돈다**
  (2026-07-27 실측: 150시드 발사 후 30분간 pool 불변, seed_explode run 0건).
  → 커서만 전진해 시드가 통째로 허공에 소진된다.

교정: `started:true` 를 받을 때까지만 커서를 전진시킨다. 실측상 worker 는 간헐적으로 비고
(1차 8.2s queued → 2차 0.3s STARTED), 이 재시도 루프가 곧 **워커 단일슬롯 직렬화**로도
동작한다(busy면 queued → 대기 → free 되면 started).

발사 후에는 새 seed_explode run id 가 뜰 때까지 대기해 배치 겹침을 막는다.
"""
import io
import json
import os
import sys
import time
import urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)


def say(msg):
    """★ 마라톤을 죽이지 않는 print.

    2026-08-05·08-06·08-07 세 번 다 같은 자리에서 죽었다 —
      `OSError: [Errno 22] Invalid argument` @ print(...)
    처음엔 PowerShell RedirectStandardOutput 탓으로 봤지만 sh 리다이렉션에서도 재현됐다.
    진짜 원인은 **로그 파일이 G:(Google Drive 마운트) 위에 있다는 것**이다. Drive File
    Stream 은 간헐적으로 쓰기를 거부하고, flush=True + line_buffering 이라 그 한 번의
    거부가 그대로 프로세스를 죽인다. 수십 시간짜리 마라톤이 로그 한 줄 때문에 끝난다.
    → 로그는 로컬 디스크(C:)에 쓰고(체인 스크립트), 그래도 실패하면 삼킨다."""
    for _ in range(3):
        try:
            print(msg, flush=True)
            return
        except OSError:
            time.sleep(1)

BASE = "G:/내 드라이브/developer/blog-index-analyzer/flyio-backend/"
SEEDS = sys.argv[1]
STATE = sys.argv[2]
LABEL = sys.argv[3] if len(sys.argv) > 3 else os.path.basename(SEEDS)
CID, UID = "3442423", "1"
B = "https://blog-index-analyzer.fly.dev/api/naver-ad"

BATCH = 150
FIRE_TRIES, FIRE_GAP = 90, 20      # started 받을 때까지 최대 30분 재시도
RUN_WAIT = int(os.environ.get("RUN_WAIT", "900"))   # 잡 완료 대기 (pool 델타 감지라 보통 1~3분)
RUN_POLL = int(os.environ.get("RUN_POLL", "30"))
# ⚠️ 포화 구간에선 pool 델타가 0 이라 매 배치가 RUN_WAIT 를 통째로 태운다(555배치×15분=139시간).
#    짧게 잡아도 안전하다 — 워커가 아직 바쁘면 다음 fire 가 started 를 못 받아 재시도 루프에서
#    자연히 직렬화된다. 포화 축을 돌릴 땐 RUN_WAIT=240 정도로 낮출 것.
DRY_MIN = int(os.environ.get("DRY_MIN", "15"))
DRY_STOP = int(os.environ.get("DRY_STOP", "6"))   # 연속 N배치 순증<DRY_MIN 이면 고갈로 보고 정지
# ⚠️ 시드파일이 여러 축을 이어붙인 것이면 dry-stop 을 끌 것(DRY_STOP=999).
#    앞축이 말라도 뒤축이 살아있는데 조기 정지한다 — 축별로 수율이 10배 이상 갈린다.


def _get(path, t=90, tries=4):
    for a in range(tries):
        try:
            return json.load(urllib.request.urlopen(B + path, timeout=t))
        except Exception:
            time.sleep(15)
    return None


def stats():
    r = _get(f"/keyword-pool/stats?customer_id={CID}&user_id={UID}&lite=true")
    if not r:
        return None, None, None
    runs = {x["id"] for x in r["recent_runs"] if x["kind"] == "seed_explode"}
    return r["pool"]["total"], r["registered"]["active"], runs


def fire(batch):
    """started:true 받으면 True. queued(합성 ack)면 False — 잡이 안 돈 것이므로 재시도."""
    d = json.dumps({"seeds": batch, "min_volume": 11, "max_per_seed": 1000,
                    "min_score": 30, "customer_id": CID}, ensure_ascii=False).encode()
    req = urllib.request.Request(
        f"{B}/keyword-pool/seed-explode-register?customer_id={CID}&user_id={UID}",
        data=d, method="POST", headers={"Content-Type": "application/json"})
    try:
        return bool(json.load(urllib.request.urlopen(req, timeout=120)).get("started"))
    except Exception:
        return False


seeds = json.load(open(SEEDS, encoding="utf-8"))
cur = 0
if os.path.exists(STATE):
    try:
        cur = json.load(open(STATE, encoding="utf-8")).get("cursor", 0)
    except Exception:
        cur = 0

p0, a0, _ = stats()
if p0 is None:
    say(f"[{LABEL}] 초기 stats 실패 — 중단")
    sys.exit(1)
nb = (len(seeds) - cur + BATCH - 1) // BATCH
say(f"=== [{LABEL}] 시드 {len(seeds):,} 커서 {cur} → {nb}배치 | 시작 pool={p0:,} active={a0:,}")

prev, dry, bi = p0, 0, 0
while cur < len(seeds):
    batch = seeds[cur:cur + BATCH]
    bi += 1
    _, _, before = stats()
    ok, tried = False, 0
    for tried in range(1, FIRE_TRIES + 1):
        if fire(batch):
            ok = True
            break
        time.sleep(FIRE_GAP)
    if not ok:
        say(f"⚠️ [{LABEL} {bi}/{nb}] {FIRE_TRIES}회 재시도에도 started 없음 — 중단 "
              f"(커서 {cur} 보존, 재실행하면 이어감)")
        break
    say(f"[{LABEL} {bi}/{nb}] STARTED (시도 {tried}) 예시={batch[0]}")

    cur += BATCH
    json.dump({"cursor": cur}, open(STATE, "w", encoding="utf-8"))

    # 잡 완료 대기 — 새 run id **또는 pool 델타**.
    # ⚠️ run id 단독 감지는 구조적으로 안 된다(2026-07-29 실측): stats 의 recent_runs 는
    #    최근 20건인데 register 크론이 30초마다 돌아 20칸을 전부 채운다 → seed_explode
    #    run 이 창에 아예 안 보이고 매 배치가 RUN_WAIT(45분) 타임아웃 → 68배치=50시간.
    #    explode 가 pending 을 넣으면 pool total 이 즉시 오르므로 이쪽이 진짜 신호다.
    t0 = time.time()
    done = False
    while time.time() - t0 < RUN_WAIT:
        time.sleep(RUN_POLL)
        p, a, now = stats()
        if now is None:
            continue
        if (now - before) or (p is not None and p != prev):
            done = True
            break
    p, a, _ = stats()
    if p is None:
        say(f"[{LABEL} {bi}] stats 다운 — 대기")
        time.sleep(120)
        continue
    d = p - prev
    prev = p
    say(f"[{LABEL} {bi}/{nb}] {'완료' if done else '타임아웃(계속)'} "
          f"pool={p:,}(+{d}) active={a:,} 누적+{p - p0:,}")
    dry = dry + 1 if d < DRY_MIN else 0
    if dry >= DRY_STOP:
        say(f"⚠️ [{LABEL}] 연속{DRY_STOP}배치 순증<{DRY_MIN} — 광맥 고갈로 정지 (커서 {cur})")
        break

pf, af, _ = stats()
say(f"=== [{LABEL}] 종료 pool={pf:,}(+{pf-p0:,}) active={af:,}(+{af-a0:,}) 커서={cur}")
