# Austin flyover GIS spike (`render/gis/`)

Feasibility data pull for a photoreal 3D flyover of central Austin rendered in Blender.
Everything here is free, public data, fetched 2026-09-15/16 with the scripts in `scripts/`.
Nothing outside `render/gis/` was touched.

## Areas of interest

| Box | WGS84 lon/lat | EPSG:32614 envelope (m) | Size |
|---|---|---|---|
| `downtown` | -97.785 .. -97.705, 30.235 .. 30.300 (Lady Bird Lake, downtown, Capitol, UT Tower) | 616833.6, 3345449.4, 624610.2, 3352738.8 | 7.8 x 7.3 km, 55.4 km2 |
| `anderson_mill` | -97.820 .. -97.790, 30.445 .. 30.470 (Anderson Mill / Westwood HS) | 613272.0, 3368687.4, 616182.0, 3371489.4 | 2.9 x 2.8 km, 8.0 km2 |

All rasters are delivered in **EPSG:32614 (WGS84 / UTM 14N, metres)** on the UTM *envelope* of the lon/lat box
(the envelope is slightly larger than the box because a lat/lon rectangle is not a rectangle in UTM).
Vectors are delivered twice: `*_4326.geojson` (as received) and `*_32614.geojson` (reprojected).
Heights/elevations are metres above NAVD88.

## Reproduce

```bash
cd render/gis
uv venv --python 3.12 .venv                 # Python 3.14 has no rasterio/geopandas wheels
VIRTUAL_ENV=$PWD/.venv uv pip install -r requirements.txt
P=.venv/Scripts/python
$P scripts/00_probe_stac.py                 # what Planetary Computer has (no downloads)
$P scripts/10_fetch_naip.py                 # NAIP mosaic + NDVI + veg mask (~8 min downtown)
$P scripts/12_recompress_ndvi.py            # NDVI float32 -> LERC (0.001) + deflate
$P scripts/13_vegmask_020.py                # second veg mask at NDVI > 0.20
$P scripts/11_fetch_3dep.py                 # 3DEP DSM/DTM/HAG + COPC probe (no point clouds)
$P scripts/20_fetch_osm.py                  # Overpass, one query per layer per box
$P scripts/30_fetch_austin_socrata.py       # data.austintexas.gov (SoQL within_box)
$P scripts/31_fetch_capmetro_gtfs.py        # CapMetro GTFS via data.texas.gov
SCRATCH=<tmp> $P scripts/32_fetch_tree_canopy.py   # 386 MB citywide gdb, clipped, zip not kept
$P scripts/33_fetch_austin_arcgis.py        # City ArcGIS Online feature services (paged)
SCRATCH=<tmp> $P scripts/34_fetch_txgio_2024.py    # TxGIO 2024 1 m DSM/DEM for anderson_mill
$P scripts/40_quicklook.py                  # quick-look PNGs
$P scripts/50_inventory.py                  # the file table below
```

`scripts/common.py` holds the boxes and endpoints. Run logs and the STAC probe dump are in `_logs/`.
`_sources/` keeps the raw 34 MB GTFS zip (shared by both boxes). `.venv/`, `_sources/`, `_logs/` are git-ignored;
the data folders are ~2.8 GB and should not be committed either (see sizes at the end).

## Layout

```
render/gis/
  README.md  requirements.txt  .gitignore  scripts/  _logs/  _sources/
  downtown/ | anderson_mill/
    naip/               NAIP 2022 0.6 m RGBN + RGB(JPEG) + NDVI + veg masks
    3dep/               USGS 3DEP 2017 lidar DSM / DTM / HAG at 2 m (+ COPC probe in manifest.json)
    txgio_lidar_2024/   (anderson_mill only) TxGIO StratMap 2024 lidar DSM / DEM / HAG at 1 m
    osm/                OpenStreetMap layers via Overpass
    austin_open_data/   City of Austin datasets (Socrata + ArcGIS Online)
    capmetro/           CapMetro GTFS stops / route shapes clipped to the box
    quicklook_<box>.png ortho + OSM footprints | DSM hillshade + HAG
  every folder has a manifest.json with source hrefs, item ids, stats and fetch timestamps
```

## Sources (keys used in the file table)

**S1 NAIP** - USDA NAIP orthoimagery via Microsoft Planetary Computer STAC (`https://planetarycomputer.microsoft.com/api/stac/v1`, collection `naip`).
Most recent year on PC for Texas is **2022** (years present: 2012, 2014, 2016, 2018, 2020, 2022; no 2024). **0.6 m GSD, 4 bands RGB+NIR, 8-bit.**
Native CRS EPSG:26914 (NAD83 / UTM 14N); source COGs are deflate-compressed.
Items: downtown `tx_m_3009751_nw_14_060_20220608`, `tx_m_3009750_ne_14_060_20220608`, `tx_m_3009743_sw_14_060_20220608`, `tx_m_3009742_se_14_060_20220608`;
anderson_mill `tx_m_3009734_nw_14_060_20220611`, `tx_m_3009734_ne_14_060_20220608` (flown 8-11 June 2022, leaf-on).
Read windowed through WarpedVRT + `rasterio.merge` (no full tile downloads). License: **public domain (US Government work)**.
Files: `naip_2022_rgbn_60cm.tif` (4-band lossless), `naip_2022_rgb_60cm_jpeg.tif` (3-band JPEG q90 YCbCr, use this as the Blender texture),
`naip_2022_ndvi.tif` (float32, LERC max error 0.001), `naip_2022_vegmask_ndvi_gt_0p35.tif` and `..._0p20.tif` (uint8 0/1).
NDVI is computed from 8-bit DN, not reflectance, so it runs low: downtown mean 0.06, p95 0.50; anderson_mill mean 0.05, p95 0.42.
Checked against the City's 2022 canopy polygons on anderson_mill: **NDVI > 0.35 recovers only 43 % of mapped canopy** (precision 0.83);
NDVI > 0.20 recovers 80 % (precision 0.71). Both masks are provided; prefer the canopy polygons (S6i) for tree placement.

