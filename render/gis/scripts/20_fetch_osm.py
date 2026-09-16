"""Fetch OSM vectors via Overpass, one query per layer per box (polite: sequential, paused,
retried with backoff). Saves GeoJSON in EPSG:4326 (native) and EPSG:32614."""
import json, sys, time
import requests, osm2geojson
import geopandas as gpd
from common import BOXES, OVERPASS_URL, CRS_M, ROOT

PAUSE_S = 4
HEADERS = {"User-Agent": "sidequest-atx-render-spike/0.1 (Austin flyover feasibility; contact: jamesjli2025@gmail.com)"}

# layer -> (overpass body template using {bb} = "S,W,N,E", tags to keep, geometry filter or None)
LAYERS = {
    "buildings": ('(way["building"]({bb});relation["building"]({bb}););out geom;',
                  ["building", "height", "building:levels", "name", "min_height", "building:min_level",
                   "roof:shape", "roof:levels", "roof:height", "building:material", "building:colour",
                   "roof:colour", "amenity", "addr:housenumber", "addr:street"], ("Polygon", "MultiPolygon")),
    "highways": ('way["highway"]({bb});out geom;',
                 ["highway", "name", "lanes", "sidewalk", "sidewalk:left", "sidewalk:right", "sidewalk:both",
                  "oneway", "surface", "width", "maxspeed", "bridge", "tunnel", "layer", "ref", "cycleway",
                  "footway", "service", "lit"], ("LineString", "MultiLineString")),
    "landcover": ('('
                  'way["landuse"~"^(grass|forest|meadow|cemetery|recreation_ground|village_green|orchard|'
                  'farmland|greenfield|brownfield)$"]({bb});relation["landuse"~"^(grass|forest|meadow|cemetery|'
                  'recreation_ground|village_green|orchard|farmland)$"]({bb});'
                  'way["leisure"~"^(park|golf_course|garden|pitch|nature_reserve|playground|dog_park|'
                  'sports_centre|stadium|track)$"]({bb});relation["leisure"~"^(park|golf_course|garden|pitch|'
                  'nature_reserve|playground|dog_park|sports_centre|stadium)$"]({bb});'
                  'way["natural"~"^(wood|scrub|grassland|heath|wetland|tree_row|bare_rock|scree|sand|beach)$"]'
                  '({bb});relation["natural"~"^(wood|scrub|grassland|heath|wetland)$"]({bb});'
                  'way["golf"]({bb});'
                  ');out geom;',
                  ["landuse", "leisure", "natural", "golf", "name", "surface", "sport"], None),
    "water": ('(way["natural"="water"]({bb});relation["natural"="water"]({bb});way["waterway"]({bb});'
              'relation["waterway"]({bb});way["natural"~"^(coastline|wetland|bay|spring)$"]({bb});'
              'way["landuse"~"^(reservoir|basin)$"]({bb});relation["landuse"="reservoir"]({bb}););out geom;',
              ["natural", "water", "waterway", "name", "intermittent", "landuse", "tunnel", "layer", "width"], None),
    "bridges": ('(way["bridge"]["bridge"!="no"]({bb});way["man_made"="bridge"]({bb});'
                'relation["man_made"="bridge"]({bb});relation["type"="bridge"]({bb}););out geom;',
                ["bridge", "man_made", "highway", "railway", "name", "layer", "bridge:structure",
                 "bridge:name", "lanes", "width"], None),
    "transit_stops": ('(node["highway"="bus_stop"]({bb});node["public_transport"~"^(platform|stop_position|'
                      'station)$"]({bb});node["railway"~"^(station|halt|tram_stop|stop)$"]({bb});'
                      'node["amenity"="bus_station"]({bb}););out body;',
                      ["highway", "public_transport", "railway", "bus", "tram", "train", "name", "ref",
                       "shelter", "bench", "network", "operator", "route_ref", "gtfs:stop_id", "gtfs_id"],
                      ("Point",)),
    "trees_osm": ('node["natural"="tree"]({bb});out body;',
                  ["natural", "species", "genus", "height", "diameter_crown", "leaf_type", "circumference"],
                  ("Point",)),
    "bus_routes": ('relation["route"="bus"]({bb});out geom({bb});',
                   ["route", "ref", "name", "network", "operator", "from", "to", "colour"], None),
}


