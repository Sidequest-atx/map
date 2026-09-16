"""Fetch City of Austin ArcGIS Online feature services clipped to each box (paged REST queries):
- impervious_cover_2021 FEATURE='Structure' -> building footprints (2013/2017/2021 vintages) with MAX_HEIGHT (ft)
- impervious_cover_2021 paved/other surfaces (roads, parking, sidewalks, bridges, pools, courts...)
- building_footprints_2017 (all)
Saves GeoJSON in EPSG:4326 and EPSG:32614 and adds height_m / elevation_m columns."""
import json, sys, time
import requests
import geopandas as gpd
from common import BOXES, CRS_M, ROOT

H = {"User-Agent": "sidequest-atx-render-spike/0.1 (contact: jamesjli2025@gmail.com)"}
BASE = "https://services.arcgis.com/0L95CJ0VTaxqcmED/arcgis/rest/services"
TERMS = "City of Austin Open Data Terms of Use (https://data.austintexas.gov/stories/s/ranj-cccq)"
SURF = ("Paved Road", "Paved Parking", "Sidewalk", "Bridge", "Paved Driveway", "Paved Alley", "Trail",
        "Recreation Court/Ball Field", "In Ground Pool", "Golf Course", "Median > 10 Feet", "Patio",
        "Railroad Ballast", "Unpaved Parking", "Unpaved Road", "Unpaved Driveway", "Courtyard", "Dock", "Dam")
LAYERS = {
    "buildings_2021": (f"{BASE}/PLANNINGCADASTRE_impervious_cover_2021/FeatureServer/0", "FEATURE='Structure'",
                       "OBJECTID,FEATURE,SOURCE,MAX_HEIGHT,ELEVATION,BASE_ELEVATION,MODIFIED_DATE,ORIGIN_FEATURE_CLASS",
                       "PLANNINGCADASTRE_impervious_cover_2021 (Structure polygons; hand-digitized from early-2021 "
                       "imagery, heights from lidar in feet; SOURCE gives vintage 2013/2017/2021)", 2000),
    "surfaces_2021": (f"{BASE}/PLANNINGCADASTRE_impervious_cover_2021/FeatureServer/0",
                      "FEATURE IN (" + ",".join(f"'{s}'" for s in SURF) + ")",
                      "OBJECTID,FEATURE,SOURCE,MODIFIED_DATE",
                      "PLANNINGCADASTRE_impervious_cover_2021 (paved/unpaved surfaces: roads, parking, sidewalks, "
                      "bridges, trails, courts, pools...)", 2000),
    "buildings_2017": (f"{BASE}/UTILITIESCOMMUNICATION_building_footprints_2017/FeatureServer/0", "1=1",
                       "OBJECTID,FEATURE,SOURCE,MAX_HEIGHT,ELEVATION,BASE_ELEVATION,MODIFIED_DATE",
                       "STRUCTURE_building_footprints_2017 (2015 impervious cover updated with early-2017 imagery; "
                       "MAX_HEIGHT/ELEVATION/BASE_ELEVATION in feet)", 1000),
}
FT = 0.3048


def fetch(url, where, fields, box, page):
    minx, miny, maxx, maxy = box
    geom = json.dumps({"xmin": minx, "ymin": miny, "xmax": maxx, "ymax": maxy, "spatialReference": {"wkid": 4326}})
    feats, offset, nbytes, pages = [], 0, 0, 0
    while True:
        params = {"f": "geojson", "where": where, "geometry": geom, "geometryType": "esriGeometryEnvelope",
                  "inSR": 4326, "spatialRel": "esriSpatialRelIntersects", "outFields": fields, "outSR": 4326,
                  "resultOffset": offset, "resultRecordCount": page, "orderByFields": "OBJECTID"}
        for attempt in range(4):
            try:
                r = requests.get(f"{url}/query", params=params, headers=H, timeout=300)
                r.raise_for_status()
                js = r.json()
                if "error" in js:
                    raise RuntimeError(js["error"])
                break
            except Exception as e:  # noqa
                print(f"      page@{offset} attempt {attempt} failed: {str(e)[:120]}", flush=True)
                time.sleep(5 * (attempt + 1))
        else:
            raise RuntimeError(f"gave up at offset {offset}")
        nbytes += len(r.content)
        pages += 1
        got = js.get("features", [])
        feats.extend(got)
        more = js.get("properties", {}).get("exceededTransferLimit") or len(got) >= page
        if not more:
            break
        offset += len(got)
        time.sleep(0.5)
    return feats, nbytes, pages


