"""Encode the approved crops without cropping, retouching, or generating artwork."""
import sys
from pathlib import Path
from PIL import Image

source = Path(sys.argv[1]) / '01_tile_assets'
target = Path('public/arcade/approved-v1')
names = ['run21', 'tri-towers', 'eleven-up', 'boxdrop', 'trip-flip', 'take-two',
         'royal-flash', 'mega-card-golf', 'quintzee']
for path, name in zip(sorted(source.glob('*.png')), names, strict=True):
    with Image.open(path) as image:
        assert image.size == (1466, 564), path
        for width in [480, 960]:
            image.resize((width, round(width * 564 / 1466)), Image.Resampling.LANCZOS).save(
                target / f'{name}-{width}.webp', quality=92, method=6)
print(f'{len(names)} approved crops; {sum(p.stat().st_size for p in target.glob("*.webp")):,} bytes across both sizes')
