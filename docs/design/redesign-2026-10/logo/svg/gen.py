import math
INK, PAPER, COBALT = '#141417', '#f5f3ee', '#2346d9'
INK_D, PAPER_D, COBALT_D = '#f3f1ec', '#0f1013', '#8aa2ff'
H = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{w}" height="{h}" role="img" aria-label="Centralu">\n'

def pane(S, R, r, c, k, cut=True):
    """One pane with its inner corner at (S,S): big outer radius R, small r, chamfer c rounded by k."""
    d = k / math.sqrt(2)
    p = f'M{R} 0H{S-r}A{r} {r} 0 0 1 {S} {r}'
    if cut:
        p += (f'V{S-c-k}Q{S} {S-c} {S-d:.2f} {S-c+d:.2f}'
              f'L{S-c+d:.2f} {S-d:.2f}Q{S-c} {S} {S-c-k} {S}')
    else:
        p += f'V{S-r}A{r} {r} 0 0 1 {S-r} {S}'
    p += f'H{r}A{r} {r} 0 0 1 0 {S-r}V{R}A{R} {R} 0 0 1 {R} 0Z'
    return p

def f_mark(ink, cobalt, only_cobalt_cut=False):
    S, G = 42, 6            # pane size, gap; mark is 90 x 90
    T = 2 * S + G
    out = []
    for i, (tr, fill) in enumerate([('', ink), (f'matrix(-1 0 0 1 {T} 0)', cobalt),
                                    (f'matrix(1 0 0 -1 0 {T})', ink), (f'rotate(180 {T/2} {T/2})', ink)]):
        cut = (i == 1) if only_cobalt_cut else True
        t = f' transform="{tr}"' if tr else ''
        out.append(f'<path{t} fill="{fill}" d="{pane(S, 14, 6, 13, 5, cut)}"/>')
    return '\n'.join(out), T

def b_mark(ink, cobalt):
    # three concentric lanes; quarter arcs centred at (cx, ty) and (cx, by), joined by a short vertical
    cx, ty, by, sw = 600, 575, 670, 46
    lanes = [(308, 872, 912), (231, 912, 912), (154, 872, 872)]   # radius, top end, bottom end
    out = []
    for rad, te, be in lanes:
        x, top, bot = cx - rad, ty - rad, by + rad
        out.append(f'<path d="M{te} {top}H{cx}A{rad} {rad} 0 0 0 {x} {ty}V{by}A{rad} {rad} 0 0 0 {cx} {bot}H{be}"/>')
    lanes_g = f'<g fill="none" stroke="{ink}" stroke-width="{sw}">\n' + '\n'.join(out) + '\n</g>'
    tip = f'<rect x="886" y="{ty-308-sw/2}" width="76" height="{sw}" fill="{cobalt}"/>'
    return lanes_g + '\n' + tip, (269, 244, 693, 757)

def squircle(cx, cy, half, n=5, steps=720):
    pts = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        c, s = math.cos(t), math.sin(t)
        pts.append((cx + half * math.copysign(abs(c) ** (2 / n), c), cy + half * math.copysign(abs(s) ** (2 / n), s)))
    return 'M' + 'L'.join(f'{x:.1f} {y:.1f}' for x, y in pts) + 'Z'

def write(name, body, vb, w, h):
    with open(name, 'w') as f:
        f.write(H.format(vb=vb, w=w, h=h) + body + '\n</svg>\n')

# F marks
for suf, ink, cob in [('', INK, COBALT), ('-dark', INK_D, COBALT_D)]:
    m, T = f_mark(ink, cob)
    write(f'F-panes{suf}.svg', m, f'0 0 {T} {T}', 360, 360)
    m, T = f_mark(ink, cob, only_cobalt_cut=True)
    write(f'F-panes-refined{suf}.svg', m, f'0 0 {T} {T}', 360, 360)
# B marks
for suf, ink, cob in [('', INK, COBALT), ('-dark', INK_D, COBALT_D)]:
    m, (x, y, w, h) = b_mark(ink, cob)
    write(f'B-lanes-c{suf}.svg', m, f'{x} {y} {w} {h}', round(w / 2), round(h / 2))

# macOS icons: 1024 canvas, 824 body on Apple's grid, faint edge so the dark one keeps its outline
body = squircle(512, 512, 412)
def icon(name, bg, edge, mark, scale, size):
    t = (1024 - size * scale) / 2
    write(name, f'<path d="{body}" fill="{bg}"/>\n<path d="{body}" fill="none" stroke="{edge}" stroke-width="2"/>\n'
                f'<g transform="translate({t:.1f} {t:.1f}) scale({scale})">\n{mark}\n</g>', '0 0 1024 1024', 512, 512)
for suf, bg, edge, ink, cob in [('light', PAPER, 'rgba(0,0,0,.08)', INK, COBALT),
                                ('dark', PAPER_D, 'rgba(255,255,255,.14)', INK_D, COBALT_D)]:
    m, T = f_mark(ink, cob)
    icon(f'icon-F-{suf}.svg', bg, edge, m, 6.2, T)
    m, (x, y, w, h) = b_mark(ink, cob)
    s = 560 / h
    tx, ty = 512 - (x + w / 2) * s, 512 - (y + h / 2) * s
    write(f'icon-B-{suf}.svg', f'<path d="{body}" fill="{bg}"/>\n<path d="{body}" fill="none" stroke="{edge}" stroke-width="2"/>\n'
          f'<g transform="translate({tx:.1f} {ty:.1f}) scale({s:.4f})">\n{m}\n</g>', '0 0 1024 1024', 512, 512)
