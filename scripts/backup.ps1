# Timestamped pg_dump of the Feedwire database.
# Usage: powershell -File scripts/backup.ps1 [-OutDir .\backups]
param(
  [string]$OutDir = (Join-Path $PSScriptRoot '..\backups'),
  [string]$DatabaseUrl = $env:DATABASE_URL
)
$ErrorActionPreference = 'Stop'
if (-not $DatabaseUrl) { $DatabaseUrl = 'postgres://feedwire:feedwire@localhost:5433/feedwire' }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$file = Join-Path $OutDir "feedwire-$stamp.sql.gz"
Write-Host "Dumping to $file"
docker exec feedwire-db pg_dump -U feedwire -d feedwire --no-owner --clean --if-exists |
  gzip | Set-Content -Path $file -Encoding Byte
Write-Host "Done: $file"
