## sync_repo.ps1
# PowerShell script to synchronize local repository with remote (Lovable preview)
# Includes automatic conflict resolution (prefers remote version) during rebase.

$repoPath = $PSScriptRoot
if (-not $repoPath) { $repoPath = Get-Location }
Set-Location $repoPath

Write-Host "--- Starting repository synchronization ---"

# Auto-stage & commit any uncommitted changes
$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Host "Uncommitted changes detected. Staging and committing automatically."
    git add -A
    $timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
    $commitMessage = "Auto-sync commit $timestamp"
    git commit -m $commitMessage
    if ($LASTEXITCODE -ne 0) {
        Write-Error "git commit failed. Resolve issues before retrying."
        exit $LASTEXITCODE
    }
}

git fetch origin

# Determine commit hashes
$localHash = git rev-parse HEAD
$remoteHash = $null
try {
    $remoteHash = git rev-parse "@{u}"
} catch {
    Write-Host "No upstream reference found. Skipping pull."
}
$baseHash = $null
if ($remoteHash) { $baseHash = git merge-base HEAD "@{u}" 2>$null }
if (-not $remoteHash) { $remoteHash = $localHash }

if ($localHash -eq $remoteHash) {
    Write-Host "Repository is up-to-date. No changes to pull or push."
} elseif ($localHash -eq $baseHash) {
    Write-Host "Remote has new commits. Pulling with rebase..."
    git pull --rebase
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Rebase failed - attempting automatic conflict resolution (remote wins)."
        # List conflicted files
        $conflicted = git diff --name-only --diff-filter=U
        foreach ($file in $conflicted) {
            Write-Host "Resolving conflict for $file with remote version."
            git checkout --theirs $file
            git add $file
        }
        git rebase --continue
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Rebase continue failed. Aborting rebase."
            git rebase --abort
            exit $LASTEXITCODE
        }
        Write-Host "Rebase completed after conflict resolution."
    }
    # After successful rebase, push any new local commits
    git push origin HEAD
    if ($LASTEXITCODE -ne 0) {
        Write-Error "git push failed after rebase."
        exit $LASTEXITCODE
    }
    Write-Host "Push complete."
} elseif ($remoteHash -eq $baseHash) {
    Write-Host "Local has new commits. Pushing..."
    git push origin HEAD
    if ($LASTEXITCODE -ne 0) {
        Write-Error "git push failed. Check remote access."
        exit $LASTEXITCODE
    }
    Write-Host "Push complete."
} else {
    Write-Warning "Both local and remote have diverged. Attempting automatic merge (remote wins)."
    git pull --rebase
    if ($LASTEXITCODE -ne 0) {
        $conflicted = git diff --name-only --diff-filter=U
        foreach ($file in $conflicted) {
            git checkout --theirs $file
            git add $file
        }
        git rebase --continue
        if ($LASTEXITCODE -ne 0) { git rebase --abort; exit $LASTEXITCODE }
    }
    git push origin HEAD
    if ($LASTEXITCODE -ne 0) { Write-Error "Push after merge failed."; exit $LASTEXITCODE }
}

Write-Host "--- Synchronization finished ---"
exit 0
