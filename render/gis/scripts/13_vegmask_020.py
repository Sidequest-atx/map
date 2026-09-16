"""Additional vegetation mask at NDVI > 0.20 (8-bit NAIP DN NDVI runs low; 0.35 misses ~57% of the City's mapped canopy)."""
import numpy as np, rasterio
from rasterio.enums import Resampling
from common import ROOT, BOXES
for name in BOXES:
    d = ROOT / name / "naip"
    p = next(d.glob("naip_*_ndvi.tif"))
    with rasterio.open(p) as s:
        ndvi = s.read(1); prof = s.profile.copy()
    valid = ~np.isnan(ndvi)
    mask = ((ndvi > 0.20) & valid).astype("uint8")
    prof.update(dtype="uint8", nodata=255, compress="deflate", zlevel=9, predictor=1)
    for k in ("MAX_Z_ERROR",):
        prof.pop(k, None)
    out = d / p.name.replace("_ndvi.tif", "_vegmask_ndvi_gt_0p20.tif")
    with rasterio.open(out, "w", **prof) as dst:
        dst.write(mask, 1)
        dst.build_overviews([2, 4, 8, 16], Resampling.nearest)
    print(f"{name}: {out.name} veg fraction={mask[valid].mean():.3f}")
