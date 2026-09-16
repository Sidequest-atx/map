"""Two more site images from the real data, both 1600x1200 WebP:
- never-built.webp: the ortho around the longest residential street in the
  box with no City sidewalk segment on either side (found by measuring OSM
  residential ways against the City's sidewalk lines);
- failing.webp: the City's condition map re-drawn at higher scale over the
  1200 x 900 m window holding the most "functionally deficient" segments.
Run: render/gis/.venv/Scripts/python render/gis/scripts/61_site_crops.py
"""
import json
import os
import sys

import numpy as np
import rasterio
from PIL import Image, ImageDraw, ImageEnhance, ImageOps
from rasterio.windows import Window
from shapely.geometry import LineString, shape
from shapely.strtree import STRtree

HERE = os.path.dirname(os.path.abspath(__file__))
GIS = os.path.dirname(HERE)
RENDER = os.path.dirname(GIS)
REPO = os.path.dirname(RENDER)
BOX = os.path.join(GIS, "anderson_mill")
OUT = os.path.join(RENDER, "out", "stills")
PUB = os.path.join(REPO, "public", "media")
NAIP = os.path.join(BOX, "naip", "naip_2022_rgb_60cm_jpeg.tif")
SIDEWALKS = os.path.join(BOX, "austin_open_data", "sidewalks_32614.geojson")
HIGHWAYS = os.path.join(BOX, "osm", "highways_32614.geojson")

ACCEPTABLE = (146, 176, 78)
DEFICIENT = (226, 96, 52)
PENDING = (205, 205, 200)
HALO = (20, 22, 16)


def enhance(img):
    img = ImageOps.autocontrast(img, cutoff=0.6)
    img = ImageEnhance.Color(img).enhance(1.12)
    img = ImageEnhance.Contrast(img).enhance(1.06)
    return img


def lines_of(geom):
    if geom["type"] == "LineString":
        return [geom["coordinates"]]
    if geom["type"] == "MultiLineString":
        return geom["coordinates"]
    return []


