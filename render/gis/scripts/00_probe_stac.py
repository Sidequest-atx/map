"""Probe Planetary Computer STAC for NAIP + 3DEP coverage over both boxes. No downloads."""
import json, sys
from pystac_client import Client
import planetary_computer as pc
from common import BOXES, STAC_URL, box_geojson

cat = Client.open(STAC_URL, modifier=pc.sign_inplace)
out = {}
for name, b in BOXES.items():
    out[name] = {}
    print(f"\n===== {name} {b} =====")
    # NAIP
    s = cat.search(collections=["naip"], intersects=box_geojson(b))
    items = list(s.items())
    print(f"NAIP items: {len(items)}")
    by_year = {}
    for it in items:
        y = it.properties.get("naip:year")
        by_year.setdefault(y, []).append(it)
    for y in sorted(by_year, key=lambda x: str(x)):
        its = by_year[y]
        gsd = {it.properties.get("gsd") for it in its}
        print(f"  year {y}: {len(its)} items, gsd={gsd}, ids={[i.id for i in its][:6]}")
        for it in its[:1]:
            a = it.assets["image"]
            print(f"    sample asset href: {a.href.split('?')[0]}")
            print(f"    datetime={it.datetime}, props keys={list(it.properties.keys())}")
    out[name]["naip"] = {str(y): [i.id for i in its] for y, its in by_year.items()}
    # 3DEP rasters
    for coll in ["3dep-lidar-dsm", "3dep-lidar-dtm", "3dep-lidar-hag", "3dep-lidar-copc"]:
        s = cat.search(collections=[coll], intersects=box_geojson(b))
        items = list(s.items())
        print(f"{coll}: {len(items)} items")
        out[name][coll] = []
        for it in items:
            p = it.properties
            info = {
                "id": it.id,
                "datetime": str(it.datetime),
                "start": p.get("start_datetime"), "end": p.get("end_datetime"),
                "gsd": p.get("gsd"),
                "project": p.get("3dep:usgs_id"),
                "assets": list(it.assets.keys()),
            }
            if coll == "3dep-lidar-copc":
                info["pc:count"] = p.get("pc:count")
                info["pc:density"] = p.get("pc:density")
                info["pc:type"] = p.get("pc:type")
                info["pc:encoding"] = p.get("pc:encoding")
                for k, a in it.assets.items():
                    info[f"asset_{k}_href"] = a.href.split("?")[0]
                    info[f"asset_{k}_extra"] = {kk: vv for kk, vv in a.extra_fields.items() if kk != "table:columns"}
            else:
                a = it.assets.get("data")
                if a is not None:
                    info["href"] = a.href.split("?")[0]
                    info["raster:bands"] = a.extra_fields.get("raster:bands")
                    info["proj:epsg"] = p.get("proj:epsg")
                    info["proj:shape"] = p.get("proj:shape")
                    info["proj:transform"] = p.get("proj:transform")
            out[name][coll].append(info)
            print("   ", json.dumps({k: v for k, v in info.items() if not k.startswith("asset_") and k not in ("proj:transform",)}, default=str)[:400])
json.dump(out, open("scripts/_probe_stac.json", "w"), indent=1, default=str)
