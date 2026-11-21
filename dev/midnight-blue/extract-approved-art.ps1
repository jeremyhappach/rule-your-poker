Add-Type -AssemblyName System.Drawing
$references = 'C:/Users/jerem/Downloads/P-Town-Poker-Midnight-Blue-review/mockups'
$output = Join-Path $PSScriptRoot '../../public/game-branding'
$rawOutput = Join-Path $PSScriptRoot '../../qualification.local/approved-source-regions'
[System.IO.Directory]::CreateDirectory($rawOutput) | Out-Null
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
$quality = [System.Drawing.Imaging.EncoderParameters]::new(1)
$quality.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new([System.Drawing.Imaging.Encoder]::Quality,[long]88)
function Export-Region($source,$name,$x,$y,$width,$height) {
 $image = [System.Drawing.Bitmap]::FromFile((Join-Path $references $source))
 $region = $image.Clone([System.Drawing.Rectangle]::new($x,$y,$width,$height),$image.PixelFormat)
 $region.Save((Join-Path $output ($name+'.jpg')),$codec,$quality)
 $region.Save((Join-Path $rawOutput ($name+'.png')),[System.Drawing.Imaging.ImageFormat]::Png)
 $region.Dispose()
 $image.Dispose()
}
# Only art regions: no mockup controls, device frame, status bar or example values.
Export-Region '02-Multiplayer-Selector.png' 'approved-picker-crown' 32 73 454 96
Export-Region '02-Multiplayer-Selector.png' 'approved-midnight-texture' 551 746 425 135
Export-Region '03-Holm-Setup.png' 'approved-scene-glow' 800 244 95 165
Export-Region '03-Holm-Setup.png' 'approved-scene-light' 30 244 210 220
Export-Region '03-Holm-Setup.png' 'approved-scene-table' 115 411 125 53
Export-Region '04-Multiplayer-Setup-Examples.png' 'approved-357-art' 29 211 280 195
Export-Region '04-Multiplayer-Setup-Examples.png' 'approved-cribbage-art' 348 207 279 191
Export-Region '04-Multiplayer-Setup-Examples.png' 'approved-gin-art' 665 208 279 201
Export-Region '04-Multiplayer-Setup-Examples.png' 'approved-horses-art' 984 207 278 211
Export-Region '04-Multiplayer-Setup-Examples.png' 'approved-yahtzee-art' 1301 267 279 108
Export-Region '04-Multiplayer-Setup-Examples.png' 'approved-run21-art' 1623 211 278 205
Export-Region '02-Multiplayer-Selector.png' 'approved-picker-357' 330 386 153 117
Export-Region '02-Multiplayer-Selector.png' 'approved-picker-cribbage' 57 579 199 93
Export-Region '02-Multiplayer-Selector.png' 'approved-picker-gin' 323 569 158 103
Export-Region '02-Multiplayer-Selector.png' 'approved-picker-canasta' 81 746 175 90
Export-Region '02-Multiplayer-Selector.png' 'approved-picker-golf' 339 739 143 97
Export-Region '02-Multiplayer-Selector.png' 'approved-picker-horses' 573 390 186 153
Export-Region '02-Multiplayer-Selector.png' 'approved-picker-scc' 800 390 184 153
Export-Region '02-Multiplayer-Selector.png' 'approved-picker-yahtzee' 550 632 210 65
Export-Region '02-Multiplayer-Selector.png' 'approved-picker-farkle' 805 628 179 95
Export-Region '02-Multiplayer-Selector.png' 'approved-picker-chess' 1200 325 71 65
Export-Region '02-Multiplayer-Selector.png' 'approved-picker-words' 1417 325 80 65
Export-Region '02-Multiplayer-Selector.png' 'approved-picker-run21' 1163 405 107 63
Export-Region '02-Multiplayer-Selector.png' 'approved-picker-tri' 1388 405 110 63
Export-Region '02-Multiplayer-Selector.png' 'approved-picker-eleven' 1162 479 108 61
Export-Region '02-Multiplayer-Selector.png' 'approved-picker-boxdrop' 1413 479 85 62
Export-Region '02-Multiplayer-Selector.png' 'approved-picker-trip' 1175 549 95 64
Export-Region '02-Multiplayer-Selector.png' 'approved-picker-take' 1406 550 93 62
Export-Region '02-Multiplayer-Selector.png' 'approved-picker-royal' 1201 622 68 59
Export-Region '02-Multiplayer-Selector.png' 'approved-picker-race' 1400 621 100 60
Export-Region '02-Multiplayer-Selector.png' 'approved-picker-crib-lab' 1401 691 98 60
Export-Region '02-Multiplayer-Selector.png' 'approved-picker-quintzee' 1401 761 98 63
Export-Region '03-Holm-Setup.png' 'holm-approved-cards' 250 267 540 181
$quality.Dispose()
