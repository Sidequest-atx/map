"""Fetch City of Austin open-data (Socrata) vector datasets clipped to each box via SoQL within_box,
save GeoJSON in EPSG:4326 and EPSG:32614. One request per 50k-row page; polite pauses."""
import json, sys, time
import requests
import geopandas as gpd
from common import BOXES, CRS_M, ROOT

H = {"User-Agent": "sidequest-atx-render-spike/0.1 (contact: jamesjli2025@gmail.com)"}
DOMAIN = "data.austintexas.gov"
TERMS = "City of Austin Open Data Terms of Use (https://data.austintexas.gov/stories/s/ranj-cccq)"
# key -> (dataset id, geometry column, human name, notes, license)
DATASETS = {
    "sidewalks": ("vchz-d9ng", "the_geom", "Sidewalks (Austin Transportation and Public Works)",
                  "Sidewalk/driveway/ped-facility inventory incl. functional_condition, rating_overall, "
                  "rating_no_veg, assessment_date, width, sidewalk_surface, year_built", TERMS),
    "street_centerline": ("8hf2-pdmb", "the_geom", "Street Centerline (Austin Technology Services GIS)",
                          "road_class, speed_limit, one_way, elevation_from/to, full_street_name", TERMS),
    "building_footprints_2013": ("3qcc-8uhz", "the_geom", "Building Footprints Year 2013",
                                 "Heads-up digitized from 2012/2013 ortho + 2012 lidar; max_height, "
                                 "elevation, base_elevation (feet)", TERMS),
    "planimetrics_2015": ("ucrq-eauf", "the_geom", "Planimetrics 2015",
                          "2015 planimetrics/impervious cover; feature class + max_height/elevation "
                          "for buildings", TERMS),
    "tree_inventory": ("wrik-xasw", "geometry", "Tree Inventory (public trees, as of 2020-03-13)",
                       "species, diameter (inches)", "Public Domain"),
    "downtown_tree_inventory_2013": ("7aq7-a66u", "the_geom", "Downtown Tree Inventory 2013",
                                     "species, dbh, height (ft), condition", "Public Domain"),
    "creeks": ("anma-viwb", "the_geom", "INLANDWATERS_creeks_lines", "stream centerlines", TERMS),
    "urban_trails": ("jdwm-wfps", "the_geom", "TRANSPORTATION_urban_trails_network",
                     "width, trail_surface_type, build_status", TERMS),
}
PAGE = 50000


def fetch(ds_id, geom_col, box):
    minx, miny, maxx, maxy = box
    where = f"within_box({geom_col},{maxy},{minx},{miny},{maxx})"
    feats, offset, nbytes = [], 0, 0
    while True:
        params = {"$where": where, "$limit": PAGE, "$offset": offset, "$order": ":id"}
        r = requests.get(f"https://{DOMAIN}/resource/{ds_id}.geojson", params=params, headers=H, timeout=300)
        if r.status_code != 200 and "$order" in params:
            params.pop("$order")
            r = requests.get(f"https://{DOMAIN}/resource/{ds_id}.geojson", params=params, headers=H, timeout=300)
        r.raise_for_status()
        nbytes += len(r.content)
        page = r.json().get("features", [])
        feats.extend(page)
        if len(page) < PAGE:
            break
        offset += PAGE
        time.sleep(1.5)
    return feats, nbytes, where


only_boxes = [a for a in sys.argv[1:] if a in BOXES] or list(BOXES)
only_ds = [a for a in sys.argv[1:] if a in DATASETS] or list(DATASETS)
for name in only_boxes:
    outdir = ROOT / name / "austin_open_data"
    outdir.mkdir(parents=True, exist_ok=True)
    manp = outdir / "manifest.json"
    man = json.load(open(manp)) if manp.exists() else {}
    for key in only_ds:
        ds_id, gcol, title, notes, lic = DATASETS[key]
        t0 = time.time()
        try:
            feats, nbytes, where = fetch(ds_id, gcol, BOXES[name])
        except Exception as e:  # noqa
            print(f"[{name}/{key}] FAILED: {e}", flush=True)
            man[key] = {"id": ds_id, "title": title, "error": str(e)[:300]}
            json.dump(man, open(manp, "w"), indent=1)
            continue
        feats = [f for f in feats if f.get("geometry")]
        if feats:
            gdf = gpd.GeoDataFrame.from_features(feats, crs="EPSG:4326")
            # Socrata may return nested dicts for some columns; stringify anything non-scalar
            for c in gdf.columns:
                if c != "geometry" and gdf[c].map(lambda v: isinstance(v, (dict, list))).any():
                    gdf[c] = gdf[c].map(lambda v: json.dumps(v) if isinstance(v, (dict, list)) else v)
        else:
            gdf = gpd.GeoDataFrame(columns=["geometry"], geometry="geometry", crs="EPSG:4326")
        p1 = outdir / f"{key}_4326.geojson"
        p2 = outdir / f"{key}_32614.geojson"
        gdf.to_file(p1, driver="GeoJSON")
        gdf.to_crs(CRS_M).to_file(p2, driver="GeoJSON")
        gt = gdf.geometry.geom_type.value_counts().to_dict() if len(gdf) else {}
        rec = {"id": ds_id, "title": title, "notes": notes, "license": lic,
               "url": f"https://{DOMAIN}/d/{ds_id}", "api": f"https://{DOMAIN}/resource/{ds_id}.geojson",
               "where": where, "features": int(len(gdf)), "geom_types": gt, "columns": [c for c in gdf.columns],
               "response_bytes": nbytes, "files": [p1.name, p2.name],
               "fetched_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
               "seconds": round(time.time() - t0, 1)}
        man[key] = rec
        json.dump(man, open(manp, "w"), indent=1)
        print(f"[{name}/{key}] {len(gdf)} features {gt} ({nbytes/1e6:.1f} MB, {time.time()-t0:.0f}s)", flush=True)
        time.sleep(2)
