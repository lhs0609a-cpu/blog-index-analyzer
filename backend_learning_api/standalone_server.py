"""
Standalone server for testing learning API
Run: uvicorn standalone_server:app --reload --port 8001
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import router

app = FastAPI(
    title="Learning Engine API",
    description="순위 예측 학습 엔진 API",
    version="1.0.0"
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Learning router 추가
app.include_router(router)


@app.get("/")
async def root():
    return {
        "message": "Learning Engine API",
        "status": "running",
        "endpoints": {
            "collect": "POST /api/learning/collect",
            "train": "POST /api/learning/train",
            "status": "GET /api/learning/status",
            "history": "GET /api/learning/history"
        }
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
