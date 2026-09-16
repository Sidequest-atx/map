"""Walk render/gis/<box>/ and print a Markdown inventory (size, CRS, resolution or feature count) for the README."""
import json, os
from pathlib import Path
import rasterio, geopandas as gpd
from common import ROOT, BOXES
rows = []
for name in BOXES:
    for p in sorted((ROOT / name).rglob("*")):
        if p.is_dir() or p.name == "manifest.json":
            continue
        rel = p.relative_to(ROOT).as_posix()
        mb = p.stat().st_size / 1e6
        if p.suffix == ".tif":
            with rasterio.open(p) as s:
                crs = s.crs.to_epsg() or s.crs.to_string()[:30]
                desc = f"{s.width}x{s.height} px @ {s.res[0]:g} m, {s.count} band {s.dtypes[0]}, {s.profile.get('compress')}"
        elif p.suffix == ".geojson":
            crs = "4326" if "_4326" in p.name else ("32614" if "_32614" in p.name else "?")
            try:
                g = gpd.read_file(p, engine="pyogrio")
                gt = g.geometry.geom_type.value_counts().to_dict() if len(g) else {}
                desc = f"{len(g)} features " + ",".join(f"{k}:{v}" for k, v in gt.items())
            except Exception as e:  # noqa
                desc = f"unreadable: {e}"[:60]
        elif p.suffix == ".csv":
            crs = "-"; desc = f"{sum(1 for _ in open(p, encoding='utf-8')) - 1} rows"
        elif p.suffix == ".png":
            crs = "-"; desc = "quick-look PNG"
        else:
            crs = "-"; desc = ""
        rows.append((rel, mb, crs, desc))
SRC = [  # (path substring, year, source key, license key) -- keys are defined in README "Sources" section
    ("/naip/", "2022", "S1 NAIP", "PD"),
    ("/3dep/", "2017 (pub. 2019)", "S2 3DEP", "PD"),
    ("/txgio_lidar_2024/", "2024-01", "S3 TxGIO 2024", "PD"),
    ("/osm/", "2026-09-16 snapshot", "S4 OSM", "ODbL"),
    ("/capmetro/", "feed 2026-08-26", "S5 GTFS", "CapMetro ToU"),
    ("sidewalks_", "2006/07 + rolling", "S6a Sidewalks", "CoA ToU"),
    ("street_centerline_", "rolling (daily)", "S6b Street Centerline", "CoA ToU"),
    ("building_footprints_2013_", "2012/13", "S6c Footprints 2013", "CoA ToU"),
    ("planimetrics_2015_", "2015", "S6d Planimetrics 2015", "CoA ToU"),
    ("downtown_tree_inventory_2013_", "2013", "S6f Downtown Trees 2013", "PD"),
    ("tree_inventory_", "2013-2020", "S6e Tree Inventory", "PD"),
    ("creeks_", "rolling", "S6g Creeks", "CoA ToU"),
    ("urban_trails_", "rolling", "S6h Urban Trails", "CoA ToU"),
    ("tree_canopy_2022_", "2022", "S6i Tree Canopy 2022", "PD"),
    ("buildings_2021_", "2012-2021 vintages", "S7a Impervious Cover 2021 (Structure)", "CoA ToU"),
    ("surfaces_2021_", "2012-2021 vintages", "S7a Impervious Cover 2021 (surfaces)", "CoA ToU"),
    ("buildings_2017_", "2012-2017 vintages", "S7b Footprints 2017", "CoA ToU"),
    ("quicklook_", "-", "derived", "-"),
]
def meta(rel):
    for sub, y, sk, lic in SRC:
        if sub in rel:
            return y, sk, lic
    return "?", "?", "?"
print("| File | MB | EPSG | Year | Source | License | Contents |")
print("|---|---:|---|---|---|---|---|")
for rel, mb, crs, desc in rows:
    y, sk, lic = meta(rel)
    print(f"| `{rel}` | {mb:.1f} | {crs} | {y} | {sk} | {lic} | {desc} |")
tot = sum(r[1] for r in rows)
print(f"\nTotal listed: {tot/1000:.2f} GB in {len(rows)} files")