def overpass(query, tries=5):
    for i in range(tries):
        try:
            r = requests.post(OVERPASS_URL, data={"data": query}, headers=HEADERS, timeout=240)
            if r.status_code == 200:
                return r.json(), len(r.content)
            print(f"      HTTP {r.status_code}: {r.text[:200]!r}", flush=True)
        except Exception as e:  # noqa
            print(f"      error: {e}", flush=True)
        wait = 15 * (2 ** i)
        print(f"      retry in {wait}s", flush=True)
        time.sleep(wait)
    raise RuntimeError("overpass failed")


def to_gdf(data, keep, geom_types):
    gj = osm2geojson.json2geojson(data, filter_used_refs=False, log_level="ERROR")
    feats = []
    for f in gj["features"]:
        p = f["properties"]
        tags = p.get("tags", {}) or {}
        props = {"osm_type": p.get("type"), "osm_id": p.get("id")}
        for k in keep:
            if k in tags:
                props[k] = tags[k]
        f["properties"] = props
        feats.append(f)
    if not feats:
        return gpd.GeoDataFrame(columns=["osm_type", "osm_id", "geometry"], geometry="geometry", crs="EPSG:4326")
    gdf = gpd.GeoDataFrame.from_features(feats, crs="EPSG:4326")
    if geom_types:
        gdf = gdf[gdf.geometry.geom_type.isin(geom_types)]
    return gdf


only_boxes = [a for a in sys.argv[1:] if a in BOXES] or list(BOXES)
only_layers = [a for a in sys.argv[1:] if a in LAYERS] or list(LAYERS)
for name in only_boxes:
    minx, miny, maxx, maxy = BOXES[name]
    bb = f"{miny},{minx},{maxy},{maxx}"
    outdir = ROOT / name / "osm"
    outdir.mkdir(parents=True, exist_ok=True)
    manp = outdir / "manifest.json"
    man = json.load(open(manp)) if manp.exists() else {}
    for layer in only_layers:
        body, keep, gtypes = LAYERS[layer]
        q = "[out:json][timeout:180];" + body.format(bb=bb)
        t0 = time.time()
        print(f"[{name}/{layer}] query...", flush=True)
        data, nbytes = overpass(q)
        n_el = len(data.get("elements", []))
        gdf = to_gdf(data, keep, gtypes)
        p4326 = outdir / f"{layer}_4326.geojson"
        p32614 = outdir / f"{layer}_32614.geojson"
        gdf.to_file(p4326, driver="GeoJSON")
        gdf.to_crs(CRS_M).to_file(p32614, driver="GeoJSON")
        gt = gdf.geometry.geom_type.value_counts().to_dict() if len(gdf) else {}
        rec = {"query": q, "overpass_elements": n_el, "features": int(len(gdf)), "geom_types": gt,
               "response_bytes": nbytes, "tags_kept": keep, "files": [p4326.name, p32614.name],
               "fetched_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
               "seconds": round(time.time() - t0, 1)}
        if layer == "buildings" and len(gdf):
            rec["with_height"] = int(gdf["height"].notna().sum()) if "height" in gdf else 0
            rec["with_levels"] = int(gdf["building:levels"].notna().sum()) if "building:levels" in gdf else 0
        man[layer] = rec
        json.dump(man, open(manp, "w"), indent=1)
        print(f"[{name}/{layer}] {n_el} elements -> {len(gdf)} features {gt} ({nbytes/1e6:.1f} MB, "
              f"{time.time()-t0:.0f}s)", flush=True)
        time.sleep(PAUSE_S)
