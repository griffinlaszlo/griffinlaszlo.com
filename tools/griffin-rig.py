# Cuts griffin's chairlift art into an animation rig: a still base (chair,
# torso, upper arm) plus moving layers - both legs with their skis, his head,
# the shaka arm, and the hand with the beer. Every layer keeps the full
# canvas, so they stack with no offsets; pivots are given in work coords.
#
# Run:  python3 tools/griffin-rig.py [path/to/griffinchairlift.png]
# Needs numpy and opencv-python-headless (for the inpainting) plus Pillow.
# Writes gifs/griffin/*.png at 252x266 - 3x the 84px it's shown at.
import os, sys
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFilter

# The source is mocial's full-size chairlift art (griffinchairlift.png),
# scaled to an 800px-wide working size that the outlines below are drawn in
SOURCE = sys.argv[1] if len(sys.argv) > 1 else '../website/griffinchairlift.png'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'gifs', 'griffin')
src_img = Image.open(SOURCE).convert('RGBA')
W = 800
H = round(src_img.height * W / src_img.width)
work = src_img.resize((W, H), Image.LANCZOS)
arr = np.array(work)

PARTS = {
  'leg-right': [(500,472),(520,455),(560,450),(588,460),(600,490),(601,530),(600,560),(640,520),(675,470),(700,420),(715,400),(740,402),(746,420),(730,452),(700,505),(660,575),(620,640),(585,690),(545,745),(530,753),(512,746),(505,735),(518,715),(540,685),(553,660),(545,615),(530,590),(515,575),(505,550),(502,510)],
  'leg-left': [(343,562),(362,520),(380,478),(397,457),(420,452),(440,462),(448,475),(462,470),(470,430),(476,410),(490,402),(505,404),(512,418),(505,450),(498,490),(490,545),(480,600),(470,660),(460,710),(450,765),(443,800),(428,812),(405,812),(402,798),(414,775),(422,720),(424,690),(410,682),(398,665),(390,630),(385,595),(370,590),(350,585),(340,575)],
  'head': [(330,225),(372,232),(396,250),(400,275),(397,300),(398,330),(390,353),(372,366),(345,370),(326,360),(314,347),(298,346),(284,336),(274,318),(270,295),(274,265),(290,241),(310,229)],
  'arm': [(412,352),(440,333),(462,325),(480,305),(500,288),(512,281),(515,268),(519,255),(513,236),(522,227),(533,238),(536,246),(550,239),(561,246),(570,254),(585,252),(604,256),(605,267),(591,275),(568,274),(553,277),(549,291),(546,303),(531,319),(511,337),(491,356),(473,376),(462,386),(440,374)],
  'beer': [(252,368),(291,366),(293,382),(288,405),(286,414),(299,424),(302,440),(297,453),(290,456),(294,466),(295,506),(286,517),(257,519),(249,506),(249,457),(238,452),(226,449),(237,424),(249,412),(255,404),(257,385),(253,380)],
}
ORDER = ['leg-right', 'leg-left', 'head', 'arm', 'beer']

def mask_of(poly, grow=0):
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).polygon(poly, fill=255)
    if grow:
        m = m.filter(ImageFilter.MaxFilter(grow * 2 + 1))
    return np.array(m) > 127

masks = {k: mask_of(v) for k, v in PARTS.items()}
# The left ski is in front of the right leg where they overlap
masks['leg-right'] &= ~masks['leg-left']

layers = {}
for k in ORDER:
    layer = arr.copy()
    layer[~masks[k], 3] = 0
    layers[k] = layer

# Behind the left ski the right trouser leg carries on: fill that overlap
# with trouser black so swinging the left ski never shows a hole
behind = mask_of(PARTS['leg-right']) & masks['leg-left']
ys, xs = np.nonzero(behind)
sel = (ys > 455) & (xs > 503)
layers['leg-right'][ys[sel], xs[sel]] = (26, 26, 26, 255)

# The base: everything else, with the cut-outs inpainted from what's around
# them (a little grown so the parts' outlines don't leave a ghost)
hole = np.zeros((H, W), bool)
for k in ORDER:
    hole |= mask_of(PARTS[k], grow=2)
rgb = arr[:, :, :3].copy()
alpha = arr[:, :, 3].copy()
rgb[alpha < 20] = 255
hole8 = hole.astype(np.uint8) * 255
rgb_f = cv2.inpaint(np.ascontiguousarray(rgb[:, :, ::-1]), hole8, 6, cv2.INPAINT_TELEA)[:, :, ::-1]
alpha_f = cv2.inpaint(alpha, hole8, 6, cv2.INPAINT_TELEA)
base = np.dstack([rgb_f, np.where(alpha_f > 128, 255, 0).astype(np.uint8)])
base[~hole] = arr[~hole]

# Some of what the parts covered is open sky, not chair: above the backrest
# behind the shaka arm, and below the seat behind the dangling legs. Inpaint
# smears colour into those; clear them back to transparent.
yy, xx = np.mgrid[0:H, 0:W]
sky = (mask_of(PARTS['arm'], grow=7) & ((yy < 340) | ((xx > 478) & (yy < 362))))
legs = mask_of(PARTS['leg-left'], grow=3) | mask_of(PARTS['leg-right'], grow=3)
sky |= legs & ((yy > 604) | ((xx > 612) & (yy > 430)))
base[sky, 3] = 0

# Behind the beer hand and bottle is his jacket and lap, not more chair: paint
# that gap jacket blue so lifting the beer doesn't leave a grey smudge
jacket = arr[400, 200, :3]
beer_hole = mask_of(PARTS['beer'], grow=3) & (yy < 512)
base[beer_hole, :3] = jacket
base[beer_hole, 3] = 255
layers = dict(base=base, **layers)

os.makedirs(OUT, exist_ok=True)
for k, a in layers.items():
    Image.fromarray(a).resize((252, 266), Image.LANCZOS).save(os.path.join(OUT, k + '.png'), optimize=True)
print('wrote', len(layers), 'layers to', os.path.normpath(OUT))
