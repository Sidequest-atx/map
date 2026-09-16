"""Vehicles. The site's licensed car models (public/models/cars, read-only) are
imported once, oriented by the principal axis of their vertices (the bus is
baked at 45 deg in plan, so bounding boxes lie), normalised to real lengths,
grounded, and instanced: parked cars in driveways, the pickup nosed across the
walk before beats.broken, a little moving traffic, and the CapMetro bus that
serves the never-built stop in the first gap."""
import math
import os

import bpy
import numpy as np
from mathutils import Matrix, Vector

from common import B, BEATS, LANES, LOTS, RENDER_DIR, WALK, box, collection, hexcol, left_of, rng, select_only, text_object
import mats
from protos import bake as _bake_proto, import_gltf, protos_collection

CARS_DIR = os.path.normpath(os.path.join(RENDER_DIR, "..", "public", "models", "cars"))
FLEET = {
    "sedan": ("sedan.glb", 4.6),
    "suv": ("suv-crossover.glb", 4.7),
    "pickup": ("pickup.glb", 5.3),
    "suv_large": ("suv-large.glb", 5.0),
    "bus": ("bus.glb", 11.0),
    "cybertruck": ("cybertruck.glb", 5.7),
}
# extra yaw after PCA alignment so the nose points -Y (three +z) at yaw 0; filled from the lineup render
FLIP = {"sedan": 0.0, "suv": 0.0, "pickup": 0.0, "suv_large": 0.0, "bus": math.pi, "cybertruck": math.pi}
PROTOS = {}
BUS_STOP_F = 0.185
BUS_STAND_OFF = 4.6  # bus centre this far behind the stop pole along its travel


def _principal_angle(me):
    n = len(me.vertices)
    co = np.empty(n * 3, dtype=np.float64)
    me.vertices.foreach_get("co", co)
    xy = co.reshape(n, 3)[:, :2]
    xy = xy - xy.mean(axis=0)
    cov = xy.T @ xy / max(1, n)
    evals, evecs = np.linalg.eigh(cov)
    major = evecs[:, int(np.argmax(evals))]
    return math.atan2(major[1], major[0])


def _bbox(me):
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    zs = [v.co.z for v in me.vertices]
    return (min(xs), max(xs)), (min(ys), max(ys)), (min(zs), max(zs))


def _upgrade_paint(ob):
    """Flat glTF colours -> coated car paint (windows/tyres stay as they are)."""
    for m in ob.data.materials:
        if not m or not m.use_nodes:
            continue
        bsdf = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None:
            continue
        c = bsdf.inputs["Base Color"].default_value
        lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
        if lum < 0.04:
            bsdf.inputs["Roughness"].default_value = 0.08 if bsdf.inputs["Metallic"].default_value < 0.5 else 0.4
            continue
        bsdf.inputs["Roughness"].default_value = 0.32
        try:
            bsdf.inputs["Coat Weight"].default_value = 0.8
            bsdf.inputs["Coat Roughness"].default_value = 0.04
        except Exception:
            pass


def load_car(key, lib):
    if key in PROTOS:
        return PROTOS[key]
    fname, length = FLEET[key]
    path = os.path.join(CARS_DIR, fname)
    if not os.path.exists(path):
        PROTOS[key] = None
        return None
    objs = import_gltf(path)
    ob, h, w = _bake_proto(objs, "proto_car_" + key, center="bbox")
    me = ob.data
    ang = _principal_angle(me)
    me.transform(Matrix.Rotation(math.pi / 2 - ang + FLIP.get(key, 0.0), 4, "Z"))
    (x0, x1), (y0, y1), (z0, z1) = _bbox(me)
    s = length / max(0.01, y1 - y0)
    me.transform(Matrix.Scale(s, 4))
    (x0, x1), (y0, y1), (z0, z1) = _bbox(me)
    me.transform(Matrix.Translation(Vector((-(x0 + x1) / 2, -(y0 + y1) / 2, -z0))))
    me.update()
    _upgrade_paint(ob)
    if key == "bus":
        _capmetro_livery(ob, lib)
    pc = protos_collection()
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    pc.objects.link(ob)
    ob.hide_render = True
    ob.hide_viewport = True
    (x0, x1), (y0, y1), (z0, z1) = _bbox(me)
    PROTOS[key] = {"ob": ob, "len": y1 - y0, "w": x1 - x0, "h": z1 - z0}
    print("CAR %s: %d verts, L %.2f W %.2f H %.2f" % (key, len(me.vertices), y1 - y0, x1 - x0, z1 - z0))
    return PROTOS[key]


def _capmetro_livery(ob, lib):
    """White body, CapMetro blue where the model's transit blue was, the yellow chevron
    becomes the red accent; text decals and the destination sign are added as parts."""
    for i, m in enumerate(ob.data.materials):
        if not m or not m.use_nodes:
            continue
        bsdf = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None:
            continue
        r, g, b = bsdf.inputs["Base Color"].default_value[:3]
        sat = max(r, g, b) - min(r, g, b)
        if b > r + 0.12 and b > 0.3:
            ob.data.materials[i] = lib["capmetro_blue"]
        elif r > 0.55 and g > 0.4 and b < 0.25:
            ob.data.materials[i] = lib["capmetro_red"]
        elif sat < 0.12 and max(r, g, b) > 0.45:
            ob.data.materials[i] = lib["capmetro_white"]


