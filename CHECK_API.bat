@echo off
setlocal
chcp 65001 >nul
set /p BASE=Nhap domain Railway (vd https://ta-store.up.railway.app): 
if "%BASE%"=="" (
  echo Chua nhap domain.
  pause
  exit /b 1
)
set "BASE=%BASE:~0,200%"
echo.
echo Dang kiem tra %BASE%/api/health ...
curl.exe --fail --show-error --silent "%BASE%/api/health"
if errorlevel 1 (
  echo.
  echo LOI: API chua truy cap duoc. Hay kiem tra Deployment, Domain va log Railway.
  pause
  exit /b 1
)
echo.
echo.
echo Neu JSON o tren co "ok":true thi backend dang phan hoi.
echo Tiep theo mo domain goc de dang nhap Admin.
pause
