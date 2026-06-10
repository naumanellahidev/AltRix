while ($true) {
  Write-Host "[AutoSync] Pulling latest changes..."
  git pull origin main
  $status = git status --porcelain
  if ($status) {
    Write-Host "[AutoSync] Committing local changes..."
    git add .
    $msg = "auto-sync $(Get-Date -Format o)"
    git commit -m "$msg"
    git push origin main
  } else {
    Write-Host "[AutoSync] No local changes to commit."
  }
  Start-Sleep -Seconds 30
}
