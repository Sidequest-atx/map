"""Download City of Austin Tree Canopy 2022 polygons (Socrata blob 943x-7cq5, ~386 MB zip),
extract to the scratch dir, read with a bbox filter and clip to each box. Citywide zip is NOT kept."""
import json, os, sys, time, zipfile
from pathlib import Path
import requests
import geopandas as gpd
from shapely.geometry import box as sbox
from common import BOXES, CRS_M, ROOT

H = {"User-Agent": "sidequest-atx-render-spike/0.1 (contact: jamesjli2025@gmail.com)"}
DS = "943x-7cq5"
URL = f"https://data.austintexas.gov/download/{DS}/application%2Fx-zip-compressed"
scratch = Path(os.environ.get("SCRATCH", str(ROOT / "_sources"))) / "tree_canopy_2022"
scratch.mkdir(parents=True, exist_ok=True)
zp = scratch / "Tree_Canopy_2022.zip"
if not zp.exists() or zp.stat().st_size < 1e6:
    t0 = time.time()
    with requests.get(URL, headers=H, timeout=1800, stream=True, allow_redirects=True) as r:
        r.raise_for_status()
        with open(zp, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
    print(f"downloaded {zp.stat().st_size/1e6:.1f} MB in {time.time()-t0:.0f}s", flush=True)
z = zipfile.ZipFile(zp)
members = z.namelist()
print("members:", members[:30], flush=True)
z.extractall(scratch)
# find a readable vector source
cands = [p for p in scratch.rglob("*") if p.suffix.lower() in (".shp", ".gdb", ".geojson", ".gpkg")] + \
        [p for p in scratch.rglob("*.gdb") if p.is_dir()]
cands = list(dict.fromkeys(cands))
print("vector candidates:", cands, flush=True)
src = cands[0]
layers = None
try:
    import pyogrio
    layers = pyogrio.list_layers(src)
    print("layers:", layers, flush=True)
except Exception as e:  # noqa
    print("list_layers failed:", e, flush=True)
info = None
try:
    import pyogrio
    info = pyogrio.read_info(src)
    print("info:", {k: info[k] for k in ("crs", "fields", "geometry_type", "features") if k in info}, flush=True)
except Exception as e:  # noqa
    print("read_info failed:", e, flush=True)
src_crs = info["crs"] if info else None
for name, b in BOXES.items():
    t0 = time.time()
    bpoly = gpd.GeoSeries([sbox(*b)], crs="EPSG:4326")
    bb = tuple(bpoly.to_crs(src_crs).total_bounds) if src_crs else tuple(bpoly.total_bounds)
    gdf = gpd.read_file(src, bbox=bb)
    if gdf.crs is None:
        gdf = gdf.set_crs(src_crs)
    gdf = gdf.to_crs("EPSG:4326")
    gdf = gpd.clip(gdf, bpoly.iloc[0])
    gdf = gdf[~gdf.geometry.is_empty]
    outdir = ROOT / name / "austin_open_data"
    outdir.mkdir(parents=True, exist_ok=True)
    p1 = outdir / "tree_canopy_2022_4326.geojson"
    p2 = outdir / "tree_canopy_2022_32614.geojson"
    gdf.to_file(p1, driver="GeoJSON")
    g2 = gdf.to_crs(CRS_M)
    g2.to_file(p2, driver="GeoJSON")
    area = float(g2.area.sum())
    box_area = float(bpoly.to_crs(CRS_M).area.iloc[0])
    manp = outdir / "manifest.json"
    man = json.load(open(manp)) if manp.exists() else {}
    man["tree_canopy_2022"] = {"id": DS, "title": "Tree Canopy 2022 (Urban Forest Program)", "url": f"https://data.austintexas.gov/d/{DS}",
                               "download": URL, "license": "Public Domain", "source_file": str(src.name), "source_crs": str(src_crs),
                               "features": int(len(gdf)), "canopy_area_km2": round(area / 1e6, 3), "canopy_fraction_of_box": round(area / box_area, 3),
                               "columns": list(gdf.columns), "files": [p1.name, p2.name],
                               "fetched_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "seconds": round(time.time() - t0)}
    json.dump(man, open(manp, "w"), indent=1)
    print(f"[{name}] canopy polys={len(gdf)} area={area/1e6:.2f} km2 ({area/box_area:.1%} of box) in {time.time()-t0:.0f}s", flush=True)