only_boxes = [a for a in sys.argv[1:] if a in BOXES] or list(BOXES)
only_layers = [a for a in sys.argv[1:] if a in LAYERS] or list(LAYERS)
for name in only_boxes:
    outdir = ROOT / name / "austin_open_data"
    outdir.mkdir(parents=True, exist_ok=True)
    manp = outdir / "manifest.json"
    man = json.load(open(manp)) if manp.exists() else {}
    for key in only_layers:
        url, where, fields, title, page = LAYERS[key]
        t0 = time.time()
        try:
            feats, nbytes, pages = fetch(url, where, fields, BOXES[name], page)
        except Exception as e:  # noqa
            print(f"[{name}/{key}] FAILED: {e}", flush=True)
            man[key] = {"title": title, "url": url, "error": str(e)[:300]}
            json.dump(man, open(manp, "w"), indent=1)
            continue
        feats = [f for f in feats if f.get("geometry")]
        gdf = gpd.GeoDataFrame.from_features(feats, crs="EPSG:4326") if feats else \
            gpd.GeoDataFrame(columns=["geometry"], geometry="geometry", crs="EPSG:4326")
        if "MAX_HEIGHT" in gdf.columns:
            gdf["height_m"] = gdf["MAX_HEIGHT"].astype(float) * FT
            gdf["elevation_m"] = gdf["ELEVATION"].astype(float) * FT
            gdf["base_elevation_m"] = gdf["BASE_ELEVATION"].astype(float) * FT
        if "MODIFIED_DATE" in gdf.columns:
            gdf["MODIFIED_DATE"] = gdf["MODIFIED_DATE"].map(
                lambda v: time.strftime("%Y-%m-%d", time.gmtime(v / 1000)) if isinstance(v, (int, float)) and v else None)
        p1 = outdir / f"{key}_4326.geojson"
        p2 = outdir / f"{key}_32614.geojson"
        gdf.to_file(p1, driver="GeoJSON")
        gdf.to_crs(CRS_M).to_file(p2, driver="GeoJSON")
        rec = {"title": title, "service": url, "where": where, "license": TERMS, "features": int(len(gdf)),
               "geom_types": gdf.geometry.geom_type.value_counts().to_dict() if len(gdf) else {},
               "columns": list(gdf.columns), "pages": pages, "response_bytes": nbytes, "files": [p1.name, p2.name],
               "fetched_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "seconds": round(time.time() - t0)}
        if "SOURCE" in gdf.columns and len(gdf):
            rec["source_vintages"] = gdf["SOURCE"].value_counts().to_dict()
        if "FEATURE" in gdf.columns and len(gdf):
            rec["feature_classes"] = gdf["FEATURE"].value_counts().to_dict()
        if "height_m" in gdf.columns and len(gdf):
            h = gdf["height_m"].dropna()
            rec["height_m_stats"] = {"n": int(len(h)), "p50": round(float(h.median()), 1), "p95": round(float(h.quantile(0.95)), 1),
                                     "max": round(float(h.max()), 1), "zero_or_null": int((gdf["height_m"].fillna(0) <= 0).sum())}
        man[key] = rec
        json.dump(man, open(manp, "w"), indent=1)
        print(f"[{name}/{key}] {len(gdf)} features in {pages} pages ({nbytes/1e6:.1f} MB, {time.time()-t0:.0f}s) "
              f"{rec.get('source_vintages', '')} {rec.get('height_m_stats', '')}", flush=True)
        time.sleep(1)
