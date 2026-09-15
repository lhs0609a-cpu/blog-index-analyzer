# 새 글 누락 감시 (1단계) 설계

작성 2026-09-11. 갱신 2026-09-14. 상태: 관리자 검증 단계, 알림 비활성.

## 2026-09-14 판정 수정 (아래 초기 설계보다 우선)

- 실제 블로그탭 검색의 결과 영역(`#main_pack`) 안에 있는 게시글 링크의 블로그 ID와 logNo를 확인한다. HTML 전체 문자열이나 스크립트 안의 글 번호는 증거로 쓰지 않는다.
- 검색어는 HTML 엔티티와 공백을 정리한 전체 제목이다. 40자 절단을 제거했고 일반 검색과 따옴표 검색을 순서대로 시도한다. 따옴표를 정확매칭 보장으로 취급하지 않는다.
- 검색 API는 비교 진단 전용이다. API 상위 결과 미발견은 실제 검색 누락을 뜻하지 않는다. 공식 API 설명: https://developers.naver.com/docs/serviceapi/search/blog/blog.md
- 실제 검색에서 링크를 확인한 경우만 `indexed`. 차단·오류·파싱 불가·미발견은 재시도하고 3회 후 `unmeasurable`. 현재 버전은 `missing`을 확정하지 않는다. HTML 링크 순서를 실제 시각적 순위로 표시하지 않는다.
- RSS에서 빠진 것만으로 삭제·비공개를 확정하지 않는다. 기존 `missing/delayed/removed/unmeasurable`은 한 번만 재확인 큐로 복구하며 과거 확인 이력은 보존한다.
- 워커는 `watch_runtime`에 시작·실행·완료·실패 및 PID를 기록한다. 관리자 보고서에서 API 프로세스와 별개로 워커의 최근 실행을 확인한다. 경고 레벨 로그로 운영 로그 필터에서도 보이게 한다.
- 운영에서 공유 cron 프로세스의 확인 지연이 관찰되어 `post_watch_worker.py`로 분리했다. `entrypoint.sh`의 `POST_WATCH_DEDICATED=1`로 중복 기동을 막고 별도 nice 5 프로세스에서 RSS/검색을 실행한다.
- 수동 확인과 자동 워커는 SQLite 임대 잠금을 공유한다. 확인 주기는 최대 10분, 잠금은 장애 복구를 위해 15분 후 만료한다. 감시 해제된 블로그는 확인 큐에서 제외한다.
- `api_budget`은 현재 검색 요청 예산이며 실제 검색 페이지 요청도 포함한다. 글당 최대 2회를 예약하고 오류 요청도 차감한다.

운영 점검: `python scripts/post_watch_diagnostics.py` (UTC/KST·대기 시각·실행 기록), `--run` (기존 오판정 복구와 확인 한 주기), `--sample 24` (등록 블로그별 최근 글을 번갈아 API/실제 검색 비교). 표본 비교 호출도 예산에 기록된다.

파일 제외 점검: `.dockerignore`의 `*.jsonl`/`*.xlsx`는 빌드 컨텍스트에만 적용된다. 런타임 소스(main/services/database/routers)에서 JSONL 파일 의존은 없었으며, XLSX는 업로드 바이트를 `BytesIO`로 읽거나 다운로드 응답을 메모리에서 생성한다. `/data` 볼륨의 기존 파일이나 새 업로드를 차단하는 접근 규칙이 아니다. 향후 정적 XLSX 템플릿을 추가하면 해당 경로의 예외 규칙이 필요하다.

운영 비교(2026-09-14): 등록 11개 블로그에서 24개 글을 비교했다. 실제 검색 링크 확인 16건, 미발견·확인 불가 8건. API 미발견인데 실제 검색에서는 확인된 글은 3건(표본의 12.5%). 실제 검색의 미발견은 누락으로 해석하지 않았으며, 이 표본으로 전체 정확도를 추정하지 않는다. 기존 부정 판정 24건을 재확인 큐로 복구했다.

최종 배포: `deployment-01M2EZF6XG9SP3DRAAT68R770E`. 분리 워커 PID 663의 자동 확인이 2026-09-14 03:34:41 UTC(12:34:41 KST)에 완료됐다. 10건 처리, 검색 노출 2건 확인, 확인 불가 8건 재시도, 누락 확정 0건. 03:40:23 UTC 점검 시 due 0건, 다음 확인 예정 03:41:24 UTC. RSS 11개 블로그 순회도 완료. 공개 `/health`는 healthy 응답. Fly SSH의 Windows 종료 시 `The handle is invalid` 메시지가 붙었지만 원격 JSON 결과는 수신되었으며, 로그 필터 출력 대신 영속 실행 기록으로 확인했다. 10분 간격 설정과 첫 자동 완료는 확인했고 장기 연속 실행 관찰은 별도다.

