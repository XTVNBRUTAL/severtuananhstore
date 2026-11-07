@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title TUAN ANH STORE - Stop
set "RUNTIME_DIR=%~dp0.runtime"
set "STOP_FILE=%RUNTIME_DIR%\stop.flag"
set "NODE_PID_FILE=%RUNTIME_DIR%\node.pid"
set "WATCHDOG_PID_FILE=%RUNTIME_DIR%\watchdog.pid"
set "TUNNEL_PID_FILE=%RUNTIME_DIR%\cloudflared.pid"
set "TUNNEL_LAUNCHER_PID_FILE=%RUNTIME_DIR%\tunnel-launcher.pid"
set "TUNNEL_PORT_FILE=%RUNTIME_DIR%\cloudflared.port"
set "TEMP_TUNNEL_WORKER_PID_FILE=%RUNTIME_DIR%\temporary-tunnel-worker.pid"
set "TEMP_TUNNEL_CHILD_PID_FILE=%RUNTIME_DIR%\temporary-cloudflared.pid"
set "TUNNEL_STDOUT_FILE=%RUNTIME_DIR%\cloudflared.stdout.log"
set "TUNNEL_STDERR_FILE=%RUNTIME_DIR%\cloudflared.stderr.log"
set "ACTIVE_PORT_FILE=%RUNTIME_DIR%\active-port.txt"

if not exist "%RUNTIME_DIR%" (
  echo TUAN ANH STORE chua duoc chay.
  pause
  exit /b 0
)

echo Dang gui lenh dung website va ket noi cong khai...
echo stop>"%STOP_FILE%"
rem Stop Admin-created Quick Tunnel separately; do not confuse it with Named Tunnel.
if exist "%TEMP_TUNNEL_WORKER_PID_FILE%" (
  for /f "usebackq delims=" %%P in ("%TEMP_TUNNEL_WORKER_PID_FILE%") do taskkill /PID %%P /T /F >nul 2>nul
)
if exist "%TEMP_TUNNEL_CHILD_PID_FILE%" (
  for /f "usebackq delims=" %%P in ("%TEMP_TUNNEL_CHILD_PID_FILE%") do taskkill /PID %%P /T /F >nul 2>nul
)
if exist "%NODE_PID_FILE%" (
  for /f "usebackq delims=" %%P in ("%NODE_PID_FILE%") do taskkill /PID %%P /T /F >nul 2>nul
)
if exist "%TUNNEL_PID_FILE%" (
  for /f "usebackq delims=" %%P in ("%TUNNEL_PID_FILE%") do taskkill /PID %%P /T /F >nul 2>nul
)
if exist "%TUNNEL_LAUNCHER_PID_FILE%" (
  for /f "usebackq delims=" %%P in ("%TUNNEL_LAUNCHER_PID_FILE%") do taskkill /PID %%P /T /F >nul 2>nul
)
timeout /t 3 /nobreak >nul
if exist "%WATCHDOG_PID_FILE%" (
  for /f "usebackq delims=" %%P in ("%WATCHDOG_PID_FILE%") do taskkill /PID %%P /T /F >nul 2>nul
)
if exist "%TEMP_TUNNEL_WORKER_PID_FILE%" del /q "%TEMP_TUNNEL_WORKER_PID_FILE%" >nul 2>nul
if exist "%TEMP_TUNNEL_CHILD_PID_FILE%" del /q "%TEMP_TUNNEL_CHILD_PID_FILE%" >nul 2>nul
if exist "%RUNTIME_DIR%\temporary-public-url.txt" del /q "%RUNTIME_DIR%\temporary-public-url.txt" >nul 2>nul
if exist "%RUNTIME_DIR%\temporary-tunnel-status.txt" del /q "%RUNTIME_DIR%\temporary-tunnel-status.txt" >nul 2>nul
if exist "%RUNTIME_DIR%\temporary-tunnel-failed.flag" del /q "%RUNTIME_DIR%\temporary-tunnel-failed.flag" >nul 2>nul
if exist "%TUNNEL_PID_FILE%" del /q "%TUNNEL_PID_FILE%" >nul 2>nul
if exist "%TUNNEL_LAUNCHER_PID_FILE%" del /q "%TUNNEL_LAUNCHER_PID_FILE%" >nul 2>nul
if exist "%TUNNEL_PORT_FILE%" del /q "%TUNNEL_PORT_FILE%" >nul 2>nul
if exist "%TUNNEL_STDOUT_FILE%" del /q "%TUNNEL_STDOUT_FILE%" >nul 2>nul
if exist "%TUNNEL_STDERR_FILE%" del /q "%TUNNEL_STDERR_FILE%" >nul 2>nul
if exist "%ACTIVE_PORT_FILE%" del /q "%ACTIVE_PORT_FILE%" >nul 2>nul
if exist "%~dp0PUBLIC_URL.txt" del /q "%~dp0PUBLIC_URL.txt" >nul 2>nul
if exist "%RUNTIME_DIR%\named-tunnel.mode" del /q "%RUNTIME_DIR%\named-tunnel.mode" >nul 2>nul

echo Da gui lenh dung website va tunnel.
echo Chay start.bat de bat lai va tao URL cong khai moi.
pause
