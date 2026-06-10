## continuous_sync.ps1
# PowerShell script that runs sync_repo.ps1 every 30 seconds indefinitely.
# Use with: powershell -NoProfile -ExecutionPolicy Bypass -File ./continuous_sync.ps1

while ($true) {
    & "./sync_repo.ps1"
    if ($LASTEXITCODE -ne 0) {
        Write-Error "sync_repo.ps1 failed with exit code $LASTEXITCODE. Stopping loop."
        exit $LASTEXITCODE
    }
    Start-Sleep -Seconds 30
}
