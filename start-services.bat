@echo off
setlocal
rem Local development: starts the 9 backend services (each in its own .venv,
rem created on first run) and the website, each in its own window.
rem Needs PostgreSQL on 127.0.0.1:5432 with authdb and shopdb (see each
rem service's .env); every service creates its own tables on start.
rem --env-file loads each .env (on the VPS systemd does this); without it
rem most services start with no database and every request fails.
rem The website forwards /svc/<name>/ to these ports (apps\web\next.config.ts).

cd /d "%~dp0"
echo Starting Higoverse for local development...

call :svc auth-service     8000
call :svc product-service  8001
call :svc supplier-service 8002
call :svc sale-service     8003
call :svc purchase-service 8004
call :svc expense-service  8005
call :svc settings-service 8006
call :svc shop-service     8007
call :svc report-service   8008

netstat -ano | findstr /r /c:":3000 .*LISTENING" >nul
if errorlevel 1 (
  start "web (3000)" cmd /k "cd /d %~dp0apps\web && (if not exist node_modules npm install) && npm run dev"
) else (
  echo web: already running on port 3000
)

echo.
echo   website          -^> http://localhost:3000
echo   auth-service     -^> http://localhost:8000      product-service  -^> http://localhost:8001
echo   supplier-service -^> http://localhost:8002      sale-service     -^> http://localhost:8003
echo   purchase-service -^> http://localhost:8004      expense-service  -^> http://localhost:8005
echo   settings-service -^> http://localhost:8006      shop-service     -^> http://localhost:8007
echo   report-service   -^> http://localhost:8008
echo.
echo Close a window to stop that service.
pause
exit /b

:svc
netstat -ano | findstr /r /c:":%2 .*LISTENING" >nul
if not errorlevel 1 (
  echo %1: already running on port %2
  exit /b
)
start "%1 (%2)" cmd /k "cd /d %~dp0backend\%1 && (if not exist .venv\Scripts\python.exe (py -3.12 -m venv .venv || python -m venv .venv) && .venv\Scripts\python -m pip install -q -r requirements.txt) && .venv\Scripts\python -m uvicorn app.main:app --env-file .env --host 127.0.0.1 --port %2 --reload"
ping -n 2 127.0.0.1 >nul
exit /b
