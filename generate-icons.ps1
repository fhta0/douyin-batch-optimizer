# 生成Chrome插件图标
# 使用PowerShell和.NET

Add-Type -AssemblyName System.Drawing

function Create-Icon {
    param(
        [int]$Size,
        [string]$OutputPath
    )
    
    # 创建位图
    $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
    
    # 绘制渐变背景
    $cornerRadius = $Size / 6
    
    # 创建渐变画笔
    $gradientRect = New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)
    $gradientBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $gradientRect,
        [System.Drawing.Color]::FromArgb(102, 126, 234),  # #667eea
        [System.Drawing.Color]::FromArgb(118, 75, 162),   # #764ba2
        45.0
    )
    
    # 绘制圆角矩形
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, $cornerRadius * 2, $cornerRadius * 2, 180, 90)
    $path.AddArc($Size - $cornerRadius * 2, 0, $cornerRadius * 2, $cornerRadius * 2, 270, 90)
    $path.AddArc($Size - $cornerRadius * 2, $Size - $cornerRadius * 2, $cornerRadius * 2, $cornerRadius * 2, 0, 90)
    $path.AddArc(0, $Size - $cornerRadius * 2, $cornerRadius * 2, $cornerRadius * 2, 90, 90)
    $path.CloseFigure()
    
    $graphics.FillPath($gradientBrush, $path)
    
    # 绘制文字
    $fontSize = [int]($Size * 0.55)
    $font = New-Object System.Drawing.Font("Arial", $fontSize, [System.Drawing.FontStyle]::Bold)
    $text = "抖"
    
    # 测量文字尺寸
    $textSize = $graphics.MeasureString($text, $font)
    $x = ($Size - $textSize.Width) / 2
    $y = ($Size - $textSize.Height) / 2 - $Size / 20
    
    # 绘制文字
    $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $graphics.DrawString($text, $font, $textBrush, $x, $y)
    
    # 保存
    $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    
    # 清理
    $graphics.Dispose()
    $bitmap.Dispose()
    $gradientBrush.Dispose()
    $textBrush.Dispose()
    $font.Dispose()
    $path.Dispose()
    
    Write-Host "✅ 已生成: $OutputPath (${Size}x${Size})" -ForegroundColor Green
}

# 主程序
Write-Host "🚀 开始生成Chrome插件图标..." -ForegroundColor Cyan
Write-Host ""

$sizes = @(16, 48, 128)
foreach ($size in $sizes) {
    $outputPath = "icon${size}.png"
    Create-Icon -Size $size -OutputPath $outputPath
}

Write-Host ""
Write-Host "🎉 所有图标生成完成！" -ForegroundColor Green
Write-Host ""
Write-Host "📦 接下来请按照INSTALL.html中的步骤安装插件" -ForegroundColor Yellow
