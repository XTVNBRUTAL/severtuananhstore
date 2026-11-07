$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeDir = Join-Path $root '.runtime'
$portableFlag = Join-Path $runtimeDir 'use-portable.flag'
$portableNode = Join-Path $runtimeDir 'node.exe'
$stopFile = Join-Path $runtimeDir 'stop.flag'
$watchdogPidFile = Join-Path $runtimeDir 'watchdog.pid'
$nodePidFile = Join-Path $runtimeDir 'node.pid'
$stdoutLog = Join-Path $runtimeDir 'server.out.log'
$stderrLog = Join-Path $runtimeDir 'server.err.log'
$watchdogLog = Join-Path $runtimeDir 'watchdog.log'
$serverFile = Join-Path $root 'server.js'
$envFile = Join-Path $root '.env'
$activePortFile = Join-Path $runtimeDir 'active-port.txt'

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

# Read .env without replacing values explicitly provided by start.bat.
if (Test-Path -LiteralPath $envFile) {
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

# The selected port file is authoritative. Explicitly pass it to node.exe rather
# than relying on environment inheritance through multiple Windows processes.
$activePort = 3000
if (Test-Path -LiteralPath $activePortFile) {
    $parsedPort = 0
    $portText = (Get-Content -Raw -LiteralPath $activePortFile).Trim()
    if ([int]::TryParse($portText, [ref]$parsedPort) -and $parsedPort -ge 1024 -and $parsedPort -le 65535) {
        $activePort = $parsedPort
    }
}
$env:TA_STORE_PORT = [string]$activePort
if ([string]::IsNullOrWhiteSpace($env:TA_STORE_TUNNEL_ORIGIN)) {
    $env:TA_STORE_TUNNEL_ORIGIN = "http://127.0.0.1:$activePort"
}
if ($env:CLOUDFLARE_TUNNEL_TOKEN -and $env:CLOUDFLARE_TUNNEL_TOKEN -notmatch '^PASTE_') {
    $env:CLOUDFLARE_NAMED_TUNNEL_CONFIGURED = 'true'
}
if ($env:CLOUDFLARE_TUNNEL_TOKEN -and -not $env:TA_STORE_TUNNEL_READY_URL) {
    $env:TA_STORE_TUNNEL_READY_URL = 'http://127.0.0.1:2000/ready'
}

Set-Content -Path $watchdogPidFile -Value $PID -Encoding ASCII

function Write-WatchdogLog([string]$message) {
    Add-Content -LiteralPath $watchdogLog -Value ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $message)
}

function Get-NodePath {
    if ((Test-Path -LiteralPath $portableFlag) -and (Test-Path -LiteralPath $portableNode)) {
        return $portableNode
    }
    $command = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($command -and $command.Source) { return $command.Source }
    throw 'Khong tim thay node.exe. Hay chay start.bat de chuan bi Node.js.'
}

function New-LogHandler([string]$logPath) {
    $capturedPath = $logPath
    $handlerScript = {
        param($sender, $eventArgs)
        if ($null -ne $eventArgs.Data) {
            try { [System.IO.File]::AppendAllText($capturedPath, $eventArgs.Data + [Environment]::NewLine, [System.Text.Encoding]::UTF8) } catch { }
        }
    }.GetNewClosure()
    return [System.Diagnostics.DataReceivedEventHandler]$handlerScript
}