## 왜 만드는가

블랭크의 핵심 기능은 전부 한 번 진단하면 끝나는 구조다(블로그 분석, 저품질 확인, 원고 진단, 키워드 판정). 다시 올 이유가 약하다.
블로거가 반복해서 손으로 하는 일은 "새 글 제목을 검색해 보고 나오는지 확인하기"다. 이걸 대신해 주면 매일 돌아올 이유가 생기고, 구독료를 낼 이유가 된다.

운영 DB 실측(9/4~9/10, 7일):

| 항목 | 값 |
|---|---|
| 사용자가 분석한 블로그 | 하루 13~189개, 평균 약 58개 |
| 페이지 조회 | 하루 약 200회 |
| 가입자 | 누적 72명 |
| 순위 추적 등록 블로그 | 0개 |
| 알림 발송 이력 | 0건 |

순위 추적은 요금제가 파는 기능인데 쓰는 사람이 없다. 키워드를 직접 등록해야 하는 구조가 원인으로 보인다. 그래서 이 기능은 **블로그 ID 하나로 설정이 끝나야 한다**.

## 범위

**1단계에 넣는 것**
- 블로그 등록 → RSS로 새 글 감지 → 정해진 시점에 색인 확인 → 누락이면 알림
- 대시보드의 감시 현황 카드, 분석 결과 화면의 "감시 켜기" 버튼
- 인앱 알림과 이메일 알림

**1단계에 넣지 않는 것 (2단계 이후)**
- 블로그 단위 저품질 경고 (연속 누락 패턴)
- 누락된 글의 원인 진단과 재발행 가이드
- 통합검색(VIEW) 노출 추적, 키워드 순위
- 카카오 알림톡, 웹 푸시

## 판정 정의

**색인됨.** 글 제목을 쌍따옴표로 감싸 정확 매칭으로 검색한다. 네이버 블로그 검색 API 상위 30개 결과 중에 **그 글의 logNo**가 있으면 색인된 것으로 본다.
- 기존 `RankChecker.check_blog_tab_rank`는 블로그 ID만 맞으면 찾은 것으로 친다. 제목이 비슷한 옛 글이 있으면 오탐이 난다.
- 그래서 글 단위로 맞추는 `check_post_indexed(title, blog_id, log_no)`를 새로 만든다. 제목 정제는 `blog_index_verifier._clean_title`을 그대로 쓴다.

**확인 시점.** 게시 시각(RSS의 `pubDate`)을 기준으로 잰다.

| 시점 | 무료 | 유료 | 이 시점에 못 찾으면 |
|---|---|---|---|
| +1시간 | | ✓ | 상태만 기록 |
| +6시간 | | ✓ | 상태만 기록 |
| +24시간 | ✓ | ✓ | **지연** — 인앱 알림 |
| +72시간 | ✓ | ✓ | **누락** — 인앱과 이메일 알림, 확인 종료 |

색인이 확인되면 그 글은 더 확인하지 않는다. 72시간 기준은 업계 통용 누락 기준(NSIDE "72시간 누락")과 같다.

**판정 불가.** 아래 경우는 누락으로 치지 않는다. 오탐 알림이 제일 큰 신뢰 손실이기 때문이다.
- 정제한 제목이 6자 미만이면 정확 매칭의 변별력이 없다. `unmeasurable`로 둔다.
- API가 오류를 내거나 시간 초과가 나면 다음 주기로 미룬다. 3회 연속 실패하면 `unmeasurable`로 둔다.
- 글이 RSS에서 사라지면 삭제나 비공개로 본다. `removed`로 두고 확인을 종료한다.

## 데이터 모델

새 파일 `/data/post_watch.db`를 만든다. 기존 `tracked_blogs`와 `tracked_posts`(순위 추적, 0건)는 키워드 순위 전제라 쓰지 않는다.