def _bus_dress(bus, proto, coll, lib):
    """Decals that travel with a bus instance (parented): red stripe, CapMetro lettering, destination sign."""
    L, W, H = proto["len"], proto["w"], proto["h"]
    parts = []
    font = None
    for cand in (r"C:\Windows\Fonts\arialbd.ttf", r"C:\Windows\Fonts\verdanab.ttf"):
        if os.path.exists(cand):
            try:
                font = bpy.data.fonts.load(cand, check_existing=True)
                break
            except Exception:
                font = None
    for side in (1, -1):
        x = side * (W / 2 + 0.008)
        stripe = box("bus_stripe", coll, lib["capmetro_red"], 0.012, L * 0.78, 0.06, (x, 0.35, 1.32))
        parts.append(stripe)
        t = text_object("bus_text", coll, lib["capmetro_text"], "CapMetro", 0.42, (x, 0.9 * side, 0.92), 0.0, 0.0, extrude=0.003)
        t.rotation_mode = "XYZ"
        t.rotation_euler = (math.pi / 2, 0.0, side * math.pi / 2)
        if font:
            t.data.font = font
        parts.append(t)
    panel = box("bus_dest_panel", coll, lib["metal_dark"], W * 0.72, 0.05, 0.34, (0.0, -L / 2 - 0.012, H - 0.62))
    parts.append(panel)
    t = text_object("bus_dest_text", coll, lib["dest_sign"], "383  RESEARCH", 0.17, (0.0, -L / 2 - 0.05, H - 0.62), 0.0, 0.0, extrude=0.002)
    t.rotation_mode = "XYZ"
    t.rotation_euler = (math.pi / 2, 0.0, 0.0)
    if font:
        t.data.font = font
    parts.append(t)
    for p in parts:
        p.parent = bus
    return parts


def place(key, name, coll, lib, x, z, yaw, y=0.0):
    proto = load_car(key, lib)
    if proto is None:
        return None
    ob = bpy.data.objects.new(name, proto["ob"].data)
    coll.objects.link(ob)
    ob.location = B(x, z, y + 0.02)
    ob.rotation_euler = (0.0, 0.0, yaw)
    if key == "bus":
        _bus_dress(ob, proto, coll, lib)
    return ob


def path_yaw(p):
    return math.atan2(p["tx"], p["tz"])


def bus_stop_pose():
    """Where the bus sits when it is stopped at the never-built stop: on the rev lane
    (the walk's side), front door at the pole."""
    lane = LANES["rev"]
    wp = WALK.frameF(BUS_STOP_F)
    s = lane.closestS(wp["x"], wp["z"])
    # the bus travels toward +s on the rev lane; its centre sits BUS_STAND_OFF before the pole
    p = lane.frame(s - BUS_STAND_OFF)
    return p, path_yaw(p), lane, s


def build(lib, bus_at_stop=True, traffic=True):
    coll = collection("Vehicles")
    placed = []
    # parked cars in driveways (site order: every Nth lot with a drive, models cycling)
    with_drives = [l for l in LOTS if l.get("drive") and not l["back"]]
    models = ["suv", "sedan", "pickup", "sedan", "suv", "pickup"]
    step = max(1, len(with_drives) // 6)
    mi = 0
    i = 0
    while i < len(with_drives) and mi < 6:
        l = with_drives[i]
        a, b = l["drive"]["a"], l["drive"]["b"]
        yaw = math.atan2(b["x"] - a["x"], b["z"] - a["z"])
        placed.append(place(models[mi], "parked_" + l["id"], coll, lib, b["x"] * 0.35 + a["x"] * 0.65, b["z"] * 0.35 + a["z"] * 0.65, yaw))
        mi += 1
        i += step
    # the pickup nosed across the walk, right before the broken beat
    p = WALK.frameF(BEATS["broken"] - 0.03)
    nx, nz = left_of(p["tx"], p["tz"])
    near = sorted(with_drives, key=lambda l: math.hypot(l["cx"] - p["x"], l["cz"] - p["z"]))
    if near:
        a, b = near[0]["drive"]["a"], near[0]["drive"]["b"]
        yaw = math.atan2(b["x"] - a["x"], b["z"] - a["z"])
        placed.append(place("pickup", "pickup_across_walk", coll, lib, p["x"] + nx * 0.4, p["z"] + nz * 0.4, yaw))
    # the CapMetro bus at its stop
    if bus_at_stop:
        bp, byaw, lane, s = bus_stop_pose()
        bus = place("bus", "capmetro_bus", coll, lib, bp["x"], bp["z"], byaw)
        placed.append(bus)
    # a little traffic: one sedan northbound on the fwd lane (animated by render.py if asked),
    # one crossover parked at the downtown curb
    if traffic:
        fwd = LANES["fwd"]
        q = fwd.frame(WALK.length * 0.205)
        placed.append(place("sedan", "traffic_sedan", coll, lib, q["x"], q["z"], path_yaw(q)))
        q2 = LANES["rev"].frame(WALK.length * 0.62)
        placed.append(place("suv_large", "traffic_suv", coll, lib, q2["x"], q2["z"], path_yaw(q2)))
        # a car crossing the frame on the far leg for the aerial
        q3 = fwd.frame(WALK.length * 0.44)
        placed.append(place("cybertruck", "traffic_cyber", coll, lib, q3["x"], q3["z"], path_yaw(q3)))
    print("VEHICLES: %d placed" % len([p for p in placed if p]))
    return coll


def lineup(lib, coll):
    """DEV: the six prototypes side by side at yaw 0 (nose should point -Y) for a facing check."""
    keys = list(FLEET.keys())
    objs = []
    for i, k in enumerate(keys):
        objs.append(place(k, "lineup_" + k, coll, lib, -25 + i * 8.0, 428.0, 0.0))
    return objs
