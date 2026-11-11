#!/usr/bin/env python3
"""prepare.py — turn your own reference photo into what the painter looks at.

    python3 painter/prepare.py path/to/your-photo.jpg

Writes work/target.rgb (600 x 894 raw RGB, what painter/optimize.js reads) and
work/ref.png (what tools/compare.py reads). work/ is git-ignored: the reference
never enters the repository or the page. Needs Pillow.
"""
import os
import sys
from PIL import Image

if len(sys.argv) != 2:
    sys.exit(__doc__)
here = os.path.dirname(os.path.abspath(__file__))
work = os.path.join(here, '..', 'work')
os.makedirs(work, exist_ok=True)
im = Image.open(sys.argv[1]).convert('RGB')
im.save(os.path.join(work, 'ref.png'))
with open(os.path.join(work, 'target.rgb'), 'wb') as f:
    f.write(im.resize((600, 894), Image.LANCZOS).tobytes())
print('wrote work/target.rgb and work/ref.png from', sys.argv[1], im.size)
