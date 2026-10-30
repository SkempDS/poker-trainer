# -*- coding: utf-8 -*-
"""从 PNG 生成多尺寸 ICO，供 csc /win32icon 使用。"""
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC_CANDIDATES = [
    r"D:\QLDownload\dsh_desk\resources\icon.png",
    r"D:\QLDownload\dsh_desk\resources\tray.ico",
]
OUT = os.path.join(HERE, "icon.ico")
SIZES = [16, 24, 32, 48, 64, 128, 256]


def pick_source():
    for p in SRC_CANDIDATES:
        if os.path.exists(p):
            return p
    return None


def main():
    src = pick_source()
    if not src:
        print("没找到图标素材，尝试的路径：")
        for p in SRC_CANDIDATES:
            print("  ", p)
        return 1

    print("图标素材:", src)
    img = Image.open(src)
    print("原始尺寸:", img.size, "模式:", img.mode)

    if img.mode != "RGBA":
        img = img.convert("RGBA")

    # 裁成方形，避免非正方形图片被拉伸
    w, h = img.size
    if w != h:
        side = min(w, h)
        left = (w - side) // 2
        top = (h - side) // 2
        img = img.crop((left, top, left + side, top + side))
        print("裁成方形:", img.size)

    # ico 里放多个尺寸，Windows 会按需挑
    frames = [img.resize((s, s), Image.LANCZOS) for s in SIZES]
    frames[-1].save(OUT, format="ICO", sizes=[(s, s) for s in SIZES],
                    append_images=frames[:-1])
    print("写出", OUT, "%.1f KB" % (os.path.getsize(OUT) / 1024.0))

    # 回读校验：每个尺寸都在
    with Image.open(OUT) as chk:
        got = sorted(chk.info.get("sizes", []))
    print("回读尺寸:", [s[0] for s in got])
    missing = [s for s in SIZES if (s, s) not in got]
    if missing:
        print("缺尺寸:", missing)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
