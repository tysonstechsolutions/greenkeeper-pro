$ErrorActionPreference = "Stop"
$src = "C:\Users\tyson\Desktop\Job Documents\889s\Wittek Golf 889.pdf"
$staging = Join-Path $env:TEMP "wittek-889.pdf"
Copy-Item -LiteralPath $src -Destination $staging -Force
Write-Output "Copied to staging: $staging ($(Get-Item $staging).Length bytes)"

$dst = "ss:///vendor-files/889-forms/0af817f5-3b6e-4cde-abcf-12bebc33ee15/889-1778697540471.pdf"
npx supabase storage cp $staging $dst --linked --experimental
