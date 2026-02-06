#!/usr/bin/env pwsh

$ErrorActionPreference = "Stop"

Write-Host "Starting git push process..." -ForegroundColor Green

# Change to project directory
Push-Location "C:\Users\B_Sinclair\Desktop\ace-fixings-app-vite"

try {
    Write-Host "Fetching from remote..." -ForegroundColor Cyan
    & git fetch origin main 2>&1 | Write-Host
    
    Write-Host "`nGetting current status..." -ForegroundColor Cyan
    & git status -s 2>&1 | Write-Host
    
    Write-Host "`nShowing last 2 commits..." -ForegroundColor Cyan
    & git log --oneline -2 2>&1 | Write-Host
    
    Write-Host "`nMerging origin/main..." -ForegroundColor Cyan
    & git merge origin/main --no-edit 2>&1 | Write-Host
    
    Write-Host "`nPushing to GitHub..." -ForegroundColor Cyan
    & git push origin main 2>&1 | Write-Host
    
    Write-Host "`nPush completed successfully!" -ForegroundColor Green
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
} finally {
    Pop-Location
}
