"""Trees, shrubs and weeds. Photoscanned Poly Haven prototypes (glTF, leaf alpha
wired in after import) are normalised once and then INSTANCED as linked-mesh
objects at the positions the site's nature.tsx computes: yard trees per lot,
planting-strip street trees, the grove behind block A, the park inside the L,
and THE oak at beats.falls with its root fan running under the heaved slabs."""
import math

import bpy
from mathutils import Vector

from common import B, BEATS, DEFECTS, DIMS, GAPS, INTERSECTIONS, LOTS, WALK, collection, is_downtown, left_of, rng, sphere
import protos
from protos import instance

WALK_OFF = DIMS["WALK_OFF"]

def load_proto(key, folder_rel, gltf_glob="*.gltf", keep=None, sink=0.0, center="base"):
    """Prototype via the per-asset cache (see protos.py). `keep` is a spec string."""
    return protos.get(key, folder_rel, gltf_glob, keep or "all", center, sink)


# ---------- the plant catalogue ----------

TREE_KEYS = ["island_tree_01", "island_tree_02", "tree_small_02", "island_tree_03"]


def load_plants():
    lib = {}
    # island_tree_03 (rock base, 2.1M tris) and searsia_burchellii (0.6M) are left out: host RAM.
    lib["oak_a"] = load_proto("island_tree_01", "models/polyhaven/island_tree_01")
    lib["oak_b"] = load_proto("island_tree_02", "models/polyhaven/island_tree_02")
    lib["young"] = None  # tree_small_02 (2.1M tris) also left out for host RAM; two oak variants remain
    lib["low"] = None
    lib["shrub_a"] = load_proto("searsia_lucida", "models/polyhaven/searsia_lucida", center="bbox")
    lib["shrub_b"] = None
    lib["tuft"] = load_proto("grass_medium_01", "models/polyhaven/grass_medium_01", keep="named:large_a", center="bbox")
    lib["tuft_b"] = load_proto("grass_bermuda_01", "models/polyhaven/grass_bermuda_01", keep="first", center="bbox")
    return lib


def _tree_for(r, kind="yard"):
    k = r()
    if kind == "street":
        return "oak_a" if k < 0.62 else "oak_b"
    if kind == "grove":
        return "oak_a" if k < 0.45 else ("oak_b" if k < 0.78 else "young")
    return "oak_a" if k < 0.45 else ("oak_b" if k < 0.72 else "young")


def tree(plants, coll, x, z, seed, size, kind="yard", name="tree"):
    """Site `size` (its trunk-height parameter) -> a real tree ~1.65x that tall."""
    r = rng(seed)
    key = _tree_for(r, kind)
    p = plants.get(key) or plants.get("oak_a")
    if p is None:
        return None
    target_h = max(4.0, min(12.5, size * 1.65 * (0.92 + r() * 0.16)))
    s = target_h / max(0.5, p["h"])
    return instance(p, name, coll, x, z, r() * math.pi * 2, s)


def bush(plants, coll, x, z, seed, s=1.0, name="bush"):
    r = rng(seed)
    p = plants.get("shrub_a") if r() < 0.6 else plants.get("shrub_b")
    p = p or plants.get("shrub_a") or plants.get("shrub_b")
    if p is None:
        return None
    width = 1.6 * s * (0.85 + r() * 0.3)
    sc = width / max(0.5, p["w"])
    return instance(p, name, coll, x, z, r() * math.pi * 2, sc)


def weed(plants, coll, x, z, seed, name="weed"):
    r = rng(seed)
    p = plants.get("tuft") if r() < 0.6 else plants.get("tuft_b")
    p = p or plants.get("tuft") or plants.get("tuft_b")
    if p is None:
        return None
    sc = 0.9 + r() * 0.8
    ob = instance(p, name, coll, x, z, r() * math.pi * 2, sc, y=-0.01)
    return ob


# ---------- placement (port of nature.tsx) ----------


