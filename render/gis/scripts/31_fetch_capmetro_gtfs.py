"""Download CapMetro GTFS (data.texas.gov r4v4-vz24), build stops + route shapes, clip to boxes,
save GeoJSON in EPSG:4326 and EPSG:32614. Raw zip kept once under render/gis/_sources/."""
import csv, io, json, sys, time, zipfile
from collections import defaultdict
import requests
import geopandas as gpd
from shapely.geometry import LineString, Point, box as sbox
from common import BOXES, CRS_M, ROOT

H = {"User-Agent": "sidequest-atx-render-spike/0.1 (contact: jamesjli2025@gmail.com)"}
URL = "https://data.texas.gov/download/r4v4-vz24/application%2Fzip"
SRC = ROOT / "_sources"
SRC.mkdir(exist_ok=True)
zp = SRC / "capmetro_gtfs.zip"
if not zp.exists():
    t0 = time.time()
    r = requests.get(URL, headers=H, timeout=600, allow_redirects=True)
    r.raise_for_status()
    zp.write_bytes(r.content)
    print(f"downloaded {zp} {len(r.content)/1e6:.1f} MB in {time.time()-t0:.0f}s final_url={r.url}", flush=True)
z = zipfile.ZipFile(zp)
names = z.namelist()
print("zip members:", names, flush=True)


def read(n):
    with z.open(n) as f:
        return list(csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")))


stops = read("stops.txt")
routes = {r["route_id"]: r for r in read("routes.txt")}
trips = read("trips.txt")
shapes_pts = defaultdict(list)
for row in read("shapes.txt"):
    shapes_pts[row["shape_id"]].append((int(row["shape_pt_sequence"]), float(row["shape_pt_lon"]), float(row["shape_pt_lat"])))
feed_info = read("feed_info.txt") if "feed_info.txt" in names else []
cal = read("calendar.txt") if "calendar.txt" in names else []
date_range = None
if cal:
    date_range = (min(c["start_date"] for c in cal), max(c["end_date"] for c in cal))
print(f"stops={len(stops)} routes={len(routes)} trips={len(trips)} shapes={len(shapes_pts)} feed_info={feed_info[:1]} calendar_range={date_range}", flush=True)

# shape -> routes (with trip counts, headsigns)
shape_routes = defaultdict(lambda: defaultdict(int))
shape_head = defaultdict(set)
for t in trips:
    sid = t.get("shape_id")
    if sid:
        shape_routes[sid][t["route_id"]] += 1
        if t.get("trip_headsign"):
            shape_head[sid].add(t["trip_headsign"])
shape_recs = []
for sid, pts in shapes_pts.items():
    pts.sort()
    if len(pts) < 2:
        continue
    rts = shape_routes.get(sid, {})
    rid = max(rts, key=rts.get) if rts else None
    rt = routes.get(rid, {}) if rid else {}
    shape_recs.append({"shape_id": sid, "route_id": rid, "route_short_name": rt.get("route_short_name"),
                       "route_long_name": rt.get("route_long_name"), "route_type": rt.get("route_type"),
                       "route_color": rt.get("route_color"), "trips_on_shape": sum(rts.values()),
                       "headsigns": "; ".join(sorted(shape_head.get(sid, []))[:4]),
                       "geometry": LineString([(x, y) for _, x, y in pts])})
shapes_gdf = gpd.GeoDataFrame(shape_recs, crs="EPSG:4326")
stop_recs = []
for s in stops:
    try:
        stop_recs.append({k: s.get(k) for k in ("stop_id", "stop_code", "stop_name", "stop_desc", "location_type",
                                                 "parent_station", "wheelchair_boarding", "zone_id")}
                         | {"geometry": Point(float(s["stop_lon"]), float(s["stop_lat"]))})
    except (KeyError, ValueError):
        pass
stops_gdf = gpd.GeoDataFrame(stop_recs, crs="EPSG:4326")
# stop -> routes serving (via stop_times, can be large; do it once)
stop_routes = defaultdict(set)
trip_route = {t["trip_id"]: t["route_id"] for t in trips}
with z.open("stop_times.txt") as f:
    for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
        rid = trip_route.get(row["trip_id"])
        if rid:
            stop_routes[row["stop_id"]].add(routes.get(rid, {}).get("route_short_name") or rid)
stops_gdf["routes"] = stops_gdf["stop_id"].map(lambda s: ";".join(sorted(stop_routes.get(s, []))))

only_boxes = [a for a in sys.argv[1:] if a in BOXES] or list(BOXES)
for name in only_boxes:
    b = sbox(*BOXES[name])
    outdir = ROOT / name / "capmetro"
    outdir.mkdir(parents=True, exist_ok=True)
    st = stops_gdf[stops_gdf.intersects(b)].copy()
    sh = shapes_gdf[shapes_gdf.intersects(b)].copy()
    sh_clip = sh.copy()
    sh_clip["geometry"] = sh_clip.geometry.intersection(b)
    sh_clip = sh_clip[~sh_clip.geometry.is_empty]
    files = []
    for tag, g in [("stops", st), ("route_shapes_clipped", sh_clip)]:
        p1 = outdir / f"gtfs_{tag}_4326.geojson"
        p2 = outdir / f"gtfs_{tag}_32614.geojson"
        g.to_file(p1, driver="GeoJSON")
        g.to_crs(CRS_M).to_file(p2, driver="GeoJSON")
        files += [p1.name, p2.name]
    # routes summary CSV (which routes pass through the box)
    rsum = sh.groupby(["route_id", "route_short_name", "route_long_name", "route_type"], dropna=False)["trips_on_shape"].sum().reset_index()
    rsum.to_csv(outdir / "gtfs_routes_in_box.csv", index=False)
    man = {"source": "CapMetro GTFS via data.texas.gov r4v4-vz24", "url": URL,
           "landing": "https://data.texas.gov/d/r4v4-vz24", "license": "See CapMetro data terms of use (data.texas.gov 'See Terms of Use'; https://www.capmetro.org/metrolabs/)",
           "feed_info": feed_info[:1], "calendar_range": date_range, "zip_bytes": zp.stat().st_size,
           "stops_in_box": int(len(st)), "shapes_in_box": int(len(sh)), "routes_in_box": int(rsum["route_id"].nunique()),
           "files": files + ["gtfs_routes_in_box.csv"], "fetched_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    json.dump(man, open(outdir / "manifest.json", "w"), indent=1)
    print(f"[{name}] stops={len(st)} shapes={len(sh)} routes={man['routes_in_box']}", flush=True)
