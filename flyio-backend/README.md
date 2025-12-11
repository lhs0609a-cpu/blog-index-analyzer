# Fly.io 백엔드 영구 배포 가이드

학습 API를 포함한 백엔드를 Fly.io에 영구적으로 배포하는 방법입니다.

## 문제

현재 Fly.io에 배포된 백엔드에는 학습 API(`/api/learning/*`)가 없어서, 프론트엔드에서 검색을 해도 학습 샘플이 저장되지 않습니다.

## 해결 방법

### 옵션 1: 기존 Fly.io 프로젝트에서 재배포 (권장)

기존 Fly.io 백엔드 프로젝트가 있는 경로로 이동한 후:

```bash
# 1. deploy 폴더의 파일들을 복사
cp -r G:\내\ 드라이브\developer\blog-index-analyzer\deploy\routers\learning.py <백엔드프로젝트>/routers/
cp -r G:\내\ 드라이브\developer\blog-index-analyzer\deploy\database\learning_db.py <백엔드프로젝트>/database/
cp -r G:\내\ 드라이브\developer\blog-index-analyzer\deploy\services\learning_engine.py <백엔드프로젝트>/services/

# 2. entrypoint.sh 복사
cp G:\내\ 드라이브\developer\blog-index-analyzer\deploy\entrypoint.sh <백엔드프로젝트>/

# 3. Dockerfile 수정
# Dockerfile의 CMD 줄을 다음으로 변경:
# CMD ["/app/entrypoint.sh"]

# 4. requirements.txt에 numpy와 scipy 추가
echo "numpy>=1.24.0" >> requirements.txt
echo "scipy>=1.11.0" >> requirements.txt

# 5. 재배포
fly deploy
```

### 옵션 2: GitHub에서 자동 배포 설정

현재 GitHub 저장소에 deploy 폴더에 모든 파일이 준비되어 있습니다.

1. Fly.io Dockerfile을 수정해서 entrypoint.sh를 사용하도록 설정
2. GitHub Actions를 설정해서 자동 배포

### 옵션 3: 로컬에서 백엔드 실행 (가장 빠름!)

**Fly.io 재배포 없이 즉시 테스트할 수 있는 방법:**

```bash
# 1. 백엔드 디렉토리로 이동
cd <기존백엔드프로젝트>

# 2. deploy 폴더의 파일 복사
cp ../blog-index-analyzer/deploy/routers/learning.py routers/
cp ../blog-index-analyzer/deploy/database/learning_db.py database/
cp ../blog-index-analyzer/deploy/services/learning_engine.py services/

# 3. main.py 수정
# 다음 두 줄을 추가:
# import routers.learning as learning
# app.include_router(learning.router, prefix="/api/learning", tags=["학습엔진"])

# 4. 의존성 설치
pip install numpy scipy

# 5. 백엔드 실행
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8001

# 6. 프론트엔드에서 API URL을 localhost:8001로 변경
```

## 배포 후 확인

```bash
# API 테스트
curl https://naverpay-delivery-tracker.fly.dev/api/learning/status

# 또는
curl http://localhost:8001/api/learning/status
```

정상 응답:
```json
{
  "current_weights": {...},
  "statistics": {
    "total_samples": 0,
    "current_accuracy": 0,
    ...
  }
}
```

## 트러블슈팅

### "Module not found: numpy" 오류
```bash
pip install numpy scipy
```

### "404 Not Found" 오류
- main.py에 learning router가 등록되었는지 확인
- 앱이 재시작되었는지 확인

### 파일이 재시작 후 사라짐
- Fly.io는 stateless이므로 SSH로 추가한 파일은 재시작 시 사라집니다
- 반드시 Dockerfile에 포함하거나 `fly deploy`로 재배포해야 합니다

## 완료!

이제 blog-index-analyzer.vercel.app에서 키워드 검색을 하면:
- 검색 결과가 자동으로 학습 샘플로 저장됩니다
- /dashboard/learning 페이지에서 "총 학습 샘플"이 증가하는 것을 확인할 수 있습니다
