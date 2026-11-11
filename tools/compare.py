#!/usr/bin/env python3
"""Critic board: reference photo vs painting, whole + face + eyes + hands.

  python3 tools/compare.py work/render.ppm work/board.png

Needs Pillow, numpy and your own reference at work/ref.png (not in the repo)."""
import os
import sys
import numpy as np
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
scale = int(sys.argv[3]) if len(sys.argv) > 3 else 1
W, H = 600 * scale, 894 * scale
ref = Image.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'work', 'ref.png')).convert('RGB')
if not src.endswith('.rgb'):
    img = Image.open(src).convert('RGB')
else:
    img = Image.frombytes('RGB', (W, H), open(src, 'rb').read())
a = np.asarray(ref.resize((600, 894), Image.LANCZOS)).astype(float)
b = np.asarray(img.resize((600, 894), Image.LANCZOS)).astype(float)
print('rmse vs photo: %.2f' % np.sqrt(((a - b) ** 2).mean()))


def pair(box, zoom):
    # box is given in 300 x 447 coordinates and scaled to each image's own size
    x0, y0, x1, y1 = box
    size = (int((x1 - x0) * zoom), int((y1 - y0) * zoom))

    def cut(im):
        kx, ky = im.size[0] / 300, im.size[1] / 447
        return im.crop((int(x0 * kx), int(y0 * ky), int(x1 * kx), int(y1 * ky))).resize(size, Image.LANCZOS)
    return cut(ref), cut(img)


rows = [pair((0, 0, 300, 447), 1.6), pair((95, 45, 205, 165), 5), pair((115, 82, 185, 142), 9), pair((70, 290, 230, 390), 4)]
Wd = max(r.size[0] * 2 + 12 for r, _ in rows)
Ht = sum(r.size[1] + 12 for r, _ in rows)
board = Image.new('RGB', (Wd, Ht), (24, 24, 24))
y = 0
for r, p in rows:
    board.paste(r, (0, y)); board.paste(p, (r.size[0] + 12, y)); y += r.size[1] + 12
board.save(out)
