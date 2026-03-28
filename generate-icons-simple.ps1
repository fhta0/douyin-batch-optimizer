# Generate Chrome Extension Icons
Add-Type -AssemblyName System.Drawing

function Create-Icon {
    param([int]$Size, [string]$OutputPath)
    
    $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    
    # Fill with purple color
    $graphics.Clear([System.Drawing.Color]::FromArgb(102, 126, 234))
    
    # Draw text
    $fontSize = [int]($Size * 0.5)
    $font = New-Object System.Drawing.Font("Arial", $fontSize, [System.Drawing.FontStyle]::Bold)
    $text = "D"
    
    $textSize = $graphics.MeasureString($text, $font)
    $x = ($Size - $textSize.Width) / 2
    $y = ($Size - $textSize.Height) / 2
    
    $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $graphics.DrawString($text, $font, $textBrush, $x, $y)
    
    $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    
    $graphics.Dispose()
    $bitmap.Dispose()
    
    Write-Host "Generated: $OutputPath (${Size}x${Size})"
}

Write-Host "Generating Chrome Extension Icons..."

$sizes = @(16, 48, 128)
foreach ($size in $sizes) {
    Create-Icon -Size $size -OutputPath "icon${size}.png"
}

Write-Host "Done!"
