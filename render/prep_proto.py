"""Child-process CLI used by street/protos.py: prepare one glTF prototype and save it to its cache .blend.

    blender -b --python render/prep_proto.py -- <key> <folder_rel> <gltf_glob> <keep_spec> <center> <sink> <out_blend>
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "street"))

import protos  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:]
key, folder_rel, gltf_glob, keep_spec, center, sink, out_path = argv[:7]
ok = protos.prepare(key, folder_rel, gltf_glob, keep_spec, center, sink, out_path)
print("PREP", key, "ok" if ok else "FAILED")
