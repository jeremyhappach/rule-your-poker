param([string]$Evidence = 'qualification.local/blue-hour', [string]$Reference = 'C:/Users/jerem/Downloads/Holm and Cribbage, Three Midnight Themes.png')
Add-Type -AssemblyName System.Drawing
$outDir = (Resolve-Path -LiteralPath $Evidence).Path
$holm = [Drawing.Image]::FromFile((Join-Path $outDir 'holm-390.jpg'))
$crib = [Drawing.Image]::FromFile((Join-Path $outDir 'cribbage-390.jpg'))
$approved = [Drawing.Image]::FromFile($Reference)
$font = [Drawing.Font]::new('Segoe UI', 16)
$small = [Drawing.Font]::new('Segoe UI', 11)
$ivory = [Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(240,234,222))
$brass = [Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(210,180,119))
function New-Board([int]$width) {
  $bitmap = [Drawing.Bitmap]::new($width, 920)
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear([Drawing.Color]::FromArgb(7,19,32))
  $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  return @($bitmap, $graphics)
}
try {
  $board, $g = New-Board 828
  $g.DrawString('Holm · Blue Hour', $font, $brass, 16, 10)
  $g.DrawString('Cribbage · Blue Hour', $font, $brass, 422, 10)
  $g.DrawImage($holm, 16, 46, 390, 844)
  $g.DrawImage($crib, 422, 46, 390, 844)
  $g.DrawString('390 × 844 · real components / local fixture · unchanged gameplay geometry', $small, $ivory, 16, 896)
  $board.Save((Join-Path $outDir 'blue-hour-phone-comparison.png'), [Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $board.Dispose()

  $board, $g = New-Board 1640
  $g.DrawString('Approved Blue Hour · Holm', $font, $brass, 16, 10)
  $g.DrawString('Rendered Holm', $font, $brass, 422, 10)
  $g.DrawString('Approved Blue Hour · Cribbage', $font, $brass, 828, 10)
  $g.DrawString('Rendered Cribbage', $font, $brass, 1234, 10)
  # Crop only the supplied center-column phone contents; preserve aspect ratio.
  $g.DrawImage($approved, [Drawing.Rectangle]::new(16,46,390,644), 452,108,323,533,[Drawing.GraphicsUnit]::Pixel)
  $g.DrawImage($holm, 422,46,390,844)
  $g.DrawImage($approved, [Drawing.Rectangle]::new(828,46,390,644), 452,718,323,533,[Drawing.GraphicsUnit]::Pixel)
  $g.DrawImage($crib, 1234,46,390,844)
  $g.DrawString('Reference specifies finish. Existing game geometry, rim, artifacts and controls are retained.', $small, $ivory, 16, 896)
  $board.Save((Join-Path $outDir 'blue-hour-reference-comparison.png'), [Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $board.Dispose()
} finally { $holm.Dispose(); $crib.Dispose(); $approved.Dispose(); $font.Dispose(); $small.Dispose(); $ivory.Dispose(); $brass.Dispose() }
