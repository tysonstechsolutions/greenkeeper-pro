# add-pin-user.ps1
#
# Admin helper: creates a PIN-authenticated user end-to-end.
#   1. Creates the auth.users row (synthetic email, shared PIN_USER_PASSWORD)
#   2. Upserts the profiles row
#   3. Inserts the pin_codes row
#
# Requires: SUPABASE_SERVICE_ROLE_KEY in .env.local (it should be there already
# under NEXT_SUPABASE_SERVICE_ROLE_KEY or similar).
#
# Usage:
#   .\scripts\add-pin-user.ps1 -FullName "Tyson Smith" -Pin "1234" -Role "super"
#
# Roles: super, asst_super, foreman, mechanic, crew, seasonal, pro, director

param(
  [Parameter(Mandatory=$true)][string]$FullName,
  [Parameter(Mandatory=$true)][string]$Pin,
  [Parameter(Mandatory=$true)][string]$Role,
  [string]$Phone = "",
  [string]$EnvFile = ".env.local"
)

$ErrorActionPreference = "Stop"

if ($Pin -notmatch '^\d{4,6}$') {
  Write-Error "PIN must be 4-6 digits"
}

$validRoles = @("super","asst_super","foreman","mechanic","crew","seasonal","pro","director","gm","superintendent","assistant_superintendent","technician","operator","crew_member")
if ($validRoles -notcontains $Role) {
  Write-Error ("Role must be one of: " + ($validRoles -join ", "))
}

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

$supabaseUrl = $envVars["NEXT_PUBLIC_SUPABASE_URL"]
# Service-role key may be named differently — check the usual suspects.
$serviceKey = $envVars["SUPABASE_SERVICE_ROLE_KEY"]
if (-not $serviceKey) { $serviceKey = $envVars["NEXT_SUPABASE_SERVICE_ROLE_KEY"] }
if (-not $serviceKey) { $serviceKey = $envVars["SUPABASE_SERVICE_KEY"] }
$pinPassword = $envVars["PIN_USER_PASSWORD"]

if (-not $supabaseUrl) { Write-Error "NEXT_PUBLIC_SUPABASE_URL is missing in $EnvFile" }
if (-not $serviceKey)  {
  Write-Error @"
SUPABASE_SERVICE_ROLE_KEY is missing in $EnvFile.

Get it from Supabase dashboard -> Project Settings -> API -> service_role key
(it's the 'secret' one — DO NOT share it), then add to .env.local:
  SUPABASE_SERVICE_ROLE_KEY=eyJ...
"@
}
if (-not $pinPassword) { Write-Error "PIN_USER_PASSWORD is missing in $EnvFile" }

# Build synthetic email
function Slugify([string]$s) {
  $s = $s.ToLower() -replace '[^a-z0-9]+', ''
  if ($s.Length -gt 24) { $s = $s.Substring(0, 24) }
  if ([string]::IsNullOrEmpty($s)) { $s = "user" }
  return $s
}
$email = ("{0}.{1}@vmgc.mil" -f (Slugify $FullName), $Pin)

Write-Host ""
Write-Host ("Creating user: {0}" -f $FullName) -ForegroundColor Cyan
Write-Host ("  Email  : {0}" -f $email) -ForegroundColor Gray
Write-Host ("  PIN    : {0}" -f $Pin) -ForegroundColor Gray
Write-Host ("  Role   : {0}" -f $Role) -ForegroundColor Gray
Write-Host ""

$headers = @{
  "apikey"        = $serviceKey
  "Authorization" = "Bearer $serviceKey"
  "Content-Type"  = "application/json"
  "Prefer"        = "return=representation"
}

# Step 1: Create auth user via Admin API
$createBody = @{
  email         = $email
  password      = $pinPassword
  email_confirm = $true
  user_metadata = @{
    full_name = $FullName
    role      = $Role
  }
} | ConvertTo-Json -Depth 4

try {
  $authResp = Invoke-RestMethod -Uri "$supabaseUrl/auth/v1/admin/users" -Method Post -Headers $headers -Body $createBody
  $userId = $authResp.id
  Write-Host ("  [x] auth.users row created: {0}" -f $userId) -ForegroundColor Green
} catch {
  $errText = $_.ErrorDetails.Message
  if ($errText -match "already.*(registered|exists)" -or $errText -match "User already registered") {
    Write-Host "  [!] User with that email already exists — looking them up..." -ForegroundColor Yellow
    $lookup = Invoke-RestMethod -Uri ("{0}/auth/v1/admin/users?email={1}" -f $supabaseUrl, [uri]::EscapeDataString($email)) -Method Get -Headers $headers
    $userId = $lookup.users[0].id
    Write-Host ("  [x] reusing existing user: {0}" -f $userId) -ForegroundColor Green
  } else {
    Write-Error ("Failed to create auth user: " + $errText)
  }
}

# Step 2: Upsert profile
$profileBody = @(
  @{
    id         = $userId
    email      = $email
    full_name  = $FullName
    phone      = if ($Phone) { $Phone } else { $null }
    role       = $Role
    is_active  = $true
  }
) | ConvertTo-Json -Depth 4

$profileHeaders = $headers.Clone()
$profileHeaders["Prefer"] = "return=representation,resolution=merge-duplicates"

try {
  Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/profiles?on_conflict=id" -Method Post -Headers $profileHeaders -Body $profileBody | Out-Null
  Write-Host "  [x] profiles row upserted" -ForegroundColor Green
} catch {
  Write-Error ("Failed to upsert profile: " + $_.ErrorDetails.Message)
}

# Step 3: Insert pin_codes row (deactivate any prior PIN for this user first)
try {
  Invoke-RestMethod -Uri ("{0}/rest/v1/pin_codes?user_id=eq.{1}" -f $supabaseUrl, $userId) `
                    -Method Patch -Headers $headers `
                    -Body (@{ is_active = $false } | ConvertTo-Json) | Out-Null
} catch {
  # no prior rows — ignore
}

$pinBody = @(
  @{
    pin       = $Pin
    user_id   = $userId
    is_active = $true
  }
) | ConvertTo-Json -Depth 4

try {
  Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/pin_codes" -Method Post -Headers $headers -Body $pinBody | Out-Null
  Write-Host "  [x] pin_codes row created" -ForegroundColor Green
} catch {
  $errText = $_.ErrorDetails.Message
  if ($errText -match "duplicate key" -or $errText -match "23505") {
    Write-Error "That PIN is already in use by another user. Pick a different one."
  } else {
    Write-Error ("Failed to insert pin_codes: " + $errText)
  }
}

Write-Host ""
Write-Host "Done. The user can now sign in with PIN:" -ForegroundColor Green
Write-Host ("  {0}" -f $Pin) -ForegroundColor Green
