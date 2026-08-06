# BLANK 블로그 자동 작성·발행 시스템 설계서

> 작성일 2026-08-06 · 상태: **설계(미구현)** · 기준 참조: `doctor-voice-pro/chrome-extension/EXTENSION-FULL-SPEC.txt` v16.0.7

---

## 0. 30초 요약

> **플랫폼 목표**: BLANK 를 "네이버 블로그를 **지수 분석부터 글 작성·발행까지 전부** 하는 곳"으로
> 만든다. 지금까지는 진단(지수·키워드·경쟁도)만 팔았고, 홈에서 "AI 글쓰기"를 내걸면서도
> `/tools` 페이지가 삭제돼 **실물이 없는 상태**다(`frontend/app/page.tsx:425`).
> 이 기능이 그 공백을 메우고, 진단 → 처방 → 실행 → 검증의 고리를 닫는다.

BLANK 유료 사용자가 **"이번 주 쓸 글"을 고르고 승인만 하면**, 원고 생성부터 네이버 블로그
예약발행까지 자동으로 끝나고, 발행된 글의 **실제 순위가 다시 우리 DB로 돌아온다.**

```
winner-keywords로 주제 선정
  → writing-guide 실측 수치로 프롬프트 조립          (백엔드)
  → Gemini 웹 자동화로 원고 생성                     (로컬 에이전트)
  → 같은 지표로 규격 채점 → 미달이면 재프롬프트      (백엔드)  ★우리만 가능
  → 사용자 승인
  → 네이버 글쓰기 → 예약발행(골든타임 자동 배치)     (로컬 에이전트)
  → rank_tracker 자동 등록 → 실제 순위 회수          (백엔드)  ★루프 닫힘
```

**핵심 설계 원칙 (닥터보이스 스펙에서 그대로 승계)**

1. 에디터 입력은 **CDP 계열 경로만**. DOM 직접 대입은 SmartEditor ONE이 무시한다. 취향이 아니라 유일한 경로다.
2. 셀렉터는 `data-click-area` / `data-name` / `data-testid` 만. 해시 클래스는 폴백.
3. **실패는 조용히 넘기지 말고 발행을 중단한다.** 사진 빠진 글, 엉뚱한 카테고리, 즉시 발행돼버린 예약글은 수동 복구가 지옥이다.
4. 네이버·구글 비밀번호는 **어디에도 저장하지 않는다.** 브라우저 프로필 세션만 쓴다.

---

## 1. 결정 사항과 근거

| 항목 | 결정 | 대안 | 왜 |
|---|---|---|---|
| **실행기** | 로컬 트레이 에이전트 (Python + Playwright + 실제 Chrome) | 크롬 확장(스펙 그대로) | MV3 워커 30초 사망·64MiB 메시지 한계·디버깅 배너·웹스토어 심사 리젝 위험이 **전부 사라진다**. 우리는 이미 Playwright로 네이버 UI 자동화를 완주한 실적이 있다(키네스 지역타겟팅 102/102, `_pw_naver_login.py`) |
| **UI** | 기존 웹앱(www.blrank.co.kr) 재사용. 에이전트는 화면 없음 | 에이전트에 GUI 탑재 | 개발량 최소. 확장 스펙의 웹앱↔확장 브릿지(`content-website.js`, CustomEvent 5종, REQUEST_JOB 토큰 왕복)가 **통째로 불필요해진다** |
| **원고 생성** | Gemini 웹 자동화 (사용자 구글 계정) | 서버 LLM(OpenAI) | 토큰 원가 0. 단 **프롬프트 조립·채점·재생성 지시는 백엔드가 한다** → 우리 강점(writing-guide 규격 강제)은 그대로 유지 |
| **1차 사용자** | BLANK 유료 사용자 상품 | 내부 운영용 | 처음부터 `user_id` 기준 데이터 모델 + 플랜별 쿼터 + ToS 고지 |
| **자격증명** | 저장 안 함. 전용 크롬 프로필에 세션만 | 확장 스펙의 AES-GCM 로컬 암호화 | 다수 일반 사용자 대상이라 사고 파장이 소수 병원과 다르다 |
| **예약 발행** | 네이버 자체 예약발행 기능 사용 | 우리 서버가 시각 맞춰 트리거 | 사용자 PC가 꺼져 있어도 네이버가 발행한다. **브라우저를 한 번 열었을 때 앞으로 N일치를 밀어넣는 것**이 이 상품의 핵심 UX |

---

## 2. 아키텍처

```
┌──────────────────────────────────────────────────────────────────┐
│  웹앱 (Next.js / Vercel / www.blrank.co.kr)                      │
│   /autopost          주제 편성 · 초안 편집 · 승인 · 발행 예약   │
│   /autopost/results  발행 결과 · 순위 추이                       │
└───────────────────────────┬──────────────────────────────────────┘
                            │ REST (기존 JWT 세션 그대로)
┌───────────────────────────▼──────────────────────────────────────┐
│  백엔드 (FastAPI / Fly.io)                                       │
│   · 주제 편성    winner_keyword_service / blue_ocean             │
│   · 프롬프트 조립 top_posts writing-guide 수치 주입              │
│   · 규격 채점기  spec_scorer  (신규)                             │
│   · 잡 큐/리스   autopost_jobs                                   │
│   · 발행 후처리  rank_tracker 자동 등록                          │
│   · 가드         지수 보호 · 중복 주제 · 플랜 쿼터               │
└───────────────────────────┬──────────────────────────────────────┘
                            │ 폴링 + 리스(claim) · Bearer JWT
┌───────────────────────────▼──────────────────────────────────────┐
│  로컬 에이전트 (Windows 트레이 상주, 화면 없음)                  │
│   blank-agent.exe                                                │
│   ├ job_runner      큐 폴링 · 리스 갱신 · 결과 보고 · 가드 타임아웃│
│   ├ gemini_writer   gemini.google.com 조작 · 완료판정 · 수확      │
│   ├ naver_poster    글쓰기 · 이미지 · 발행레이어 · 예약 datepicker│
│   └ diag            로컬 링버퍼 로그 + 업로드                     │
└───────────────────────────┬──────────────────────────────────────┘
                            │ Playwright (channel="chrome", 전용 프로필)
                    ┌───────▼────────┐   ┌──────────────────┐
                    │ blog.naver.com │   │ gemini.google.com│
                    └────────────────┘   └──────────────────┘
```

