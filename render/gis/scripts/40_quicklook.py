"""Quick-look PNG per box: NAIP RGB ortho (downsampled via overviews) with OSM building footprints outlined,
plus a second panel with DSM hillshade + HAG. Saves <box>/quicklook_<box>.png."""
import sys
import numpy as np, rasterio, geopandas as gpd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
from rasterio.enums import Resampling
from common import ROOT, BOXES, CRS_M

MAXW = 3000
for name in (sys.argv[1:] or list(BOXES)):
    d = ROOT / name
    rgb_p = next((d / "naip").glob("naip_*_rgb_60cm_jpeg.tif"))
    with rasterio.open(rgb_p) as s:
        f = max(1, int(np.ceil(s.width / MAXW)))
        out_shape = (3, s.height // f, s.width // f)
        rgb = s.read(out_shape=out_shape, resampling=Resampling.average)
        b = s.bounds
        year = rgb_p.name.split("_")[1]
    img = np.moveaxis(rgb, 0, -1)
    bld = gpd.read_file(d / "osm" / "buildings_32614.geojson")
    segs = []
    for g in bld.geometry:
        polys = g.geoms if g.geom_type == "MultiPolygon" else [g]
        for p in polys:
            segs.append(np.asarray(p.exterior.coords))
    with rasterio.open(d / "3dep" / "3dep_dsm_2m.tif") as s:
        dsm = s.read(1).astype("float32"); dsm[dsm == s.nodata] = np.nan; db = s.bounds
    with rasterio.open(d / "3dep" / "3dep_hag_2m.tif") as s:
        hag = s.read(1).astype("float32"); hag[hag == s.nodata] = np.nan
    # hillshade
    z = np.where(np.isnan(dsm), np.nanmean(dsm), dsm)
    gy, gx = np.gradient(z, 2.0)
    slope = np.arctan(np.hypot(gx, gy)); aspect = np.arctan2(-gx, gy)
    az, alt = np.radians(315), np.radians(45)
    hs = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    ext_rgb = (b.left, b.right, b.bottom, b.top)
    ext_dsm = (db.left, db.right, db.bottom, db.top)
    w_km = (b.right - b.left) / 1000; h_km = (b.top - b.bottom) / 1000
    fig, axes = plt.subplots(1, 2, figsize=(22, 11 * h_km / w_km + 1.2), dpi=150)
    ax = axes[0]
    ax.imshow(img, extent=ext_rgb, interpolation="bilinear")
    ax.add_collection(LineCollection(segs, colors="#ffec3d", linewidths=0.35, alpha=0.9))
    ax.set_xlim(b.left, b.right); ax.set_ylim(b.bottom, b.top)
    ax.set_title(f"{name}: NAIP {year} RGB 0.6 m (EPSG:32614) + OSM building footprints (n={len(bld)})", fontsize=11)
    ax.set_xlabel("Easting (m)"); ax.set_ylabel("Northing (m)")
    ax = axes[1]
    ax.imshow(hs, extent=ext_dsm, cmap="gray", vmin=-0.2, vmax=1.2, interpolation="bilinear")
    hm = np.where(hag > 2, hag, np.nan)
    im = ax.imshow(hm, extent=ext_dsm, cmap="viridis", vmin=2, vmax=40, alpha=0.75, interpolation="nearest")
    ax.set_xlim(b.left, b.right); ax.set_ylim(b.bottom, b.top)
    ax.set_title("USGS 3DEP 2017 lidar: DSM 2 m hillshade + height-above-ground > 2 m", fontsize=11)
    ax.set_xlabel("Easting (m)")
    plt.colorbar(im, ax=ax, fraction=0.03, pad=0.02, label="HAG (m)")
    plt.tight_layout()
    out = d / f"quicklook_{name}.png"
    fig.savefig(out, dpi=150)
    print(f"[{name}] wrote {out} (ortho downsample factor {f}, {img.shape[1]}x{img.shape[0]})", flush=True)
