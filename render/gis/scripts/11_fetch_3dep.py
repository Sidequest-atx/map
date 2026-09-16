"""Fetch USGS 3DEP lidar-derived DSM / DTM / HAG rasters clipped to each box (EPSG:32614),
and probe the 3dep-lidar-copc point-cloud tiles (metadata + HTTP HEAD size only, NO download)."""
import json, os, sys, time
import numpy as np
import rasterio, requests
from rasterio.vrt import WarpedVRT
from rasterio.merge import merge
from rasterio.enums import Resampling
from rasterio.warp import transform_bounds
from shapely.geometry import shape, box as sbox
from shapely.ops import transform as stransform, unary_union
from pyproj import Transformer
from pystac_client import Client
import planetary_computer as pc
from common import BOXES, STAC_URL, CRS_M, ROOT, box_geojson

os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("GDAL_HTTP_MERGE_CONSECUTIVE_RANGES", "YES")
os.environ.setdefault("VSI_CACHE", "TRUE")

only = sys.argv[1:] or list(BOXES)
cat = Client.open(STAC_URL, modifier=pc.sign_inplace)
to_utm = Transformer.from_crs("EPSG:4326", CRS_M, always_xy=True).transform
for name in only:
    b = BOXES[name]
    outdir = ROOT / name / "3dep"
    outdir.mkdir(parents=True, exist_ok=True)
    man = {"rasters": {}, "copc": []}
    box_utm = stransform(to_utm, sbox(*b))
    dsm_items = list(cat.search(collections=["3dep-lidar-dsm"], intersects=box_geojson(b)).items())
    for coll, tag in [("3dep-lidar-dsm", "dsm"), ("3dep-lidar-dtm", "dtm"), ("3dep-lidar-hag", "hag")]:
        t0 = time.time()
        if tag == "dtm":
            # WORKAROUND: PC's 3dep-lidar-dtm item footprints for this project are mis-registered
            # (the STAC search returns tiles 8-40 km away). The DTM COGs exist at the same tile
            # indices as the DSM, so derive the DTM hrefs from the DSM tile list and sign them.
            items = []
            for it in dsm_items:
                href = pc.sign(it.assets["data"].href.split("?")[0].replace("/dsm/", "/dtm/").replace("-dsm-", "-dtm-"))
                items.append((it.id.replace("-dsm-", "-dtm-"), href, it.properties))
        else:
            items = [(it.id, it.assets["data"].href, it.properties) for it in
                     cat.search(collections=[coll], intersects=box_geojson(b)).items()]
        srcs, vrts, info = [], [], []
        native_res, native_crs, nodata = None, None, None
        for iid, href, props in items:
            class _A:  # minimal shim so the loop body below is unchanged
                pass
            it = _A(); it.id = iid; it.properties = props
            a = _A(); a.href = href
            s = rasterio.open(a.href)
            native_res, native_crs, nodata = s.res, str(s.crs), s.nodata
            info.append({"id": it.id, "href": a.href.split("?")[0], "crs": str(s.crs), "res": s.res,
                         "shape": s.shape, "dtype": s.dtypes[0], "nodata": s.nodata,
                         "bounds": list(s.bounds), "project": it.properties.get("3dep:usgs_id"),
                         "start": it.properties.get("start_datetime"),
                         "end": it.properties.get("end_datetime")})
            print(f"  [{name}/{tag}] {it.id} crs={s.crs} res={s.res} shape={s.shape} "
                  f"nodata={s.nodata} bounds={[round(x) for x in s.bounds]}", flush=True)
            srcs.append(s)
            vrts.append(WarpedVRT(s, crs=CRS_M, resampling=Resampling.bilinear))
        res = float(native_res[0])
        minx, miny, maxx, maxy = transform_bounds("EPSG:4326", CRS_M, *b, densify_pts=21)
        minx, miny = np.floor(minx / res) * res, np.floor(miny / res) * res
        maxx, maxy = np.ceil(maxx / res) * res, np.ceil(maxy / res) * res
        arr, transform = merge(vrts, bounds=(minx, miny, maxx, maxy), res=res, nodata=nodata,
                               resampling=Resampling.bilinear, method="first")
        for v in vrts:
            v.close()
        for s in srcs:
            s.close()
        a = arr[0]
        valid = ~np.isnan(a) if nodata is None or np.isnan(nodata) else (a != nodata)
        p = outdir / f"3dep_{tag}_{res:g}m.tif"
        with rasterio.open(p, "w", driver="GTiff", height=a.shape[0], width=a.shape[1], count=1,
                           dtype="float32", crs=CRS_M, transform=transform, nodata=nodata,
                           tiled=True, blockxsize=512, blockysize=512, compress="deflate",
                           predictor=3) as dst:
            dst.write(a.astype("float32"), 1)
            dst.build_overviews([2, 4, 8], Resampling.average)
            dst.update_tags(SOURCE=f"USGS 3DEP {coll} via Microsoft Planetary Computer",
                            PROJECT=info[0]["project"] if info else "",
                            LICENSE="Public domain (US Government work)")
        st = {"min": float(np.nanmin(a[valid])), "max": float(np.nanmax(a[valid])),
              "mean": float(np.nanmean(a[valid])), "valid_fraction": float(valid.mean()),
              "shape": list(a.shape), "res_m": res,
              "bounds_utm": [float(minx), float(miny), float(maxx), float(maxy)]}
        try:
            tiles = unary_union([
                stransform(Transformer.from_crs(i["crs"], CRS_M, always_xy=True).transform,
                           sbox(*i["bounds"])) for i in info])
            st["tile_coverage_of_box"] = float(tiles.intersection(box_utm).area / box_utm.area)
        except Exception as e:  # noqa
            st["tile_coverage_of_box"] = f"err {e}"
        man["rasters"][tag] = {"collection": coll, "file": str(p.relative_to(ROOT)),
                               "native_res_m": native_res, "native_crs": native_crs,
                               "sources": info, "stats": st, "seconds": round(time.time() - t0)}
        print(f"[{name}/{tag}] wrote {p.name} {a.shape} stats={st} ({time.time()-t0:.0f}s)",
              flush=True)
    # COPC probe (no download)
    items = list(cat.search(collections=["3dep-lidar-copc"], intersects=box_geojson(b)).items())
    tot_pts, tot_bytes, tot_area = 0, 0, 0.0
    for it in items:
        a = it.assets["data"]
        href = a.href
        geom_utm = stransform(to_utm, shape(it.geometry))
        area = geom_utm.area
        try:
            r = requests.head(href, timeout=30, allow_redirects=True)
            size = int(r.headers.get("Content-Length", 0)) or None
        except Exception as e:  # noqa
            size = f"err {e}"
        cnt = it.properties.get("pc:count")
        dens = cnt / area if (cnt and area) else None
        rec = {"id": it.id, "href": href.split("?")[0], "points": cnt,
               "tile_area_km2": round(area / 1e6, 3),
               "density_pts_per_m2": round(dens, 2) if dens else None, "size_bytes": size,
               "size_MB": round(size / 1e6, 1) if isinstance(size, int) else size,
               "pc:density_prop": it.properties.get("pc:density"),
               "pc:type": it.properties.get("pc:type"),
               "encoding": it.properties.get("pc:encoding"),
               "project": it.properties.get("3dep:usgs_id"),
               "start": it.properties.get("start_datetime"), "end": it.properties.get("end_datetime"),
               "intersects_box_frac": round(geom_utm.intersection(box_utm).area / area, 3)}
        man["copc"].append(rec)
        if cnt:
            tot_pts += cnt
        if isinstance(size, int):
            tot_bytes += size
        tot_area += area
        print(f"  [{name}/copc] {it.id} pts={cnt} area={area/1e6:.2f}km2 "
              f"dens={rec['density_pts_per_m2']} size={rec['size_MB']}MB", flush=True)
    man["copc_summary"] = {"tiles": len(items), "total_points": tot_pts, "total_bytes": tot_bytes,
                           "total_GB": round(tot_bytes / 1e9, 2),
                           "mean_density_pts_per_m2": round(tot_pts / tot_area, 2) if tot_area else None,
                           "box_area_km2": round(box_utm.area / 1e6, 2)}
    print(f"[{name}] COPC summary {man['copc_summary']}", flush=True)
    json.dump(man, open(outdir / "manifest.json", "w"), indent=1, default=str)