**S2 3DEP** - USGS 3DEP lidar-derived rasters via Planetary Computer, collections `3dep-lidar-dsm`, `3dep-lidar-dtm`, `3dep-lidar-hag`.
Project **USGS_LPC_TX_Central_B1_2017_LAS_2019** (= StratMap 2017 Central Texas lidar, flown 2017, published 2019; PC item datetime is 2019-01-01).
**Native resolution 2 m** (4097x4097 tiles, float32, nodata -9999), native CRS NAD83 / UTM 14N + NAVD88 height (EPSG:26914+5703).
Tiles: downtown `*-2m-6-9, 6-10, 5-9, 5-10`; anderson_mill `*-2m-5-12, 5-11, 4-12`. Tile coverage of both boxes 100 %.
Water is nodata (lidar returns dropped): downtown DTM 98.2 % valid, DSM 98.8 %, HAG 98.4 % (the gaps are Lady Bird Lake); anderson_mill 99.8-99.9 %.
Downtown stats: DSM 40.8-351.7 m, DTM 95.7-237.7 m, HAG -90.7..211.5 m (HAG has noise spikes; clamp to 0..250).
Landmark check (max HAG in a 50 m window): Austonian 211.5 m (true 208), Frost Bank 158.4 (157), 360 Condos 150.1 (172), UT Tower 100.2 (94),
Capitol 57.9 (dome top 93 m not captured in that window). **The Independent reads 70.6 m because it was mid-construction in 2017; 6xGuadalupe (2023) is absent.**
`3dep-lidar-copc` point clouds (NOT downloaded, probed only): downtown 37 tiles / 830.6 M points / **4.40 GB** total, **mean 6.8 pts/m2** (5.4-8.6 per tile), **78-143 MB per tile** (tiles are ~3.0-3.6 km2, LAZ/COPC);
anderson_mill 9 tiles / 211.5 M points / 1.08 GB, 6.9 pts/m2 (6.2-8.1), 104-152 MB per tile. Per-tile hrefs, counts, sizes and densities are in `3dep/manifest.json`. License: public domain.
Gotcha: PC's `3dep-lidar-dtm` item footprints for this project are mis-registered (the STAC search returns tiles 8-40 km away).
`11_fetch_3dep.py` derives the DTM hrefs from the DSM tile ids instead (the COGs exist at the same indices).

**S3 TxGIO 2024** - Texas Geographic Information Office DataHub (`https://data.geographic.texas.gov/`, API `https://api.tnris.org/api/v1/`),
collection *Hays & Williamson Counties Lidar* (StratMap 2024, Fugro, flown 2024-01-10..29, published 2024-09-10, id `91943379-ef06-490e-ac08-66bc98fa1ce8`).
Covers anderson_mill (quarter-quads Jollyville NW `3097341`, NE `3097342`); does not cover downtown. Catalogued as "1m/50cm" but the delivered DSM/DEM GeoTIFFs are **1 m**
(NAD83(2011) / UTM 14N + NAVD88, EPSG:6343). Zips downloaded: DSM 100 + 158 MB, DEM 193 + 180 MB (deleted after clipping). HAG = DSM - DEM: p95 11.1 m, max 54.7 m, 46 % of the box > 2 m.
Gotcha: the download host (CloudFront) returns 403 unless the request carries a browser User-Agent. License: public domain / free use, cite TxGIO.
Also available there for **downtown** but not downloaded (too big for a spike): *Bexar & Travis Counties Lidar* (StratMap 2021, Sanborn, flown 2021-01-26..03-07, id `447db89a-58ee-4a1b-a61f-b918af2fb0bb`),
**28 cm inside Austin city limits**, DEM (bare earth) + LAZ + contours only, no DSM; downtown needs 4 quarter-quads (Austin East SE, Austin West SW, Montopolis NE, Oak Hill NW):
DEM zips ~1.0-1.2 GB each (~4.4 GB), LAZ 9-14 GB each (~47 GB). The City's "2021 2ft DEM" on ArcGIS Online is a tile map service only (not downloadable).

**S4 OSM** - OpenStreetMap via Overpass API (`https://overpass-api.de/api/interpreter`), `[out:json][timeout:180]`, one query per layer per box, 4 s pause, snapshot 2026-09-16 UTC.
Overpass JSON -> GeoJSON with `osm2geojson` (multipolygon relations assembled). License: **ODbL 1.0, (c) OpenStreetMap contributors** (attribution required).
Layers and tags kept: `buildings` (building, height, building:levels, name, min_height, roof:shape/levels/height, building:material/colour, amenity, addr),
`highways` (highway, name, lanes, sidewalk[:left/right/both], oneway, surface, width, maxspeed, bridge, tunnel, layer, ref, cycleway, footway, service, lit),
`landcover` (landuse grass/forest/meadow/cemetery/recreation_ground/village_green/orchard/farmland..., leisure park/golf_course/garden/pitch/nature_reserve/playground/dog_park/..., natural wood/scrub/grassland/heath/wetland/tree_row..., golf=*),
`water` (natural=water, water=*, waterway=*, reservoirs), `bridges` (bridge=* except no, man_made=bridge, type=bridge relations), `transit_stops` (highway=bus_stop, public_transport=*, railway stations/stops),
`trees_osm` (natural=tree points), `bus_routes` (route=bus relations, geometry clipped to the box).
Counts downtown / anderson_mill: buildings 38,749 / 4,812 (**with `height` 31,164 / 3,731 = 80 %**, with `building:levels` 653 / 23), highways 28,126 / 2,265, landcover 1,897 / 61,
water 586 / 89, bridges 727 / 50, transit stops 1,094 / 32, trees 2,240 / 2, bus routes 13 / 0 (105 relation elements came back for downtown but only 13 assembled into
geometry; use the GTFS shapes instead).

