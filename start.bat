@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title TUAN ANH STORE - Public Website Launcher V35

set "RUNTIME_DIR=%~dp0.runtime"
set "PUBLIC_URL_FILE=%~dp0PUBLIC_URL.txt"
set "PUBLIC_URL="
set "SERVER_PORT="

if not exist "%RUNTIME_DIR%" mkdir "%RUNTIME_DIR%"

echo =====================================================
echo          TUAN ANH STORE - PUBLIC WEBSITE
echo =====================================================
echo [1/4] Kiem tra Node.js...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ensure-node.ps1"
if errorlevel 1 (
  echo [LOI] Khong chuan bi duoc Node.js.
  pause
  exit /b 1
)

echo.
echo [2/4] Chon cong website local...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0select-port.ps1"
if errorlevel 1 (
  echo [LOI] Khong the chon cong cho website.
  pause
  exit /b 1
)
for /f "usebackq delims=" %%P in ("%RUNTIME_DIR%\active-port.txt") do set "SERVER_PORT=%%P"
if not defined SERVER_PORT (
  echo [LOI] Khong doc duoc cong server.
  pause
  exit /b 1
)
set "TA_STORE_PORT=%SERVER_PORT%"
set "TA_STORE_TUNNEL_ORIGIN=http://127.0.0.1:%SERVER_PORT%"
set "STORE_URL=http://127.0.0.1:%SERVER_PORT%"
echo [OK] Cong duoc chon: %SERVER_PORT%

if exist "%RUNTIME_DIR%\reuse-server.flag" goto SERVER_READY