def main():
    sw = json.load(open(SIDEWALKS, encoding="utf-8"))["features"]
    hw = json.load(open(HIGHWAYS, encoding="utf-8"))["features"]
    sw_geoms = []
    for f in sw:
        g = shape(f["geometry"])
        if not g.is_empty:
            sw_geoms.append(g)
    tree = STRtree(sw_geoms)

    # ---- never built: residential ways far from every sidewalk segment ----
    # houses (City 2021 structure polygons) so the pick is a real residential street, not a service road
    bld_path = os.path.join(BOX, "austin_open_data", "buildings_2021_32614.geojson")
    houses = []
    if os.path.exists(bld_path):
        for f in json.load(open(bld_path, encoding="utf-8"))["features"]:
            try:
                g = shape(f["geometry"])
            except Exception:
                continue
            if not g.is_empty and 60 < g.area < 420:  # single-family footprints
                houses.append(g.centroid)
    htree = STRtree(houses) if houses else None

    cands = []
    for f in hw:
        p = f["properties"]
        if p.get("highway") != "residential" or not p.get("name"):
            continue
        g = shape(f["geometry"])
        if g.geom_type != "LineString" or not (260 <= g.length <= 900):
            continue
        n = max(8, int(g.length / 6))
        far = 0
        for i in range(n + 1):
            pt = g.interpolate(i / n, normalized=True)
            idx = tree.nearest(pt)
            d = sw_geoms[idx].distance(pt) if idx is not None else 1e9
            if d > 11:
                far += 1
        frac = far / (n + 1)
        if frac < 0.92:
            continue
        # houses per 100 m within 35 m of the centerline
        nh = 0
        if htree is not None:
            for j in htree.query(g.buffer(35)):
                if houses[j].distance(g) <= 35:
                    nh += 1
        density = nh / (g.length / 100)
        cands.append((density, g.length, f))
    cands.sort(key=lambda t: -t[0])
    print("sidewalk-less residential streets:", len(cands), "densest:", [(round(c[0], 1), round(c[1]), c[2]["properties"].get("name")) for c in cands[:6]])

    with rasterio.open(NAIP) as ds:
        left, top = ds.bounds.left, ds.bounds.top
        res = ds.res[0]
        W, H = ds.width, ds.height
        win_w, win_h = 1600, 1200  # px at 0.6 m => 960 x 720 m

        def crop_at(cx, cy, w=win_w, h=win_h):
            c0 = int(np.clip((cx - left) / res - w / 2, 0, W - w))
            r0 = int(np.clip((top - cy) / res - h / 2, 0, H - h))
            arr = ds.read(window=Window(c0, r0, w, h))
            return enhance(Image.fromarray(np.transpose(arr, (1, 2, 0)))), c0, r0

        if cands:
            g = cands[0][2]
            geom = shape(g["geometry"])
            c = geom.interpolate(0.5, normalized=True)
            # tighter: 1200 x 900 px = 720 x 540 m, so houses and curbs read; upscale to 1600
            img, c0, r0 = crop_at(c.x, c.y, 1200, 900)
            img = img.resize((1600, 1200), Image.LANCZOS)
            path = os.path.join(OUT, "never-built.webp")
            img.save(path, "WEBP", quality=84, method=6)
            print("never-built.webp", g["properties"].get("name"), round(geom.length), "m", os.path.getsize(path) // 1024, "KB")

        # ---- failing: densest deficient window, lines redrawn at crop scale ----
        pts = []
        for f in sw:
            if "DEFICIENT" not in (f["properties"].get("functional_condition") or "").upper():
                continue
            for line in lines_of(f["geometry"]):
                for cxy in line:
                    pts.append(((cxy[0] - left) / res, (top - cxy[1]) / res))
        pts = np.array(pts)
        best = None
        for r0 in range(0, H - win_h, 200):
            for c0 in range(0, W - win_w, 200):
                m = (pts[:, 0] >= c0) & (pts[:, 0] < c0 + win_w) & (pts[:, 1] >= r0) & (pts[:, 1] < r0 + win_h)
                n = int(m.sum())
                if best is None or n > best[0]:
                    best = (n, c0, r0)
        n, c0, r0 = best
        arr = ds.read(window=Window(c0, r0, win_w, win_h))
        img = ImageEnhance.Brightness(enhance(Image.fromarray(np.transpose(arr, (1, 2, 0))))).enhance(0.9)
        draw = ImageDraw.Draw(img)

        def to_px(x, y):
            return ((x - left) / res - c0, (top - y) / res - r0)

        order = []
        for f in sw:
            cond = (f["properties"].get("functional_condition") or "").upper()
            col, z = (DEFICIENT, 2) if "DEFICIENT" in cond else ((ACCEPTABLE, 1) if "ACCEPTABLE" in cond else (PENDING, 0))
            for line in lines_of(f["geometry"]):
                p2 = [to_px(a, b) for a, b in ((q[0], q[1]) for q in line)]
                if any(-50 < x < win_w + 50 and -50 < y < win_h + 50 for x, y in p2) and len(p2) >= 2:
                    order.append((z, p2, col))
        order.sort(key=lambda t: t[0])
        for _, p2, _ in order:
            draw.line(p2, fill=HALO, width=8, joint="curve")
        for _, p2, col in order:
            draw.line(p2, fill=col, width=5, joint="curve")
        path = os.path.join(OUT, "failing.webp")
        img.save(path, "WEBP", quality=84, method=6)
        print("failing.webp deficient vertices:", n, os.path.getsize(path) // 1024, "KB")

    for name in ("never-built.webp", "failing.webp"):
        src = os.path.join(OUT, name)
        if os.path.exists(src):
            with open(src, "rb") as a, open(os.path.join(PUB, name), "wb") as b:
                b.write(a.read())
            print("published", name)


if __name__ == "__main__":
    sys.exit(main())
