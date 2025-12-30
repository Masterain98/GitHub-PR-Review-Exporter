# GitHub PR Review Exporter - Build Script
# This script packages the Chrome extension for publishing

# Get script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Read version from manifest.json
$ManifestPath = Join-Path $ScriptDir "manifest.json"
$Manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
$Version = $Manifest.version

# Define output zip file path (in project root)
$ZipFileName = "GitHub-PR-Review-Exporter.zip"
$ZipFilePath = Join-Path $ScriptDir $ZipFileName

# Remove existing zip file if it exists
if (Test-Path $ZipFilePath) {
    Remove-Item $ZipFilePath -Force
    Write-Host "Removed existing $ZipFileName" -ForegroundColor DarkGray
}

# Define files to include in the package
$FilesToInclude = @(
    "manifest.json",
    "content.js",
    "popup.html",
    "popup.js",
    "style.css"
)

# Define directories to include
$DirsToInclude = @(
    "icons"
)

# Create a temporary directory for staging
$TempDir = Join-Path $env:TEMP "github-pr-review-exporter-build-$(Get-Date -Format 'yyyyMMddHHmmss')"
New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

try {
    Write-Host "Building GitHub PR Review Exporter v$Version..." -ForegroundColor Cyan
    Write-Host ""

    # Copy files
    Write-Host "Copying files..." -ForegroundColor Yellow
    foreach ($File in $FilesToInclude) {
        $SourcePath = Join-Path $ScriptDir $File
        if (Test-Path $SourcePath) {
            Copy-Item $SourcePath -Destination $TempDir
            Write-Host "  + $File" -ForegroundColor Green
        } else {
            Write-Host "  ! $File not found, skipping" -ForegroundColor Red
        }
    }

    # Copy directories
    foreach ($Dir in $DirsToInclude) {
        $SourcePath = Join-Path $ScriptDir $Dir
        if (Test-Path $SourcePath) {
            $DestPath = Join-Path $TempDir $Dir
            Copy-Item $SourcePath -Destination $DestPath -Recurse
            
            # Count files in directory (exclude source/large files)
            $FileCount = (Get-ChildItem $DestPath -File | Where-Object { 
                $_.Name -notlike "*512*" -and $_.Name -notlike "*.psd" 
            }).Count
            Write-Host "  + $Dir/ ($FileCount files)" -ForegroundColor Green
            
            # Remove unnecessary files from icons directory
            $LargeIconPath = Join-Path $DestPath "logov2-512.png"
            if (Test-Path $LargeIconPath) {
                Remove-Item $LargeIconPath -Force
                Write-Host "    - Removed logov2-512.png (not needed for extension)" -ForegroundColor DarkGray
            }
        } else {
            Write-Host "  ! $Dir not found, skipping" -ForegroundColor Red
        }
    }

    Write-Host ""
    Write-Host "Creating zip package..." -ForegroundColor Yellow

    # Create zip file
    Compress-Archive -Path "$TempDir\*" -DestinationPath $ZipFilePath -Force

    # Get zip file size
    $ZipSize = (Get-Item $ZipFilePath).Length
    $ZipSizeKB = [math]::Round($ZipSize / 1024, 2)

    Write-Host ""
    Write-Host "Build completed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Output: $ZipFilePath" -ForegroundColor White
    Write-Host "Size:   $ZipSizeKB KB" -ForegroundColor White
    Write-Host ""
    Write-Host "Contents:" -ForegroundColor Cyan
    
    # List contents of the zip
    $ZipContents = [System.IO.Compression.ZipFile]::OpenRead($ZipFilePath)
    foreach ($Entry in $ZipContents.Entries) {
        $Size = [math]::Round($Entry.Length / 1024, 2)
        Write-Host "  - $($Entry.FullName) ($Size KB)" -ForegroundColor Gray
    }
    $ZipContents.Dispose()

    Write-Host ""
    Write-Host "Ready to upload to Chrome Web Store!" -ForegroundColor Cyan

} finally {
    # Clean up temp directory
    if (Test-Path $TempDir) {
        Remove-Item $TempDir -Recurse -Force
    }
}
