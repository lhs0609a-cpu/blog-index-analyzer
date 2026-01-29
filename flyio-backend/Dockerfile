# Build timestamp: 2026-01-29T09:00
FROM python:3.11-slim

# 작업 디렉토리 설정
WORKDIR /app

# 시스템 의존성 설치 (Playwright/Selenium을 위한 브라우저 포함)
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libwayland-client0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Copy entrypoint script first
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Python 의존성 파일 복사
COPY requirements.txt .

# Python 의존성 설치
RUN pip install --no-cache-dir -r requirements.txt

# Playwright 브라우저 설치
RUN playwright install chromium
RUN playwright install-deps chromium

# 애플리케이션 코드 복사
COPY . .

# entrypoint.sh 실행 권한 재설정 (COPY로 덮어씌워졌을 수 있음)
RUN chmod +x /app/entrypoint.sh

# SQLite 데이터베이스 디렉토리 생성
RUN mkdir -p /app/data

# 포트 노출
EXPOSE 8001

# 환경변수 설정
ENV PYTHONUNBUFFERED=1
ENV PORT=8001

# 애플리케이션 실행 with entrypoint
CMD ["/app/entrypoint.sh"]
