"""Cut fighter sprites out of art/reference-sheet.jpg into sprites/*.webp.

Usage: python3 tools/cut_sprites.py   (needs pillow, numpy, scipy)
"""
import os, sys, numpy as np
from PIL import Image
from scipy import ndimage
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = np.asarray(Image.open(os.path.join(ROOT, 'art', 'reference-sheet.jpg')).convert('RGB')).astype(np.int16)
BOXES = {
  'ricky_idle':   (30, 60, 492, 980),
  'ricky_attack': (405, 92, 702, 548),
  'ricky_run':    (352, 600, 708, 990),
  'julian_idle':  (698, 72, 1188, 990),
  'julian_attack':(1084, 88, 1422, 562),
  'julian_run':   (1108, 592, 1348, 992),
  'bubbles_idle': (1372, 150, 1748, 965),
  'bubbles_attack':(1662, 362, 1988, 668),
  'bubbles_run':  (1706, 668, 1952, 980),
}
HOLES = {}
# the main Julian's glass hand overlaps the attack pose's left leg: cut along the hand,
# then rebuild the hidden strip of jeans and its ink edge
POLY_ONLY = {'julian_idle': [(1128, 425), (1188, 425), (1188, 620), (1100, 620), (1112, 500), (1121, 488), (1124, 445)]}
POLY = {'julian_attack': [(1084, 296), (1144, 304), (1170, 324), (1182, 356), (1180, 402), (1160, 426), (1150, 438), (1132, 442), (1124, 470), (1118, 506), (1084, 506)]}
REBUILD = {'julian_attack': ([(1170, 330), (1190, 330), (1190, 505), (1116, 508)], [(1170, 332), (1116, 506)])}
EXCL = {  # absolute-image rectangles that belong to a neighbouring pose
  'bubbles_attack': [(1662, 340, 1739, 474)],
  'bubbles_idle': [(1700, 230, 1748, 332), (1740, 380, 1748, 472), (1716, 462, 1748, 965)],
}
def cut(name, box, out):
    x0, y0, x1, y1 = box
    im = src[y0:y1, x0:x1]
    h, w, _ = im.shape
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    # background: dark, slightly blue-violet, low saturation panel colour
    refs = np.array([[43, 43, 57], [25, 25, 37], [33, 33, 46], [50, 50, 64]])
    dist = np.min(np.sqrt(((im[:, :, None, :] - refs[None, None]) ** 2).sum(-1)), axis=2)
    border_grey = (r > 55) & (r < 150) & (b - r > 8) & (b - r < 38) & (np.abs(g - r) < 10)
    bgish = (dist < 24) | border_grey
    lab, n = ndimage.label(bgish)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    for (sx, sy) in HOLES.get(name, []):
        lx, ly = sx - x0, sy - y0
        if bgish[ly, lx]: bg |= lab == lab[ly, lx]
    fg = ~bg
    if name in POLY_ONLY:
        from PIL import ImageDraw
        m = Image.new('L', (w, h), 0); ImageDraw.Draw(m).polygon([(px - x0, py - y0) for px, py in POLY_ONLY[name]], fill=255)
        fg &= ~(np.asarray(m) > 0)
    if name in POLY:
        from PIL import ImageDraw
        m = Image.new('L', (w, h), 0); ImageDraw.Draw(m).polygon([(px - x0, py - y0) for px, py in POLY[name]], fill=255)
        cut_mask = np.asarray(m) > 0
        fg &= ~cut_mask
        poly, edge_line = REBUILD[name]
        m2 = Image.new('L', (w, h), 0); ImageDraw.Draw(m2).polygon([(px - x0, py - y0) for px, py in poly], fill=255)
        hole = cut_mask & (np.asarray(m2) > 0)
        # flat denim sampled from the visible part of the same leg, with a soft highlight
        jy0, jy1, jx0, jx1 = 360 - y0, 480 - y0, 1176 - x0, 1190 - x0
        denim = np.median(im[jy0:jy1, jx0:jx1].reshape(-1, 3), axis=0).astype(np.int16)
        im = im.copy(); im[hole] = denim
        inleg = np.asarray(m2) > 0
        skinny = inleg & ((im[..., 0] - im[..., 2]) > 45)
        im[skinny] = denim; hole |= skinny
        line = Image.new('L', (w, h), 0); ImageDraw.Draw(line).line([(px - x0, py - y0) for px, py in edge_line], fill=255, width=5)
        lm = np.asarray(line) > 0
        im[lm] = [18, 16, 20]
        fg |= hole | (lm & (np.asarray(m2) > 0))
    for (ax, ay, bx, by) in EXCL.get(name, []): fg[max(0, ay - y0):max(0, by - y0), max(0, ax - x0):max(0, bx - x0)] = False
    fg = ndimage.binary_opening(fg, iterations=1)
    # keep the main character only
    core = ndimage.binary_erosion(fg, iterations=3)
    fl, fn = ndimage.label(core)
    sizes = ndimage.sum(core, fl, range(1, fn + 1))
    keep = ndimage.binary_dilation(fl == (int(np.argmax(sizes)) + 1), iterations=5) & fg
    # trim the 1px halo that is still panel coloured
    edge = keep & ~ndimage.binary_erosion(keep)
    keep &= ~(edge & (dist < 34))
    alpha = (keep * 255).astype(np.uint8)
    alpha = np.asarray(Image.fromarray(alpha).filter(__import__('PIL.ImageFilter', fromlist=['x']).GaussianBlur(0.6)))
    alpha = np.where(keep, np.maximum(alpha, 200), alpha // 3).astype(np.uint8)
    rgba = np.dstack([im.astype(np.uint8), alpha])
    ys, xs = np.where(keep)
    rgba = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    img = Image.fromarray(rgba, 'RGBA')
    if img.height > 560: img = img.resize((round(img.width * 560 / img.height), 560), Image.LANCZOS)
    img.save(out % name, 'WEBP', quality=88, method=6)
    return img.size
for k, v in BOXES.items():
    print(k, cut(k, v, os.path.join(ROOT, 'sprites', '%s.webp')))
