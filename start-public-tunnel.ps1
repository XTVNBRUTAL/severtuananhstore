$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtime = Join-Path $root '.runtime'
$cloudflared = Join-Path $runtime 'cloudflared.exe'
$pidFile = Join-Path $runtime 'cloudflared.pid'
$launcherPidFile = Join-Path $runtime 'tunnel-launcher.pid'
$urlFile = Join-Path $root 'PUBLIC_URL.txt'
$logFile = Join-Path $runtime 'cloudflared.log'
$statusFile = Join-Path $runtime 'tunnel-status.txt'
$failedFile = Join-Path $runtime 'tunnel-failed.flag'
$namedModeFile = Join-Path $runtime 'named-tunnel.mode'
$envFile = Join-Path $root '.env'
$download = Join-Path $runtime 'cloudflared-download.exe'

# Load .env for the Named Tunnel path. Keep parent-process values if provided.
if (Test-Path $envFile) {
    foreach ($line in Get-Content -LiteralPath $envFile) {
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
            $name = $Matches[1]
            $value = $Matches[2].Trim()
            if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
                $value = $value.Substring(1, $value.Length - 2)
            }
            if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name, 'Process'))) {
                [Environment]::SetEnvironmentVariable($name, $value, 'Process')
            }
        }
    }
}
Remove-Item -Force $namedModeFile -ErrorAction SilentlyContinue
$portFile = Join-Path $runtime 'active-port.txt'
$tunnelPortFile = Join-Path $runtime 'cloudflared.port'
$stdoutFile = Join-Path $runtime 'cloudflared.stdout.log'
$stderrFile = Join-Path $runtime 'cloudflared.stderr.log'
$process = $null

New-Item -ItemType Directory -Force -Path $runtime | Out-Null

function Write-TunnelLog([string]$message) {
    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    try { [System.IO.File]::AppendAllText($logFile, "[$stamp] $message`r`n") } catch { }
    try { Set-Content -Path $statusFile -Value $message -Encoding UTF8 } catch { }
}

function Fail-Tunnel([string]$message) {
    Write-TunnelLog ("ERROR: " + $message)
    try { Remove-Item -Force $urlFile -ErrorAction SilentlyContinue } catch { }
    try { Set-Content -Path $failedFile -Value $message -Encoding UTF8 } catch { }
    throw $message
}