```sql
CREATE TABLE watched_blogs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  blog_id TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  rss_state TEXT DEFAULT 'ok',        -- ok | failing | disabled(RSS 꺼짐)
  rss_fail_count INTEGER DEFAULT 0,
  last_rss_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, blog_id)
);

CREATE TABLE watched_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  blog_id TEXT NOT NULL,
  log_no TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  published_at TIMESTAMP NOT NULL,
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'pending',      -- pending | indexed | delayed | missing | unmeasurable | removed | baseline
  checks_done INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  next_check_at TIMESTAMP,
  indexed_at TIMESTAMP,
  first_rank INTEGER,
  last_checked_at TIMESTAMP,
  UNIQUE(blog_id, log_no)
);
CREATE INDEX idx_wp_due ON watched_posts(status, next_check_at);

CREATE TABLE post_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  found INTEGER,
  rank INTEGER,
  error TEXT
);

CREATE TABLE api_budget (
  day_kst TEXT PRIMARY KEY,
  calls INTEGER DEFAULT 0
);
```

설계 원칙:
- **글은 블로그 기준으로 한 번만 확인한다.** 여러 사용자가 같은 블로그를 감시해도 확인은 한 번이다. 알림만 사용자별로 보낸다.
- **체크포인트는 요금제 의존이다.** 같은 블로그를 무료와 유료 사용자가 함께 감시하면 가장 촘촘한 쪽을 따른다.
- **첫 등록 시 옛 글은 확인하지 않는다.** 그때 RSS에 있던 글 중 게시 72시간이 지난 글은 `baseline`으로 넣고 끝낸다. 72시간 안의 글은 바로 감시에 넣는다(등록 직후부터 쓸모가 보이도록). 옛 글의 현재 상태는 기존 색인 검증(`/api/blogs/verify-index`)이 이미 보여준다.

## 워커 작업

`services/post_watch_scheduler.py`를 만들어 `main.py`의 `RUN_SCHEDULERS` 블록에 등록한다. 패턴은 `index_snapshot_scheduler`를 따른다.

**RSS 순회 (60분마다)**
1. 활성 블로그마다 `fetch_blog_posts_via_rss(blog_id)`를 호출한다. 블로그 사이에 2초 간격을 둔다.
2. 링크에서 logNo를 뽑는다. 처음 보는 글이면 `pending`으로 넣고, `next_check_at`을 요금제별 첫 시점으로 잡는다.
3. 게시된 지 72시간 넘은 글이 새로 잡히면(RSS 지연 등) `baseline`으로 넣는다.
4. RSS가 연속 3회 실패하면 `failing`으로 바꾼다. 404가 나면 `disabled`로 바꾸고 사용자에게 "RSS 공개 설정" 안내를 띄운다.

**확인 (10분마다)**
1. `status IN ('pending','delayed') AND next_check_at <= now`인 글을 오래된 순으로 최대 50개 꺼낸다.
2. 오늘 `api_budget`이 상한(`POST_WATCH_DAILY_API_CAP`, 기본 3,000)에 닿았으면 멈춘다. 3,000은 무료 한도 25,000의 12%이고, 기존 사용량은 평균 약 500회, 최대 약 1,700회다.
3. 글마다 `check_post_indexed`를 호출하고 `post_checks`에 기록한 뒤 상태를 바꾼다. 호출 간격은 1초다.
4. 상태가 바뀌어 알림 대상이면 알림 큐에 넣는다.

**비용 추정.** 글 하나에 평균 1~2회 호출한다(대부분 24시간 안에 색인된다고 가정). 분석되는 블로그 58개를 전부 감시해도 하루 약 120회다. RSS 요청은 검색 API 한도와 상관없다.

## 알림

**인앱.** 기존 `notification_db.notifications`에 `category='post_watch'`로 적재한다. 테이블은 있지만 지금까지 쓰인 적이 없다.
- 헤더에 알림 표시가 있는지는 구현 전에 확인한다. 없으면 대시보드 카드 안에서 먼저 보여준다.

**이메일.** 발송 코드가 아직 없다. `config.py`에 SMTP 설정 항목만 있고, 운영 서버에는 SMTP 시크릿이 없다.
- `services/mailer.py`를 만든다. 표준 `smtplib`를 `asyncio.to_thread`로 감싼다.
- 시크릿 `SMTP_USER`와 `SMTP_PASSWORD`를 등록한다. Gmail 앱 비밀번호를 쓰면 하루 약 500통까지 무료다.
- 누락 메일 한 통에 담을 것: 글 제목, 게시 시각, 경과 시간, 확인 방법 링크(블랭크 감시 화면), 할 일 한 줄(예: "제목·첫 문단 수정 후 재발행 전 24시간 더 지켜보기").
- 같은 블로그의 누락은 하루 한 통으로 묶는다.
- `notification_settings.quiet_hours`를 지킨다. 조용한 시간에 생긴 알림은 끝나는 시각에 보낸다.