**에이전트는 백엔드만 본다.** 웹앱 탭을 경유하지 않는다.
→ 확장 스펙의 2단 payload 전송(10-1장)·CustomEvent 릴레이·64MiB 회피 구조가 전부 불필요.
→ 메모리에 기록된 `api.blrank.co.kr` CNAME 미해석 이슈를 피하려면 에이전트는
   **`https://blog-index-analyzer.fly.dev` 를 기본 엔드포인트**로 쓰고, 도메인은 설정으로 뺀다.

---

## 3. 확장 스펙 대비 삭감표

닥터보이스 스펙 13장 안전장치의 절반은 **크롬 확장이라서 생긴 문제**다. 로컬 프로그램에선 사라진다.

| 스펙 항목 | 우리 | 사유 |
|---|---|---|
| 13-1 MV3 keepalive (25초 API 호출 + alarms backstop) | **삭제** | 그냥 프로세스다 |
| 10-1 payload 2단 전송(REQUEST_JOB/토큰) | **삭제** | 에이전트가 백엔드에서 직접 받는다 |
| 8-4 이미지 삽입 전후 debugger detach/attach | **삭제** | Playwright `set_input_files()` — CDP와 충돌 없음 |
| 8-5 합성 DragEvent 이미지 드롭 | **삭제** | 스펙 16장이 스스로 "네이버 정책 변경에 취약"이라 인정. 진짜 file input을 쓴다 |
| 5장 웹앱↔확장 메시지 프로토콜 전체 | **삭제** | REST로 대체 |
| 14장 crx + updates.xml + 그룹정책 .reg | **삭제** | 일반 인스톨러 + 자체 업데이터 |
| 7-3 확장 내 비밀번호 AES-GCM 저장 | **삭제** | 세션만 쓴다 |
| 4장 CDP 헬퍼(insertText/ctrlA/ctrlB) | **치환** | Playwright `keyboard.insert_text()` / `press()` |
| 12장 셀렉터 맵 | **전량 승계** | 이게 스펙의 최대 자산 |
| 9장 발행/예약/카테고리 로직 | **전량 승계** | 로직 그대로, 호출부만 Playwright |
| 11-4 Gemini 완료판정 3신호 중 2개 | **전량 승계** | 휴리스틱 아님. 그대로 |
| 13-3 "실패 시 중단" 원칙 목록 | **전량 승계 + 확장** | §9 |
| 13-2 디스크 진단 로그 | **승계** | 고객 PC 원격 디버깅의 유일한 창구 |

---

## 4. 데이터 모델

기존 SQLite(`/data/blog_analyzer.db`, `DATABASE_PATH`) 컨벤션을 따른다.
신규 파일: `flyio-backend/database/autopost_db.py`

### 4-1. 신규 테이블

```sql
-- 발행 대상 블로그 (에이전트가 어느 계정으로 쓸지)
CREATE TABLE autopost_blogs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    blog_id         TEXT    NOT NULL,        -- 네이버 blogId (expectedBlogId 대조용)
    blog_name       TEXT,
    default_category TEXT,                   -- 카테고리 "번호" 우선 (이름은 사용자가 바꾼다)
    daily_cap       INTEGER,                 -- NULL이면 지수 기반 자동 산정(§10)
    min_gap_minutes INTEGER DEFAULT 180,
    is_active       INTEGER DEFAULT 1,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, blog_id)
);

-- 원고
CREATE TABLE autopost_drafts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    autopost_blog_id INTEGER NOT NULL,
    keyword         TEXT    NOT NULL,        -- 주력 키워드
    sub_keywords    TEXT,                    -- JSON []
    category        TEXT,                    -- top_posts detect_category() 결과
    source          TEXT,                    -- winner_keywords | blue_ocean | manual
    status          TEXT DEFAULT 'pending',  -- §5 상태머신
    prompt          TEXT,                    -- 백엔드가 조립한 최종 프롬프트
    title           TEXT,
    body            TEXT,
    spec_score      REAL,                    -- 0~100
    spec_report     TEXT,                    -- JSON: 항목별 pass/fail + 실측치
    regen_count     INTEGER DEFAULT 0,
    guide_snapshot  TEXT,                    -- 채점에 쓴 writing-guide 사본(재현성)
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (autopost_blog_id) REFERENCES autopost_blogs(id) ON DELETE CASCADE
);

-- 실행 잡 (생성 + 발행 공용 큐)
CREATE TABLE autopost_jobs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    draft_id        INTEGER NOT NULL,
    kind            TEXT NOT NULL,           -- generate | publish
    status          TEXT DEFAULT 'queued',   -- §5
    -- 발행 옵션
    final_action    TEXT DEFAULT 'draft',    -- draft | publishNow | schedule  ★기본 draft(안전)
    scheduled_at    TIMESTAMP,               -- 예약 시각(분은 10분 내림)
    open_type       TEXT DEFAULT 'public',   -- public | neighbor | both | private
    allow_search    INTEGER DEFAULT 1,
    category        TEXT,
    expected_blog_id TEXT NOT NULL,          -- ★오발행 방지
    -- 실행 상태
    agent_id        TEXT,
    lease_expires_at TIMESTAMP,              -- ★중복 실행 방지
    attempts        INTEGER DEFAULT 0,
    progress_text   TEXT,
    progress_pct    INTEGER,
    result_url      TEXT,                    -- 발행된 글 URL
    error           TEXT,
    uncertain       INTEGER DEFAULT 0,       -- ★"발행됐을 수도 있음" → 자동 재시도 금지
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (draft_id) REFERENCES autopost_drafts(id) ON DELETE CASCADE
);
CREATE INDEX idx_jobs_queue ON autopost_jobs(status, lease_expires_at);

-- 등록된 에이전트
CREATE TABLE autopost_agents (
    agent_id        TEXT PRIMARY KEY,        -- uuid4
    user_id         INTEGER NOT NULL,
    machine_name    TEXT,
    version         TEXT,
    last_seen_at    TIMESTAMP,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 이미지 라이브러리 (사용자 업로드)
CREATE TABLE autopost_images (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    autopost_blog_id INTEGER,
    file_path       TEXT NOT NULL,           -- /data/autopost_images/{user}/{uuid}.jpg
    tags            TEXT,                    -- JSON [] — 키워드 매칭용
    used_count      INTEGER DEFAULT 0,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 발행 이력 (가드 판정 + 감사)
CREATE TABLE autopost_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    autopost_blog_id INTEGER NOT NULL,
    draft_id        INTEGER,
    keyword         TEXT,
    title           TEXT,
    post_url        TEXT,
    published_at    TIMESTAMP,
    action          TEXT,                    -- draft | published | scheduled
    tracked_post_id INTEGER,                 -- rank_tracker 연결
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 4-2. 기존 자산 재사용 (신규 개발 없음)

| 붙일 곳 | 용도 |
|---|---|
| `GET /api/winner-keywords/daily-winners` | 주제 편성 후보 |
| `GET /api/top-posts/writing-guide?category=` | 원고 규격(제목길이·키워드위치·본문길이·헤딩수·키워드밀도·이미지수) |
| `database/top_posts_db.detect_category()` | 키워드 → 카테고리 판정 |
| `POST /api/rank-tracker/blogs` · `tracked_posts` · `post_keywords` | 발행 후 순위추적 자동 등록 |
| `database/user_blogs_db` | 사용자 블로그 ↔ 지수/레벨 |
| `database/usage_db` | 플랜 쿼터 차감 |
| `routers/auth_deps.get_current_user` | JWT 인증 (에이전트도 동일) |

---

## 5. 잡 상태머신

### 5-1. draft (원고)

```
pending ──(generate 잡 생성)──> generating ──(수확)──> scoring
                                    ▲                     │
                                    │              ┌──────┴──────┐
                                    │          통과 │             │ 미달
                                    └──재프롬프트──┤             ▼
                                   (regen_count++) │        needs_regen
                                                   ▼         (한도 초과 시)
                                              generated ────────> failed
                                                   │
                                       사용자 승인 ▼
                                              approved ──(publish 잡)──> publishing
                                                                              │
                                                                              ▼
                                                                          published
