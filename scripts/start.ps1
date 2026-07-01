$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
docker compose up --build -d
Write-Host "App running at http://localhost:8000"