$restartCount = 0
$watchdogStartedAt = Get-Date
try {
    Write-WatchdogLog "Watchdog da khoi dong. Port duoc chon: $activePort. Thu muc: $root"
    while (-not (Test-Path -LiteralPath $stopFile)) {
        $nodePath = Get-NodePath
        if (-not (Test-Path -LiteralPath $serverFile)) { throw "Khong tim thay server.js: $serverFile" }
        $nodeVersion = (& $nodePath --version 2>&1 | Out-String).Trim()
        if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($nodeVersion)) { throw "Node.js khong chay duoc: $nodePath" }

        # Start from clean logs so a previous run cannot hide the current error.
        Set-Content -LiteralPath $stdoutLog -Value '' -Encoding UTF8
        Set-Content -LiteralPath $stderrLog -Value '' -Encoding UTF8
        Write-WatchdogLog "Dang khoi dong server. Node=$nodePath; version=$nodeVersion; port=$activePort"

        $startInfo = New-Object System.Diagnostics.ProcessStartInfo
        $startInfo.FileName = $nodePath
        # Arguments is a single quoted script path; ProcessStartInfo handles spaces in usernames/folders.
        $escapedServerPath = $serverFile.Replace('"', '\"')
        $startInfo.Arguments = '"' + $escapedServerPath + '"'
        $startInfo.WorkingDirectory = $root
        $startInfo.UseShellExecute = $false
        $startInfo.CreateNoWindow = $true
        $startInfo.RedirectStandardOutput = $true
        $startInfo.RedirectStandardError = $true
        $startInfo.EnvironmentVariables['TA_STORE_PORT'] = [string]$activePort
        if ([string]::IsNullOrWhiteSpace($startInfo.EnvironmentVariables['TA_STORE_TUNNEL_ORIGIN'])) {
            $startInfo.EnvironmentVariables['TA_STORE_TUNNEL_ORIGIN'] = "http://127.0.0.1:$activePort"
        }
        if ([string]::IsNullOrWhiteSpace($startInfo.EnvironmentVariables['TA_STORE_HOST'])) {
            $startInfo.EnvironmentVariables['TA_STORE_HOST'] = '127.0.0.1'
        }
        if ($env:CLOUDFLARE_TUNNEL_TOKEN -and $env:CLOUDFLARE_TUNNEL_TOKEN -notmatch '^PASTE_') {
            $startInfo.EnvironmentVariables['CLOUDFLARE_NAMED_TUNNEL_CONFIGURED'] = 'true'
        }
        if ($env:CLOUDFLARE_TUNNEL_TOKEN -and -not $env:TA_STORE_TUNNEL_READY_URL) {
            $startInfo.EnvironmentVariables['TA_STORE_TUNNEL_READY_URL'] = 'http://127.0.0.1:2000/ready'
        }

        $nodeProcess = New-Object System.Diagnostics.Process
        $nodeProcess.StartInfo = $startInfo
        if (-not $nodeProcess.Start()) { throw 'Windows khong khoi dong duoc tien trinh node.exe.' }
        Set-Content -Path $nodePidFile -Value $nodeProcess.Id -Encoding ASCII
        Write-WatchdogLog "Node process started. PID=$($nodeProcess.Id); command=`"$nodePath`" $($startInfo.Arguments)"

        # Drain both streams asynchronously to prevent a full pipe from blocking Node.
        $stdoutHandler = New-LogHandler $stdoutLog
        $stderrHandler = New-LogHandler $stderrLog
        $nodeProcess.add_OutputDataReceived($stdoutHandler)
        $nodeProcess.add_ErrorDataReceived($stderrHandler)
        $nodeProcess.BeginOutputReadLine()
        $nodeProcess.BeginErrorReadLine()

        $stopRequested = $false
        while (-not $nodeProcess.WaitForExit(1000)) {
            if (Test-Path -LiteralPath $stopFile) {
                $stopRequested = $true
                try { $nodeProcess.Kill() } catch { }
                break
            }
        }
        try { $nodeProcess.WaitForExit() } catch { }
        $nodeProcess.Refresh()
        $exitCode = $nodeProcess.ExitCode
        $nodeProcess.Dispose()
        Remove-Item -Force -LiteralPath $nodePidFile -ErrorAction SilentlyContinue

        if ($stopRequested -or (Test-Path -LiteralPath $stopFile)) { break }
        Write-WatchdogLog "Server da ket thuc (exit code $exitCode). Log stdout/stderr da duoc ghi."
        $restartCount++
        if ($restartCount -ge 6) {
            Write-WatchdogLog 'Server loi lien tiep 6 lan; watchdog dung de tranh lap vo han. Chay start.bat lai sau khi sua log.'
            break
        }
        Start-Sleep -Seconds ([Math]::Min(2 + $restartCount, 8))
    }
    Write-WatchdogLog 'Nhan lenh dung server hoac watchdog da ket thuc.'
}
catch {
    Write-WatchdogLog ("WATCHDOG ERROR: {0}" -f $_.Exception.ToString())
}
finally {
    Remove-Item -Force -LiteralPath $nodePidFile -ErrorAction SilentlyContinue
    Remove-Item -Force -LiteralPath $watchdogPidFile -ErrorAction SilentlyContinue
}
