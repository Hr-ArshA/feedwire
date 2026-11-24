# Restore a dump produced by backup.ps1.
# Usage: powershell -File scripts/restore.ps1 -File .\backups\feedwire-....sql.gz
param([Parameter(Mandatory = $true)][string]$File)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $File)) { throw "Dump not found: $File" }
Write-Host "Restoring $File into feedwire-db"
Get-Content -LiteralPath $File -Encoding Byte | docker exec -i feedwire-db gunzip |
  docker exec -i feedwire-db psql -U feedwire -d feedwire -v ON_ERROR_STOP=1
Write-Host 'Restore complete.'
