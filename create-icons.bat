@echo off
chcp 65001

:: Create icon16.png using ImageMagick (if available)
:: If not available, create a simple colored square

echo Creating icons...

:: Try to use PowerShell with System.Drawing
powershell -Command "Add-Type -AssemblyName System.Drawing; $b=New-Object System.Drawing.Bitmap(16,16); $g=[System.Drawing.Graphics]::FromImage($b); $g.Clear([System.Drawing.Color]::FromArgb(102,126,234)); $b.Save('icon16.png'); $g.Dispose(); $b.Dispose();"
powershell -Command "Add-Type -AssemblyName System.Drawing; $b=New-Object System.Drawing.Bitmap(48,48); $g=[System.Drawing.Graphics]::FromImage($b); $g.Clear([System.Drawing.Color]::FromArgb(102,126,234)); $b.Save('icon48.png'); $g.Dispose(); $b.Dispose();"
powershell -Command "Add-Type -AssemblyName System.Drawing; $b=New-Object System.Drawing.Bitmap(128,128); $g=[System.Drawing.Graphics]::FromImage($b); $g.Clear([System.Drawing.Color]::FromArgb(102,126,234)); $b.Save('icon128.png'); $g.Dispose(); $b.Dispose();"

echo Done!
pause