```

### 5-2. job (실행)

```
queued ──claim──> claimed ──> running ──┬──> succeeded
   ▲                  │                 ├──> failed
   │                  │                 └──> uncertain  ★자동 재시도 금지
   └───리스 만료──────┘
```

**리스(lease) 규칙**
- `claim` 시 `lease_expires_at = now + guard_ms`, `agent_id` 기록
- 에이전트는 30초마다 heartbeat로 리스 연장
- 리스 만료 = 에이전트가 죽었다 → `queued`로 되돌림, `attempts++`
- `attempts >= 3` → `failed`
- **`uncertain`은 절대 되돌리지 않는다.** 같은 글이 두 번 예약되는 사고(스펙 10-3)를 그대로 물려받는다

**가드 타임아웃** (스펙 10-3 계승)
```python
def job_guard_ms(job):
    imgs = len(job.blocks_images)
    if job.kind == 'generate':
        return 180_000 + min(120_000, len(job.prompt) // 10 * 1000)   # 스펙 11-3
    base    = 180_000     # 페이지 로드 + 타이핑 + finalize
    captcha = 200_000     # ★finalize의 캡차 대기(180초)보다 반드시 길게
    return base + captcha + imgs * 30_000
```

---

## 6. API 명세

### 6-1. 웹앱 → 백엔드 (`/api/autopost`)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/blogs` | 등록된 발행 대상 블로그 |
| POST | `/blogs` | 블로그 등록 (blogId·기본 카테고리·일일 상한) |
| POST | `/plan` | **주제 편성**. winner-keywords + 가드 → 이번 주 후보 N건 반환 |
| POST | `/drafts` | 후보 승인 → draft 생성 + generate 잡 큐잉 |
| GET | `/drafts` | 목록 (status 필터) |
| GET | `/drafts/{id}` | 본문 + `spec_report`(항목별 실측치/기준/pass) |
| PATCH | `/drafts/{id}` | 사용자 직접 수정 → 재채점 |
| POST | `/drafts/{id}/regenerate` | 수동 재생성 |
| POST | `/drafts/{id}/approve` | 승인 → publish 잡 큐잉(발행 옵션 포함) |
| POST | `/schedule/auto` | **골든타임 자동 배치**(§11). 승인된 draft들에 예약 시각 배정 |
| GET | `/jobs` | 진행 상황 (progress_text/pct) |
| POST | `/jobs/{id}/cancel` | 취소 (queued만) |
| GET | `/agents` | 연결된 에이전트 상태 (신호등) |
| POST | `/agents/pair-code` | 6자리 연결코드 발급(10분 유효) |
| GET | `/images` · POST `/images` | 이미지 라이브러리 |

### 6-2. 에이전트 ↔ 백엔드 (`/api/autopost/agent`)

인증: `Authorization: Bearer <agent JWT>` — 기존 `auth_deps.get_current_user` 그대로.

| 메서드 | 경로 | 요청 / 응답 |
|---|---|---|
| POST | `/pair` | `{code, machine_name, version}` → `{agent_id, access_token, refresh_token}` |
| POST | `/refresh` | `{refresh_token}` → `{access_token}` |
| GET | `/next` | → **잡 1건 claim** 또는 `{job: null}`. 폴링 간격 15초(유휴)/3초(활성) |
| GET | `/jobs/{id}/payload` | 실행에 필요한 전부 (아래) |
| POST | `/jobs/{id}/heartbeat` | `{progress_text, pct}` → 리스 연장 |
| POST | `/jobs/{id}/result` | `{ok, action, post_url, harvested_text, error, uncertain}` |
| POST | `/diag` | 진단 로그 업로드 |

**`/payload` 응답 (kind별)**

```jsonc
// kind: "generate"
{ "kind":"generate", "prompt":"...", "min_chars":1800, "new_chat":true, "temp_chat":true }

// kind: "publish"
{
  "kind":"publish",
  "expected_blog_id":"myblog",          // ★다르면 즉시 중단
  "blocks":[                            // 텍스트/이미지 인터리브 (스펙 6장 계승)
    {"type":"text","content":"첫 단락"},
    {"type":"image","url":"https://.../autopost_images/xx.jpg"},
    {"type":"text","content":"둘째 단락"}
  ],
  "title":"글 제목",
  "emphasize":["주력키워드"],           // Ctrl+B 자동 굵게
  "tags":["태그1","태그2"],
  "options":{"openType":"public","search":true,"category":"24"},
  "finalAction":"schedule",
  "schedule":{"datetime":"2026-08-10T14:30"}
}
```
> 이미지는 URL로 내려보내고 에이전트가 받아 임시파일로 떨군다.
> base64를 안 쓰므로 스펙 10-1장의 64MiB 문제 자체가 없다.

---

## 7. 원고 파이프라인

### 7-1. 프롬프트 조립 (백엔드) — **이 상품의 차별점**

```
키워드 → detect_category() → GET writing-guide(category)
      → 실측 수치를 자연어 제약으로 변환 → 프롬프트
```

`generate_writing_rules()`가 이미 다음을 내려준다(`database/top_posts_db.py:406`):

| 규칙 | 필드 | 프롬프트 반영 |
|---|---|---|
| 제목 길이 | `title.length.{min,optimal,max}` | "제목은 N~M자" |
| 키워드 위치 | `title.keyword_placement.best_position` | "키워드를 제목 앞부분에" |
| 본문 길이 | `content.length.{min,max}` | "본문 N~M자" |
| 소제목 수 | `content.structure.heading_count.{min,max}` | "소제목 N개 이상" |
| 키워드 밀도 | `content.structure.keyword_density.{min,max}` | "1,000자당 N~M회" |
| 이미지 수 | `media.images.{min,max}` | "`[이미지]` 표시를 N군데" |

여기에 **모바일 서식 규칙(§7-4)을 프롬프트에 함께 박는다.** 후처리로만 고치려 하면
접속사로 길게 이어붙인 문장이 들어와 기계적으로 자를 곳이 없다. 생성 단계에서 짧게 쓰게 한다.

**`status: "insufficient_data"`(샘플 5건 미만)면 `get_default_rules()` 기본값이 나온다.**
이때는 프롬프트에 반영하되 `spec_score` 게이트는 **경고만 하고 차단하지 않는다** — 근거 없는
기준으로 사용자 원고를 반려하면 안 된다. `confidence` 값을 UI에 그대로 노출한다.

### 7-2. Gemini 조작 (에이전트) — 스펙 11장 이식

| 스펙 | 우리 구현 |
|---|---|
| `GEM_INPUT_POS` → 좌표 → CDP click | `page.click('rich-textarea .ql-editor[role="textbox"]')` |
| CDP `Input.insertText` | `page.keyboard.insert_text(prompt)` — Quill Delta 반영 대기 400ms 후 Enter |
| 전송 = Enter (`enterkeyhint="send"`) | 동일. **전송 버튼 셀렉터는 찾지 않는다** |
| 완료판정 3신호 중 2개 | 그대로: `.response-footer.complete` / `.markdown.markdown-main-panel[aria-busy="false"]` / `message-actions` 존재 |
| 본문 수확 `innerText` | 그대로. **`textContent`는 문단 구분이 다 붙는다** |
| `newChatEvery: 1` | 그대로. 같은 대화를 계속 쓰면 앞 글 문체를 따라가 갈수록 짧아진다 |
| `reloadEvery: 20` | 그대로 (SPA 메모리 누수) |
| 60초 내 응답 시작 없음 → 실패 | 그대로 (프롬프트 전송 실패 판정) |
| 1.5초 폴링 | **불필요**(MV3 아님). 하지만 진행률 표시용으로 유지 |

### 7-3. 규격 채점기 (백엔드 신규) — `services/autopost_scorer.py`

수확 텍스트를 **top_posts가 상위글에서 뽑는 것과 동일한 지표**로 잰다.

```python
def score(title, body, keyword, guide) -> dict:
    m = {
      # --- writing-guide 대조 항목 (실측 기준) ---
      "title_length":      len(title),
      "title_has_keyword": keyword in title,
      "title_kw_position": position_bucket(title, keyword),   # front|middle|end
      "content_length":    len(strip_markers(body)),
      "heading_count":     count_headings(body),
      "keyword_count":     body.count(keyword),
      "keyword_density":   body.count(keyword) / max(1, len(body)/1000),
      "image_slots":       body.count("[이미지]"),

      # --- 모바일 가독성 항목 (§7-4, 우리 자체 기준) ---
      "avg_line_chars":    mean(len(l) for l in lines if l.strip()),
      "long_line_ratio":   ratio(len(l) > 35 for l in lines if l.strip()),
      "max_para_lines":    max(len(p) for p in paragraphs),     # 빈 줄 사이 줄 수
      "wall_of_text":      any(len(p) >= 5 for p in paragraphs),
      "blank_line_ratio":  count(l == '' for l in lines) / max(1, len(lines)),
    }
    # 항목별 기준 대조 → pass/fail + 총점
```

**게이트**

| 게이트 | 조건 | 적용 시점 |
|---|---|---|
| 규격 필수 3종 | `content_length` · `keyword_density` · `title_length` 전부 범위 내 | `guide.status == 'data_driven'` 일 때만 |
| **가독성 필수** | `wall_of_text == False` **and** `long_line_ratio ≤ 0.15` | **항상** |
| 총점 | ≥ 70 | `data_driven` 일 때만 |

> **가독성 게이트는 writing-guide 데이터가 없어도 항상 적용한다.** 이건 상위글 통계에서
> 나온 기준이 아니라 우리가 정한 편집 원칙이고, 데이터 부족과 무관하게 지켜야 한다.
> 미달 → `needs_regen`

**재프롬프트**는 미달 항목을 자연어 지시로 바꿔 원 프롬프트 뒤에 덧붙인다.
```
직전 원고의 문제:
- 본문이 1,850자입니다. 2,400~3,200자가 필요합니다.
- 소제목이 2개입니다. 4개 이상으로 나눠주세요.
위 지적만 반영해 전체를 다시 써주세요.
```
`regen_count` 상한 **2회**(=최대 3번 생성). 초과 시 `generated` 상태로 두고
**사용자에게 미달 항목을 그대로 보여준 뒤 판단을 맡긴다.** 무한 재생성은 Gemini 한도를 태운다.

### 7-4. ★ 모바일 서식 — 이 기능의 필수 요건

> **네이버 블로그 트래픽은 대부분 모바일이다.** PC에서 멀쩡해 보이는 문단이
> 모바일에서는 8~10줄 벽이 된다. 읽히지 않는 글은 체류시간이 떨어지고 순위도 안 나온다.
> 그래서 이건 "예쁘게 다듬기"가 아니라 **발행 전 통과해야 하는 게이트**다(§7-3).

#### 규칙

| # | 규칙 | 값 |
|---|---|---|
| R1 | **한 문장 = 한 줄.** 문장이 끝나면 무조건 개행 | — |
| R2 | 한 줄 길이 | 목표 **25자 내외**, **최대 35자** |
| R3 | 35자 초과 줄은 분할 | 쉼표 → 접속사(그리고/하지만/그래서/때문에) → 조사 경계 순 |
| R4 | **문단 = 최대 3줄.** 3줄 쓰면 빈 줄 | — |
| R5 | 빈 줄은 **1줄만.** 2줄 이상 연속 금지 | — |
| R6 | 소제목 앞뒤로 빈 줄 | — |
| R7 | 도입부는 3줄 이내로 끊고 빈 줄 | — |
| R8 | 목록은 항목마다 개행, 항목 사이 빈 줄 없음 | — |
| R9 | 이미지 앞뒤로 빈 줄 | — |

#### 손대지 않는 것 (멱등성)

- 소제목 줄, 목록 줄, 인용 줄, `[이미지]` 표시
- **이미 R1~R9를 만족하는 글** — 다시 돌려도 결과가 같아야 한다.
  후처리가 멱등이 아니면 재생성 루프를 돌 때마다 서식이 흔들린다.

#### Before / After

```
❌ 지금 나오는 형태 (모바일에서 벽)
임플란트 수술 후에는 관리가 정말 중요한데요, 특히 첫 일주일 동안은 잇몸이 아물어가는
시기이기 때문에 자극적인 음식이나 딱딱한 음식은 피하시는 것이 좋고 흡연은 절대 금물이며
음주도 최소 2주는 참으셔야 합니다. 또한 처방받은 약은 반드시 시간에 맞춰 복용하시고
칫솔질도 수술 부위를 피해서 부드럽게 해주셔야 합니다.

✅ 목표 형태
임플란트 수술 후에는 관리가 중요합니다.

특히 첫 일주일이 고비인데요.
잇몸이 아물어가는 시기이기 때문입니다.

이때는 딱딱한 음식을 피해주세요.
흡연은 절대 금물입니다.
음주도 최소 2주는 참으셔야 합니다.

처방받은 약은 시간에 맞춰 드세요.
칫솔질은 수술 부위를 피해서 부드럽게 해주시고요.
```

#### 2단 적용

1. **생성 단계** — 프롬프트에 R1~R9를 명시한다(§7-1).
   후처리로만 고치려 하면 접속사로 길게 이어붙인 문장이 들어와 기계적으로 자를 곳이 없다.
2. **후처리 단계** — `reflow_for_mobile(body)`가 R1~R9를 강제한다.
   생성이 잘 나와도 반드시 통과시킨다(멱등이라 손해 없음).

#### ★ 발행 단계에서 빈 줄이 사라지는 함정

닥터보이스 스펙 8-4장이 실제로 겪은 사고다. 본문을 문단 단위로 나눠 입력할 때
**문단 경계에서 Enter를 한 번만 치면 빈 줄이 사라져 모바일 가독성이 통째로 무너진다.**

```
텍스트 블록 다음에 또 텍스트 블록이면 → Enter 두 번 (빈 줄 유지)
텍스트 블록 다음에 이미지면        → Enter 한 번
```

즉 **§7-4에서 만든 서식을 §8 발행 단계가 도로 뭉갤 수 있다.**
P1 스모크에서 "발행된 글을 모바일로 열어 빈 줄이 살아있는지" 눈으로 확인한다.

---

## 8. 발행 파이프라인 — 스펙 8·9장 이식

### 8-1. 실행 순서

```
1. 프로필 브라우저 기동 (channel="chrome", 전용 user-data-dir)
2. GoBlogWrite.naver 이동
3. 로그인 화면이면 → 잡 실패 {needLogin:true} → 사용자 알림  ★60초 감시(스펙 7-1)
4. assertBlog()          blogId ≠ expected_blog_id → 즉시 중단
5. dismissDraftPopup()   "작성 중이던 글" 취소 (텍스트 매칭)
6. 제목  클릭 → Ctrl+A → insert_text(title)
7. 본문  클릭 → Ctrl+A → 블록 인터리브 입력
      · 텍스트: insert_text, 줄바꿈=Enter, emphasize 단어는 Ctrl+B로 감쌈
      · ★텍스트 다음에 또 텍스트면 Enter 두 번 — 빈 줄이 사라지면 §7-4가 무너진다
      · 이미지: 툴바 사진 버튼 → file input → set_input_files() → 증가 검증
8. finalize()            공개설정 → 검색허용 → 카테고리 → 예약 → 최종 발행 → 캡차 대기
9. 결과 보고 → rank_tracker 자동 등록
```

### 8-2. Playwright 치환표

| 스펙 (CDP) | Playwright |
|---|---|
| `Input.dispatchMouseEvent` + 절대좌표 + iframe 오프셋 계산 | `frame.click(selector)` — **오프셋 계산 자체가 불필요** |
| `Input.insertText` | `page.keyboard.insert_text()` |
| `Input.dispatchKeyEvent` Enter/Ctrl+A/Ctrl+B | `keyboard.press('Enter' / 'Control+a' / 'Control+b')` |
| `all_frames:true` + editorOnly 프레임 판정 | `page.frame_locator('#mainFrame')` — **프레임 중복 응답 문제 소멸** |
| base64 → File → DataTransfer → 합성 DragEvent | `file_input.set_input_files(path)` |
| `attachDebugger` / `detachDebugger` 곡예 | 없음 |

> **iframe 처리가 크게 단순해진다.** 스펙은 `all_frames:true`로 모든 프레임에 주입한 뒤
> "에디터 프레임만 응답"(editorOnly), "blogId 찾은 프레임만 응답" 같은 선점 방지 장치가
> 필요했다. Playwright는 프레임을 직접 지목하므로 이 장치들이 통째로 필요 없다.

### 8-3. 이미지 삽입 — 스펙 대비 개선

스펙은 합성 DragEvent를 쓰고 "실제로 이미지가 늘었는지"를 3신호 최댓값으로 검증했다(16장에서
스스로 미실측이라 인정). 우리는 진짜 파일 업로드를 쓴다.

```python
# 툴바 사진 버튼: button[data-name="image"][data-group="documentToolbar"]
before = image_component_count(frame)
async with page.expect_file_chooser() as fc:
    await frame.click('button[data-name="image"]')
fc.value.set_files(local_path)
await wait_until(lambda: image_component_count(frame) > before, timeout=25_000)
```
검증 함수는 스펙의 3신호 최댓값을 그대로 승계한다(이미지 컴포넌트 클래스가 미실측이므로).
```python
max(count('.se-component.se-image'),
    count('.se-component[class*="image" i]'),
    count('.se-content img, .se-components-wrap img'))
```
**N장 중 M장(M<N)만 들어가면 발행하지 않고 중단한다.**

### 8-4. 셀렉터 — 스펙 12장 전량 승계

핵심만 재기록 (전체는 스펙 12장 참조, 2026-07 실측):

| 대상 | 셀렉터 |
|---|---|
| 에디터 프레임 판정 | `.se-component.se-documentTitle` |
| 제목 클릭 대상 | `.se-documentTitle .se-title-text .se-text-paragraph` |
| 본문 클릭 대상 | `.se-component.se-text .se-text-paragraph` |
| 임시저장 | `[data-click-area="tpb.save"]` |
| 발행 레이어 열기 | `[data-click-area="tpb.publish"]` |
| 최종 발행 | `[data-testid="seOnePublishBtn"]` |
| 카테고리 버튼 | `[data-click-area="tpb*i.category"]` |
| 카테고리 항목 | `[role="menu"] input[data-testid^="categoryBtn_"]` |
| 공개 설정 | `#open_public` / `#open_neighbor` / `#open_both_neighbor` / `#open_private` |
| 예약 라디오 | `#radio_time2` |
| 예약 날짜 | `input.input_date__QmA0s` → jQuery UI datepicker |
| 예약 시/분 | `select.hour_option__J_heO` / `select.minute_option__Vb3xB` (**10분 단위만**) |
| 캡차 | `iframe[id^="ncaptcha-iframe"]` 외 (cross-origin, 존재만 확인) |

**함정 (스펙에서 그대로 물려받을 것)**
- 카테고리는 **번호 우선 매칭**. 이름은 사용자가 언제든 바꾼다
- 카테고리 `input`은 `tabindex="-1"`이라 클릭 핸들러가 없다 → **`label`을 클릭**해야 반영
- 카테고리명 NBSP(U+00A0) 정규화 필요
- 선택 후 **버튼 텍스트가 실제로 바뀌었는지 재확인**
- 예약 분은 **10분 단위 내림** 필수
- 시/분 select는 React 제어 → 네이티브 setter + `input`/`change` dispatch
  (Playwright `select_option()`이 이걸 처리하지만 **실측 확인 필요**, §15-3)
- `emphasize` 단어는 **긴 단어부터 정렬**. "치과"와 "치과교정"이 둘 다 있으면 쪼개진다

---

## 9. 실패 시 중단 원칙 (스펙 13-3 승계 + 확장)

| 중단해야 하는 경우 | 안 하면 생기는 일 |
|---|---|
| 예약 날짜 지정 실패 | 네이버 기본값(오늘/지금) → **예약해둔 글이 전부 즉시 발행** |
| 예약 시/분 입력란 못 찾음 | 같음 |
| 카테고리 못 찾음 / 반영 안 됨 | 엉뚱한 카테고리로 공개 발행 |
| 이미지 N장 중 M장만 삽입 | 사진 빠진 글이 발행됨 |
| blogId ≠ expected_blog_id | **남의 블로그에 글이 올라감** |
| 배치 시작 전 계정 확인 실패 | 로그인 화면에서 헛돌기 (성공 조건으로만 판단하지 말 것) |
| 캡차 시간 초과 | 실패가 성공으로 보고됨 |
| **(신규) 일일 상한 초과** | 저품질 판정 위험 |
| **(신규) 중복 주제** | 자기 글끼리 카니발 |
| **(신규) 플랜 쿼터 초과** | 원가 통제 실패 |

**결과 조립 순서 함정도 그대로 승계:** `{**res, "ok": res.done is not False}` — `ok`를 뒤에 둔다.
앞에 두면 캡차 시간초과 같은 실패가 성공으로 보고된다.

---

## 10. 지수 보호 가드 (우리 고유)

우리는 사용자 블로그의 지수·레벨을 안다. 타 툴이 못 하는 안전장치이자 판매 포인트.

| 가드 | 규칙 | 근거 |
|---|---|---|
| 일일 발행 상한 | 레벨별 초기값: 준최1~3 → 1건, 준최4~7 → 2건, 최적 → 3건 | **실측 근거 없음. 보수적 휴리스틱.** `rank_history`가 쌓이면 재보정 (§15-6) |
| 최소 간격 | 3시간 (`min_gap_minutes`) | 동일 |
| 시각 지터 | 10분 내림 후 슬롯 내 랜덤 배치 | 동일 시각 반복 발행 패턴 회피 |
| 중복 주제 | 최근 90일 `autopost_history` 제목·키워드와 토큰 자카드 ≥ 0.6 → 차단 | 자기 카니발 방지 |
| 동일 키워드 재발행 | `post_keywords`에 이미 있으면 차단(사용자 강제 해제 가능) | 순위추적 오염 방지 |
| 이미지 0장 | 차단이 아니라 **경고**. writing-guide `media.images.min` 미달 표시 | 하드 블록은 과함 |

---

## 11. 골든타임 자동 배치

`POST /api/autopost/schedule/auto`

```
승인된 draft 목록
  → 각 키워드의 golden_time 조회 (winner_keyword_service._get_golden_time)
  → 후보 슬롯 생성 (오늘+1 ~ 오늘+N일)
  → 가드 적용: 일일 상한 · 최소 간격 · 기존 예약과 충돌
  → 10분 단위 내림 + 지터
  → 각 job.scheduled_at 확정
```

> ⚠️ `winner_keyword_service`의 `golden_time_patterns`는 **카테고리별 하드코딩 휴리스틱**이다
> (맛집→토요일 18~21시 등, `services/winner_keyword_service.py:118`). 실측이 아니다.
> UI에 "추정"으로 표기하고, `rank_history`가 쌓이면 발행 시각 대비 순위 상관으로 교체한다.

---

## 12. 순위추적 되먹임 (루프 닫기)

발행 성공 시 백엔드가 자동으로:

```
1. tracked_blogs   없으면 생성 (user_id, blog_id)
2. tracked_posts   post_id/title/url/published_date 등록
3. post_keywords   주력 키워드 priority=1, 서브 키워드 priority=2
4. autopost_history.tracked_post_id 연결
```

이후 기존 `rank_tracker` 크론이 순위를 측정한다 → `rank_history` 축적.

**이 데이터가 되먹이는 곳**
- `spec_score` ↔ 실제 순위 상관 → 채점 가중치 재보정
- 골든타임 하드코딩 → 실측 교체
- 일일 상한 휴리스틱 → 실측 교체
- winner-keywords 예측 정확도 검증 (정답지 루프)

**발행 자동화가 곧 우리 학습 데이터 수집기가 된다.** 이게 이 기능의 장기 가치다.

---

## 13. 에이전트 — 설치 / 인증 / 진단 / 업데이트

### 13-1. 브라우저 기동

```python
browser = pw.chromium.launch(
    channel="chrome",                     # ★순정 Chromium 아님. 사용자 설치 크롬
    headless=False,
    args=[f"--user-data-dir={PROFILE_DIR}"],
)
```
- **전용 프로필 디렉터리**를 쓴다 (사용자 평소 프로필은 쓰지 않는다 — §15-1)
- 최초 1회 사용자가 그 창에서 **네이버·구글에 직접 로그인** → 이후 세션 유지
- ⚠️ `_pw_naver_login.py:5` 실측 주석: **`persistent_context` + headed 조합은 드라이버가 죽는다.**
  `launch` + 프로필 인자를 쓴다
- 세션 만료 감지 → 트레이 알림 → 사용자가 "로그인 창 열기" 클릭

### 13-2. 인증

```
웹앱에서 "에이전트 연결" → 6자리 코드(10분 유효)
  → 에이전트에 입력 → POST /agent/pair
  → access_token(1h) + refresh_token(장기) 발급
  → Windows DPAPI로 로컬 암호화 저장
```
**네이버·구글 비밀번호는 어디에도 저장하지 않는다.**

### 13-3. 진단 (스펙 13-2 승계)

- 로컬 링버퍼 500줄, 줄당 300자 상한
- **base64/장문은 잘라 넣는다** (`data:[^"]{40,}` → 앞 30자 + "…생략")
- 트레이 메뉴 "진단 로그 업로드" → `POST /agent/diag`
- **프로세스 기동 줄은 즉시 기록.** 로그 한가운데 이 줄이 있으면 = 도중에 죽었다는 뜻

### 13-4. 업데이트

- `GET /api/autopost/agent/version` → `{version, download_url, notes, min_version}`
- 기동 시 + 3시간마다 확인, 트레이에 배지
- `min_version` 미만이면 **잡 수령 거부** (프로토콜 불일치로 인한 사고 방지)
- ⚠️ 버전은 **단일 진실 원천 한 곳에서만** 읽는다 (스펙 13-4: 상수로 박아 v16.0.5 사고 발생)

---

## 14. 단계별 산출물

| 단계 | 산출물 | 완료 판정 |
|---|---|---|
| **P0** 실현성 검증 | 스모크 스크립트 1개 (§15-1 전량) | Gemini 로그인 유지 ✅ / 네이버 제목 입력 ✅ |
| **P1** 발행기 | `agent/naver_poster.py` + 백엔드 잡 큐 + `/agent/*` API | 임시저장 1건 → 사진 1장 → **내일 날짜 예약발행** 성공 |
| **P2** 생성기 | `agent/gemini_writer.py` + `autopost_scorer.py` + `autopost_reflow.py` + 프롬프트 조립 | 재생성 루프가 실제로 규격을 끌어올리는지(점수 before/after) + **§7-4 서식이 휴대폰에서 읽히는지** |
| **P3** 웹앱 | `/autopost` 편성·초안편집·승인·예약 UI | 사용자가 웹에서만 조작해 5건 예약 완료 |
| **P4** 루프 + 상품화 | rank_tracker 자동 등록 · 지수 가드 · 플랜 쿼터 · 인스톨러 · ToS 고지 | 발행 글의 실제 순위가 대시보드에 뜸 |

### P1 스모크 (스펙 15-5 승계)

1. 에이전트 기동 → 페어링 → `/next` 폴링 확인
2. blogId 동기화 → 정상 반환?
3. 카테고리 목록 읽기 → 반환?
4. `final_action:'draft'` 1건 → 네이버 임시저장함에서 확인
5. 사진 1장 + draft → **실제로 삽입됐는지 확인**
6. `final_action:'schedule'`, **반드시 내일 이후 날짜** → 예약발행 목록에서 날짜/시각 확인
   (오늘로 테스트하면 datepicker 월 이동 로직이 검증되지 않는다)
7. **★발행된 글을 실제 휴대폰으로 열어 §7-4 서식이 살아있는지 확인**
   (빈 줄 소실 · 줄 길이 · 3줄 초과 문단). PC 미리보기로는 판별되지 않는다
8. 2건 연속 → 리스/중복실행 방지 확인
9. 진단 로그 업로드 확인

---

## 15. 미검증 가정 / 리스크

### 15-1. ★ 최대 리스크 — 자동화 브라우저에서 구글 로그인

확장은 사용자의 진짜 크롬에서 돌아 Gemini 로그인이 공짜였다. 로컬 에이전트는 전용 프로필을
쓰므로 **최초 1회 구글 로그인이 필요한데, 구글은 자동화 제어된 브라우저의 계정 로그인을
자주 차단한다**("이 브라우저 또는 앱은 안전하지 않을 수 있습니다").

또한 최근 크롬은 보안 패치로 **기본 프로필에 대한 원격 디버깅 접근을 차단**했다.
"사용자의 평소 프로필을 그대로 붙여쓰기"는 기대하면 안 된다.

**→ P0에서 가장 먼저 잰다. 여기서 막히면 설계가 바뀐다:**
- 통과 → 이 설계 그대로
- 실패 → ① 생성엔진을 서버 LLM(OpenAI)으로 되돌리거나 ② 생성만 크롬 확장에 맡기는 하이브리드

**P0 스모크 항목**
1. `channel="chrome"` + 전용 프로필로 창 기동
2. 그 창에서 구글 로그인 → gemini.google.com 진입
3. 창 닫고 재실행 → **로그인 유지되는가**
4. 같은 프로필로 네이버 로그인 → `GoBlogWrite.naver` → `.se-documentTitle` 잡히는가
5. `keyboard.insert_text()`로 제목 한 줄 실제 입력
6. Gemini 입력창에 `insert_text` + Enter → 응답 시작되는가

### 15-2. 네이버 ToS / 계정 제재

자동 포스팅은 계정 제재 가능성이 있다. 완화책은 사람같은 페이싱(건 사이 1.5초+, 일일 상한,
시각 지터)과 캡차 사용자 핸드오프뿐이고, **"안전하다"고 말할 수 없다.**
유료 상품이므로 **가입 시 명시적 고지와 동의가 필요하다.** 법무 검토 대상.

### 15-3. 셀렉터 유효기간

스펙 12장은 **2026-07 실측**이다. 우리가 구현할 시점에 네이버가 개편했을 수 있다.
P1 착수 시 전량 재확인이 필요하다. 특히 미확보 항목:
- 이미지 컴포넌트 클래스 (3신호 최댓값으로 방어 중)
- 드래프트 복원 팝업 확인 버튼 (텍스트 매칭 best-effort)
- 예약 시/분 select에 Playwright `select_option()`이 React 제어를 뚫는지

### 15-4. Gemini 무료 한도

유료 상품인데 생성 능력이 **사용자 개인 구글 계정 한도**에 묶인다.
- 한도 초과 시 응답이 안 나오고 `complete`도 안 붙어 **가드 타임아웃으로만 걸린다**
- 배치 중 연속 실패하면 이걸 의심해야 하고, 에러 메시지에 그렇게 안내해야 한다
- **플랜별 "월 N건" 약속과 실제 생성 가능량이 어긋날 수 있다** → 상품 문구 신중히

### 15-5. 이미지 조달 공백

닥터보이스는 병원이 사진을 올린다. 우리 사용자는 사진 소스가 없을 수 있는데,
writing-guide의 `media.images` 패턴상 이미지 수는 상위노출에 영향이 있다.
v1은 **사용자 업로드 라이브러리만** 제공하고, AI 이미지 생성/스톡 연동은 범위 밖.
이 공백은 상품 설명에 정직하게 반영해야 한다.

### 15-6. 근거 없는 상수들

- 일일 발행 상한 (레벨별 1~3건) — **실측 아님**
- 골든타임 카테고리 테이블 — **하드코딩 휴리스틱**
- `spec_score` 게이트 70점 — **임의값**
- 중복 주제 자카드 0.6 — **임의값**
- **§7-4 모바일 서식 수치** (줄 25자/최대 35자, 문단 3줄, `long_line_ratio` 0.15) —
  상위글 통계에서 나온 값이 아니라 **편집 원칙으로 정한 값**이다.
  `top_posts`는 줄바꿈·문단 구조를 측정하지 않으므로 데이터로 검증할 수단이 현재 없다.
  → 발행 글의 체류시간·순위와 서식 지표의 상관이 쌓이면 재보정.
  단 **가독성 게이트 자체는 데이터가 없어도 유지한다**(§7-3).

나머지는 `rank_history` 축적 후 재보정 대상. UI에서 "추정"으로 표기한다.

### 15-7. 배포

- PyInstaller exe는 **코드서명 없으면 SmartScreen 경고 + 백신 오탐**이 실재한다
- 코드서명 인증서 확보 여부가 P4 일정에 영향
- 웹앱 배포는 **main push에만** Vercel Deploy Hook (백엔드는 `flyctl deploy` 별도)

---

## 16. 스펙 대응표 (이식 체크리스트)

| 닥터보이스 스펙 | 우리 | 위치 |
|---|---|---|
| 2장 manifest 권한 | ❌ 불필요 | — |
| 3장 3계층 아키텍처 | ✅ 변형 (§2) | — |
| 4장 CDP 헬퍼 | 🔄 Playwright 치환 (§8-2) | `agent/browser.py` |
| 5장 웹앱↔확장 프로토콜 | ❌ REST로 대체 (§6) | — |
| 6장 Job 스키마 | ✅ 승계 (§6-2 payload) | `autopost_jobs` |
| 7장 로그인 흐름 | 🔄 세션만, 자동로그인 제거 (§13-1) | `agent/session.py` |
| 8장 글쓰기 | ✅ 승계, 이미지만 개선 (§8) | `agent/naver_poster.py` |
| 9장 발행/예약/카테고리 | ✅ **전량 승계** | `agent/naver_poster.py` |
| 10장 배치 | 🔄 큐+리스로 대체 (§5) | 백엔드 |
| 11장 Gemini | ✅ 승계 (§7-2) | `agent/gemini_writer.py` |
| 12장 셀렉터 맵 | ✅ **전량 승계** | `agent/selectors.py` |
| 13-1 keepalive | ❌ 불필요 | — |
| 13-2 진단 로그 | ✅ 승계 (§13-3) | `agent/diag.py` |
| 13-3 실패 시 중단 | ✅ **전량 승계 + 확장** (§9) | 전역 |
| 14장 crx 배포 | 🔄 인스톨러+자체 업데이터 (§13-4) | — |
| 11-6 모바일 리플로우 | ✅ **승계 + 강화 → 필수 게이트** (§7-4) | `services/autopost_reflow.py` |
| — | 🆕 규격 채점기 + 가독성 채점 (§7-3) | `services/autopost_scorer.py` |
| — | 🆕 지수 보호 가드 (§10) | `services/autopost_guard.py` |
| — | 🆕 골든타임 배치 (§11) | `services/autopost_scheduler.py` |
| — | 🆕 순위추적 되먹임 (§12) | `routers/autopost.py` |

---

## 17. 신규 파일 목록

```
flyio-backend/
├── routers/autopost.py                  웹앱용 + 에이전트용 API
├── services/autopost_planner.py         주제 편성 (winner-keywords + 가드)
├── services/autopost_prompt.py          writing-guide → 프롬프트 조립
├── services/autopost_scorer.py          규격 채점 + 가독성 채점 + 재프롬프트 생성
├── services/autopost_reflow.py          모바일 서식 강제 (§7-4, 멱등)
├── services/autopost_guard.py           지수 보호 · 중복 주제 · 쿼터
├── services/autopost_scheduler.py       골든타임 자동 배치
└── database/autopost_db.py              테이블 6개 (§4-1)

frontend/app/autopost/
├── page.tsx                             편성 · 초안 목록 · 승인
├── [id]/page.tsx                        초안 편집 + spec_report
└── results/page.tsx                     발행 결과 + 순위 추이

agent/                                   ★신규 저장소 또는 서브디렉터리
├── main.py                              트레이 + 폴링 루프
├── browser.py                           Playwright 기동 · 프로필 · 세션
├── naver_poster.py                      스펙 8·9장 이식
├── gemini_writer.py                     스펙 11장 이식
├── selectors.py                         스펙 12장 이식
├── diag.py                              스펙 13-2 이식
└── auth.py                              페어링 · 토큰 · DPAPI
```

---

## 18. 열린 결정

1. **에이전트를 같은 저장소에 둘 것인가, 분리할 것인가**
   같은 저장소면 배포 파이프라인(Vercel=프론트, Fly=백엔드)에 세 번째 산출물이 끼어든다.
2. **P0 실패 시 대안** — 서버 LLM 회귀 / 크롬 확장 하이브리드 중 어느 쪽을 기본 대안으로 둘지.
3. **이미지 v1 범위** — 사용자 업로드만으로 상품이 성립하는지.
4. **ToS 고지 문구와 책임 범위** — 유료 상품이라 법무 확인이 필요한 지점.

---

> 이 문서와 코드가 어긋나면 **코드가 정답이다.** 코드를 고치면 해당 절과 §8-4 셀렉터를 함께 갱신할 것.
