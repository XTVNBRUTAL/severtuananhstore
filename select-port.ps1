$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtime = Join-Path $root '.runtime'
$portFile = Join-Path $runtime 'active-port.txt'
$nodePidFile = Join-Path $runtime 'node.pid'
$reuseFile = Join-Path $runtime 'reuse-server.flag'
$expectedVersion = 'public-web-v37-advanced-license-generator'
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
Remove-Item -Force $reuseFile -ErrorAction SilentlyContinue

function Get-LocalHttpText([string]$url) {
    $request = [System.Net.HttpWebRequest]::Create($url)
    $request.Proxy = $null
    $request.Timeout = 3000
    $request.ReadWriteTimeout = 3000
    $request.KeepAlive = $false
    $response = $request.GetResponse()
    try {
        $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
        try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
    } finally {
        $response.Dispose()
    }
}

function Test-TuanAnhServer([int]$port) {
    try {
        $base = "http://127.0.0.1:$port"
        $healthText = Get-LocalHttpText "$base/api/health"
        $health = $healthText | ConvertFrom-Json
        if ($health.ok -ne $true -or $health.service -ne 'Tuan Anh Store Key API' -or $health.version -ne $expectedVersion) {
            return $false
        }
        $homeHtml = Get-LocalHttpText "$base/"
        if ($homeHtml -notmatch 'TUAN ANH STORE') {
            return $false
        }
        return $true
    } catch {
        return $false
    }
}

# Reuse only the Node process recorded by THIS folder, running this exact build,
# and serving the actual homepage. A stale V28/V29 process must never be reused.
if ((Test-Path $portFile) -and (Test-Path $nodePidFile)) {
    try {
        $port = [int](Get-Content -Raw $portFile)
        $nodePid = [int](Get-Content -Raw $nodePidFile)
        $process = Get-Process -Id $nodePid -ErrorAction Stop
        if ($port -ge 1024 -and $port -le 65535 -and $process.ProcessName -eq 'node' -and (Test-TuanAnhServer $port)) {
            Set-Content -Path $reuseFile -Value 'reuse' -Encoding ASCII
            Write-Output $port
            exit 0
        }
    } catch { }
}

function Test-PortAvailable([int]$port) {
    $listener = $null
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
        $listener.Start()
        return $true
    } catch {
        return $false
    } finally {
        if ($listener) { try { $listener.Stop() } catch { } }
    }
}

$selected = 0
for ($candidate = 3000; $candidate -le 3100; $candidate++) {
    if (Test-PortAvailable $candidate) { $selected = $candidate; break }
}
if ($selected -eq 0) {
    Write-Error 'Khong tim thay cong trong tu 3000 den 3100. Hay dong cac server cu hoac ung dung dang dung cac cong nay.'
    exit 1
}
[System.IO.File]::WriteAllText($portFile, [string]$selected)
Write-Output $selected
