#!/bin/sh
# 마라톤 워치독 (2026-08-07 v2) — 죽으면 되살린다.
#
# 왜 필요한가: 2026-08-06 체인이 배치 도중 프로세스째 사라졌고(로그 0바이트) **하루 반
# 동안 아무도 몰랐다**. 커서 상태파일은 살아있어 이어가기만 하면 되는데 되살릴 주체가
# 없었다. 이 스크립트가 그 주체다.
#
# ⚠️ 모든 자산은 C:/Users/lhs06/AppData/Local/blank_haeul/ 에 둔다. 세션 scratchpad 는
#    2026-08-07 통째로 날아갔다(코퍼스 25만·검증큐 58만 소실). 임시디렉터리 금지.
# ⚠️ 프로세스 조회 대신 **로그 mtime 신선도**로 판정한다 — Windows 11 에 wmic 이 없고
#    tasklist 는 커맨드라인을 안 준다.
# ⚠️ 임계값은 넉넉히 — 살아있는 잡을 죽었다고 오판해 재기동하면 드라이버가 둘이 되어
#    같은 배치를 두 번 쏜다.
cd "G:/내 드라이브/developer/blog-index-analyzer/flyio-backend" || exit 1
D="C:/Users/lhs06/AppData/Local/blank_haeul"
L="$D/watchdog.log"
LOCK="$D/watchdog.lock"

if [ -f "$LOCK" ] && kill -0 "$(cat "$LOCK" 2>/dev/null)" 2>/dev/null; then
  echo "[$(date)] 이미 실행중(pid $(cat "$LOCK")) — 종료" >> "$L"; exit 0
fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT INT TERM

age () { [ -f "$1" ] || { echo 999999; return; }; expr $(date +%s) - $(date -r "$1" +%s); }

echo "[$(date)] 워치독 시작 pid=$$" >> "$L"
while true; do
  # --- 자동 피더 (배치당 로그, 대기중이어도 IDLE_SLEEP=600 마다 찍는다) ---
  a=$(age "$D/logs/feed.log")
  if [ "$a" -gt 2400 ] && ! grep -q "목표 도달" "$D/logs/feed.log" 2>/dev/null; then
    echo "[$(date)] 피더 정지(${a}s 무갱신) → 재기동" >> "$L"
    nohup python _haeul_feed_loop.py >> "$D/logs/feed.log" 2>&1 &
    sleep 180
  fi

  # --- 볼륨 검증기 (60콜당 로그) ---
  a=$(age "$D/vol.log")
  if [ "$a" -gt 900 ] && ! grep -q "→ _haeul_w4_live.json" "$D/vol.log" 2>/dev/null; then
    echo "[$(date)] 검증기 정지(${a}s 무갱신) → 재기동" >> "$L"
    GAP=0.5 WORKERS=5 VOLC="$D/volcache.json" CANDFILE="$D/tocheck2.json" \
      OUT=_haeul_w4_live.json nohup python _haeul_w2_vol.py >> "$D/vol.log" 2>&1 &
    sleep 180
  fi

  sleep 300
done
