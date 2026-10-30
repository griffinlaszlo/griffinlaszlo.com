# Renders the other riders on the chairlift - the couple and the snowboarder
# drawn in tools/crew/*.svg - into the layered PNGs in gifs/crew/.
#
# Each drawing marks its moving parts with a class (L-wave, L-steam, L-board,
# L-front, L-rec). Every layer is the whole 800x846 drawing with everything
# but that layer hidden, so they stack with no offsets, the same way
# griffin's rig does; the bottom layer also gets the empty chair under it.
# Written at 252x266, the size of gifs/griffin/empty-chair.png.
#
# Run:  python3 tools/crew-build.py
# Needs Pillow and Google Chrome (it draws the SVGs headless).
import os, subprocess, tempfile, time
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
OUT = os.path.join(ROOT, 'gifs', 'crew')
CHAIR = os.path.join(ROOT, 'gifs', 'griffin', 'empty-chair.png')
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
W, H = 800, 846

# rider: [(layer, CSS that leaves just that layer showing)], bottom first
HIDE_ALL = 'svg * { visibility: hidden; } '
CREW = {
    'couple': [
        ('base', '.L-wave, .L-steam { visibility: hidden; }'),
        ('steam', HIDE_ALL + '.L-steam { visibility: visible; }'),
        ('wave', HIDE_ALL + '.L-wave, .L-wave * { visibility: visible; }'),
    ],
    'boarder': [
        ('back', '.L-board, .L-front { visibility: hidden; }'),
        ('board', HIDE_ALL + '.L-board, .L-board * { visibility: visible; }'),
        ('front', HIDE_ALL + '.L-front, .L-front * { visibility: visible; } .L-rec { visibility: hidden; }'),
        ('rec', HIDE_ALL + '.L-rec { visibility: visible; }'),
    ],
}

def render(svg_text, png_path):
    """Draw an SVG to a transparent PNG with headless Chrome."""
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, 'layer.svg')
        with open(src, 'w') as f:
            f.write(svg_text)
        proc = subprocess.Popen([
            CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
            '--default-background-color=00000000', '--force-device-scale-factor=1',
            '--window-size=%d,%d' % (W, H), '--timeout=3000',
            '--user-data-dir=' + os.path.join(tmp, 'profile'),
            '--screenshot=' + png_path, 'file://' + src,
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        # Chrome sometimes keeps running after the screenshot is written
        for _ in range(40):
            if proc.poll() is not None or (os.path.exists(png_path) and os.path.getsize(png_path)):
                break
            time.sleep(0.5)
        time.sleep(0.5)
        proc.kill()

os.makedirs(OUT, exist_ok=True)
chair = Image.open(CHAIR).convert('RGBA')
for rider, layers in CREW.items():
    svg = open(os.path.join(HERE, 'crew', rider + '.svg')).read()
    for i, (layer, css) in enumerate(layers):
        styled = svg.replace('<defs>', '<defs><style>' + css + '</style>', 1)
        big = os.path.join(OUT, '_render.png')
        if os.path.exists(big):
            os.remove(big)
        render(styled, big)
        img = Image.open(big).convert('RGBA').resize(chair.size, Image.LANCZOS)
        os.remove(big)
        if i == 0:
            base = chair.copy()
            base.alpha_composite(img)
            img = base
        img.save(os.path.join(OUT, '%s-%s.png' % (rider, layer)))
        print('wrote gifs/crew/%s-%s.png' % (rider, layer))
