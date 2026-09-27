# 生成扩展图标（纯本地绘制，无外部素材）。
# 用法：powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\make-icons.ps1
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $here "..\icons"
New-Item -ItemType Directory -Force -Path $out | Out-Null

function New-Icon([int]$s, [string]$path) {
  $bmp = New-Object System.Drawing.Bitmap $s, $s
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  $k = $s / 128.0

  # 深色描边底圆
  $outline = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 59, 42, 24))
  $g.FillEllipse($outline, (4 * $k), (4 * $k), (120 * $k), (120 * $k))

  # 饼干主体
  $body = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 224, 168, 94))
  $g.FillEllipse($body, (10 * $k), (10 * $k), (108 * $k), (108 * $k))

  # 巧克力碎
  $chip = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 94, 60, 30))
  $chips = @(
    @(34, 38, 20), @(70, 30, 18), @(58, 74, 22),
    @(84, 58, 16), @(40, 78, 14), @(76, 88, 18)
  )
  foreach ($c in $chips) {
    $g.FillEllipse($chip, ($c[0] * $k), ($c[1] * $k), ($c[2] * $k), ($c[2] * $k))
  }

  # 高光
  $shine = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(70, 255, 255, 255))
  $g.FillEllipse($shine, (28 * $k), (22 * $k), (30 * $k), (16 * $k))

  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

New-Icon 16  (Join-Path $out "icon16.png")
New-Icon 32  (Join-Path $out "icon32.png")
New-Icon 48  (Join-Path $out "icon48.png")
New-Icon 128 (Join-Path $out "icon128.png")
Write-Host "icons written to $out"