def build(lib, quick=False):
    coll = collection("Nature")
    plants = load_plants()
    r = rng(2620)
    n_trees = 0

    # yard + shrub planting per lot
    for lot in LOTS:
        lr = rng(lot["seed"] + 9)
        fx = math.sin(lot["yaw"])
        fz = math.cos(lot["yaw"])
        lx = fz
        lz = -fx
        trees = 0 if lot.get("hero") else int(math.floor(lr() * (2 if lot["back"] else 2.5)))
        for i in range(trees):
            side = -1 if lr() < 0.5 else 1
            tx = lot["cx"] + lx * side * (9.5 + lr() * 3) + fx * (lr() - 0.3) * 6
            tz = lot["cz"] + lz * side * (9.5 + lr() * 3) + fz * (lr() - 0.3) * 6
            if tree(plants, coll, tx, tz, lot["seed"] + 31 + i, 3.4 + lr() * 2.2, "yard", "yard_tree"):
                n_trees += 1
        if (not lot["back"]) and lr() < 0.75:
            n = 1 + int(math.floor(lr() * 3))
            for i in range(n):
                off = -0.42 + (i / max(1, n - 1)) * 0.84
                bush(plants, coll, lot["cx"] + lx * off * 8 + fx * 5.6, lot["cz"] + lz * off * 8 + fz * 5.6, lot["seed"] + 60 + i, 0.9 + lr() * 0.5, "yard_bush")

    # planting-strip street trees along the walk (clear of driveways, intersections, hydrants, the bus stop)
    strip_off = -(WALK_OFF - 5.5)
    hydrant_s = [f * WALK.length for f in (0.115, 0.52, 0.87)]
    bus_stop_s = 0.185 * WALK.length
    # keep the strip trees out of the story shots (they would stand between the camera and the panel)
    beat_s = [BEATS[k] * WALK.length for k in ("broken", "falls", "precedent", "count", "math")]
    drive_mids = [((l["drive"]["a"]["x"] + l["drive"]["b"]["x"]) / 2, (l["drive"]["a"]["z"] + l["drive"]["b"]["z"]) / 2) for l in LOTS if l.get("drive")]
    s = 9.0
    while s < WALK.length - 8:
        p = WALK.frame(s)
        step = 15 + r() * 6
        if any(math.hypot(i["at"]["x"] - p["x"], i["at"]["z"] - p["z"]) < 13 for i in INTERSECTIONS):
            s += step
            continue
        downtown = is_downtown(p["x"], p["z"])
        nx, nz = left_of(p["tx"], p["tz"])
        x = p["x"] + nx * strip_off
        z = p["z"] + nz * strip_off
        if any(math.hypot(mx - x, mz - z) < 5.5 for mx, mz in drive_mids) or any(abs(s - hs) < 3.0 for hs in hydrant_s) or -20.0 < s - bus_stop_s < 9.0:
            s += step
            continue
        if any(-14.0 < s - bs < 9.0 for bs in beat_s):
            s += step
            continue
        size = 2.6 if downtown else 3 + r() * 1.6
        if tree(plants, coll, x, z, 7000 + int(math.floor(s)), size, "street", "street_tree"):
            n_trees += 1
        s += step

    # THE oak at the falls beat, roots running under the walk
    hero_oak(plants, coll, lib)

    # weeds through the seams and in the never-built dirt
    for k in range(26):
        f = 0.03 + r() * 0.92
        if any(a < f < b for a, b in GAPS):
            continue
        p = WALK.frameF(f)
        if is_downtown(p["x"], p["z"]):
            continue
        nx, nz = left_of(p["tx"], p["tz"])
        side = 1 if r() < 0.5 else -1
        weed(plants, coll, p["x"] + nx * side * 0.85, p["z"] + nz * side * 0.85, 8100 + k)
    for a, b in GAPS:
        for k in range(7):
            p = WALK.frameF(a + (b - a) * r())
            nx, nz = left_of(p["tx"], p["tz"])
            weed(plants, coll, p["x"] + nx * (r() - 0.5) * 1.6, p["z"] + nz * (r() - 0.5) * 1.6, 8600 + k)

    # a loose grove behind the far side of block A
    for k in range(14):
        if tree(plants, coll, 46 + r() * 40, 210 + r() * 180, 8800 + k, 3.5 + r() * 2.5, "grove", "grove_tree"):
            n_trees += 1
    for k in range(10):
        if tree(plants, coll, -66 - r() * 34, 200 + r() * 190, 8900 + k, 3.5 + r() * 2.5, "grove", "grove_tree"):
            n_trees += 1

    # the neighbourhood park inside the L
    for k in range(16):
        px = 14 + r() * 96
        pz = 62 + r() * 100
        if px > 118 and pz < 104:
            continue
        if abs(pz - 120) < 8.5:
            continue
        if tree(plants, coll, px, pz, 9300 + k, 3.8 + r() * 2.6, "grove", "park_tree"):
            n_trees += 1
    print("NATURE: %d trees placed" % n_trees)
    return coll


