const fs = require('fs');
const path = require('path');

// 简单的PNG生成器（不依赖canvas库）
function createSimplePNG(width, height, color) {
    // PNG文件头
    const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    
    // 创建简单的PNG数据（纯色）
    // 这里创建一个简单的PNG，实际使用时建议用canvas库
    
    // 由于Node.js没有内置canvas，我们创建一个base64编码的简单PNG
    // 这是一个1x1像素的紫色PNG，会被拉伸
    const purplePixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
    
    return Buffer.from(purplePixel, 'base64');
}

// 生成图标
function generateIcons() {
    const sizes = [16, 48, 128];
    
    console.log('Generating icons...');
    
    sizes.forEach(size => {
        const pngBuffer = createSimplePNG(size, size, '#667eea');
        fs.writeFileSync(`icon${size}.png`, pngBuffer);
        console.log(`Created: icon${size}.png`);
    });
    
    console.log('Done!');
}

generateIcons();
