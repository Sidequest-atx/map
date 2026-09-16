"""Re-encode NDVI float32 GeoTIFFs with LERC (max abs error 0.001) + deflate; deflate alone barely compresses float noise."""
import os, sys
import numpy as np, rasterio
from rasterio.enums import Resampling
from common import ROOT, BOXES
for name in BOXES:
    d = ROOT / name / "naip"
    for p in d.glob("naip_*_ndvi.tif"):
        if p.name.endswith("_lerc.tif"):
            continue
        with rasterio.open(p) as s:
            prof = s.profile.copy(); a = s.read(1)
        tmp = p.with_name(p.stem + "_lerc.tif")
        prof.update(compress="lerc_deflate", MAX_Z_ERROR=0.001, predictor=1, tiled=True, blockxsize=512, blockysize=512, BIGTIFF="IF_SAFER")
        prof.pop("zlevel", None)
        with rasterio.open(tmp, "w", **prof) as dst:
            dst.write(a, 1)
            dst.build_overviews([2, 4, 8, 16], Resampling.average)
            dst.update_tags(SOURCE="NDVI=(NIR-Red)/(NIR+Red) from USDA NAIP DN (8-bit), via Microsoft Planetary Computer", COMPRESSION="LERC max_z_error=0.001 + deflate")
        old, new = p.stat().st_size, tmp.stat().st_size
        os.replace(tmp, p)
        print(f"{name}: {p.name} {old/1e6:.0f} MB -> {new/1e6:.0f} MB", flush=True)
