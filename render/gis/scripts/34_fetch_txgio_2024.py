"""TxGIO (TNRIS) DataHub: StratMap 2024 Hays & Williamson lidar, 50 cm DSM + DEM quarter-quads
covering the Anderson Mill box (Jollyville NW + NE). Download zips to scratch, mosaic + clip to the box
in EPSG:32614, write DSM, DEM and HAG (DSM - DEM). Zips are deleted afterwards."""
import json, os, sys, time, zipfile
from pathlib import Path
import numpy as np
import rasterio, requests
from rasterio.vrt import WarpedVRT
from rasterio.merge import merge
from rasterio.enums import Resampling
from rasterio.warp import transform_bounds
from common import BOXES, CRS_M, ROOT

# NOTE: data.geographic.texas.gov (CloudFront) returns 403 for non-browser User-Agents
H = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36", "Referer": "https://data.geographic.texas.gov/"}
CID = "91943379-ef06-490e-ac08-66bc98fa1ce8"
NAME = "anderson_mill"
b = BOXES[NAME]
scratch = Path(os.environ.get("SCRATCH", str(ROOT / "_sources"))) / "txgio_2024"
scratch.mkdir(parents=True, exist_ok=True)
outdir = ROOT / NAME / "txgio_lidar_2024"
outdir.mkdir(parents=True, exist_ok=True)
rs = requests.get("https://api.tnris.org/api/v1/resources", params={"collection_id": CID, "area_type_name__icontains": "Jollyville", "limit": 50}, headers=H, timeout=60).json()
wanted = {}
for r in rs["results"]:
    a, t = r["area_type_name"], r["resource_type_abbreviation"]
    if a in ("Jollyville|NW", "Jollyville|NE") and t in ("DSM", "DEM"):
        wanted[(a, t)] = r
print("resources:", {k: (v["resource"], v["filesize"]) for k, v in wanted.items()}, flush=True)
man = {"collection": "Hays & Williamson Counties Lidar (StratMap 2024, Fugro), TxGIO DataHub",
       "collection_url": f"https://data.geographic.texas.gov/collection?c={CID}", "api": "https://api.tnris.org/api/v1/",
       "acquisition": "2024-01-10 to 2024-01-29", "license": "Public domain / free to use (TxGIO StratMap; cite 'Texas Geographic Information Office')",
       "sources": [], "rasters": {}}
tifs = {"DSM": [], "DEM": []}
for (area, typ), r in sorted(wanted.items()):
    zp = scratch / Path(r["resource"]).name
    if not zp.exists() or zp.stat().st_size < 1e6:
        t0 = time.time()
        with requests.get(r["resource"], headers=H, timeout=3600, stream=True) as resp:
            resp.raise_for_status()
            with open(zp, "wb") as f:
                for chunk in resp.iter_content(1 << 20):
                    f.write(chunk)
        print(f"downloaded {zp.name} {zp.stat().st_size/1e6:.0f} MB in {time.time()-t0:.0f}s", flush=True)
    d = scratch / zp.stem
    d.mkdir(exist_ok=True)
    zipfile.ZipFile(zp).extractall(d)
    found = [p for p in d.rglob("*") if p.suffix.lower() in (".tif", ".tiff", ".img")]
    print(f"  {area} {typ}: {len(found)} raster files, e.g. {[p.name for p in found[:3]]}", flush=True)
    tifs[typ] += found
    man["sources"].append({"area": area, "type": typ, "url": r["resource"], "zip_bytes": r["filesize"], "files": [p.name for p in found]})
arrs = {}
for typ, files in tifs.items():
    t0 = time.time()
    srcs = [rasterio.open(p) for p in files]
    s0 = srcs[0]
    print(f"  {typ} native crs={s0.crs.to_string()[:60]} res={s0.res} dtype={s0.dtypes[0]} nodata={s0.nodata} n={len(srcs)}", flush=True)
    res = float(s0.res[0])
    minx, miny, maxx, maxy = transform_bounds("EPSG:4326", CRS_M, *b, densify_pts=21)
    minx, miny = np.floor(minx / res) * res, np.floor(miny / res) * res
    maxx, maxy = np.ceil(maxx / res) * res, np.ceil(maxy / res) * res
    vrts = [WarpedVRT(s, crs=CRS_M, resampling=Resampling.bilinear) for s in srcs]
    nodata = s0.nodata if s0.nodata is not None else -9999.0
    arr, transform = merge(vrts, bounds=(minx, miny, maxx, maxy), res=res, nodata=nodata, resampling=Resampling.bilinear)
    for v in vrts:
        v.close()
    for s in srcs:
        s.close()
    a = arr[0].astype("float32")
    valid = ~np.isnan(a) & (a != nodata) & (a > -1000)
    a[~valid] = np.nan
    arrs[typ] = (a, transform)
    p = outdir / f"txgio2024_{typ.lower()}_{res:g}m.tif"
    with rasterio.open(p, "w", driver="GTiff", height=a.shape[0], width=a.shape[1], count=1, dtype="float32", crs=CRS_M,
                       transform=transform, nodata=np.nan, tiled=True, blockxsize=512, blockysize=512, compress="deflate", predictor=3) as dst:
        dst.write(a, 1)
        dst.build_overviews([2, 4, 8, 16], Resampling.average)
        dst.update_tags(SOURCE="TxGIO StratMap 2024 Hays & Williamson Counties Lidar", TYPE=typ)
    man["rasters"][typ.lower()] = {"file": str(p.relative_to(ROOT)), "native_crs": s0.crs.to_string(), "native_res_m": res, "shape": list(a.shape),
                                   "bounds_utm": [float(minx), float(miny), float(maxx), float(maxy)], "valid_fraction": float(valid.mean()),
                                   "min": float(np.nanmin(a)), "max": float(np.nanmax(a)), "seconds": round(time.time() - t0)}
    print(f"[{NAME}/{typ}] wrote {p.name} {a.shape} valid={valid.mean():.3f} range=({np.nanmin(a):.1f},{np.nanmax(a):.1f}) in {time.time()-t0:.0f}s", flush=True)
if "DSM" in arrs and "DEM" in arrs and arrs["DSM"][0].shape == arrs["DEM"][0].shape:
    hag = arrs["DSM"][0] - arrs["DEM"][0]
    p = outdir / "txgio2024_hag_1m.tif"
    with rasterio.open(p, "w", driver="GTiff", height=hag.shape[0], width=hag.shape[1], count=1, dtype="float32", crs=CRS_M,
                       transform=arrs["DSM"][1], nodata=np.nan, tiled=True, blockxsize=512, blockysize=512, compress="deflate", predictor=3) as dst:
        dst.write(hag.astype("float32"), 1)
        dst.build_overviews([2, 4, 8, 16], Resampling.average)
    man["rasters"]["hag"] = {"file": str(p.relative_to(ROOT)), "derived": "DSM - DEM", "p50": float(np.nanpercentile(hag, 50)),
                             "p95": float(np.nanpercentile(hag, 95)), "max": float(np.nanmax(hag)),
                             "frac_gt_2m": float(np.nanmean(hag > 2))}
    print(f"[{NAME}/HAG] wrote {p.name} p95={np.nanpercentile(hag,95):.1f} max={np.nanmax(hag):.1f} frac>2m={np.nanmean(hag>2):.3f}", flush=True)
json.dump(man, open(outdir / "manifest.json", "w"), indent=1, default=str)
for zp in scratch.glob("*.zip"):
    zp.unlink()
print("done", flush=True)