def hero_oak(plants, coll, lib):
    rh = DEFECTS["rootHeave"]
    p = WALK.frameF(rh["f"])
    nx, nz = left_of(p["tx"], p["tz"])
    bx = p["x"] + nx * 3.1
    bz = p["z"] + nz * 3.1
    proto = plants.get("oak_a") or plants.get("oak_b")
    if proto:
        target_h = 10.5
        s = target_h / max(0.5, proto["h"])
        ob = instance(proto, "hero_oak", coll, bx, bz, 0.9, s)
    # root flare: a low dirt/mulch mound at the trunk and a heaved soil mound under the lifted slabs
    m = sphere("oak_mound", coll, lib["dirt"], 1.0, B(bx, bz, -0.35), segs=24)
    m.scale = (2.4, 2.4, 0.5)
    hm = sphere("heave_mound", coll, lib["dirt"], 1.0, B(p["x"] + nx * 0.2, p["z"] + nz * 0.2, -0.32), segs=24)
    hm.scale = (1.5, 2.2, 0.45)
    hm.rotation_euler = (0, 0, math.atan2(p["tx"], p["tz"]))
    # the root fan: bezier tubes from the trunk toward (and under) the walk
    rr = rng(9912)
    for i in range(5):
        spread = (i / 4 - 0.5) * 2.2
        p0 = Vector((bx, bz, 0.22))
        p1 = Vector((bx + nx * -1.6 + p["tx"] * spread, bz + nz * -1.6 + p["tz"] * spread, 0.16 + rr() * 0.1))
        reach = 2.8 + rr()
        p2 = Vector((bx + nx * -reach + p["tx"] * spread * 1.4, bz + nz * -reach + p["tz"] * spread * 1.4, 0.02))
        root_tube(coll, lib, "oak_root_%d" % i, [p0, p1, p2], 0.1 - i * 0.008)
    # a few surface roots on the far sides too
    for i in range(3):
        ang = 1.2 + i * 1.6 + rr() * 0.6
        dx, dz = math.cos(ang), math.sin(ang)
        p0 = Vector((bx, bz, 0.2))
        p1 = Vector((bx + dx * 1.4, bz + dz * 1.4, 0.12))
        p2 = Vector((bx + dx * 2.6, bz + dz * 2.6, -0.05))
        root_tube(coll, lib, "oak_root_far_%d" % i, [p0, p1, p2], 0.07)


def root_tube(coll, lib, name, pts_three, radius):
    """Quadratic bezier (three x, z, y) -> Blender bevelled curve with the bark material."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 4
    cu.resolution_u = 12
    cu.use_fill_caps = True
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(2)
    p0, p1, p2 = pts_three
    bl = [B(v.x, v.y, v.z) for v in (p0, p1, p2)]
    # convert the quadratic control point into cubic handles
    c0 = bl[0] + (bl[1] - bl[0]) * (2 / 3)
    c1 = bl[2] + (bl[1] - bl[2]) * (2 / 3)
    mid = (bl[0] * 0.25 + bl[1] * 0.5 + bl[2] * 0.25)
    for k, (co, radius_k) in enumerate(((bl[0], 1.0), (mid, 0.7), (bl[2], 0.3))):
        bp = sp.bezier_points[k]
        bp.co = co
        bp.handle_left_type = "AUTO"
        bp.handle_right_type = "AUTO"
        bp.radius = radius_k
    ob = bpy.data.objects.new(name, cu)
    coll.objects.link(ob)
    cu.materials.append(lib["bark"])
    return ob
