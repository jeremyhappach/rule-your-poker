# Run from any directory on Windows; uses the built-in System.Drawing library.
# New artwork revisions must use new versioned filenames and update HTML/manifest.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$iconDir = Join-Path $repoRoot 'public/icons'
$masterPath = Join-Path $repoRoot 'assets/branding/ptown-poker-icon-full-bleed.png'
[IO.Directory]::CreateDirectory($iconDir) | Out-Null
$master = [Drawing.Image]::FromFile($masterPath)
$frames = @{}
try {
    foreach ($size in @(16, 32, 48, 180, 192, 512)) {
        $bitmap = [Drawing.Bitmap]::new($size, $size, [Drawing.Imaging.PixelFormat]::Format24bppRgb)
        $graphics = [Drawing.Graphics]::FromImage($bitmap)
        $attributes = [Drawing.Imaging.ImageAttributes]::new()
        $stream = [IO.MemoryStream]::new()
        try {
            $graphics.CompositingQuality = [Drawing.Drawing2D.CompositingQuality]::HighQuality
            $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $attributes.SetWrapMode([Drawing.Drawing2D.WrapMode]::TileFlipXY)
            $graphics.DrawImage($master, [Drawing.Rectangle]::new(0, 0, $size, $size), 0, 0, $master.Width, $master.Height, [Drawing.GraphicsUnit]::Pixel, $attributes)
            $bitmap.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
            $frames[$size] = $stream.ToArray()
            if ($size -ne 48) {
                [IO.File]::WriteAllBytes((Join-Path $iconDir "ptown-poker-v1-$size.png"), $frames[$size])
            }
        } finally {
            $stream.Dispose()
            $attributes.Dispose()
            $graphics.Dispose()
            $bitmap.Dispose()
        }
    }
} finally { $master.Dispose() }

# ICO directory with PNG payloads for the three standard browser sizes.
$icoPath = Join-Path $iconDir 'ptown-poker-v1.ico'
$writer = [IO.BinaryWriter]::new([IO.File]::Create($icoPath))
try {
    $writer.Write([uint16]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]3)
    $offset = 6 + 3 * 16
    foreach ($size in @(16, 32, 48)) {
        $writer.Write([byte]$size)
        $writer.Write([byte]$size)
        $writer.Write([byte]0)
        $writer.Write([byte]0)
        $writer.Write([uint16]1)
        $writer.Write([uint16]24)
        $writer.Write([uint32]$frames[$size].Length)
        $writer.Write([uint32]$offset)
        $offset += $frames[$size].Length
    }
    foreach ($size in @(16, 32, 48)) { $writer.Write([byte[]]$frames[$size]) }
} finally { $writer.Dispose() }

# Fallbacks for browsers that discover the conventional root filenames.
Copy-Item -LiteralPath $icoPath -Destination (Join-Path $repoRoot 'public/favicon.ico')
Copy-Item -LiteralPath (Join-Path $iconDir 'ptown-poker-v1-180.png') -Destination (Join-Path $repoRoot 'public/apple-touch-icon.png')
