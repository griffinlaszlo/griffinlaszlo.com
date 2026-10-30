# Renders the other riders on the chairlift - the couple and the snowboarder
# drawn in tools/crew/*.svg - into the layered PNGs in gifs/crew/.
#
# Each rider comes in a few looks (VARIANTS): the drawing with its colours
# swapped - jackets, pants, hair, skin, hat, board - so the lift carries
# different people, not the same two over and over. Variant "a" is the
# drawing as it is. Files are named <rider>-<variant>-<layer>.png.
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

# Colour swaps per look: drawing's colour -> this look's
VARIANTS = {
    'couple': {
        'a': {},
        'b': {
            '#ea5a8e': '#f2c230', '#f3f3f3': '#3a3a3a', '#e6b84a': '#3b2416',     # her: jacket, pants, hair
            '#f6cba6': '#c68a5e', '#f2a0a0': '#d9776a', '#9bd2f0': '#f29ac0',     # skin, cheeks, goggles
            '#e8562e': '#2fb2a3', '#2d3a6b': '#c9a46a', '#5a6aa0': '#a8844c',     # him: jacket, pants
            '#3f9a4a': '#c8402f', '#2f7d3a': '#a5321f',                           # beanie
            '#7a4e2c': '#2a1d14', '#e2ad80': '#f2c9a5',                           # beard, skin
        },
        'c': {
            '#ea5a8e': '#7d55c7', '#e6b84a': '#a8432a', '#9bd2f0': '#f2c230',
            '#e8562e': '#3b6fd0', '#2d3a6b': '#262626', '#5a6aa0': '#555555',
            '#3f9a4a': '#f2c230', '#2f7d3a': '#d4a520',
            '#7a4e2c': '#1f1510', '#e2ad80': '#8d5a3b',
        },
    },
    'boarder': {
        'a': {},
        'b': {
            '#7d55c7': '#c8402f', '#6a45b0': '#a5321f',                           # hoodie
            '#c9a46a': '#55663f',                                                 # pants
            '#3a3a3a': '#e0a63a', '#2c2c2c': '#c48c26',                           # beanie
            '#f4c7a0': '#8d5a3b', '#6b4a2e': '#1f1510',                           # skin, moustache
            '#2b6fd6': '#3f9a4a', '#5a3d2b': '#3a2a20',                           # board, boots
        },
        'c': {
            '#7d55c7': '#2fb2a3', '#6a45b0': '#24907f',
            '#c9a46a': '#2d3a6b',
            '#3a3a3a': '#ea5a8e', '#2c2c2c': '#c94676',
            '#f4c7a0': '#e9b88a', '#6b4a2e': '#c9893a',
            '#2b6fd6': '#e8402f',
        },
    },
}

def recolour(svg, swaps):
    # Through placeholders, so a swap can't be caught by a later one
    for i, old in enumerate(swaps):
        svg = svg.replace(old, '@@%d@@' % i)
    for i, new in enumerate(swaps.values()):
        svg = svg.replace('@@%d@@' % i, new)
    return svg

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
    drawing = open(os.path.join(HERE, 'crew', rider + '.svg')).read()
    for variant, swaps in VARIANTS[rider].items():
        svg = recolour(drawing, swaps)
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
            name = '%s-%s-%s.png' % (rider, variant, layer)
            img.save(os.path.join(OUT, name))
            print('wrote gifs/crew/' + name)
