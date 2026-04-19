#!/usr/bin/env pwsh
# ============================================================================
#  MeetMind - One-Command Startup Script
#  Run:  .\start.ps1            (first-time setup + launch)
#        .\start.ps1 -Rebuild   (force rebuild images)
#        .\start.ps1 -Stop      (shut everything down)
# ============================================================================

param(
    [switch]$Rebuild,
    [switch]$Stop
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# -- Helpers ----------------------------------------------------------------
function Write-Step  { param($m) Write-Host "`n> $m" -ForegroundColor Cyan }
function Write-Ok    { param($m) Write-Host "  [OK] $m" -ForegroundColor Green }
function Write-Warn  { param($m) Write-Host "  [!!] $m" -ForegroundColor Yellow }
function Write-Fail  { param($m) Write-Host "  [FAIL] $m" -ForegroundColor Red }

# -- Stop mode --------------------------------------------------------------
if ($Stop) {
    Write-Step "Stopping MeetMind services..."
    docker compose down
    Write-Ok "All services stopped."
    exit 0
}

# -- Pre-flight: Docker must be running -------------------------------------
Write-Step "Checking Docker..."
try {
    docker info 2>$null | Out-Null
    Write-Ok "Docker is running."
} catch {
    Write-Fail "Docker is not running. Please start Docker Desktop and try again."
    exit 1
}

# -- .env file --------------------------------------------------------------
Write-Step "Checking .env file..."
$envFile = Join-Path $PSScriptRoot ".env"

if (-not (Test-Path $envFile)) {
    Write-Warn ".env not found - creating from template."

    $guid = [guid]::NewGuid().ToString()
    $envTemplate = @"
# ============================================================================
#  MeetMind Environment Variables
#  Fill in the values below, then re-run .\start.ps1
# ============================================================================

# -- MongoDB Atlas -----------------------------------------------------------
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/
MONGO_DB_NAME=meetmind

# -- Redis (Docker service - no change needed) -------------------------------
REDIS_URL=redis://redis:6379

# -- Security ----------------------------------------------------------------
SECRET_KEY=$guid

# -- AI / LLM ---------------------------------------------------------------
# Get a free key at https://console.groq.com
GROQ_API_KEY=<your-groq-api-key>
GROQ_MODEL=llama-3.1-8b-instant

# -- Speech-to-Text ---------------------------------------------------------
# Get a key at https://www.assemblyai.com
ASSEMBLYAI_API_KEY=<your-assemblyai-key>

# -- CORS (development: allow all; production: lock down) --------------------
ALLOWED_ORIGINS=["*"]

# -- Dashboard URL (used by the Chrome extension) ---------------------------
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
"@
    $envTemplate | Set-Content -Path $envFile -Encoding utf8

    Write-Warn "Edit .env with your API keys, then run .\start.ps1 again."
    Write-Host ""
    Write-Host "  Required keys:" -ForegroundColor White
    Write-Host "    MONGO_URI          - MongoDB Atlas connection string"
    Write-Host "    GROQ_API_KEY       - https://console.groq.com"
    Write-Host "    ASSEMBLYAI_API_KEY - https://www.assemblyai.com"
    Write-Host ""
    exit 0
}

# Validate critical keys are not still placeholders
$envContent = Get-Content $envFile -Raw
$missing = @()
if ($envContent -match "GROQ_API_KEY=<" -or $envContent -notmatch "GROQ_API_KEY=\S") {
    $missing += "GROQ_API_KEY"
}
if ($envContent -match "ASSEMBLYAI_API_KEY=<" -or $envContent -notmatch "ASSEMBLYAI_API_KEY=\S") {
    $missing += "ASSEMBLYAI_API_KEY"
}
if ($envContent -match "MONGO_URI=mongodb\+srv://<" -or $envContent -notmatch "MONGO_URI=\S") {
    $missing += "MONGO_URI"
}

if ($missing.Count -gt 0) {
    Write-Warn "The following keys in .env still have placeholder values:"
    $missing | ForEach-Object { Write-Host "    - $_" -ForegroundColor Yellow }
    Write-Host ""
    Write-Warn "Edit .env and fill them in, then re-run .\start.ps1"
    exit 1
}

Write-Ok ".env is configured."

# -- Build & Launch ---------------------------------------------------------
Write-Step "Starting MeetMind services..."

if ($Rebuild) {
    docker compose down --remove-orphans 2>$null
    docker compose up -d --build
} else {
    docker compose up -d --build
}

if ($LASTEXITCODE -ne 0) {
    Write-Fail "Docker Compose failed. Check the output above."
    exit 1
}

Write-Ok "Containers launched."

# -- Health Checks ----------------------------------------------------------
Write-Step "Waiting for services to be ready..."

# Core API health
$maxRetries = 30
$ready = $false
for ($i = 1; $i -le $maxRetries; $i++) {
    try {
        $resp = Invoke-RestMethod -Uri http://localhost:8000/health -TimeoutSec 3
        if ($resp.status -eq "ok") { $ready = $true; break }
    } catch { }
    Start-Sleep -Seconds 2
}

if ($ready) {
    Write-Ok "Core API healthy."
} else {
    Write-Fail "Core API did not respond after 60s. Check logs: docker compose logs core-api"
    exit 1
}

# Web Dashboard
$ready = $false
for ($i = 1; $i -le 20; $i++) {
    try {
        $r = Invoke-WebRequest -UseBasicParsing http://localhost:3000 -TimeoutSec 5
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch { }
    Start-Sleep -Seconds 3
}

if ($ready) {
    Write-Ok "Web Dashboard healthy."
} else {
    Write-Warn "Dashboard not responding yet - may still be compiling. Check: docker compose logs web-dashboard"
}

# -- Summary ----------------------------------------------------------------
Write-Host ""
Write-Host "  +----------------------------------------------------------+" -ForegroundColor Magenta
Write-Host "  |              MeetMind is running!                        |" -ForegroundColor Magenta
Write-Host "  +----------------------------------------------------------+" -ForegroundColor Magenta
Write-Host "  |                                                          |" -ForegroundColor Magenta
Write-Host "  |  Dashboard   :  http://localhost:3000                    |" -ForegroundColor Magenta
Write-Host "  |  API         :  http://localhost:8000                    |" -ForegroundColor Magenta
Write-Host "  |  API Docs    :  http://localhost:8000/docs               |" -ForegroundColor Magenta
Write-Host "  |  WebSocket   :  ws://localhost:8000/ws/{meeting_id}      |" -ForegroundColor Magenta
Write-Host "  |                                                          |" -ForegroundColor Magenta
Write-Host "  |  Chrome Ext  :  Load services/chrome-extension/          |" -ForegroundColor Magenta
Write-Host "  |                 as unpacked in chrome://extensions        |" -ForegroundColor Magenta
Write-Host "  |                                                          |" -ForegroundColor Magenta
Write-Host "  |  Stop        :  .\start.ps1 -Stop                       |" -ForegroundColor Magenta
Write-Host "  |  Rebuild     :  .\start.ps1 -Rebuild                    |" -ForegroundColor Magenta
Write-Host "  |  Logs        :  docker compose logs -f                   |" -ForegroundColor Magenta
Write-Host "  |                                                          |" -ForegroundColor Magenta
Write-Host "  +----------------------------------------------------------+" -ForegroundColor Magenta
Write-Host ""

# -- Open dashboard in default browser --------------------------------------
Start-Process "http://localhost:3000"