**S5 GTFS** - CapMetro GTFS, dataset `r4v4-vz24` on data.texas.gov (`https://data.texas.gov/d/r4v4-vz24`, blob `https://data.texas.gov/download/r4v4-vz24/application%2Fzip`),
feed version `260826_0956`, valid 2026-08-26 .. 2027-01-09; feed-wide 2,348 stops, 71 routes, 25,274 trips, 7,323 shapes.
Downtown: 539 stops, 50 routes, 5,133 shapes (clipped); anderson_mill: 16 stops, 2 routes, 59 shapes. Stops carry a `routes` column (short names serving the stop).
`https://www.capmetro.org/gtfs` answers 403 to non-browser clients; use data.texas.gov. License: data.texas.gov "See Terms of Use" (CapMetro open-data terms, attribution). Alternative on the same portal: "Capital Metro Shapefiles - JANUARY 2025" (`58ze-kqqp`, routes/stops shapefiles, 3 MB).

**S6 City of Austin open data portal** (Socrata, `https://data.austintexas.gov`, SoQL `within_box` on the geometry column, GeoJSON export, 50k-row pages).
License unless noted: **City of Austin Open Data Terms of Use** (`https://data.austintexas.gov/stories/s/ranj-cccq`; free use with attribution, no warranty).
- S6a **Sidewalks** `vchz-d9ng` (Austin Transportation and Public Works; `https://data.austintexas.gov/d/vchz-d9ng`). Multilines, inventory started 2006/07, updated daily. **Condition scores are inside this dataset**:
  `functional_condition`, `rating_overall`, `rating_no_veg`, `assessment_date`, `ada_year_route_checked`, plus `width`, `sidewalk_surface`, `pedestrian_facility_type`, `year_built`. Downtown 34,572 / anderson_mill 6,144 segments. No separate "sidewalk condition" dataset exists (the ArcGIS `Sidewalk_SPAT_Existing` service is 5 dissolved features, useless).
- S6b **Street Centerline** `8hf2-pdmb` (`https://data.austintexas.gov/d/8hf2-pdmb`): road_class, speed_limit, one_way, elevation_from/to, full_street_name. Updated daily.
- S6c **Building Footprints Year 2013** `3qcc-8uhz` (`https://data.austintexas.gov/d/3qcc-8uhz`): digitized from 2012/13 ortho + 2012 lidar; `max_height`, `elevation`, `base_elevation` in **feet**. Superseded by S7a but kept.
- S6d **Planimetrics 2015** `ucrq-eauf` (`https://data.austintexas.gov/d/ucrq-eauf`): 2015 planimetric/impervious polygons with `feature` class and `max_height`/`elevation` (feet). Downtown 50,135 / anderson_mill 6,151. First fetch died with IncompleteRead, retry succeeded.
- S6e **Tree Inventory** `wrik-xasw` (`https://data.austintexas.gov/d/wrik-xasw`, **public domain**): public trees as of 2020-03-13, points with `species`, `diameter` (in). Downtown 26,811 / anderson_mill 86.
- S6f **Downtown Tree Inventory 2013** `7aq7-a66u` (`https://data.austintexas.gov/d/7aq7-a66u`, **public domain**): 7,295 ROW trees, `species`, `dbh`, `height` (ft), `condition`. Downtown only.
- S6g **INLANDWATERS_creeks_lines** `anma-viwb`: creek centerlines (`stream_name`, `creek_type`). 2,011 / 100.
- S6h **TRANSPORTATION_urban_trails_network** `jdwm-wfps`: `width`, `trail_surface_type`, `build_status`. 647 / 0.
- S6i **Tree Canopy 2022** `943x-7cq5` (`https://data.austintexas.gov/d/943x-7cq5`, **public domain**, Urban Forest Program): citywide canopy polygons classified from summer-2022 imagery, delivered as a 386 MB file geodatabase (EPSG:2277) that was downloaded, clipped and discarded.
  Downtown 27,084 polygons = 20.5 km2 = **37 % canopy**; anderson_mill 6,483 polygons = 2.34 km2 = 29 %. Best tree layer available; pair with HAG for crown heights. (2018/2014/2010/2006 canopies also exist: `wbdz-4vm6`, `gfer-5b65`, `b5t3-jws3`, `chiu-5jq4`.)
- Seen but not fetched: `ELEVATION_contours_2021` `4kn4-2437` (1 ft contours from the March-2021 TNRIS/Sanborn lidar, 29,623 lines in the downtown box), Land Use Inventory Detailed `7vsm-dvxg`, Traffic Signals `p53x-x73x`.

**S7 City of Austin ArcGIS Online** (org `0L95CJ0VTaxqcmED`, `https://services.arcgis.com/0L95CJ0VTaxqcmED/arcgis/rest/services/...`, paged `query` with envelope filter, GeoJSON out, EPSG:4326). Same City terms of use.
- S7a **PLANNINGCADASTRE_impervious_cover_2021** (`.../PLANNINGCADASTRE_impervious_cover_2021/FeatureServer/0`): hand-digitized impervious cover updated from early-2021 imagery.
  `buildings_2021_*` = `FEATURE='Structure'` polygons with `MAX_HEIGHT`, `ELEVATION`, `BASE_ELEVATION` (feet; converted to `height_m`, `elevation_m`, `base_elevation_m`) and `SOURCE` = imagery vintage.
  Downtown 45,445 structures (vintages: 2012 16,508; 2013 6,128; 2015 7,017; 2017 8,728; 2019 27; **2021 7,037**), height median 5.6 m, p95 11.8 m, max 210.9 m, 235 with no height.
  Landmarks: The Independent 210.9 m, Austonian 210.3, 6xGuadalupe 179.6, Frost 158.3, UT Tower 102.7, Capitol 93.2 - **the best building-height source here**. anderson_mill 5,767 structures, median 5.2 m.
  `surfaces_2021_*` = 19 other classes (Paved Road, Paved Parking, Sidewalk, Bridge, Paved Driveway, Trail, Recreation Court, In Ground Pool, Golf Course, Median, Patio, Railroad Ballast, ...). Downtown 85,014 / anderson_mill 12,749 polygons. Useful for material masks (asphalt vs concrete vs grass).