function Read-CloudflaredOutput {
    $parts = @()
    foreach ($file in @($stdoutFile, $stderrFile)) {
        if (Test-Path $file) {
            $stream = $null
            $reader = $null
            try {
                $stream = [System.IO.File]::Open($file, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
                $reader = New-Object System.IO.StreamReader($stream)
                $parts += $reader.ReadToEnd()
            } catch { }
            finally {
                if ($reader) { $reader.Dispose() }
                elseif ($stream) { $stream.Dispose() }
            }
        }
    }
    return ($parts -join "`n")
}

function Save-PublicUrl([string]$url) {
    try { $parsed = [Uri]$url } catch { return $false }
    if ($parsed.Scheme -ne 'https' -or $parsed.Host -notmatch '^[a-z0-9-]+\.trycloudflare\.com$') { return $false }
    $safeUrl = $parsed.GetLeftPart([System.UriPartial]::Authority)
    $tempUrl = "$urlFile.tmp"
    [System.IO.File]::WriteAllText($tempUrl, $safeUrl, [System.Text.Encoding]::ASCII)
    Move-Item -Force $tempUrl $urlFile
    return $true
}

# Read selected local website port.
$activePort = 3000
if (Test-Path $portFile) {
    try { $activePort = [int](Get-Content -Raw $portFile) } catch { }
}
if ($activePort -lt 1024 -or $activePort -gt 65535) {
    Fail-Tunnel 'Cong website trong active-port.txt khong hop le.'
}

# Reuse a currently running tunnel only when its URL and local target are both valid.
if (Test-Path $pidFile) {
    $existingPid = 0
    try { $existingPid = [int](Get-Content -Raw $pidFile) } catch { }
    if ($existingPid -gt 0) {
        $existing = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
        $savedTunnelPort = 0
        if (Test-Path $tunnelPortFile) {
            try { $savedTunnelPort = [int](Get-Content -Raw $tunnelPortFile) } catch { }
        }
        if ($existing -and $existing.ProcessName -eq 'cloudflared' -and $savedTunnelPort -eq $activePort -and (Test-Path $urlFile)) {
            $currentUrl = (Get-Content -Raw $urlFile).Trim()
            if ($currentUrl -match '^https://[a-z0-9-]+\.trycloudflare\.com$') {
                Set-Content -Path $statusFile -Value 'Tunnel da san sang.' -Encoding UTF8
                exit 0
            }
        }
        if ($existing -and $existing.ProcessName -eq 'cloudflared') {
            Write-TunnelLog 'Dang dong tunnel cu khong con hop le de tao ket noi sach.'
            Stop-Process -Id $existingPid -Force -ErrorAction SilentlyContinue
        }
    }
    Remove-Item -Force $pidFile -ErrorAction SilentlyContinue
    Remove-Item -Force $tunnelPortFile -ErrorAction SilentlyContinue
}

Set-Content -Path $launcherPidFile -Value $PID -Encoding ASCII
Set-Content -Path $tunnelPortFile -Value $activePort -Encoding ASCII
Remove-Item -Force $urlFile, $failedFile, $stdoutFile, $stderrFile -ErrorAction SilentlyContinue
Write-TunnelLog ("Tunnel launcher bat dau. Website local: http://127.0.0.1:{0}" -f $activePort)

try {
    if (Test-Path $cloudflared) {
        if ((Get-Item $cloudflared).Length -lt 5MB) {
            Write-TunnelLog 'File cloudflared.exe cu khong hop le; se tai lai.'
            Remove-Item -Force $cloudflared -ErrorAction SilentlyContinue
        }
    }

    if (-not (Test-Path $cloudflared)) {
        Write-TunnelLog 'Dang tai cloudflared chinh thuc tu GitHub Releases. Hay giu ket noi Internet.'
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $officialUrl = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
        Remove-Item -Force $download -ErrorAction SilentlyContinue
        Invoke-WebRequest -Uri $officialUrl -OutFile $download -UseBasicParsing -TimeoutSec 120
        if (-not (Test-Path $download) -or (Get-Item $download).Length -lt 5MB) {
            throw 'File cloudflared tai ve bi thieu hoac nho bat thuong.'
        }
        Move-Item -Force $download $cloudflared
        Write-TunnelLog 'Tai cloudflared thanh cong.'
    }

    Write-TunnelLog 'Dang kiem tra cloudflared.exe...'
    $versionInfo = & $cloudflared --version 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { throw ("Khong chay duoc cloudflared.exe: " + $versionInfo.Trim()) }
    Write-TunnelLog ("Cloudflared san sang: " + $versionInfo.Trim())

    # If a Named Tunnel token is supplied, use its stable hostname rather than
    # creating a temporary trycloudflare.com URL. The hostname/DNS/route is
    # provisioned by the authenticated Admin action inside the website.
    if ($env:CLOUDFLARE_TUNNEL_TOKEN -and $env:CLOUDFLARE_TUNNEL_TOKEN -notmatch '^PASTE_') {
        $token = $env:CLOUDFLARE_TUNNEL_TOKEN.Trim()
        Write-TunnelLog 'Dang khoi dong Named Cloudflare Tunnel (hostname co dinh).'
        $arguments = "tunnel --no-autoupdate --metrics 127.0.0.1:2000 run --token $token"
        $process = Start-Process -FilePath $cloudflared -ArgumentList $arguments -WorkingDirectory $root -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile
        if (-not $process -or $process.Id -lt 1) { throw 'Windows khong khoi dong duoc Named Cloudflare Tunnel.' }
        Set-Content -Path $pidFile -Value $process.Id -Encoding ASCII
        Set-Content -Path $namedModeFile -Value 'named' -Encoding ASCII
        Write-TunnelLog 'Named Tunnel process da khoi dong. Hay vao Admin > Chia se website, nhap hostname va bam Tao link.'
        Start-Sleep -Seconds 3
        $process.Refresh()
        if ($process.HasExited) {
            $output = Read-CloudflaredOutput
            if ($output) { Write-TunnelLog $output.Trim() }
            throw ("Named Tunnel thoat som (ma loi {0}). Kiem tra token va log Cloudflare." -f $process.ExitCode)
        }
        while ($true) {
            Start-Sleep -Seconds 3
            $process.Refresh()
            if ($process.HasExited) {
                $output = Read-CloudflaredOutput
                if ($output) { Write-TunnelLog $output.Trim() }
                throw ("Named Tunnel da ngat ket noi (ma loi {0}). Kiem tra log Cloudflare." -f $process.ExitCode)
            }
        }
    }

    # Use file redirection instead of PowerShell .NET async event callbacks.
    # This avoids runspace/thread issues that can silently discard the Quick Tunnel URL.
    $arguments = "tunnel --no-autoupdate --protocol http2 --edge-ip-version 4 --url http://127.0.0.1:$activePort"
    Write-TunnelLog 'Dang ket noi Cloudflare qua HTTP/2 (TCP). Dang doc URL tu log tien trinh...'
    $process = Start-Process -FilePath $cloudflared -ArgumentList $arguments -WorkingDirectory $root -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile
    if (-not $process -or $process.Id -lt 1) { throw 'Windows khong khoi dong duoc cloudflared.exe.' }
    Set-Content -Path $pidFile -Value $process.Id -Encoding ASCII

    # Allow the tunnel process time to emit a URL; downloads are handled above.
    $deadline = [DateTime]::UtcNow.AddSeconds(180)
    $publicUrl = $null
    while ([DateTime]::UtcNow -lt $deadline) {
        $process.Refresh()
        if ($process.HasExited) {
            $output = Read-CloudflaredOutput
            if ($output) { Write-TunnelLog $output.Trim() }
            throw ("cloudflared da thoat truoc khi tao URL (ma loi {0}). Xem .runtime\cloudflared.log." -f $process.ExitCode)
        }

        $output = Read-CloudflaredOutput
        if ($output -match '(?i)https://[a-z0-9-]+\.trycloudflare\.com') {
            $candidate = $Matches[0].ToLowerInvariant()
            if (Save-PublicUrl $candidate) { $publicUrl = $candidate; break }
        }
        Start-Sleep -Seconds 1
    }

    if (-not $publicUrl) {
        $output = Read-CloudflaredOutput
        if ($output) { Write-TunnelLog $output.Trim() }
        throw 'Da cho Cloudflare 180 giay nhung chua nhan duoc URL. Kiem tra .runtime\cloudflared.log va ket noi TCP 7844.'
    }

    Write-TunnelLog ("TUNNEL_READY: " + $publicUrl)

    # Keep this launcher alive while cloudflared is alive so the PID stays verifiable.
    while ($true) {
        Start-Sleep -Seconds 3
        $process.Refresh()
        if ($process.HasExited) {
            $exitCode = $process.ExitCode
            $output = Read-CloudflaredOutput
            if ($output) { Write-TunnelLog $output.Trim() }
            throw ("Tunnel Cloudflare da ngat ket noi (ma loi {0}). Hay tao link lai." -f $exitCode)
        }
    }
}
catch {
    $message = $_.Exception.Message
    if ([string]::IsNullOrWhiteSpace($message)) { $message = 'Khong the tao Cloudflare Tunnel.' }
    Write-TunnelLog ("ERROR: " + $message)
    try { Remove-Item -Force $urlFile -ErrorAction SilentlyContinue } catch { }
    try { Set-Content -Path $failedFile -Value $message -Encoding UTF8 } catch { }
}
finally {
    if ($process) {
        try {
            $process.Refresh()
            if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
        } catch { }
    }
    Remove-Item -Force $pidFile, $tunnelPortFile, $launcherPidFile, $download -ErrorAction SilentlyContinue
}