## API

모두 로그인이 필요하다(`routers/auth_deps.get_current_user`).

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/post-watch/blogs` | 내 감시 블로그 목록과 최근 글 상태 요약 |
| POST | `/api/post-watch/blogs` | `{blog_id}`로 등록한다. RSS를 즉시 한 번 읽어 baseline을 만들고, 요금제 한도를 넘으면 402 |
| DELETE | `/api/post-watch/blogs/{blog_id}` | 감시 해제 |
| GET | `/api/post-watch/blogs/{blog_id}/posts` | 글별 상태와 확인 이력 |
| POST | `/api/post-watch/posts/{id}/recheck` | 유료 전용. 하루 5회 제한, 예산 차감 |

## 요금제 (결정 필요)

사용자 요금제는 `get_user_subscription(user_id)`로 읽는다. 초안:

| | 무료(로그인) | 베이직 | 프로 | 비즈니스 |
|---|---|---|---|---|
| 감시 블로그 | 1 | 3 | 10 | 30 |
| 확인 시점 | 24h, 72h | 1h, 6h, 24h, 72h | 동일 | 동일 |
| 누락 이메일 | ✓ | ✓ | ✓ | ✓ |
| 지연(24h) 알림 | 인앱만 | ✓ | ✓ | ✓ |
| 수동 재확인 | | 하루 5회 | 하루 5회 | 하루 20회 |

누락 이메일을 무료에도 주는 게 핵심이다. 재방문을 만드는 게 1단계의 목적이기 때문이다. 유료 차별화는 "빨리 아는 것"(1시간·6시간)과 "여러 블로그"로 한다.

## 프론트엔드

- **`/analyze` 결과 화면.** 색인 검증 카드 아래에 "이 블로그 새 글 누락 감시 켜기" 버튼을 둔다. 비로그인이면 로그인 후 자동 등록한다. 하루 약 58개 블로그가 분석되므로 이곳이 주 유입구다.
- **`/dashboard` 첫 화면.** "새 글 감시" 카드를 둔다. 블로그별 최근 글 5개와 상태 배지(확인 중 / 노출됨 / 지연 / 누락)를 보여준다.
- **`/dashboard/post-watch`.** 글 목록, 확인 이력, 알림 설정 화면이다.
- 사용자의 `users.blog_id`가 있으면 첫 화면에서 원클릭 등록을 제안한다.

## 출시 전 검증

1. **판정 정확도.** 최근 글 100개를 두 방식으로 비교한다. 하나는 API 판정이고, 하나는 실제 검색 화면(블로그탭 정확 매칭)이다. 불일치가 5%를 넘으면 누락 알림을 끄고 원인부터 본다.
2. **판정 불가 비율.** 짧은 제목이나 오류로 `unmeasurable`이 되는 비율이 10%를 넘으면 규칙을 다시 본다.
3. **예산.** 1주일 동안 `api_budget`과 기존 사용량 합이 한도의 20%를 넘지 않는지 본다.

## 성공 지표

- 감시 등록률: 분석한 로그인 사용자 중 감시를 켠 비율
- 7일 재방문률: 감시 사용자와 비사용자 비교
- 누락 메일에서 클릭한 비율
- 오탐 신고 수 (알림 메일에 "잘못된 알림이에요" 링크를 둔다)

## 구현 순서

1. `post_watch_db.py`, `check_post_indexed`, 스케줄러 (백엔드, 알림 없이 기록만)
2. 운영에서 3일간 기록만 쌓아 판정 정확도를 검증한다 (위 1번)
3. API와 `/analyze`·`/dashboard` 화면
4. `mailer.py`와 SMTP 시크릿 등록, 알림 발송
5. 요금제 한도 적용

1~2번은 사용자 화면 없이 할 수 있다. 내부 테스트 블로그 몇 개로 먼저 돌려 판정이 맞는지부터 확인한다.

## 열린 결정

- 요금제별 한도 (위 초안)
- 이메일 발송 수단: Gmail SMTP로 시작할지, 발송 서비스를 쓸지
- 무료 사용자에게 24시간 지연 알림까지 줄지
