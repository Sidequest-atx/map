"""Prototype models (Poly Haven / poly.pizza glTF). Each asset is prepared ONCE
in a child Blender process (import, leaf alpha wired, parts joined, origin at
the ground contact, textures cached at 1K) and saved to
render/cache/protos/<key>.blend; the main build appends that single object,
which is fast and needs almost no host-RAM headroom (the glTF importer's
transient memory for million-vertex meshes is what tipped a 16 GB machine
over). Instances are linked-mesh copies, so Cycles instances them."""
import glob
import os
import subprocess

import bpy
from mathutils import Vector

from common import ASSETS, B, RENDER_DIR, collection, join, select_only
import mats

CACHE_DIR = os.path.join(RENDER_DIR, "cache", "protos")
PROTOS = {}


def protos_collection():
    return collection("Protos")


def hide_proto(ob):
    ob.hide_render = True
    ob.hide_viewport = True


# ---------- part filters (spec strings so they can cross the process boundary) ----------


def keep_fn(spec):
    """'all' | 'first' | 'named:a,b[;exclude:c,d]' | 'maxx:0.12' (world bbox max x below)."""
    if not spec or spec == "all":
        return None
    if spec == "first":
        seen = []

        def first(o):
            if not seen:
                seen.append(o.name)
                return True
            return False

        return first
    if spec.startswith("named:"):
        parts = spec.split(";")
        tokens = [t for t in parts[0][6:].split(",") if t]
        excl = []
        for p in parts[1:]:
            if p.startswith("exclude:"):
                excl = [t for t in p[8:].split(",") if t]
        return lambda o: any(t in o.name.lower() for t in tokens) and not any(t in o.name.lower() for t in excl)
    if spec.startswith("maxx:"):
        lim = float(spec[5:])
        return lambda o: max((o.matrix_world @ Vector(c)).x for c in o.bound_box) < lim
    return None


# ---------- import + normalise (runs in the child) ----------


def import_gltf(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def wire_alpha(mat, folder, token):
    """Poly Haven glTF leaves come in opaque (JPG base colour, alphaMode BLEND); plug the
    separate alpha PNG into the Principled Alpha input."""
    cands = sorted(glob.glob(os.path.join(folder, "textures", "*alpha*.png")))
    if not cands:
        return False
    pick = [c for c in cands if token in os.path.basename(c).lower()]
    path = pick[0] if pick else (cands[0] if len(cands) == 1 else None)
    if path is None:
        return False
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        return False
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = mats.img(path, True)
    tex.interpolation = "Linear"
    col_tex = next((l.from_node for l in nt.links if l.to_node == bsdf and l.to_socket.name == "Base Color" and l.from_node.type == "TEX_IMAGE"), None)
    if col_tex is not None and col_tex.inputs["Vector"].is_linked:
        nt.links.new(col_tex.inputs["Vector"].links[0].from_socket, tex.inputs["Vector"])
    for l in list(bsdf.inputs["Alpha"].links):
        nt.links.remove(l)
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Alpha"])
    try:
        mat.surface_render_method = "DITHERED"
    except Exception:
        pass
    try:
        bsdf.inputs["Roughness"].default_value = max(0.45, bsdf.inputs["Roughness"].default_value)
    except Exception:
        pass
    return True


def leaf_fixes(objs, folder):
    seen = set()
    for o in objs:
        if o.type != "MESH":
            continue
        for m in o.data.materials:
            if not m or m.name in seen or not m.use_nodes:
                continue
            seen.add(m.name)
            low = m.name.lower()
            if "leaves" in low or "leaf" in low:
                wire_alpha(m, folder, "leaves")
            elif "twigs" in low or "twig" in low:
                wire_alpha(m, folder, "twigs")
            elif "grass" in low:
                wire_alpha(m, folder, "grass")


def bake(objs, name, keep=None, sink=0.0, center="base"):
    """Join the imported parts into one mesh object, bake transforms, put the origin at the
    ground-contact centre; returns (object, height, width)."""
    meshes = [o for o in objs if o.type == "MESH" and (keep is None or keep(o))]
    others = [o for o in objs if o.type != "MESH"]
    drop = [o for o in objs if o.type == "MESH" and o not in meshes]
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    for o in drop:
        bpy.data.objects.remove(o, do_unlink=True)
    ob = join(meshes, name)
    for o in others:
        try:
            bpy.data.objects.remove(o, do_unlink=True)
        except Exception:
            pass
    select_only(ob)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    me = ob.data
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    zs = [v.co.z for v in me.vertices]
    zmin = min(zs)
    height = max(zs) - zmin
    if center == "base":
        low = [v.co for v in me.vertices if v.co.z < zmin + max(0.25, height * 0.06)]
        cx = sum(v.x for v in low) / len(low)
        cy = sum(v.y for v in low) / len(low)
    else:
        cx = (min(xs) + max(xs)) / 2
        cy = (min(ys) + max(ys)) / 2
    for v in me.vertices:
        v.co.x -= cx
        v.co.y -= cy
        v.co.z -= zmin - sink
    me.update()
    width = max(max(xs) - min(xs), max(ys) - min(ys))
    return ob, height, width


def prepare(key, folder_rel, gltf_glob, keep_spec, center, sink, out_path):
    """Child-process entry: build one prototype and save it as its own .blend."""
    bpy.ops.wm.read_homefile(use_empty=True)
    folder = os.path.join(ASSETS, folder_rel)
    files = sorted(glob.glob(os.path.join(folder, gltf_glob)))
    if not files:
        print("PROTO %s: no file matches %s" % (key, gltf_glob))
        return False
    objs = import_gltf(files[0])
    leaf_fixes(objs, folder)
    ob, h, w = bake(objs, "proto_" + key, keep=keep_fn(keep_spec), sink=float(sink), center=center)
    ob["proto_h"] = float(h)
    ob["proto_w"] = float(w)
    mats.shrink_images(default_max=1024)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=out_path, compress=False)
    print("PROTO %s: %d verts, h %.2f w %.2f -> %s" % (key, len(ob.data.vertices), h, w, out_path))
    return True


