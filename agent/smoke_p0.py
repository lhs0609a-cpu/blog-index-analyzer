# -*- coding: utf-8 -*-
"""
P0 스모크 — 설계서(docs/BLOG_AUTOPOST_SPEC.md) §15-1 의 단일 최대 리스크를 잰다.

  질문: "Playwright 가 띄운 실제 Chrome 에서 구글 로그인이 되고, 유지되는가?"

  통과 → 설계서 그대로 진행 (생성엔진 = Gemini 웹 자동화)
  실패 → 생성엔진을 서버 LLM 으로 되돌리거나, 생성만 크롬 확장에 맡기는 하이브리드

두 가지 세션 유지 방식을 **둘 다** 잰다. 어느 쪽이 사는지가 곧 에이전트 구현 방식이다.

  --mode persistent   launch_persistent_context(user_data_dir)
                      → 프로필 디렉터리 통째로 유지. 구글 디바이스 바인딩에 유리할 것으로 기대.
                      ⚠ _pw_naver_login.py:5 실측 주석: "persistent_context + headed 는
                        드라이버가 죽는다". 그 관찰이 지금도 유효한지 여기서 확인한다.

  --mode state        launch() + storage_state(json)
                      → 쿠키/로컬스토리지만 저장. 네이버는 이 방식으로 이미 성공한 전례가 있다.
                      구글은 이것만으로 부족할 수 있다(디바이스 바인딩).

사용법 (반드시 이 순서):

  python agent/smoke_p0.py login  --mode persistent    # 창이 뜨면 구글+네이버 직접 로그인
  python agent/smoke_p0.py verify --mode persistent    # 창 닫았다 다시 열어 세션 생존 확인
  python agent/smoke_p0.py gemini --mode persistent    # Gemini 입력+전송+응답 시작
  python agent/smoke_p0.py naver  --mode persistent    # 네이버 에디터 진입 + 제목 입력

  (state 모드도 --mode state 로 동일하게 4단계)

주의
  · naver 단계는 제목만 입력하고 **저장/발행을 절대 하지 않는다.**
    다만 네이버 자동저장이 임시저장 글을 만들 수 있다. 나중에 임시저장함에서 지우면 된다.
  · 생성되는 _profile_p0/ 와 _state_p0.json 에는 **살아있는 네이버/구글 세션**이 들어간다.
    .gitignore 에 등록돼 있다. 절대 커밋하지 말 것.
"""
import argparse
import json
import os
import sys
import time

from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

HERE = os.path.dirname(os.path.abspath(__file__))
PROFILE_DIR = os.path.join(HERE, "_profile_p0")
STATE_FILE = os.path.join(HERE, "_state_p0.json")
REPORT_FILE = os.path.join(HERE, "_smoke_p0_report.json")

GEMINI_URL = "https://gemini.google.com/app"
NAVER_WRITE_URL = "https://blog.naver.com/GoBlogWrite.naver"

# 설계서 §8-4 / 스펙 12장
GEMINI_INPUT_SELECTORS = [
    'rich-textarea .ql-editor[role="textbox"]',
    '.ql-editor[role="textbox"]',
    'rich-textarea [contenteditable="true"]',
    '[role="textbox"][contenteditable="true"]',
    'div.ql-editor[contenteditable="true"]',
]
NAVER_TITLE_SELECTOR = ".se-documentTitle .se-title-text .se-text-paragraph"
NAVER_EDITOR_MARK = ".se-component.se-documentTitle, .se-documentTitle"

LOGIN_WAIT_MAX = 900   # 15분
POLL = 3


# ────────────────────────────────────────────────────────────── 공통

def log(*a):
    print(*a, flush=True)


def banner(text):
    log("=" * 72)
    log(" " + text)
    log("=" * 72)


