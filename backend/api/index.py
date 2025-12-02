"""
Vercel Serverless Function entry point for FastAPI
"""
from main import app

# Vercel이 이 app을 사용합니다
handler = app
