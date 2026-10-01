@echo off
echo Starting all Higoverse microservices...

start "product-service (8001)" cmd /k "cd backend\product-service && pip install -r requirements.txt -q && uvicorn app.main:app --port 8001 --reload"
timeout /t 2 /nobreak >nul

start "supplier-service (8002)" cmd /k "cd backend\supplier-service && pip install -r requirements.txt -q && uvicorn app.main:app --port 8002 --reload"
timeout /t 2 /nobreak >nul

start "sale-service (8003)" cmd /k "cd backend\sale-service && pip install -r requirements.txt -q && uvicorn app.main:app --port 8003 --reload"
timeout /t 2 /nobreak >nul

start "purchase-service (8004)" cmd /k "cd backend\purchase-service && pip install -r requirements.txt -q && uvicorn app.main:app --port 8004 --reload"
timeout /t 2 /nobreak >nul

start "expense-service (8005)" cmd /k "cd backend\expense-service && pip install -r requirements.txt -q && uvicorn app.main:app --port 8005 --reload"
timeout /t 2 /nobreak >nul

start "settings-service (8006)" cmd /k "cd backend\settings-service && pip install -r requirements.txt -q && uvicorn app.main:app --port 8006 --reload"
timeout /t 2 /nobreak >nul

start "auth-service (8000)" cmd /k "cd backend\auth-service && pip install -r requirements.txt -q && uvicorn app.main:app --port 8000 --reload"
timeout /t 2 /nobreak >nul

start "shop-service (8007)" cmd /k "cd backend\shop-service && pip install -r requirements.txt -q && uvicorn app.main:app --port 8007 --reload"
timeout /t 2 /nobreak >nul

echo.
echo All services starting in separate windows:
echo   auth-service     -^> http://localhost:8000
echo   product-service  -^> http://localhost:8001
echo   supplier-service -^> http://localhost:8002
echo   sale-service     -^> http://localhost:8003
echo   purchase-service -^> http://localhost:8004
echo   expense-service  -^> http://localhost:8005
echo   settings-service -^> http://localhost:8006
echo   shop-service     -^> http://localhost:8007
echo   report-service   -^> https://higoverse-reports.vercel.app (production)
echo.
echo Then run the frontend: cd apps\web ^&^& npm run dev
pause