def record(stage, mode, ok, detail=""):
    """단계별 결과를 누적 저장. 마지막에 판정표로 읽는다."""
    data = {}
    if os.path.exists(REPORT_FILE):
        try:
            with open(REPORT_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            data = {}
    data.setdefault(mode, {})[stage] = {
        "ok": bool(ok),
        "detail": detail,
        "at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    with open(REPORT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    log(f"\n[결과] {mode}/{stage} → {'PASS' if ok else 'FAIL'}  {detail}")


class Session:
    """persistent / state 두 방식을 같은 인터페이스로 감싼다."""

    def __init__(self, pw, mode, load_state=True):
        self.mode = mode
        self.pw = pw
        self.browser = None
        self.ctx = None

        args = ["--start-maximized", "--disable-blink-features=AutomationControlled"]

        if mode == "persistent":
            os.makedirs(PROFILE_DIR, exist_ok=True)
            # channel="chrome" = 순정 Chromium 이 아니라 사용자가 설치한 진짜 Chrome
            self.ctx = pw.chromium.launch_persistent_context(
                PROFILE_DIR,
                channel="chrome",
                headless=False,
                args=args,
                locale="ko-KR",
                no_viewport=True,
            )
        else:
            self.browser = pw.chromium.launch(
                channel="chrome", headless=False, args=args
            )
            state = STATE_FILE if (load_state and os.path.exists(STATE_FILE)) else None
            self.ctx = self.browser.new_context(
                locale="ko-KR", no_viewport=True, storage_state=state
            )

    def page(self):
        pages = [p for p in self.ctx.pages if p.url not in ("about:blank",)]
        return pages[0] if pages else self.ctx.new_page()

    def save(self):
        if self.mode == "state":
            self.ctx.storage_state(path=STATE_FILE)
            log(f"  세션 저장 → {STATE_FILE}")
        else:
            log(f"  프로필 유지 → {PROFILE_DIR}")

    def close(self):
        try:
            self.ctx.close()
        except Exception:
            pass
        if self.browser:
            try:
                self.browser.close()
            except Exception:
                pass


# ────────────────────────────────────────────────────────────── 판정기

def gemini_logged_in(page):
    """스펙 11-4: 아바타가 없어도 입력창이 있으면 로그인된 것으로 본다(오탐 방지)."""
    for sel in GEMINI_INPUT_SELECTORS:
        try:
            if page.query_selector(sel):
                return True, sel
        except Exception:
            pass
    return False, ""


def naver_editor_frame(page):
    """에디터는 #mainFrame iframe 안에 있다. 프레임을 직접 지목한다(설계서 §8-2)."""
    for fr in page.frames:
        try:
            if fr.query_selector(NAVER_EDITOR_MARK):
                return fr
        except Exception:
            pass
    return None


def naver_logged_in(page):
    """
    로그인 단계의 판정. 에디터 진입 여부는 naver 단계에서 따로 본다.

    ★에디터 프레임만 보면 안 된다. 로그인은 됐는데 에디터가 안 뜨는 상황
      (팝업·리다이렉트 지연·글쓰기 아닌 페이지 착지)에서 영영 '대기' 로 남는다.
      _pw_naver_login.py 가 쓰던 판정 — "네이버 도메인인데 비밀번호 입력칸이 없으면
      로그인된 것" — 을 폴백으로 둔다.
    """
    url = page.url
    if "nid.naver.com" in url:
        return False, "로그인 화면(nid.naver.com)"

    fr = naver_editor_frame(page)
    if fr:
        return True, f"에디터 프레임 발견 ({fr.url[:60]})"

    if "naver.com" in url:
        try:
            if page.query_selector("input[type=password]") is None:
                return True, f"네이버 로그인됨 (에디터 아직 아님: {url[:50]})"
        except Exception:
            pass

    return False, f"에디터를 찾지 못함 ({url[:50]})"


# ────────────────────────────────────────────────────────────── 단계

def stage_login(mode, only="both"):
    banner("1단계 로그인 — 창이 뜨면 직접 로그인해 주세요")
    if only in ("both", "gemini"):
        log("   ① Gemini  : 구글 계정으로 로그인")
    if only in ("both", "naver"):
        log("   ② 네이버  : 네이버 계정으로 로그인")
    log(f" 감지되면 자동으로 저장합니다. (최대 {LOGIN_WAIT_MAX // 60}분)")
    log(" 한쪽만 하고 나가도 그쪽 세션은 저장됩니다. 나중에 --only 로 나머지만 이어서 하세요.")
    log(" ★ 구글이 '이 브라우저는 안전하지 않을 수 있습니다'로 막으면 그게 바로 P0 실패입니다.\n")

    with sync_playwright() as pw:
        # ★기존 세션을 이어받는다. 예전엔 load_state=False 라 재실행할 때마다
        #   이미 통과한 로그인이 초기화됐다.
        s = Session(pw, mode, load_state=True)
        try:
            g = n = None
            if only in ("both", "gemini"):
                g = s.page()
                g.goto(GEMINI_URL, wait_until="domcontentloaded", timeout=60000)
            if only in ("both", "naver"):
                n = s.ctx.new_page() if g else s.page()
                n.goto(NAVER_WRITE_URL, wait_until="domcontentloaded", timeout=60000)
                # ★창을 앞으로. 다른 창 뒤에 숨어서 로그인 자체가 시도되지 않은 적이 있다
                #   (URL 이 15분 내내 nidlogin.login 에서 그대로였다).
                try:
                    n.bring_to_front()
                except Exception:
                    pass
                log("\n  ★ 지금 크롬 창이 열렸습니다. 그 창에서 네이버에 로그인해 주세요.")
                log("     창이 안 보이면 작업표시줄에서 Chrome 을 찾아 클릭하세요.\n")

            t0 = time.time()
            last = 0
            # 이번 회차에서 다루지 않는 쪽은 '이미 통과'로 둔다
            g_ok = g is None
            n_ok = n is None
            renav = 0
            while time.time() - t0 < LOGIN_WAIT_MAX:
                try:
                    if not g_ok:
                        g_ok, _ = gemini_logged_in(g)
                    if not n_ok:
                        n_ok, _ = naver_logged_in(n)
                        # ★스펙 7-1 계승: 로그인을 마쳐도 복귀 URL 이 유지되지 않으면
                        #   네이버 메인으로 떨어진다. 그러면 에디터를 영영 못 찾아
                        #   "로그인했는데도 계속 대기" 가 된다 → 글쓰기로 되돌린다.
                        if (not n_ok
                                and "nid.naver.com" not in n.url
                                and "GoBlogWrite" not in n.url
                                and "PostWriteForm" not in n.url
                                and renav < 5):
                            renav += 1
                            log(f"  로그인 후 이탈 감지({n.url[:60]}) → 글쓰기로 복귀 {renav}/5")
                            n.goto(NAVER_WRITE_URL, wait_until="domcontentloaded",
                                   timeout=60000)
                            time.sleep(3)
                except Exception as e:
                    log(f"  창이 닫혔습니다: {e}")
                    break

                if g_ok and n_ok:
                    time.sleep(4)   # 쿠키 확정 대기
                    break

                el = int(time.time() - t0)
                if el - last >= 30:
                    last = el
                    # ★현재 URL 을 반드시 같이 찍는다. 이게 없으면 "네이버=대기" 만 15분 나오고
                    #   캡차인지 2단계인증인지 창을 못 본 건지 구분이 안 된다(실제로 3회 허비).
                    #   _pw_naver_login.py 는 처음부터 URL 을 찍고 있었다.
                    where = ""
                    try:
                        if n is not None and not n_ok:
                            where = f" | 네이버 화면: {n.url[:70]}"
                        elif g is not None and not g_ok:
                            where = f" | Gemini 화면: {g.url[:70]}"
                    except Exception:
                        where = " | (창 확인 불가)"
                    log(f"  대기 {el}s … Gemini={'OK' if g_ok else '대기'} "
                        f"네이버={'OK' if n_ok else '대기'}{where}")
                time.sleep(POLL)

            # ★부분 성공도 반드시 저장한다.
            #   둘 다 성공했을 때만 저장하면, 한쪽만 로그인하고 자리를 뜬 경우
            #   이미 통과한 로그인까지 통째로 버려진다(첫 실행에서 실제로 그렇게 날렸다).
            if g_ok or n_ok:
                s.save()
            done = [x for x, ok in (("Gemini", g_ok), ("네이버", n_ok)) if ok]
            if g_ok and n_ok:
                record("login", mode, True, f"로그인 완료: {'+'.join(done)} (only={only})")
            else:
                record("login", mode, False,
                       f"Gemini={g_ok} 네이버={n_ok} (only={only}) — 시간 초과 또는 중단"
                       + (" / 성공한 쪽 세션은 저장됨" if (g_ok or n_ok) else ""))
        finally:
            s.close()


def stage_verify(mode):
    banner("2단계 세션 생존 — 창을 새로 열어 로그인이 유지되는지 확인")
    log(" ★ 이 단계가 P0 의 핵심입니다. 여기서 구글이 풀리면 Gemini 자동화가 불가능합니다.\n")

    with sync_playwright() as pw:
        s = Session(pw, mode)
        try:
            g = s.page()
            g.goto(GEMINI_URL, wait_until="domcontentloaded", timeout=60000)
            time.sleep(6)   # SPA 렌더 대기
            g_ok, sel = gemini_logged_in(g)
            log(f"  Gemini  : {'유지됨' if g_ok else '풀림'}  {sel}")

            n = s.ctx.new_page()
            n.goto(NAVER_WRITE_URL, wait_until="domcontentloaded", timeout=60000)
            time.sleep(4)
            n_ok, why = naver_logged_in(n)
            log(f"  네이버  : {'유지됨' if n_ok else '풀림'}  {why}")

            record("verify", mode, g_ok and n_ok,
                   f"Gemini={'유지' if g_ok else '풀림'} / 네이버={'유지' if n_ok else '풀림'}")
            log("\n  10초 후 닫습니다. 화면을 확인하세요.")
            time.sleep(10)
        finally:
            s.close()


def stage_gemini(mode):
    banner("3단계 Gemini 입력 — insert_text + Enter 로 응답이 시작되는가")

    prompt = "안녕하세요. 이건 연결 테스트입니다. '테스트 성공'이라고만 답해주세요."

    with sync_playwright() as pw:
        s = Session(pw, mode)
        try:
            g = s.page()
            g.goto(GEMINI_URL, wait_until="domcontentloaded", timeout=60000)
            time.sleep(6)

            ok, sel = gemini_logged_in(g)
            if not ok:
                record("gemini", mode, False, "입력창 없음 — 로그인 풀림")
                return

            before = len(g.query_selector_all("model-response"))
            log(f"  입력창 {sel} / 기존 응답 {before}개")

            g.click(sel)
            time.sleep(0.3)
            g.keyboard.insert_text(prompt)      # 스펙 4장: IME 조합 문제 없음
            time.sleep(0.5)                     # Quill 이 Delta 를 반영할 여유
            g.keyboard.press("Enter")           # enterkeyhint="send" → 버튼 불필요

            # 스펙 11-3: 60초 내 '시작' 없으면 프롬프트 전송 실패로 본다
            started = False
            t0 = time.time()
            while time.time() - t0 < 60:
                time.sleep(1.5)
                if len(g.query_selector_all("model-response")) > before:
                    started = True
                    break
            if not started:
                record("gemini", mode, False, "60초 내 응답이 시작되지 않음(전송 실패)")
                return
            log("  응답 시작 확인")

            # 스펙 11-4: 완료 신호 3개 중 2개
            done, text = False, ""
            t0 = time.time()
            while time.time() - t0 < 120:
                time.sleep(1.5)
                resp = g.query_selector_all("model-response")[-1]
                sig = 0
                f = resp.query_selector(".response-footer")
                if f and "complete" in (f.get_attribute("class") or ""):
                    sig += 1
                md = resp.query_selector(".markdown.markdown-main-panel")
                if md and md.get_attribute("aria-busy") == "false":
                    sig += 1
                if resp.query_selector("message-actions"):
                    sig += 1
                if sig >= 2 and md:
                    text = (md.inner_text() or "").strip()   # ★innerText 여야 문단 유지
                    done = True
                    break

            record("gemini", mode, done,
                   f"수확 {len(text)}자: {text[:60]!r}" if done else "완료 신호 미수신")
            time.sleep(5)
        finally:
            s.close()


def stage_naver(mode):
    banner("4단계 네이버 에디터 — 제목 입력이 실제로 들어가는가")
    log(" ★ 저장/발행은 하지 않습니다. 제목만 넣고 확인 후 닫습니다.")
    log("   (네이버 자동저장이 임시저장 글을 만들 수 있습니다. 나중에 지우세요.)\n")

    probe = "P0 스모크 테스트 " + time.strftime("%H:%M:%S")

    with sync_playwright() as pw:
        s = Session(pw, mode)
        try:
            n = s.page()
            n.goto(NAVER_WRITE_URL, wait_until="domcontentloaded", timeout=60000)
            time.sleep(4)

            if "nid.naver.com" in n.url:
                record("naver", mode, False, "로그인 화면으로 튕김")
                return

            # 스펙 8-2: "작성 중이던 글" 팝업을 안 닫으면 이후 조작이 전부 막힌다
            for fr in n.frames:
                try:
                    for b in fr.query_selector_all("button, a"):
                        t = (b.inner_text() or "").strip()
                        if t in ("취소", "아니오", "새로 작성", "새글쓰기"):
                            b.click()
                            log(f"  드래프트 팝업 닫음 ('{t}')")
                            time.sleep(0.5)
                            raise StopIteration
                except StopIteration:
                    break
                except Exception:
                    pass

            fr = None
            for _ in range(20):     # 스펙 8-1: 400ms × 20회 재시도
                fr = naver_editor_frame(n)
                if fr:
                    break
                time.sleep(0.4)
            if not fr:
                record("naver", mode, False, "에디터 프레임 미발견(25초)")
                return
            log(f"  에디터 프레임: {fr.url[:70]}")

            el = fr.query_selector(NAVER_TITLE_SELECTOR)
            if not el:
                record("naver", mode, False, f"제목 문단 미발견 ({NAVER_TITLE_SELECTOR})")
                return

            el.click()
            time.sleep(0.3)
            n.keyboard.press("Control+a")
            time.sleep(0.2)
            n.keyboard.insert_text(probe)   # ★DOM 대입이 아니라 실제 입력
            time.sleep(1.2)

            got = (fr.query_selector(NAVER_TITLE_SELECTOR).inner_text() or "").strip()
            ok = probe.replace(" ", "") in got.replace(" ", "")
            log(f"  입력 시도: {probe!r}")
            log(f"  실제 값  : {got!r}")

            record("naver", mode, ok,
                   "insert_text 반영됨" if ok else "제목이 반영되지 않음 — CDP 경로 재검토 필요")
            log("\n  15초 후 닫습니다. 화면에서 제목을 확인하세요.")
            time.sleep(15)
        finally:
            s.close()


def stage_report():
    banner("P0 판정표")
    if not os.path.exists(REPORT_FILE):
        log(" 아직 실행된 단계가 없습니다.")
        return
    with open(REPORT_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    for mode in ("persistent", "state"):
        if mode not in data:
            continue
        log(f"\n [{mode}]")
        for stage in ("login", "verify", "gemini", "naver"):
            r = data[mode].get(stage)
            if not r:
                log(f"   {stage:8s} -")
                continue
            log(f"   {stage:8s} {'PASS' if r['ok'] else 'FAIL'}  {r['detail']}")
    log("\n 판정 기준")
    log("   verify/gemini 가 어느 한 모드에서라도 PASS → 설계서대로 진행")
    log("   두 모드 다 FAIL                          → §15-1 대안으로 전환")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("stage", choices=["login", "verify", "gemini", "naver", "report"])
    ap.add_argument("--mode", choices=["persistent", "state"], default="state")
    ap.add_argument("--only", choices=["both", "gemini", "naver"], default="both",
                    help="login 단계에서 한쪽만 로그인. 나머지는 기존 세션을 유지한다")
    a = ap.parse_args()

    if a.stage == "report":
        stage_report()
    elif a.stage == "login":
        stage_login(a.mode, a.only)
    elif a.stage == "verify":
        stage_verify(a.mode)
    elif a.stage == "gemini":
        stage_gemini(a.mode)
    elif a.stage == "naver":
        stage_naver(a.mode)


if __name__ == "__main__":
    main()
