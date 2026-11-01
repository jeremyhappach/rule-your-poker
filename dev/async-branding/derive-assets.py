"""Deterministic crops/masks of the supplied high-resolution artwork, not mockup crops.

Usage: python derive-assets.py <extracted async design package>
The right-hand info control is outside each crop or explicitly alpha-masked.
Arcade's original assets are never modified.
"""
import json, sys, hashlib
from pathlib import Path
from PIL import Image, ImageDraw, ImageChops

source = Path(sys.argv[1]) / '03_hi_res_arcade_art_sources'
target = Path('public/game-branding/async-v1')
# game, source prefix, title crop, quiet decorative motif crop
specs = [
    ('run21', '01_run21', (320, 195, 1305, 485), (170, 475, 1000, 685)),
    ('tri-towers', '02_tritowers', (265, 390, 1420, 680), (355, 185, 1370, 400)),
    ('quintzee', '09_quintzee', (300, 330, 1480, 635), (460, 170, 1110, 340)),
    ('boxdrop', '04_boxdrop', (290, 390, 1425, 657), (340, 170, 1440, 395)),
    ('take-two', '06_take_2', (405, 300, 1350, 650), (190, 175, 1370, 315)),
    ('royal-flash', '07_royal_flash', (480, 295, 1320, 670), (290, 170, 1410, 300)),
    ('mega-card-golf', '08_mega_card_golf', (345, 260, 1360, 655), (200, 170, 1510, 270)),
    ('trip-flip', '05_trip_flip', (460, 210, 1335, 695), (190, 195, 540, 670)),
    ('eleven-up', '03_11_up', (390, 245, 1350, 645), (180, 175, 1380, 290)),
]
manifest = []
for game, prefix, crop, motif in specs:
    file = source / f'{prefix}_full_concept.png'
    original = Image.open(file).convert('RGBA')
    assert original.size == (1774, 887)
    # All sources use the same right-hand rules badge. A generous mask includes
    # its shadow, so no residual decorative control enters the derivative.
    safe = Image.new('L', original.size, 255)
    draw = ImageDraw.Draw(safe)
    draw.ellipse((1388, 448, 1622, 661), fill=0)
    if game == 'run21':
        draw.ellipse((1380, 365, 1610, 590), fill=0)
    original.putalpha(safe)
    for kind, box, width in [('logo', crop, 720), ('motif', motif, 480)]:
        image = original.crop(box)
        # Feather only the outer edge into the header's theme. Keep title pixels.
        alpha = image.getchannel('A')
        horizontal = Image.new('L', (image.width, 1))
        horizontal.putdata([round(255*min(1,x/10,(image.width-1-x)/10)) for x in range(image.width)])
        vertical = Image.new('L', (1, image.height))
        vertical.putdata([round(255*min(1,y/8,(image.height-1-y)/8)) for y in range(image.height)])
        edge = ImageChops.darker(horizontal.resize(image.size), vertical.resize(image.size))
        image.putalpha(ImageChops.multiply(alpha, edge))
        image = image.resize((width, round(width*image.height/image.width)), Image.Resampling.LANCZOS)
        image.save(target / f'{game}-{kind}.webp', quality=92 if kind=='logo' else 82, method=6)
    manifest.append({'game':game, 'source':file.name, 'sourceSha256':hashlib.sha256(file.read_bytes()).hexdigest(), 'logoCrop':crop, 'motifCrop':motif})
Path('dev/async-branding/asset-provenance.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(f'{len(specs)} brands; {sum(p.stat().st_size for p in target.glob("*.webp")):,} bytes')