echo Dang khoi dong API server...
del /q "%RUNTIME_DIR%\stop.flag" >nul 2>nul
start "TUAN ANH STORE WATCHDOG" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-server.ps1"
set "SERVER_WAIT=0"
:WAIT_SERVER
powershell -NoProfile -Command "$ErrorActionPreference='Stop'; try { $h=[System.Net.HttpWebRequest]::Create('%STORE_URL%/api/health'); $h.Proxy=$null; $h.Timeout=2500; $r=$h.GetResponse(); $sr=New-Object System.IO.StreamReader($r.GetResponseStream()); $j=$sr.ReadToEnd() | ConvertFrom-Json; $sr.Dispose(); $r.Dispose(); if ($j.ok -ne $true -or $j.service -ne 'Tuan Anh Store Key API' -or $j.version -ne 'public-web-v37-advanced-license-generator') { exit 1 }; $w=[System.Net.HttpWebRequest]::Create('%STORE_URL%/'); $w.Proxy=$null; $w.Timeout=3000; $wr=$w.GetResponse(); $sw=New-Object System.IO.StreamReader($wr.GetResponseStream()); $html=$sw.ReadToEnd(); $sw.Dispose(); $wr.Dispose(); if ($html -match 'TUAN ANH STORE') { exit 0 } } catch {}; exit 1" >nul 2>nul
if not errorlevel 1 goto SERVER_READY
set /a SERVER_WAIT+=1
if %SERVER_WAIT% EQU 5 echo [INFO] Dang doi API phan hoi... (5 giay)
if %SERVER_WAIT% EQU 15 echo [INFO] API van dang khoi dong... (15 giay)
if %SERVER_WAIT% EQU 30 echo [INFO] Dang kiem tra tien trinh va log... (30 giay)
if %SERVER_WAIT% GEQ 40 (
  echo [LOI] API server khong phan hoi. Kiem tra log trong .runtime.
  echo Cong dang duoc su dung: %SERVER_PORT%
  if exist "%RUNTIME_DIR%\server.out.log" (
    echo --- Node.js stdout gan nhat ---
    powershell -NoProfile -Command "Get-Content -Tail 40 -LiteralPath '%RUNTIME_DIR%\server.out.log'"
  )
  if exist "%RUNTIME_DIR%\server.err.log" (
    echo --- Node.js stderr gan nhat ---
    powershell -NoProfile -Command "Get-Content -Tail 40 -LiteralPath '%RUNTIME_DIR%\server.err.log'"
  )
  echo --- Tien trinh dang nghe cong %SERVER_PORT% ---
  netstat -ano | findstr ":%SERVER_PORT%"
  if exist "%RUNTIME_DIR%\watchdog.log" (
    echo --- Watchdog gan nhat ---
    powershell -NoProfile -Command "Get-Content -Tail 20 -LiteralPath '%RUNTIME_DIR%\watchdog.log'"
  )
  pause
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto WAIT_SERVER

:SERVER_READY
echo [OK] Website V34 va trang chu da san sang: %STORE_URL%
echo [INFO] Dang tu dong mo website tren trinh duyet...
rem Mo website local ngay khi API san sang; khong phai doi Cloudflare Tunnel.
start "" "%STORE_URL%/"
echo.
echo [3/4] Dang mo ket noi cong khai qua Cloudflare Tunnel...
rem Xoa URL/trang thai cu de khong doc nham ket qua cua lan chay truoc.
if exist "%PUBLIC_URL_FILE%" del /q "%PUBLIC_URL_FILE%" >nul 2>nul
if exist "%RUNTIME_DIR%\tunnel-failed.flag" del /q "%RUNTIME_DIR%\tunnel-failed.flag" >nul 2>nul
if exist "%RUNTIME_DIR%\tunnel-status.txt" del /q "%RUNTIME_DIR%\tunnel-status.txt" >nul 2>nul
if exist "%RUNTIME_DIR%\named-tunnel.mode" del /q "%RUNTIME_DIR%\named-tunnel.mode" >nul 2>nul
start "" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-public-tunnel.ps1"
set "TUNNEL_WAIT=0"
set "LAST_TUNNEL_STATUS="
:WAIT_TUNNEL
if exist "%RUNTIME_DIR%\named-tunnel.mode" goto NAMED_TUNNEL_READY
if exist "%PUBLIC_URL_FILE%" (
  for /f "usebackq delims=" %%U in ("%PUBLIC_URL_FILE%") do set "PUBLIC_URL=%%U"
  if defined PUBLIC_URL goto TUNNEL_READY
)
if exist "%RUNTIME_DIR%\tunnel-failed.flag" goto TUNNEL_FAILED
if exist "%RUNTIME_DIR%\tunnel-status.txt" (
  for /f "usebackq delims=" %%S in ("%RUNTIME_DIR%\tunnel-status.txt") do call :SHOW_TUNNEL_STATUS "%%S"
)
set /a TUNNEL_WAIT+=1
if %TUNNEL_WAIT% GEQ 330 goto TUNNEL_FAILED
timeout /t 1 /nobreak >nul
goto WAIT_TUNNEL

:NAMED_TUNNEL_READY
echo.
echo =====================================================
echo [OK] NAMED CLOUDFLARE TUNNEL DA KHOI DONG
echo Website local: %STORE_URL%
echo Hostname co dinh duoc cau hinh trong trang Admin.
echo Hay dang nhap Admin, vao Chia se website, nhap domain va bam Luu ten mien.
echo Cloudflare API se tu tao DNS CNAME + Published Route neu .env da du thong tin.
echo =====================================================
echo.
pause
exit /b 0

:TUNNEL_READY
echo.
echo =====================================================
echo [OK] WEBSITE DA CONG KHAI TREN INTERNET
echo.
echo URL RIENG CUA BOSS MAN:
echo %PUBLIC_URL%
echo.
echo Website local: %STORE_URL%
echo Trang chu cong khai; quan ly Key/API van can Admin login.
echo =====================================================
echo.
echo [4/4] Dang mo website cong khai...
start "" "%PUBLIC_URL%"
echo URL duoc luu tai: PUBLIC_URL.txt
echo Log tunnel: .runtime\cloudflared.log
echo.
echo Dong trinh duyet khong tat website. De dung web cong khai, chay stop.bat.
pause
exit /b 0

:TUNNEL_FAILED
echo.
echo [CANH BAO] Website local van chay, nhung Cloudflare Tunnel chua tao duoc URL.
echo Website tren may nay: %STORE_URL%
echo Trinh duyet da duoc mo bang dia chi local o buoc truoc.
if exist "%RUNTIME_DIR%\tunnel-failed.flag" (
  echo Ly do:
  type "%RUNTIME_DIR%\tunnel-failed.flag"
)
echo Chi tiet ky thuat nam trong: .runtime\cloudflared.log
if exist "%RUNTIME_DIR%\cloudflared.log" start "" notepad "%RUNTIME_DIR%\cloudflared.log"
echo Website local van dung duoc. Kiem tra ket noi Internet/firewall roi chay lai start.bat.
pause
exit /b 0

:SHOW_TUNNEL_STATUS
if not "%~1"=="%LAST_TUNNEL_STATUS%" (
  echo [INFO] %~1
  set "LAST_TUNNEL_STATUS=%~1"
)
exit /b
