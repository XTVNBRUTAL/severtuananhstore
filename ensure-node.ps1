$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeDir = Join-Path $root '.runtime'
$portableNode = Join-Path $runtimeDir 'node.exe'
$portableFlag = Join-Path $runtimeDir 'use-portable.flag'

function Get-NodeMajorVersion([string]$nodePath) {
    try {
        $value = & $nodePath -p "Number(process.versions.node.split('.')[0])" 2>$null
        if ($LASTEXITCODE -eq 0) { return [int]$value }
    } catch { }
    return 0
}

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

# Prefer a Node.js installation already available on the computer (18+).
$systemNode = Get-Command node.exe -ErrorAction SilentlyContinue
if ($systemNode -and $systemNode.Source) {
    $systemPath = $systemNode.Source
    if ((Get-NodeMajorVersion $systemPath) -ge 18) {
        Remove-Item -Force $portableFlag -ErrorAction SilentlyContinue
        Write-Host "[OK] Dung Node.js co san: $(& $systemPath --version)"
        exit 0
    }
    Write-Host '[INFO] Node.js co san qua cu; se dung ban portable.'
}

# If the portable runtime exists and works, keep using it.
if (Test-Path $portableNode) {
    if ((Get-NodeMajorVersion $portableNode) -ge 18) {
        Set-Content -Path $portableFlag -Value 'portable' -Encoding ASCII
        Write-Host "[OK] Dung Node.js portable: $(& $portableNode --version)"
        exit 0
    }
    Remove-Item -Force $portableNode -ErrorAction SilentlyContinue
}

# Download only the standalone official Node executable. The server uses Node core modules only.
$downloadUrl = 'https://nodejs.org/dist/latest-v24.x/win-x64/node.exe'
$tempNode = Join-Path $runtimeDir 'node-download.exe'
Write-Host '[INFO] May chua co Node.js 18+.'
Write-Host '[INFO] Dang tai Node.js portable tu nodejs.org (can Internet o lan dau)...'

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $downloadUrl -OutFile $tempNode -UseBasicParsing -TimeoutSec 180
    if (-not (Test-Path $tempNode) -or (Get-Item $tempNode).Length -lt 10MB) {
        throw 'File Node.js tai ve khong hop le.'
    }
    if ((Get-NodeMajorVersion $tempNode) -lt 18) {
        throw 'Node.js tai ve khong chay duoc hoac phien ban qua cu.'
    }
    Move-Item -Force $tempNode $portableNode
    Set-Content -Path $portableFlag -Value 'portable' -Encoding ASCII
    Write-Host "[OK] Da chuan bi Node.js portable: $(& $portableNode --version)"
    exit 0
}
catch {
    Remove-Item -Force $tempNode -ErrorAction SilentlyContinue
    Write-Host ''
    Write-Host '[LOI] Khong tai duoc Node.js tu nodejs.org.' -ForegroundColor Red
    Write-Host "Chi tiet: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Hay kiem tra Internet / firewall, sau do chay lai start.bat.'
    exit 1
}
