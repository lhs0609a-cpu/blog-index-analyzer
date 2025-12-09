@echo off
echo ============================================
echo Deploying Learning API to Fly.io
echo ============================================

echo.
echo [1/5] Uploading routers/learning.py...
flyctl ssh sftp shell -a naverpay-delivery-tracker < nul
type routers\learning.py | flyctl ssh console -a naverpay-delivery-tracker -C "cat > /app/routers/learning.py"

echo.
echo [2/5] Uploading database/learning_db.py...
type database\learning_db.py | flyctl ssh console -a naverpay-delivery-tracker -C "cat > /app/database/learning_db.py"

echo.
echo [3/5] Uploading services/learning_engine.py...
type services\learning_engine.py | flyctl ssh console -a naverpay-delivery-tracker -C "cat > /app/services/learning_engine.py"

echo.
echo [4/5] Updating requirements.txt...
flyctl ssh console -a naverpay-delivery-tracker -C "echo numpy>=1.24.0 >> /app/requirements.txt"
flyctl ssh console -a naverpay-delivery-tracker -C "echo scipy>=1.11.0 >> /app/requirements.txt"

echo.
echo [5/5] Installing dependencies...
flyctl ssh console -a naverpay-delivery-tracker -C "pip install numpy scipy"

echo.
echo ============================================
echo Deployment completed!
echo Now restarting the app...
echo ============================================
flyctl apps restart naverpay-delivery-tracker

echo.
echo Done! Check status with:
echo flyctl status -a naverpay-delivery-tracker
pause
