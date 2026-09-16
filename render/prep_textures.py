"""Child-process step run by build.py: create the downscaled copies of every manifest
texture (render/cache/tex) one image at a time, so the main build never decodes a 4K scan.

    blender -b --python render/prep_textures.py
"""
import os
import sys
import time

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "street"))

import mats  # noqa: E402


def main():
    bpy.ops.wm.read_homefile(use_empty=True)
    os.makedirs(mats.TEX_CACHE, exist_ok=True)
    t0 = time.time()
    n = 0
    for e in mats.manifest():
        if e.get("kind") != "texture":
            continue
        files = mats._entry_files(e)
        for k, p in files.items():
            if not isinstance(p, str) or not os.path.exists(p):
                continue
            cp, lim = mats.cache_path_for(p)
            if os.path.exists(cp):
                continue
            im = bpy.data.images.load(p)
            w, h = im.size
            if w and max(w, h) > lim:
                s = lim / float(max(w, h))
                im.scale(max(1, int(round(w * s))), max(1, int(round(h * s))))
                im.file_format = "PNG" if cp.lower().endswith(".png") else "JPEG"
                try:
                    im.save(filepath=cp, quality=92)
                except TypeError:
                    im.filepath_raw = cp
                    im.save()
                n += 1
            bpy.data.images.remove(im)
    print("PREPTEX: %d textures cached in %.1fs" % (n, time.time() - t0))


main()
