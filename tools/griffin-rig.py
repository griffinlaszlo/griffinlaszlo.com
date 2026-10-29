# Cuts griffin's chairlift art into an animation rig: a still base (chair,
# torso, upper arm) plus moving layers - both legs with their skis, his head,
# the shaka arm, and the hand with the beer. Every layer keeps the full
# canvas, so they stack with no offsets; pivots are given in work coords.
#
# Run:  python3 tools/griffin-rig.py [path/to/griffinchairlift.png]
# Needs numpy and opencv-python-headless (for the inpainting) plus Pillow.
# Writes gifs/griffin/*.png at 252x266 - 3x the 84px it's shown at - plus
# empty-chair.png, the same chair with him lifted out.
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

# ===== The empty chair ======================================================
# The same chair with griffin lifted out, for the lift's other chairs. Rather
# than patch around where he was:
#   1. redraw the whole seat and backrest - slats in the art's see-through
#      grey and line weight, closing every gap;
#   2. lay the original frame back on top: the top rail and hanger, both
#      posts and the left armrest bar, exactly as drawn (minus any flecks of
#      his outline left floating on their own);
#   3. draw the right armrest bar, which his ski hid, as a matching tube
#      curving from the right post down to the seat's front corner.
def empty_chair(arr):
    alpha = arr[:, :, 3]
    yy, xx = np.mgrid[0:H, 0:W]
    hsv = cv2.cvtColor(np.ascontiguousarray(arr[:, :, :3]), cv2.COLOR_RGB2HSV).astype(int)
    s, v = hsv[:, :, 1], hsv[:, :, 2]

    # griffin, as before: his colours, the big trouser shapes, the rig outlines
    fig = (s > 70) & (alpha > 0)
    dark = ((v < 60) & (alpha > 0)).astype(np.uint8)
    fig |= cv2.morphologyEx(dark, cv2.MORPH_OPEN, np.ones((9, 9), np.uint8)) > 0
    m = Image.new('L', (W, H), 0)
    for poly in PARTS.values():
        ImageDraw.Draw(m).polygon(poly, fill=255)
    fig |= np.array(m) > 127
    fig &= ~((yy < 215) | (xx < 80) | ((xx < 265) & (yy < 300)) | ((xx > 598) & (yy < 405)))
    fig = cv2.dilate(fig.astype(np.uint8), np.ones((7, 7), np.uint8)) > 0

    INK = (30, 27, 27, 255)
    GREY = (146, 146, 146, 255)
    rng = np.random.default_rng(1)
    grain = cv2.GaussianBlur(rng.normal(0, 9, (H, W)), (0, 0), 1.2)
    see = cv2.GaussianBlur(rng.normal(0, 28, (H, W)), (0, 0), 1.5)

    def marker(layer):
        # the art's grey is see-through and grainy; give the drawn grey the same
        a = np.array(layer)
        g = (a[:, :, 3] > 0) & (a[:, :, 0] > 100)
        a[g, :3] = np.clip(a[g, :3].astype(float) + grain[g][:, None], 0, 255).astype(np.uint8)
        a[g, 3] = np.clip(212 + see[g], 150, 252).astype(np.uint8)
        return a

    def lerp_line(a, b, t):
        return [(ax + (bx - ax) * t, ay + (by - ay) * t) for (ax, ay), (bx, by) in zip(a, b)]

    # --- 1. the seat and backrest, whole ----------------------------------------
    xs = [82, 260, 440, 540, 630]
    back_top = list(zip(xs, [420, 402, 381, 368, 361]))   # meets the drawn backrest's own top edge
    back_bot = list(zip(xs, [468, 461, 447, 441, 436]))
    seat_bot = list(zip([88, 240, 360, 500, 640], [566, 598, 590, 568, 550]))
    slats = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(slats)
    d.polygon(back_top + back_bot[::-1], fill=GREY)
    d.polygon(back_bot + seat_bot[::-1], fill=GREY)
    bar_top = lerp_line(back_bot, seat_bot, 0.8)
    d.polygon(bar_top + seat_bot[::-1], fill=(158, 158, 158, 255))
    slats = Image.fromarray(marker(slats))
    d = ImageDraw.Draw(slats)
    d.line(back_top, fill=INK, width=3, joint='curve')
    for t in (0.33, 0.66):
        d.line(lerp_line(back_top, back_bot, t), fill=INK, width=3, joint='curve')
    d.line(back_bot, fill=INK, width=3, joint='curve')
    for t in (0.2, 0.4, 0.6):
        d.line(lerp_line(back_bot, seat_bot, t), fill=INK, width=3, joint='curve')
    d.line(bar_top, fill=INK, width=3, joint='curve')
    d.line(seat_bot, fill=INK, width=3, joint='curve')
    # the seat's two ends
    d.line([back_top[0], seat_bot[0]], fill=INK, width=3)
    d.line([back_top[-1], back_bot[-1], seat_bot[-1]], fill=INK, width=3)
    im = Image.new('L', (W, H), 0)
    ImageDraw.Draw(im).polygon(back_top + back_bot[::-1], fill=255)
    ImageDraw.Draw(im).polygon(back_bot + seat_bot[::-1], fill=255)
    interior = np.array(im) > 0

    # --- 2. the original frame, back on top --------------------------------------
    def tube_mask(points, width):
        t = Image.new('L', (W, H), 0)
        ImageDraw.Draw(t).line(points, fill=255, width=width, joint='curve')
        return np.array(t) > 0
    frame = (~interior) & (yy < 470)                                         # top rail, hanger, upper posts
    frame |= tube_mask([(84, 335), (70, 420), (61, 478), (66, 525), (78, 556), (100, 580)], 26)   # left post
    frame |= tube_mask([(62, 478), (110, 478), (160, 488), (205, 505), (228, 535), (236, 570), (238, 598)], 26)  # left armrest bar
    frame |= tube_mask([(620, 300), (626, 380), (630, 414)], 26)              # right post
    frame &= ~fig
    kept = arr.copy()
    kept[~frame, 3] = 0
    # drop flecks: bits of his outline left floating on their own
    n, labels, stats, _ = cv2.connectedComponentsWithStats((kept[:, :, 3] > 40).astype(np.uint8), 8)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] < 150:
            kept[labels == i, 3] = 0
    # open air beyond the chair stays open: nothing below the seat or beside it
    out = Image.alpha_composite(slats, Image.fromarray(kept))

    # --- 3. the right armrest bar ------------------------------------------------
    right_bar = [(628, 410), (652, 412), (674, 418), (689, 430), (694, 448), (690, 470), (681, 494), (667, 516), (651, 535), (636, 548)]
    tube = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    td = ImageDraw.Draw(tube)
    td.line(right_bar, fill=INK, width=19, joint='curve')
    for p in (right_bar[0], right_bar[-1]):
        td.ellipse([p[0] - 9, p[1] - 9, p[0] + 9, p[1] + 9], fill=INK)
    inner = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    TUBE = (191, 191, 191, 255)   # the frame's own lighter grey
    ImageDraw.Draw(inner).line(right_bar, fill=TUBE, width=14, joint='curve')
    for p in (right_bar[0], right_bar[-1]):
        ImageDraw.Draw(inner).ellipse([p[0] - 6, p[1] - 6, p[0] + 6, p[1] + 6], fill=TUBE)
    inner = Image.fromarray(marker(inner))
    tube = Image.alpha_composite(tube, inner)
    out = Image.alpha_composite(out, tube)
    # a highlight down the tube, like the drawn ones have
    hl = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(hl).line([(p[0] - 2, p[1] - 2) for p in right_bar[1:-2]], fill=(200, 200, 200, 120), width=3, joint='curve')
    out = Image.alpha_composite(out, hl)

    return np.array(out)

empty = empty_chair(arr)
Image.fromarray(empty).resize((252, 266), Image.LANCZOS).save(os.path.join(OUT, 'empty-chair.png'), optimize=True)
print('wrote the empty chair')
