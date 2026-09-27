# 生成扩展图标:蓝紫渐变圆角方块 + 白色"译"字
from PIL import Image, ImageDraw, ImageFont
import os

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons"))
os.makedirs(OUT, exist_ok=True)
S = 512
c1, c2 = (79, 124, 255), (139, 92, 246)

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
grad = Image.new("RGBA", (S, S))
gd = ImageDraw.Draw(grad)
for y in range(S):
    t = y / S
    gd.line([(0, y), (S, y)], fill=tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3)) + (255,))

mask = Image.new("L", (S, S), 0)
md = ImageDraw.Draw(mask)
md.rounded_rectangle([16, 16, S - 16, S - 16], radius=96, fill=255)
img.paste(grad, (0, 0), mask)

d = ImageDraw.Draw(img)
font = None
for path in (r"C:\Windows\Fonts\msyhbd.ttc", r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\simhei.ttf"):
    if os.path.exists(path):
        try:
            font = ImageFont.truetype(path, 300)
            break
        except Exception:
            pass
if font is None:
    raise SystemExit("未找到可用的中文字体")

text = "译"
bbox = d.textbbox((0, 0), text, font=font)
w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
d.text(((S - w) / 2 - bbox[0], (S - h) / 2 - bbox[1]), text, font=font, fill=(255, 255, 255, 255))

img.save(os.path.join(OUT, "icon128.png"))
img.resize((48, 48), Image.LANCZOS).save(os.path.join(OUT, "icon48.png"))
img.resize((16, 16), Image.LANCZOS).save(os.path.join(OUT, "icon16.png"))
print("icons:", sorted(os.listdir(OUT)))
