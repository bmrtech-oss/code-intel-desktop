Param(
  [Parameter(Mandatory=$true)] [string]$PfxPath,
  [string]$OutFile = "cert.pfx.base64"
)

if (-not (Test-Path $PfxPath)) {
  Write-Error "File not found: $PfxPath"
  exit 2
}

$bytes = [System.IO.File]::ReadAllBytes($PfxPath)
[Convert]::ToBase64String($bytes) | Out-File -Encoding ascii $OutFile
Write-Host "Wrote $OutFile"
Write-Host "Copy the following value into the WIN_SIGNING_CERT secret (base64):"
Get-Content $OutFile

Write-Host "Example gh CLI commands to set secrets (run locally):"
Write-Host "gh secret set WIN_SIGNING_CERT --body \"$(Get-Content $OutFile -Raw)\""
Write-Host "gh secret set WIN_SIGNING_PASSWORD --body \"<PFX_PASSWORD>\""
