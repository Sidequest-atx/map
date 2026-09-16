"""Shared constants for the Austin flyover GIS spike."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # render/gis
CRS_M = "EPSG:32614"  # UTM 14N, meters

# (minx, miny, maxx, maxy) in WGS84 lon/lat
BOXES = {
    "downtown": (-97.785, 30.235, -97.705, 30.300),
    "anderson_mill": (-97.820, 30.445, -97.790, 30.470),
}

STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"


def box_geojson(b):
    minx, miny, maxx, maxy = b
    return {
        "type": "Polygon",
        "coordinates": [[
            [minx, miny], [maxx, miny], [maxx, maxy], [minx, maxy], [minx, miny]
        ]],
    }
