param(
    [string]$srcPath = "icon_source.png"
)

Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force -Path "icons" | Out-Null

if (-not (Test-Path $srcPath)) {
    Write-Warning "Source icon not found at '$srcPath'. Provide a path using: .\create_icons.ps1 -srcPath <path-to-image>"
    exit 0
}

$src = [System.Drawing.Image]::FromFile((Resolve-Path $srcPath))

foreach ($size in @(16, 48, 128)) {
    $dest = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($dest)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.DrawImage($src, 0, 0, $size, $size)
    $g.Dispose()
    $destPath = "icons/icon$size.png"
    $dest.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $dest.Dispose()
    Write-Host "Created $destPath"
}
$src.Dispose()
