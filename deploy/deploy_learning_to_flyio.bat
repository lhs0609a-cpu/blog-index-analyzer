@echo off
echo ========================================
echo Deploying Learning API to Fly.io
echo ========================================

echo.
echo [Step 1/4] Downloading installer script to Fly.io...
C:\Users\u\.fly\bin\flyctl.exe ssh console -a naverpay-delivery-tracker -C "python3 -c \"import urllib.request; urllib.request.urlretrieve('https://raw.githubusercontent.com/lhs0609a-cpu/blog-index-analyzer/main/deploy/install_learning_api.py', '/app/install_learning_api.py')\""

echo.
echo [Step 2/4] Running installer...
C:\Users\u\.fly\bin\flyctl.exe ssh console -a naverpay-delivery-tracker -C "cd /app && python3 install_learning_api.py"

echo.
echo [Step 3/4] Updating main.py...
C:\Users\u\.fly\bin\flyctl.exe ssh console -a naverpay-delivery-tracker -C "cd /app && python3 -c \"import re; content = open('main.py').read(); if 'from routers import learning' not in content: content = re.sub(r'(from routers import.*system)', r'\1, learning', content); content = re.sub(r'(app\.include_router\(system\.router.*\))', r'\1\napp.include_router(learning.router, prefix=\\\"/api/learning\\\", tags=[\\\"학습엔진\\\"])', content); open('main.py', 'w').write(content); print('✓ main.py updated')\""

echo.
echo [Step 4/4] Restarting app...
C:\Users\u\.fly\bin\flyctl.exe ssh console -a naverpay-delivery-tracker -C "supervisorctl restart all"

echo.
echo ========================================
echo Deployment Complete!
echo ========================================
echo.
echo Testing API endpoint...
timeout /t 5 >nul
curl https://naverpay-delivery-tracker.fly.dev/api/learning/status

pause