- S7b **STRUCTURE_building_footprints_2017** (`.../UTILITIESCOMMUNICATION_building_footprints_2017/FeatureServer/0`): 2015 impervious cover updated with early-2017 imagery, same height fields. Downtown 44,369 / anderson_mill 5,610 (4,220 / 651 without height).
- Also on the org (not fetched): `ELEVATION_contours_2021` feature service, `2021 2ft DEM` tile service, Austin LiDAR 2021 boundary/grid layers, 1877-1921 Sanborn footprints, `INLANDWATERS_creeks_lines`.

## What failed or was not available

- **NAIP 2024 is not on Planetary Computer** for Texas (latest 2022). 0.6 m is the best free national ortho; the City's own 2021/2023 orthos are not published as downloads.
- **No DSM finer than 2 m for downtown for free without heavy downloads**: the 2021 28 cm lidar exists (S3) but only as bare-earth DEM + 10-14 GB LAZ per quarter-quad; a 28 cm DSM would have to be gridded from ~47 GB of LAZ.
- Planetary Computer `3dep-lidar-dtm` STAC footprints are wrong for this project (worked around, see S2). `3dep-lidar-copc` items carry no `pc:density`; density was computed from `pc:count` / tile area.
- TxGIO downloads 403 without a browser User-Agent (worked around). `capmetro.org/gtfs` 403s scripts (used data.texas.gov).
- One Socrata GeoJSON export (Planimetrics 2015, 67 MB) died with `IncompleteRead`; a retry succeeded.
- OSM `route=bus` relations: only 13 of 105 downtown relation elements assembled into geometry with `out geom(bbox)`; GTFS shapes are complete, so this was not pursued.
- Three fetch scripts shared `austin_open_data/manifest.json` and raced; the canopy entry was rebuilt afterwards (noted in the manifest).
- Not a failure but a trap: NDVI from 8-bit NAIP DN is low, so the requested 0.35 threshold under-detects trees (see S1).

## Honest read on resolution and resolvability

- **Imagery**: 0.6 m (NAIP 2022, June, leaf-on, mild shadows). Individual cars, road markings and tree crowns are visible; roofs are fine at map scale. Facades do not exist in an ortho.
- **Elevation downtown**: 2 m DSM/DTM/HAG from 2017 lidar (~6.8 pts/m2 in the raw cloud, so the cloud itself would support ~0.5 m gridding). At 2 m, a 10 m suburban house is 5 x 7 cells: it is *detected* (HAG > 3 m blob) but not *shaped*; tree crowns > 4 m are separable blobs; towers are correct to a few metres but with smeared edges. Buildings completed after early 2017 are missing or partial.
- **Elevation anderson_mill**: 1 m DSM/DEM/HAG from January 2024 (leaf-off for deciduous trees, so live oaks/junipers dominate the HAG). Houses show roof planes, individual crowns are clean.
- **Buildings**: City 2021 structure polygons with lidar heights (median 5.6 m, correct on all checked towers) and OSM (80 % with `height`, and OSM is current to 2026, so anything built 2022-2026 exists there if mapped). Use City 2021 for heights and geometry, OSM for names/levels/recent additions.
- **Trees**: City 2022 canopy polygons (37 % of downtown) + HAG crown heights + inventories for species/DBH along streets. Good enough to instance trees convincingly.
- **Water**: lidar water is nodata; fill Lady Bird Lake from the OSM/City water polygons at a flat level (about 130.5 m NAVD88, DTM edge median at the lake is 132 m).
- **Datum caveats**: NAIP/3DEP are NAD83, OSM/GTFS are WGS84; everything was reprojected to EPSG:32614 through PROJ without a datum-shift grid, so a horizontal offset of up to ~1 m between the two families is possible (sub-pixel at 2 m, ~1.5 px at 0.6 m). City `*_ELEVATION` fields are feet, converted to metres in `*_m` columns.

## Blender assessment

Scene recipe: DTM (2 m; 1 m in anderson_mill) as terrain with the JPEG ortho draped, City-2021 structure polygons extruded by `height_m` (fallback OSM `height`, then `building:levels` x 3.5 m, then 5.6 m median),
trees instanced inside canopy polygons with height from HAG (clamp 3..30 m) and species from the inventories where present, water polygons as flat planes,
GTFS shapes/stops and sidewalks as spline/props, `surfaces_2021` as a material mask over the ortho.

- **60-90 degrees elevation, 300 m+ above ground, 24-35 mm lens**: convincing. The ortho carries the look, extrusions read as blocks under the roof texture, canopy density and lake shape are right. This is the safe shot.
- **45 degrees, 100-200 m above ground**: reads as a good game map, not photoreal. Three things give it away: 0.6 m texture stretched 5-10x on screen, untextured/flat facades on every building, and 2 m lidar tree blobs if you drape on the DSM instead of instancing trees. Mitigations that stay free: instance trees (do not drape the DSM), give facades a procedural window material driven by `height_m`/levels, keep the camera above ~250 m or use a long lens from far away, add atmosphere/haze, and motion.
- **Below 45 degrees or near street level**: not achievable from this data; it needs oblique imagery or photogrammetry meshes, which are not free for Austin.
- The single biggest upgrade if wanted later is gridding a 30-50 cm DSM from the 2021 28 cm LAZ (S3) for the downtown core only (one quarter-quad, ~12 GB LAZ, PDAL), which makes roofs and crowns shaped rather than blobbed. Everything else in this folder is already good enough for the high-angle flyover.

