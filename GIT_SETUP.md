# Git + GitHub 자동 배포 설정

## ✅ Git 커밋 완료!

커밋이 완료되었습니다:
- 커밋 ID: 31b5660
- 파일 수: 80개
- 변경사항: 25,151 줄

---

## 🚀 GitHub에 푸시하기

### 1단계: GitHub에서 새 저장소 생성

1. https://github.com/new 접속
2. Repository name: `blog-index-analyzer`
3. Private/Public 선택
4. **"Initialize this repository with a README" 체크 해제**
5. "Create repository" 클릭

### 2단계: Git 리모트 추가 및 푸시

GitHub에서 생성 후 표시되는 URL을 사용:

```bash
cd "G:\내 드라이브\developer\blog-index-analyzer"

# 리모트 추가 (your-username을 실제 GitHub 사용자명으로 변경)
git remote add origin https://github.com/your-username/blog-index-analyzer.git

# 푸시
git branch -M main
git push -u origin main
```

### 3단계: Vercel 연결 (자동 배포 설정)

```bash
cd frontend
vercel login
vercel link
# GitHub 저장소 선택
vercel --prod
```

이후 GitHub에 푸시할 때마다 Vercel이 자동으로 배포합니다!

---

## 방법 2: GitHub CLI 사용 (더 빠름!)

```bash
# GitHub CLI 설치 (winget)
winget install GitHub.cli

# 로그인
gh auth login

# 저장소 생성 및 푸시
cd "G:\내 드라이브\developer\blog-index-analyzer"
gh repo create blog-index-analyzer --private --source=. --remote=origin --push
```

---

## ⚡ 빠른 배포 (Git 없이)

Git 설정하기 귀찮으면 바로 배포:

```bash
# Vercel 프론트엔드
cd frontend
vercel login
vercel --prod

# Fly.io 백엔드는 DEPLOY_TO_PRODUCTION.md 참고
```

---

## 🔍 현재 상태

- ✅ Git 초기화 완료
- ✅ 모든 파일 커밋 완료
- ⏳ 리모트 미설정 (위 단계 진행 필요)
- ⏳ GitHub 푸시 대기중
- ⏳ Vercel 자동 배포 대기중

---

**다음 명령어를 실행하세요:**

```bash
# 1. GitHub 저장소 생성 (웹에서)
# 2. 리모트 추가
git remote add origin https://github.com/YOUR-USERNAME/blog-index-analyzer.git

# 3. 푸시
git push -u origin main
```
