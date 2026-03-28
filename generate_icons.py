#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成Chrome插件图标
需要安装Pillow库: pip install Pillow
"""

from PIL import Image, ImageDraw, ImageFont
import os

def create_icon(size, output_path):
    """创建指定尺寸的图标"""
    # 创建图片
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 绘制渐变背景（简化版，使用纯色）
    # 创建圆角矩形
    corner_radius = size // 6
    
    # 绘制渐变背景（使用紫色）
    for y in range(size):
        for x in range(size):
            # 检查是否在圆角矩形内
            if (x < corner_radius and y < corner_radius and 
                (x - corner_radius)**2 + (y - corner_radius)**2 > corner_radius**2):
                continue
            if (x > size - corner_radius and y < corner_radius and 
                (x - (size - corner_radius))**2 + (y - corner_radius)**2 > corner_radius**2):
                continue
            if (x < corner_radius and y > size - corner_radius and 
                (x - corner_radius)**2 + (y - (size - corner_radius))**2 > corner_radius**2):
                continue
            if (x > size - corner_radius and y > size - corner_radius and 
                (x - (size - corner_radius))**2 + (y - (size - corner_radius))**2 > corner_radius**2):
                continue
            
            # 渐变颜色
            ratio = (x + y) / (2 * size)
            r = int(102 + (118 - 102) * ratio)  # #667eea to #764ba2
            g = int(126 + (75 - 126) * ratio)
            b = int(234 + (162 - 234) * ratio)
            img.putpixel((x, y), (r, g, b, 255))
    
    # 绘制文字"抖"
    try:
        # 尝试使用系统字体
        font_size = int(size * 0.55)
        try:
            font = ImageFont.truetype("arial.ttf", font_size)
        except:
            try:
                font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
            except:
                font = ImageFont.load_default()
    except:
        font = ImageFont.load_default()
    
    # 获取文字尺寸
    text = "抖"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    
    # 计算居中位置
    x = (size - text_width) // 2
    y = (size - text_height) // 2 - size // 10
    
    # 绘制文字
    draw.text((x, y), text, fill=(255, 255, 255, 255), font=font)
    
    # 保存
    img.save(output_path, 'PNG')
    print(f"✅ 已生成: {output_path} ({size}x{size})")

def main():
    """主函数"""
    print("🚀 开始生成Chrome插件图标...")
    print()
    
    # 图标尺寸
    sizes = [16, 48, 128]
    
    for size in sizes:
        output_path = f"icon{size}.png"
        create_icon(size, output_path)
    
    print()
    print("🎉 所有图标生成完成！")
    print()
    print("📦 接下来请按照INSTALL.html中的步骤安装插件")

if __name__ == "__main__":
    main()
