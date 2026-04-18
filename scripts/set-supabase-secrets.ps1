# set-supabase-secrets.ps1
#
# Reads .env.local and pushes the relevant values into Supabase as edge-function
# secrets. Also generates a DAILY_BRIEFING_SECRET if one isn't already set.
#
# Usage (from project root):
#   .\scripts\set-supabase-secrets.ps1

param(
  [string]$EnvFile = ".env.local"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $EnvFile)) {
  Write-Error ("Cannot find " + $EnvFile + ". Run this from the project root.")
  exit 1
}

# Parse .env.local into a hashtable.
$envVars = @{}
Get-Content $EnvFile | ForEach-Object {
  $line = $_.Trim()
  if ($line.StartsWith("#") -or $line -eq "") { return }
  if ($line -match '^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$') {
    $key = $matches[1]
    $val = $matches[2]
    if ($val.StartsWith('"') -and $val.EndsWith('"')) {
      $val = $val.Substring(1, $val.Length - 2)
    }
    elseif ($val.StartsWith("'") -and $val.EndsWith("'")) {
      $val = $val.Substring(1, $val.Length - 2)
    }
    $envVars[$key] = $val
  }
}

# Keys to push to Supabase edge functions (other keys stay local only).
$wanted = @(
  "ANTHROPIC_API_KEY",
  "NEXT_PUBLIC_WEATHER_API_KEY",
  "WEATHER_API_KEY",
  "PIN_USER_PASSWORD",
  "VAPID_PRIVATE_KEY",
  "VAPID_PUBLIC_KEY",
  "VAPID_SUBJECT"
)

Write-Host "Secrets to push to Supabase edge functions:" -ForegroundColor Cyan
$present = @()
$missing = @()
foreach ($key in $wanted) {
  if ($envVars.ContainsKey($key) -and $envVars[$key]) {
    $v = $envVars[$key]
    $start = [Math]::Max(0, $v.Length - 4)
    $masked = "***" + $v.Substring($start)
    Write-Host ("  [x] " + $key + " = " + $masked)
    $present += $key
  } else {
    Write-Host ("  [ ] " + $key + " (missing)") -ForegroundColor Yellow
    $missing += $key
  }
}

# Auto-generate DAILY_BRIEFING_SECRET if missing.
$briefingSecret = $envVars["DAILY_BRIEFING_SECRET"]
if (-not $briefingSecret) {
  Write-Host ""
  Write-Host "Generating DAILY_BRIEFING_SECRET (64 hex chars)..." -ForegroundColor Cyan
  $bytes = New-Object Byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $briefingSecret = -join ($bytes | ForEach-Object { $_.ToString("x2") })
  Write-Host "  Generated (save this somewhere if you want to curl-test):"
  Write-Host ("  " + $briefingSecret) -ForegroundColor Gray
}

Write-Host ""
if ($missing.Count -gt 0) {
  Write-Host "Note: missing keys will be skipped." -ForegroundColor Yellow
  Write-Host "If you do not use push notifications yet, the VAPID_* keys can stay missing; push-send/push-subscribe will simply not work until you add them." -ForegroundColor Yellow
  Write-Host ""
}

Write-Host "Pushing secrets to Supabase..." -ForegroundColor Cyan

foreach ($key in $present) {
  $val = $envVars[$key]
  Write-Host ("  -> " + $key) -ForegroundColor Gray
  supabase secrets set ($key + "=" + $val) | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Error ("Failed to set " + $key)
    exit 1
  }
}

Write-Host "  -> DAILY_BRIEFING_SECRET" -ForegroundColor Gray
supabase secrets set ("DAILY_BRIEFING_SECRET=" + $briefingSecret) | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Error "Failed to set DAILY_BRIEFING_SECRET"
  exit 1
}

# If we generated a new secret, append it to .env.local so the value
# is preserved for the next run.
if (-not $envVars.ContainsKey("DAILY_BRIEFING_SECRET")) {
  Add-Content -Path $EnvFile -Value ""
  Add-Content -Path $EnvFile -Value "# Added by set-supabase-secrets.ps1"
  Add-Content -Path $EnvFile -Value ("DAILY_BRIEFING_SECRET=" + $briefingSecret)
  Write-Host ""
  Write-Host ("  (also appended DAILY_BRIEFING_SECRET to " + $EnvFile + ")") -ForegroundColor Gray
}

Write-Host ""
Write-Host "Done. Verify with: supabase secrets list" -ForegroundColor Green
