# test-pin-login.ps1
#
# Hits the deployed pin-login edge function directly and prints the raw
# response. Use this when the UI gives a generic "non-2xx" error and you
# need to see the actual server message.
#
# Usage (from project root):
#   .\scripts\test-pin-login.ps1 -Pin 1234

param(
  [Parameter(Mandatory=$true)][string]$Pin,
  [string]$EnvFile = ".env.local"
)

$ErrorActionPreference = "Stop"

# Parse .env.local
$envVars = @{}
Get-Content $EnvFile | ForEach-Object {
  $line = $_.Trim()
  if ($line.StartsWith("#") -or $line -eq "") { return }
  if ($line -match '^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$') {
    $v = $matches[2]
    if ($v.StartsWith('"') -and $v.EndsWith('"')) { $v = $v.Substring(1, $v.Length - 2) }
    $envVars[$matches[1]] = $v
  }
}

$url    = $envVars["NEXT_PUBLIC_SUPABASE_URL"]
$anon   = $envVars["NEXT_PUBLIC_SUPABASE_ANON_KEY"]

if (-not $url)  { Write-Error "NEXT_PUBLIC_SUPABASE_URL missing in $EnvFile" }
if (-not $anon) { Write-Error "NEXT_PUBLIC_SUPABASE_ANON_KEY missing in $EnvFile" }

$endpoint = "$url/functions/v1/pin-login"
Write-Host ("POST {0}" -f $endpoint) -ForegroundColor Cyan
Write-Host ("  pin: {0}" -f $Pin) -ForegroundColor Gray
Write-Host ""

$headers = @{
  "apikey"        = $anon
  "Authorization" = "Bearer $anon"
  "Content-Type"  = "application/json"
}

$body = @{ pin = $Pin } | ConvertTo-Json

try {
  $resp = Invoke-RestMethod -Uri $endpoint -Method Post -Headers $headers -Body $body
  Write-Host "Response (200):" -ForegroundColor Green
  $resp | ConvertTo-Json -Depth 5
} catch {
  $status = $null
  $bodyText = $null
  if ($_.Exception.Response) {
    $status = [int]$_.Exception.Response.StatusCode
    try {
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $bodyText = $reader.ReadToEnd()
    } catch { $bodyText = "(could not read response body)" }
  } else {
    $bodyText = $_.Exception.Message
  }
  Write-Host ("Response ({0}):" -f $status) -ForegroundColor Red
  Write-Host $bodyText
}