# ---------- main-build side ----------


def get(key, folder_rel, gltf_glob="*.gltf", keep_spec="all", center="base", sink=0.0):
    """dict(ob, h, w) for a prototype, preparing its cache .blend in a child Blender if needed."""
    if key in PROTOS:
        return PROTOS[key]
    folder = os.path.join(ASSETS, folder_rel)
    if not glob.glob(os.path.join(folder, gltf_glob)):
        PROTOS[key] = None
        return None
    path = os.path.join(CACHE_DIR, key + ".blend")
    if not os.path.exists(path):
        cmd = [bpy.app.binary_path, "-b", "--python", os.path.join(RENDER_DIR, "prep_proto.py"), "--",
               key, folder_rel, gltf_glob, keep_spec, center, str(sink), path]
        print("PROTO %s: preparing cache in a child Blender" % key)
        subprocess.run(cmd, check=False)
    if not os.path.exists(path):
        print("PROTO %s: cache missing after prepare" % key)
        PROTOS[key] = None
        return None
    name = "proto_" + key
    with bpy.data.libraries.load(path, link=False) as (data_from, data_to):
        data_to.objects = [n for n in data_from.objects if n == name]
    ob = data_to.objects[0] if data_to.objects else None
    if ob is None:
        PROTOS[key] = None
        return None
    protos_collection().objects.link(ob)
    hide_proto(ob)
    PROTOS[key] = {"ob": ob, "h": float(ob.get("proto_h", 1.0)), "w": float(ob.get("proto_w", 1.0))}
    print("PROTO %s: appended (%d verts, h %.2f w %.2f)" % (key, len(ob.data.vertices), PROTOS[key]["h"], PROTOS[key]["w"]))
    return PROTOS[key]


def instance(proto, name, coll, x, z, yaw, scale, y=0.0):
    """Linked-mesh copy of a prototype at three (x, z), yaw about up, uniform scale."""
    ob = bpy.data.objects.new(name, proto["ob"].data)
    coll.objects.link(ob)
    ob.location = B(x, z, y)
    ob.rotation_euler = (0.0, 0.0, yaw)
    ob.scale = (scale, scale, scale)
    return ob
