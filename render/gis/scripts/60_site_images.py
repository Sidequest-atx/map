"""Site images from the real data: the City of Austin's own sidewalk
assessment drawn over the 2022 NAIP orthophoto of the Anderson Mill /
Westwood neighborhood (the "by the mile" view), and a plain aerial crop of
the most sidewalk-dense residential block. Writes 1600-wide WebPs to
render/out/stills and publishes them into public/media.

Run: render/gis/.venv/Scripts/python render/gis/scripts/60_site_images.py
"""
import json
import os
import sys

import numpy as np
import rasterio
from PIL import Image, ImageDraw, ImageEnhance, ImageOps
from rasterio.windows import Window

HERE = os.path.dirname(os.path.abspath(__file__))
GIS = os.path.dirname(HERE)
RENDER = os.path.dirname(GIS)
REPO = os.path.dirname(RENDER)
BOX = os.path.join(GIS, "anderson_mill")
OUT = os.path.join(RENDER, "out", "stills")
PUB = os.path.join(REPO, "public", "media")
os.makedirs(OUT, exist_ok=True)
os.makedirs(PUB, exist_ok=True)

NAIP = os.path.join(BOX, "naip", "naip_2022_rgb_60cm_jpeg.tif")
SIDEWALKS = os.path.join(BOX, "austin_open_data", "sidewalks_32614.geojson")

ACCEPTABLE = (146, 176, 78)   # olive-300-ish, reads on the ortho
DEFICIENT = (226, 96, 52)     # rust
PENDING = (205, 205, 200)
HALO = (20, 22, 16)


def enhance(img):
    img = ImageOps.autocontrast(img, cutoff=0.6)
    img = ImageEnhance.Color(img).enhance(1.12)
    img = ImageEnhance.Contrast(img).enhance(1.06)
    return img


def read_window(ds, col, row, w, h):
    arr = ds.read(window=Window(col, row, w, h))
    return Image.fromarray(np.transpose(arr, (1, 2, 0)))


def lines_of(geom):
    if geom["type"] == "LineString":
        return [geom["coordinates"]]
    if geom["type"] == "MultiLineString":
        return geom["coordinates"]
    return []


def main():
    feats = json.load(open(SIDEWALKS, encoding="utf-8"))["features"]
    with rasterio.open(NAIP) as ds:
        left, top = ds.bounds.left, ds.bounds.top
        res = ds.res[0]
        W, H = ds.width, ds.height

        # ---- 1. the condition map: the whole box cropped to 4:3 ----
        cw = W
        ch = int(W * 3 / 4)
        row0 = (H - ch) // 2
        base = read_window(ds, 0, row0, cw, ch)
        base = enhance(base)
        # darken a touch so the colored lines carry
        base = ImageEnhance.Brightness(base).enhance(0.9)
        scale = 1600 / cw
        img = base.resize((1600, int(ch * scale)), Image.LANCZOS)
        draw = ImageDraw.Draw(img)

        def to_px(x, y):
            return ((x - left) / res * scale, ((top - y) / res - row0) * scale)

        counts = {"ok": 0, "bad": 0, "other": 0}
        order = []  # draw deficient last so it sits on top
        for f in feats:
            cond = (f["properties"].get("functional_condition") or "").upper()
            if "DEFICIENT" in cond:
                col, key, z = DEFICIENT, "bad", 2
            elif "ACCEPTABLE" in cond:
                col, key, z = ACCEPTABLE, "ok", 1
            else:
                col, key, z = PENDING, "other", 0
            counts[key] += 1
            for line in lines_of(f["geometry"]):
                pts = [to_px(x, y) for x, y in ((c[0], c[1]) for c in line)]
                if len(pts) >= 2:
                    order.append((z, pts, col))
        order.sort(key=lambda t: t[0])
        for _, pts, _ in order:
            draw.line(pts, fill=HALO, width=5, joint="curve")
        for _, pts, col in order:
            draw.line(pts, fill=col, width=3, joint="curve")
        cond_path = os.path.join(OUT, "conditions.webp")
        img.save(cond_path, "WEBP", quality=84, method=6)
        print("conditions.webp", img.size, counts, os.path.getsize(cond_path) // 1024, "KB")

        # ---- 2. plain aerial: the 1152 x 864 m window with the most sidewalk ----
        win_w, win_h = 1920, 1440
        best = None
        pts_px = []
        for f in feats:
            for line in lines_of(f["geometry"]):
                for c in line:
                    pts_px.append(((c[0] - left) / res, (top - c[1]) / res))
        pts_px = np.array(pts_px)
        step = 240
        for r0 in range(0, H - win_h, step):
            for c0 in range(0, W - win_w, step):
                m = (pts_px[:, 0] >= c0) & (pts_px[:, 0] < c0 + win_w) & (pts_px[:, 1] >= r0) & (pts_px[:, 1] < r0 + win_h)
                n = int(m.sum())
                if best is None or n > best[0]:
                    best = (n, c0, r0)
        n, c0, r0 = best
        aerial = enhance(read_window(ds, c0, r0, win_w, win_h)).resize((1600, 1200), Image.LANCZOS)
        aer_path = os.path.join(OUT, "aerial_real.webp")
        aerial.save(aer_path, "WEBP", quality=84, method=6)
        print("aerial_real.webp", aerial.size, "sidewalk vertices in window:", n, "at px", (c0, r0), os.path.getsize(aer_path) // 1024, "KB")

    for name, dest in (("conditions.webp", "conditions.webp"), ("aerial_real.webp", "aerial-real.webp")):
        src = os.path.join(OUT, name)
        with open(src, "rb") as a, open(os.path.join(PUB, dest), "wb") as b:
            b.write(a.read())
        print("published", dest)


if __name__ == "__main__":
    sys.exit(main())
