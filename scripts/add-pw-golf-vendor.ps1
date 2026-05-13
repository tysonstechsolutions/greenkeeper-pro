# One-off: insert P&W Golf Supply LLC (dba Wittek Golf) vendor + attach 889.
$ErrorActionPreference = "Stop"

$id = [guid]::NewGuid().ToString().ToLower()
$ts = [int64]([DateTime]::UtcNow - (Get-Date '1970-01-01')).TotalMilliseconds
$path = "889-forms/$id/889-$ts.pdf"
$pdf = "C:\Users\tyson\Desktop\Job Documents\889s\Wittek Golf 889.pdf"

Write-Output "VENDOR_ID=$id"
Write-Output "STORAGE_PATH=$path"

# Upload to vendor-files bucket
npx supabase storage cp $pdf "ss:///vendor-files/$path" --linked

# Write the INSERT statement to a temp file
$sql = @"
INSERT INTO vendors (
  id, name, company, poc, category, supplies,
  section_889_path, section_889_filename,
  section_889_expiration_date, section_889_uploaded_at
) VALUES (
  '$id',
  'P&W Golf Supply LLC',
  'Wittek Golf',
  'Jhovany Diaz',
  'general',
  'Golf course supplies, equipment, accessories',
  '$path',
  'Wittek Golf 889.pdf',
  '2026-10-01',
  NOW()
);
"@

$tmp = "$env:TEMP\insert-pw-golf.sql"
Set-Content -Path $tmp -Value $sql -Encoding utf8
Write-Output "--- SQL ---"
Write-Output $sql

# Run via supabase db query (it reads from stdin)
Get-Content $tmp | npx supabase db query --linked
Remove-Item $tmp
