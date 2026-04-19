# ─────────────────────────────────────────────────────────────
#  Meet Live Transcriber — single-file launcher
#  Run from anywhere:  .\meet-live-transcriber\start.ps1
# ─────────────────────────────────────────────────────────────

$Root      = Split-Path -Parent $MyInvocation.MyCommand.Definition
$Backend   = Join-Path $Root "backend"
$Extension = Join-Path $Root "extension"

# ── 1. Install / update Python dependencies ──────────────────
Write-Host ""
Write-Host "==> Installing / verifying Python dependencies..." -ForegroundColor Cyan
Push-Location $Backend
pip install -q -r requirements.txt
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: pip install failed. Check your Python environment." -ForegroundColor Red
    Pop-Location; exit 1
}
Pop-Location

# ── 2. Start the FastAPI backend in a new window ─────────────
Write-Host ""
Write-Host "==> Starting FastAPI backend on http://localhost:8100 ..." -ForegroundColor Cyan
$backendJob = Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$Backend'; Write-Host 'Backend starting...' -ForegroundColor Green; uvicorn main:app --host 0.0.0.0 --port 8100 --reload"
) -PassThru

# ── 3. Open Chrome with the extension load page ──────────────
Write-Host ""
Write-Host "==> Opening Chrome extension management page..." -ForegroundColor Cyan

$ChromePaths = @(
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "$env:PROGRAMFILES\Google\Chrome\Application\chrome.exe",
    "${env:PROGRAMFILES(x86)}\Google\Chrome\Application\chrome.exe"
)

$Chrome = $ChromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($Chrome) {
    # Launch Chrome pointing at the unpacked extension folder
    Start-Process $Chrome -ArgumentList "--load-extension=`"$Extension`"", "chrome://extensions"
    Write-Host ""
    Write-Host "  Chrome opened. If the extension didn't auto-load:" -ForegroundColor Yellow
    Write-Host "  1. Enable 'Developer mode' (top-right toggle)" -ForegroundColor Yellow
    Write-Host "  2. Click 'Load unpacked' and select: $Extension" -ForegroundColor Yellow
} else {
    Write-Host "  Chrome not found at standard paths." -ForegroundColor Yellow
    Write-Host "  Manually load the extension from: $Extension" -ForegroundColor Yellow
}

# ── 4. Print usage summary ────────────────────────────────────
Write-Host ""
Write-Host "─────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host " Backend : http://localhost:8100              " -ForegroundColor Green
Write-Host " WS      : ws://localhost:8100/transcribe     " -ForegroundColor Green
Write-Host " Ext dir : $Extension"                          -ForegroundColor Green
Write-Host "─────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Wait for the backend window to show 'Application startup complete.'"
Write-Host "  2. Open https://meet.google.com in Chrome"
Write-Host "  3. Click the 'Meet Live Transcriber' icon in the toolbar"
Write-Host "  4. Transcriptions will appear as a subtitle overlay on the Meet page"
Write-Host ""