## File inventory

Sizes in MB. `PD` = public domain, `CoA ToU` = City of Austin Open Data Terms of Use, `ODbL` = OpenStreetMap ODbL 1.0.

| File | MB | EPSG | Year | Source | License | Contents |
|---|---:|---|---|---|---|---|
| `downtown/3dep/3dep_dsm_2m.tif` | 42.6 | 32614 | 2017 (pub. 2019) | S2 3DEP | PD | 3888x3646 px @ 2 m, 1 band float32, deflate |
| `downtown/3dep/3dep_dtm_2m.tif` | 34.6 | 32614 | 2017 (pub. 2019) | S2 3DEP | PD | 3888x3646 px @ 2 m, 1 band float32, deflate |
| `downtown/3dep/3dep_hag_2m.tif` | 52.8 | 32614 | 2017 (pub. 2019) | S2 3DEP | PD | 3888x3646 px @ 2 m, 1 band float32, deflate |
| `downtown/austin_open_data/building_footprints_2013_32614.geojson` | 39.4 | 32614 | 2012/13 | S6c Footprints 2013 | CoA ToU | 38570 features MultiPolygon:38570 |
| `downtown/austin_open_data/building_footprints_2013_4326.geojson` | 35.1 | 4326 | 2012/13 | S6c Footprints 2013 | CoA ToU | 38570 features MultiPolygon:38570 |
| `downtown/austin_open_data/buildings_2017_32614.geojson` | 49.3 | 32614 | 2012-2017 vintages | S7b Footprints 2017 | CoA ToU | 44369 features Polygon:44369 |
| `downtown/austin_open_data/buildings_2017_4326.geojson` | 44.2 | 4326 | 2012-2017 vintages | S7b Footprints 2017 | CoA ToU | 44369 features Polygon:44369 |
| `downtown/austin_open_data/buildings_2021_32614.geojson` | 54.4 | 32614 | 2012-2021 vintages | S7a Impervious Cover 2021 (Structure) | CoA ToU | 45445 features Polygon:45445 |
| `downtown/austin_open_data/buildings_2021_4326.geojson` | 48.8 | 4326 | 2012-2021 vintages | S7a Impervious Cover 2021 (Structure) | CoA ToU | 45445 features Polygon:45445 |
| `downtown/austin_open_data/creeks_32614.geojson` | 2.4 | 32614 | rolling | S6g Creeks | CoA ToU | 2011 features MultiLineString:2011 |
| `downtown/austin_open_data/creeks_4326.geojson` | 2.2 | 4326 | rolling | S6g Creeks | CoA ToU | 2011 features MultiLineString:2011 |
| `downtown/austin_open_data/downtown_tree_inventory_2013_32614.geojson` | 3.0 | 32614 | 2013 | S6f Downtown Trees 2013 | PD | 7295 features Point:7295 |
| `downtown/austin_open_data/downtown_tree_inventory_2013_4326.geojson` | 2.9 | 4326 | 2013 | S6f Downtown Trees 2013 | PD | 7295 features Point:7295 |
| `downtown/austin_open_data/planimetrics_2015_32614.geojson` | 84.2 | 32614 | 2015 | S6d Planimetrics 2015 | CoA ToU | 50135 features MultiPolygon:50135 |
| `downtown/austin_open_data/planimetrics_2015_4326.geojson` | 75.9 | 4326 | 2015 | S6d Planimetrics 2015 | CoA ToU | 50135 features MultiPolygon:50135 |
| `downtown/austin_open_data/sidewalks_32614.geojson` | 71.4 | 32614 | 2006/07 + rolling | S6a Sidewalks | CoA ToU | 34572 features MultiLineString:34572 |
| `downtown/austin_open_data/sidewalks_4326.geojson` | 70.4 | 4326 | 2006/07 + rolling | S6a Sidewalks | CoA ToU | 34572 features MultiLineString:34572 |
| `downtown/austin_open_data/street_centerline_32614.geojson` | 5.8 | 32614 | rolling (daily) | S6b Street Centerline | CoA ToU | 5204 features MultiLineString:5204 |
| `downtown/austin_open_data/street_centerline_4326.geojson` | 5.7 | 4326 | rolling (daily) | S6b Street Centerline | CoA ToU | 5204 features MultiLineString:5204 |
| `downtown/austin_open_data/surfaces_2021_32614.geojson` | 239.9 | 32614 | 2012-2021 vintages | S7a Impervious Cover 2021 (surfaces) | CoA ToU | 85014 features Polygon:85014 |
| `downtown/austin_open_data/surfaces_2021_4326.geojson` | 203.9 | 4326 | 2012-2021 vintages | S7a Impervious Cover 2021 (surfaces) | CoA ToU | 85014 features Polygon:85014 |
| `downtown/austin_open_data/tree_canopy_2022_32614.geojson` | 51.8 | 32614 | 2022 | S6i Tree Canopy 2022 | PD | 27084 features Polygon:27036,MultiPolygon:48 |
| `downtown/austin_open_data/tree_canopy_2022_4326.geojson` | 45.2 | 4326 | 2022 | S6i Tree Canopy 2022 | PD | 27084 features Polygon:27036,MultiPolygon:48 |
| `downtown/austin_open_data/tree_inventory_32614.geojson` | 9.1 | 32614 | 2013-2020 | S6e Tree Inventory | PD | 26811 features Point:26811 |
| `downtown/austin_open_data/tree_inventory_4326.geojson` | 8.9 | 4326 | 2013-2020 | S6e Tree Inventory | PD | 26811 features Point:26811 |
| `downtown/austin_open_data/urban_trails_32614.geojson` | 1.1 | 32614 | rolling | S6h Urban Trails | CoA ToU | 647 features MultiLineString:647 |
| `downtown/austin_open_data/urban_trails_4326.geojson` | 1.0 | 4326 | rolling | S6h Urban Trails | CoA ToU | 647 features MultiLineString:647 |
| `downtown/capmetro/gtfs_route_shapes_clipped_32614.geojson` | 55.9 | 32614 | feed 2026-08-26 | S5 GTFS | CapMetro ToU | 5133 features LineString:2788,MultiLineString:2345 |
| `downtown/capmetro/gtfs_route_shapes_clipped_4326.geojson` | 29.4 | 4326 | feed 2026-08-26 | S5 GTFS | CapMetro ToU | 5133 features LineString:2788,MultiLineString:2345 |
| `downtown/capmetro/gtfs_routes_in_box.csv` | 0.0 | - | feed 2026-08-26 | S5 GTFS | CapMetro ToU | 50 rows |
| `downtown/capmetro/gtfs_stops_32614.geojson` | 0.2 | 32614 | feed 2026-08-26 | S5 GTFS | CapMetro ToU | 539 features Point:539 |
| `downtown/capmetro/gtfs_stops_4326.geojson` | 0.2 | 4326 | feed 2026-08-26 | S5 GTFS | CapMetro ToU | 539 features Point:539 |
| `downtown/naip/naip_2022_ndvi.tif` | 217.2 | 32614 | 2022 | S1 NAIP | PD | 12961x12149 px @ 0.6 m, 1 band float32, lerc_deflate |
| `downtown/naip/naip_2022_rgb_60cm_jpeg.tif` | 63.9 | 32614 | 2022 | S1 NAIP | PD | 12961x12149 px @ 0.6 m, 3 band uint8, jpeg |
| `downtown/naip/naip_2022_rgbn_60cm.tif` | 562.3 | 32614 | 2022 | S1 NAIP | PD | 12961x12149 px @ 0.6 m, 4 band uint8, deflate |
| `downtown/naip/naip_2022_vegmask_ndvi_gt_0p20.tif` | 9.0 | 32614 | 2022 | S1 NAIP | PD | 12961x12149 px @ 0.6 m, 1 band uint8, deflate |
| `downtown/naip/naip_2022_vegmask_ndvi_gt_0p35.tif` | 9.0 | 32614 | 2022 | S1 NAIP | PD | 12961x12149 px @ 0.6 m, 1 band uint8, deflate |
| `downtown/osm/bridges_32614.geojson` | 0.4 | 32614 | 2026-09-16 snapshot | S4 OSM | ODbL | 727 features LineString:612,Polygon:112,MultiPolygon:3 |
| `downtown/osm/bridges_4326.geojson` | 0.3 | 4326 | 2026-09-16 snapshot | S4 OSM | ODbL | 727 features LineString:612,Polygon:112,MultiPolygon:3 |
| `downtown/osm/buildings_32614.geojson` | 38.8 | 32614 | 2026-09-16 snapshot | S4 OSM | ODbL | 38749 features Polygon:38523,MultiPolygon:226 |
| `downtown/osm/buildings_4326.geojson` | 28.8 | 4326 | 2026-09-16 snapshot | S4 OSM | ODbL | 38749 features Polygon:38523,MultiPolygon:226 |
| `downtown/osm/bus_routes_32614.geojson` | 0.2 | 32614 | 2026-09-16 snapshot | S4 OSM | ODbL | 13 features LineString:12,MultiLineString:1 |
| `downtown/osm/bus_routes_4326.geojson` | 0.1 | 4326 | 2026-09-16 snapshot | S4 OSM | ODbL | 13 features LineString:12,MultiLineString:1 |
| `downtown/osm/highways_32614.geojson` | 21.2 | 32614 | 2026-09-16 snapshot | S4 OSM | ODbL | 28126 features LineString:28126 |
| `downtown/osm/highways_4326.geojson` | 17.7 | 4326 | 2026-09-16 snapshot | S4 OSM | ODbL | 28126 features LineString:28126 |
| `downtown/osm/landcover_32614.geojson` | 3.0 | 32614 | 2026-09-16 snapshot | S4 OSM | ODbL | 1897 features Polygon:1724,LineString:113,MultiPolygon:60 |
| `downtown/osm/landcover_4326.geojson` | 1.9 | 4326 | 2026-09-16 snapshot | S4 OSM | ODbL | 1897 features Polygon:1724,LineString:113,MultiPolygon:60 |
| `downtown/osm/transit_stops_32614.geojson` | 0.4 | 32614 | 2026-09-16 snapshot | S4 OSM | ODbL | 1094 features Point:1094 |
| `downtown/osm/transit_stops_4326.geojson` | 0.4 | 4326 | 2026-09-16 snapshot | S4 OSM | ODbL | 1094 features Point:1094 |
| `downtown/osm/trees_osm_32614.geojson` | 0.7 | 32614 | 2026-09-16 snapshot | S4 OSM | ODbL | 2240 features Point:2240 |
| `downtown/osm/trees_osm_4326.geojson` | 0.7 | 4326 | 2026-09-16 snapshot | S4 OSM | ODbL | 2240 features Point:2240 |
| `downtown/osm/water_32614.geojson` | 3.4 | 32614 | 2026-09-16 snapshot | S4 OSM | ODbL | 586 features LineString:371,Polygon:202,MultiPolygon:10,MultiLineString:3 |
| `downtown/osm/water_4326.geojson` | 1.9 | 4326 | 2026-09-16 snapshot | S4 OSM | ODbL | 586 features LineString:371,Polygon:202,MultiPolygon:10,MultiLineString:3 |
| `downtown/quicklook_downtown.png` | 10.8 | - | - | derived | - | quick-look PNG |
| `anderson_mill/3dep/3dep_dsm_2m.tif` | 5.9 | 32614 | 2017 (pub. 2019) | S2 3DEP | PD | 1455x1402 px @ 2 m, 1 band float32, deflate |
| `anderson_mill/3dep/3dep_dtm_2m.tif` | 4.5 | 32614 | 2017 (pub. 2019) | S2 3DEP | PD | 1455x1402 px @ 2 m, 1 band float32, deflate |
| `anderson_mill/3dep/3dep_hag_2m.tif` | 8.0 | 32614 | 2017 (pub. 2019) | S2 3DEP | PD | 1455x1402 px @ 2 m, 1 band float32, deflate |
| `anderson_mill/austin_open_data/building_footprints_2013_32614.geojson` | 4.8 | 32614 | 2012/13 | S6c Footprints 2013 | CoA ToU | 4602 features MultiPolygon:4602 |
| `anderson_mill/austin_open_data/building_footprints_2013_4326.geojson` | 4.3 | 4326 | 2012/13 | S6c Footprints 2013 | CoA ToU | 4602 features MultiPolygon:4602 |
| `anderson_mill/austin_open_data/buildings_2017_32614.geojson` | 6.2 | 32614 | 2012-2017 vintages | S7b Footprints 2017 | CoA ToU | 5610 features Polygon:5610 |
| `anderson_mill/austin_open_data/buildings_2017_4326.geojson` | 5.5 | 4326 | 2012-2017 vintages | S7b Footprints 2017 | CoA ToU | 5610 features Polygon:5610 |
| `anderson_mill/austin_open_data/buildings_2021_32614.geojson` | 6.7 | 32614 | 2012-2021 vintages | S7a Impervious Cover 2021 (Structure) | CoA ToU | 5767 features Polygon:5767 |
| `anderson_mill/austin_open_data/buildings_2021_4326.geojson` | 6.0 | 4326 | 2012-2021 vintages | S7a Impervious Cover 2021 (Structure) | CoA ToU | 5767 features Polygon:5767 |
| `anderson_mill/austin_open_data/creeks_32614.geojson` | 0.2 | 32614 | rolling | S6g Creeks | CoA ToU | 100 features MultiLineString:100 |
| `anderson_mill/austin_open_data/creeks_4326.geojson` | 0.1 | 4326 | rolling | S6g Creeks | CoA ToU | 100 features MultiLineString:100 |
| `anderson_mill/austin_open_data/downtown_tree_inventory_2013_32614.geojson` | 0.0 | 32614 | 2013 | S6f Downtown Trees 2013 | PD | 0 features  |
| `anderson_mill/austin_open_data/downtown_tree_inventory_2013_4326.geojson` | 0.0 | 4326 | 2013 | S6f Downtown Trees 2013 | PD | 0 features  |
| `anderson_mill/austin_open_data/planimetrics_2015_32614.geojson` | 8.9 | 32614 | 2015 | S6d Planimetrics 2015 | CoA ToU | 6151 features MultiPolygon:6151 |
| `anderson_mill/austin_open_data/planimetrics_2015_4326.geojson` | 8.1 | 4326 | 2015 | S6d Planimetrics 2015 | CoA ToU | 6151 features MultiPolygon:6151 |
| `anderson_mill/austin_open_data/sidewalks_32614.geojson` | 12.7 | 32614 | 2006/07 + rolling | S6a Sidewalks | CoA ToU | 6144 features MultiLineString:6144 |
| `anderson_mill/austin_open_data/sidewalks_4326.geojson` | 12.5 | 4326 | 2006/07 + rolling | S6a Sidewalks | CoA ToU | 6144 features MultiLineString:6144 |
| `anderson_mill/austin_open_data/street_centerline_32614.geojson` | 0.7 | 32614 | rolling (daily) | S6b Street Centerline | CoA ToU | 583 features MultiLineString:583 |
| `anderson_mill/austin_open_data/street_centerline_4326.geojson` | 0.7 | 4326 | rolling (daily) | S6b Street Centerline | CoA ToU | 583 features MultiLineString:583 |
| `anderson_mill/austin_open_data/surfaces_2021_32614.geojson` | 41.0 | 32614 | 2012-2021 vintages | S7a Impervious Cover 2021 (surfaces) | CoA ToU | 12749 features Polygon:12749 |
| `anderson_mill/austin_open_data/surfaces_2021_4326.geojson` | 34.8 | 4326 | 2012-2021 vintages | S7a Impervious Cover 2021 (surfaces) | CoA ToU | 12749 features Polygon:12749 |
| `anderson_mill/austin_open_data/tree_canopy_2022_32614.geojson` | 9.1 | 32614 | 2022 | S6i Tree Canopy 2022 | PD | 6483 features Polygon:6472,MultiPolygon:11 |
| `anderson_mill/austin_open_data/tree_canopy_2022_4326.geojson` | 8.0 | 4326 | 2022 | S6i Tree Canopy 2022 | PD | 6483 features Polygon:6472,MultiPolygon:11 |
| `anderson_mill/austin_open_data/tree_inventory_32614.geojson` | 0.0 | 32614 | 2013-2020 | S6e Tree Inventory | PD | 86 features Point:86 |
| `anderson_mill/austin_open_data/tree_inventory_4326.geojson` | 0.0 | 4326 | 2013-2020 | S6e Tree Inventory | PD | 86 features Point:86 |
| `anderson_mill/austin_open_data/urban_trails_32614.geojson` | 0.0 | 32614 | rolling | S6h Urban Trails | CoA ToU | 0 features  |
| `anderson_mill/austin_open_data/urban_trails_4326.geojson` | 0.0 | 4326 | rolling | S6h Urban Trails | CoA ToU | 0 features  |
| `anderson_mill/capmetro/gtfs_route_shapes_clipped_32614.geojson` | 0.5 | 32614 | feed 2026-08-26 | S5 GTFS | CapMetro ToU | 59 features LineString:42,MultiLineString:17 |
| `anderson_mill/capmetro/gtfs_route_shapes_clipped_4326.geojson` | 0.3 | 4326 | feed 2026-08-26 | S5 GTFS | CapMetro ToU | 59 features LineString:42,MultiLineString:17 |
| `anderson_mill/capmetro/gtfs_routes_in_box.csv` | 0.0 | - | feed 2026-08-26 | S5 GTFS | CapMetro ToU | 2 rows |
| `anderson_mill/capmetro/gtfs_stops_32614.geojson` | 0.0 | 32614 | feed 2026-08-26 | S5 GTFS | CapMetro ToU | 16 features Point:16 |
| `anderson_mill/capmetro/gtfs_stops_4326.geojson` | 0.0 | 4326 | feed 2026-08-26 | S5 GTFS | CapMetro ToU | 16 features Point:16 |
| `anderson_mill/naip/naip_2022_ndvi.tif` | 30.7 | 32614 | 2022 | S1 NAIP | PD | 4850x4670 px @ 0.6 m, 1 band float32, lerc_deflate |
| `anderson_mill/naip/naip_2022_rgb_60cm_jpeg.tif` | 9.5 | 32614 | 2022 | S1 NAIP | PD | 4850x4670 px @ 0.6 m, 3 band uint8, jpeg |
| `anderson_mill/naip/naip_2022_rgbn_60cm.tif` | 80.5 | 32614 | 2022 | S1 NAIP | PD | 4850x4670 px @ 0.6 m, 4 band uint8, deflate |
| `anderson_mill/naip/naip_2022_vegmask_ndvi_gt_0p20.tif` | 1.3 | 32614 | 2022 | S1 NAIP | PD | 4850x4670 px @ 0.6 m, 1 band uint8, deflate |
| `anderson_mill/naip/naip_2022_vegmask_ndvi_gt_0p35.tif` | 1.1 | 32614 | 2022 | S1 NAIP | PD | 4850x4670 px @ 0.6 m, 1 band uint8, deflate |
| `anderson_mill/osm/bridges_32614.geojson` | 0.0 | 32614 | 2026-09-16 snapshot | S4 OSM | ODbL | 50 features LineString:50 |
| `anderson_mill/osm/bridges_4326.geojson` | 0.0 | 4326 | 2026-09-16 snapshot | S4 OSM | ODbL | 50 features LineString:50 |
| `anderson_mill/osm/buildings_32614.geojson` | 4.2 | 32614 | 2026-09-16 snapshot | S4 OSM | ODbL | 4812 features Polygon:4809,MultiPolygon:3 |
| `anderson_mill/osm/buildings_4326.geojson` | 2.9 | 4326 | 2026-09-16 snapshot | S4 OSM | ODbL | 4812 features Polygon:4809,MultiPolygon:3 |
| `anderson_mill/osm/bus_routes_32614.geojson` | 0.0 | 32614 | 2026-09-16 snapshot | S4 OSM | ODbL | 0 features  |
| `anderson_mill/osm/bus_routes_4326.geojson` | 0.0 | 4326 | 2026-09-16 snapshot | S4 OSM | ODbL | 0 features  |
| `anderson_mill/osm/highways_32614.geojson` | 1.8 | 32614 | 2026-09-16 snapshot | S4 OSM | ODbL | 2265 features LineString:2265 |
| `anderson_mill/osm/highways_4326.geojson` | 1.4 | 4326 | 2026-09-16 snapshot | S4 OSM | ODbL | 2265 features LineString:2265 |
| `anderson_mill/osm/landcover_32614.geojson` | 0.0 | 32614 | 2026-09-16 snapshot | S4 OSM | ODbL | 61 features Polygon:59,LineString:2 |
| `anderson_mill/osm/landcover_4326.geojson` | 0.0 | 4326 | 2026-09-16 snapshot | S4 OSM | ODbL | 61 features Polygon:59,LineString:2 |
| `anderson_mill/osm/transit_stops_32614.geojson` | 0.0 | 32614 | 2026-09-16 snapshot | S4 OSM | ODbL | 32 features Point:32 |
| `anderson_mill/osm/transit_stops_4326.geojson` | 0.0 | 4326 | 2026-09-16 snapshot | S4 OSM | ODbL | 32 features Point:32 |
| `anderson_mill/osm/trees_osm_32614.geojson` | 0.0 | 32614 | 2026-09-16 snapshot | S4 OSM | ODbL | 2 features Point:2 |
| `anderson_mill/osm/trees_osm_4326.geojson` | 0.0 | 4326 | 2026-09-16 snapshot | S4 OSM | ODbL | 2 features Point:2 |
| `anderson_mill/osm/water_32614.geojson` | 0.1 | 32614 | 2026-09-16 snapshot | S4 OSM | ODbL | 89 features Polygon:52,LineString:37 |
| `anderson_mill/osm/water_4326.geojson` | 0.1 | 4326 | 2026-09-16 snapshot | S4 OSM | ODbL | 89 features Polygon:52,LineString:37 |
| `anderson_mill/quicklook_anderson_mill.png` | 9.0 | - | - | derived | - | quick-look PNG |
| `anderson_mill/txgio_lidar_2024/txgio2024_dem_1m.tif` | 19.9 | 32614 | 2024-01 | S3 TxGIO 2024 | PD | 2910x2803 px @ 1 m, 1 band float32, deflate |
| `anderson_mill/txgio_lidar_2024/txgio2024_dsm_1m.tif` | 23.1 | 32614 | 2024-01 | S3 TxGIO 2024 | PD | 2910x2803 px @ 1 m, 1 band float32, deflate |
| `anderson_mill/txgio_lidar_2024/txgio2024_hag_1m.tif` | 31.0 | 32614 | 2024-01 | S3 TxGIO 2024 | PD | 2910x2803 px @ 1 m, 1 band float32, deflate |

Total listed: 2.77 GB in 111 files
