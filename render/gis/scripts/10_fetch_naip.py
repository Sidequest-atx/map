"""Fetch NAIP (latest year on Planetary Computer) for each box, windowed from COGs,
mosaic + reproject to EPSG:32614, write RGBN GeoTIFF, RGB JPEG-TIFF (for Blender),
NDVI float32 and vegetation mask (NDVI > 0.35)."""
import json, os, sys, time
import numpy as np
import rasterio
from rasterio.vrt import WarpedVRT
from rasterio.merge import merge
from rasterio.enums import Resampling
from rasterio.warp import transform_bounds
from pystac_client import Client
import planetary_computer as pc
from common import BOXES, STAC_URL, CRS_M, ROOT, box_geojson

os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("GDAL_HTTP_MERGE_CONSECUTIVE_RANGES", "YES")
os.environ.setdefault("GDAL_HTTP_MULTIRANGE", "YES")
os.environ.setdefault("VSI_CACHE", "TRUE")
os.environ.setdefault("GDAL_CACHEMAX", "1024")
os.environ.setdefault("CPL_VSIL_CURL_CHUNK_SIZE", "10485760")

RES = 0.6
only = sys.argv[1:] or list(BOXES)
cat = Client.open(STAC_URL, modifier=pc.sign_inplace)
for name in only:
    b = BOXES[name]
    t0 = time.time()
    outdir = ROOT / name / "naip"
    outdir.mkdir(parents=True, exist_ok=True)
    items = list(cat.search(collections=["naip"], intersects=box_geojson(b)).items())
    years = sorted({it.properties["naip:year"] for it in items})
    year = years[-1]
    sel = [it for it in items if it.properties["naip:year"] == year]
    print(f"[{name}] NAIP years available {years}; using {year}: {[i.id for i in sel]}", flush=True)
    # UTM envelope of the lon/lat box, snapped to RES grid
    minx, miny, maxx, maxy = transform_bounds("EPSG:4326", CRS_M, *b, densify_pts=21)
    minx, miny = np.floor(minx / RES) * RES, np.floor(miny / RES) * RES
    maxx, maxy = np.ceil(maxx / RES) * RES, np.ceil(maxy / RES) * RES
    width, height = int(round((maxx - minx) / RES)), int(round((maxy - miny) / RES))
    print(f"[{name}] target grid {width}x{height} @ {RES} m, bounds {(minx, miny, maxx, maxy)}", flush=True)
    srcs, vrts, src_info = [], [], []
    for it in sel:
        href = it.assets["image"].href
        s = rasterio.open(href)
        src_info.append({"id": it.id, "href": href.split("?")[0], "crs": str(s.crs), "res": s.res,
                         "shape": (s.height, s.width), "dtype": s.dtypes[0], "count": s.count,
                         "compress": s.profile.get("compress"),
                         "datetime": str(it.datetime), "gsd": it.properties.get("gsd")})
        print(f"   src {it.id}: crs={s.crs} res={s.res} shape={s.shape} bands={s.count} "
              f"{s.dtypes[0]} compress={s.profile.get('compress')}", flush=True)
        srcs.append(s)
        vrts.append(WarpedVRT(s, crs=CRS_M, resampling=Resampling.bilinear))
    mosaic, transform = merge(vrts, bounds=(minx, miny, maxx, maxy), res=RES, nodata=0,
                              resampling=Resampling.bilinear)
    for v in vrts:
        v.close()
    for s in srcs:
        s.close()
    print(f"[{name}] mosaic shape {mosaic.shape} in {time.time()-t0:.0f}s", flush=True)
    assert mosaic.shape[0] == 4, mosaic.shape
    base = dict(driver="GTiff", height=mosaic.shape[1], width=mosaic.shape[2], crs=CRS_M,
                transform=transform, tiled=True, blockxsize=512, blockysize=512, BIGTIFF="IF_SAFER")
    # 4-band lossless
    p = outdir / f"naip_{year}_rgbn_60cm.tif"
    with rasterio.open(p, "w", count=4, dtype="uint8", compress="deflate", predictor=2, zlevel=6,
                       nodata=0, **base) as dst:
        dst.write(mosaic)
        dst.descriptions = ("red", "green", "blue", "nir")
        dst.build_overviews([2, 4, 8, 16], Resampling.average)
        dst.update_tags(SOURCE="USDA NAIP via Microsoft Planetary Computer", YEAR=str(year),
                        LICENSE="Public domain (US Government work)")
    # 3-band RGB JPEG for Blender texture use
    p2 = outdir / f"naip_{year}_rgb_60cm_jpeg.tif"
    with rasterio.open(p2, "w", count=3, dtype="uint8", compress="JPEG", JPEG_QUALITY=90,
                       photometric="YCBCR", **base) as dst:
        dst.write(mosaic[:3])
        dst.build_overviews([2, 4, 8, 16], Resampling.average)
    # NDVI + mask
    red = mosaic[0].astype("float32")
    nir = mosaic[3].astype("float32")
    with np.errstate(divide="ignore", invalid="ignore"):
        ndvi = (nir - red) / (nir + red)
    valid = (mosaic.sum(axis=0) > 0)
    ndvi = np.where(valid, ndvi, np.nan).astype("float32")
    p3 = outdir / f"naip_{year}_ndvi.tif"
    with rasterio.open(p3, "w", count=1, dtype="float32", compress="deflate", predictor=3, zlevel=6,
                       nodata=np.nan, **base) as dst:
        dst.write(ndvi, 1)
        dst.build_overviews([2, 4, 8, 16], Resampling.average)
    mask = ((ndvi > 0.35) & valid).astype("uint8")
    p4 = outdir / f"naip_{year}_vegmask_ndvi_gt_0p35.tif"
    with rasterio.open(p4, "w", count=1, dtype="uint8", compress="deflate", zlevel=9, nodata=255,
                       **base) as dst:
        dst.write(mask, 1)
        dst.build_overviews([2, 4, 8, 16], Resampling.nearest)
    stats = {"ndvi_mean": float(np.nanmean(ndvi)), "ndvi_p05": float(np.nanpercentile(ndvi, 5)),
             "ndvi_p95": float(np.nanpercentile(ndvi, 95)), "veg_fraction": float(mask[valid].mean()),
             "valid_fraction": float(valid.mean())}
    man = {"year": year, "years_available": years, "sources": src_info,
           "grid": {"crs": CRS_M, "res_m": RES, "width": width, "height": height,
                    "bounds_utm": [float(minx), float(miny), float(maxx), float(maxy)]},
           "files": [str(x.relative_to(ROOT)) for x in (p, p2, p3, p4)], "stats": stats,
           "seconds": round(time.time() - t0)}
    print(f"[{name}] done in {time.time()-t0:.0f}s stats={stats}", flush=True)
    json.dump(man, open(outdir / "manifest.json", "w"), indent=1, default=str)
