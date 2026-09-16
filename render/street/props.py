"""Street furniture and story props (port of props.tsx, with scanned models
where the asset pack has them): mailboxes, stop signs at the 4-way with the
MUTCD R1-1 face, cobra streetlights, wooden utility poles with sagging lines,
hydrants, benches, Type III barricades closing the never-built stretches, the
orange ADA spray ring, the asphalt patch, the green verified-fixed pin, the
CapMetro stop in the gap, the dropped cane on the root heave, downtown cones and
plates, curb ramps and manhole covers. Surface-hugging props are ray-cast onto
the slabs so they sit on lips and tilts instead of floating."""
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

from common import (
    ASSETS, B, BEATS, BUS_STOP_LAT, DEFECTS, DIMS, INTERSECTIONS, LOTS, STREET, WALK, box, bus_stop_xz, collection,
    cylinder, hexcol, left_of, load_font, mesh_from_pydata, new_object, rng, sphere, text_object, yaw_euler,
)
import mats
from nature import load_proto
from protos import instance

STREET_W = DIMS["STREET_W"]
LANE_W = DIMS["LANE_W"]

# ---------- surface queries ----------


def surface(x, z, from_h=4.0, ground_only=True):
    """(height, normal) of the topmost ground/pavement surface at three (x, z)."""
    dg = bpy.context.evaluated_depsgraph_get()
    scene = bpy.context.scene
    origin = B(x, z, from_h)
    down = Vector((0.0, 0.0, -1.0))
    ground = bpy.data.collections.get("Ground")
    for _ in range(6):
        hit, loc, nrm, idx, ob, mw = scene.ray_cast(dg, origin, down, distance=from_h + 2.0)
        if not hit:
            break
        if not ground_only or (ob is not None and ob.name in ground.objects):
            return loc.z, nrm.normalized()
        origin = loc + down * 0.02
    return 0.132, Vector((0.0, 0.0, 1.0))


def conforming(name, coll, mat, pts, faces, uvs, lift=0.003):
    """Mesh whose vertices (three x, z) are dropped onto the surface + lift."""
    verts = []
    for x, z in pts:
        h, n = surface(x, z)
        verts.append(B(x, z, h + lift))
    me = mesh_from_pydata(name, verts, faces, uvs)
    return new_object(name, me, coll, mat)


# ---------- materials made here ----------


def stripe_material():
    name = "sq_barricade_stripes"
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.55
    tc = nt.nodes.new("ShaderNodeTexCoord")
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "DIAGONAL"
    wave.wave_profile = "SAW"
    wave.inputs["Scale"].default_value = 4.7
    wave.inputs["Distortion"].default_value = 0.0
    nt.links.new(tc.outputs["UV"], wave.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    ramp.color_ramp.elements[0].color = hexcol("#e8621e")
    ramp.color_ramp.elements[1].position = 0.5
    ramp.color_ramp.elements[1].color = hexcol("#efe9dc")
    nt.links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def decal_material(name, path, rough=0.4):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = rough
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = mats.img(path)
    tex.extension = "EXTEND"
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


# ---------- builders ----------


def stop_sign(coll, lib, x, z, yaw):
    """Pole + octagon with the public-domain MUTCD R1-1 face (faces three +z at yaw 0)."""
    cylinder("stop_pole", coll, lib["galv"], 0.032, 0.036, 2.15, B(x, z, 0.0), 10)
    r = 0.762 / 2 / math.cos(math.radians(22.5))
    cz = 2.15 + 0.381
    verts = []
    uvs = []
    for k in range(8):
        a = math.radians(22.5 + 45 * k)
        px, pz = r * math.cos(a), r * math.sin(a)
        verts.append(Vector((px, 0.0, cz + pz)))
        uvs.append((0.5 + px / 0.762, 0.5 + pz / 0.762))
    me = mesh_from_pydata("stop_face", verts, [tuple(range(8))], uvs)
    me.calc_normals_split() if hasattr(me, "calc_normals_split") else None
    if me.polygons[0].normal.y > 0:
        me.flip_normals()
    decal = os.path.join(ASSETS, "decals", "MUTCD_R1-1_stop_sign_3840.png")
    mat = decal_material("sq_stop_face", decal) if os.path.exists(decal) else lib["sign_red"]
    face = new_object("stop_face", me, coll, mat)
    face.rotation_mode = "YXZ"
    face.location = B(x, z, 0.0)
    face.rotation_euler = yaw_euler(yaw)
    back = new_object("stop_back", mesh_from_pydata("stop_back", [Vector((v.x, 0.004, v.z)) for v in verts], [tuple(range(7, -1, -1))]), coll, lib["galv"])
    back.rotation_mode = "YXZ"
    back.location = B(x, z, 0.0)
    back.rotation_euler = yaw_euler(yaw)


def cobra_light(coll, lib, x, z, toward, name="lamp"):
    """toward = (dx, dz) unit direction from the pole to the street."""
    yaw = math.atan2(toward[0], toward[1])
    cylinder(name + "_pole", coll, lib["metal"], 0.075, 0.12, 8.2, B(x, z, 0.0), 12)
    cylinder(name + "_base", coll, lib["concrete_plain"], 0.3, 0.34, 0.25, B(x, z, 0.0), 12)
    # arm: a horizontal cylinder rising slightly, from the pole top toward the street
    arm = cylinder(name + "_arm", coll, lib["metal"], 0.045, 0.06, 2.7, (0, 0, 0), 8)
    arm.rotation_mode = "YXZ"
    arm.location = B(x + toward[0] * 0.0, z + toward[1] * 0.0, 7.85)
    arm.rotation_euler = yaw_euler(yaw, math.radians(-82.0), 0.0)
    hx, hz = x + toward[0] * 2.55, z + toward[1] * 2.55
    head = box(name + "_head", coll, lib["metal_dark"], 0.36, 0.95, 0.2, B(hx, hz, 8.05), yaw)
    lens = box(name + "_lens", coll, lib["lamp"], 0.28, 0.6, 0.03, B(hx, hz, 8.03), yaw)
    return head


def utility_pole_proto(lib):
    p = load_proto("utility_pole", "models/polyhaven/modular_electricity_poles", keep="named:preset_01_", center="base")
    return p


def wires(coll, lib, a, b, heights, sag=0.55, offsets=(-0.55, 0.0, 0.55)):
    """Sagging conductors between two pole tops (three coords)."""
    dx, dz = b[0] - a[0], b[1] - a[1]
    ln = math.hypot(dx, dz) or 1.0
    nx, nz = -dz / ln, dx / ln
    for off, h in zip(offsets, heights):
        cu = bpy.data.curves.new("wire", "CURVE")
        cu.dimensions = "3D"
        cu.bevel_depth = 0.009
        cu.bevel_resolution = 2
        cu.resolution_u = 10
        sp = cu.splines.new("BEZIER")
        sp.bezier_points.add(1)
        p0 = B(a[0] + nx * off, a[1] + nz * off, h)
        p1 = B(b[0] + nx * off, b[1] + nz * off, h)
        for bp, co, other in ((sp.bezier_points[0], p0, p1), (sp.bezier_points[1], p1, p0)):
            bp.co = co
            bp.handle_left_type = "FREE"
            bp.handle_right_type = "FREE"
            hdl = co + (other - co) * 0.33 + Vector((0, 0, -sag * 1.33))
            bp.handle_left = hdl
            bp.handle_right = hdl
        ob = bpy.data.objects.new("wire", cu)
        coll.objects.link(ob)
        cu.materials.append(lib["metal_dark"])


def barricade(coll, lib, x, z, yaw, seed):
    """Type III: two A-frame legs and three striped rails, 1.5 m wide."""
    r = rng(seed)
    lean = (r() - 0.5) * 0.08
    stripes = stripe_material()
    c, s = math.cos(yaw), math.sin(yaw)
    for off in (-0.62, 0.62):
        lx, lz = x + c * off, z - s * off
        box("barr_leg", coll, lib["paint_white"], 0.06, 0.06, 1.2, B(lx, lz, 0.0), yaw, math.radians(6), lean)
        box("barr_leg", coll, lib["paint_white"], 0.06, 0.06, 1.2, B(lx, lz, 0.0), yaw, math.radians(-6), lean)
        box("barr_foot", coll, lib["paint_white"], 0.06, 0.6, 0.05, B(lx, lz, 0.0), yaw, 0.0, lean)
    for h in (0.42, 0.72, 1.02):
        box("barr_rail", coll, stripes, 1.5, 0.025, 0.2, B(x, z, h), yaw, 0.0, lean, uv_scale=1.0)


def cone(coll, lib, x, z, seed, proto=None):
    r = rng(seed)
    if proto:
        ob = instance(proto, "cone", coll, x, z, r() * 6.28, 0.71 / max(0.3, proto["h"]))
        ob.rotation_euler = (math.radians((r() - 0.5) * 4), math.radians((r() - 0.5) * 4), ob.rotation_euler.z)
        return ob
    ob = cylinder("cone", coll, lib["cone_orange"], 0.03, 0.14, 0.7, B(x, z, 0.0), 14, smooth=True)
    box("cone_base", coll, lib["rubber"], 0.38, 0.38, 0.03, B(x, z, 0.0), r() * 3)
    return ob


def ada_ring(coll, lib):
    p = WALK.frameF(BEATS["precedent"])
    cx, cz = p["x"] + 0.2, p["z"] + 0.3
    n = 48
    pts = []
    faces = []
    for k in range(n):
        a = 2 * math.pi * k / n
        pts.append((cx + math.cos(a) * 0.5, cz + math.sin(a) * 0.5))
        pts.append((cx + math.cos(a) * 0.66, cz + math.sin(a) * 0.66))
    for k in range(n):
        i = k * 2
        j = ((k + 1) % n) * 2
        faces.append((i, j, j + 1, i + 1))
    conforming("ada_ring", coll, lib["spray"], pts, faces, None, lift=0.004)
    # the tick mark
    tx = [(cx - 0.05, cz + 0.7), (cx + 0.05, cz + 0.7), (cx + 0.05, cz + 1.2), (cx - 0.05, cz + 1.2)]
    conforming("ada_tick", coll, lib["spray"], tx, [(0, 1, 2, 3)], None, lift=0.004)


def asphalt_patch(coll, lib):
    p = WALK.frameF(BEATS["math"] - 0.006)
    nx, nz = left_of(p["tx"], p["tz"])
    w, l = 1.35, 2.6
    nw, nl = 5, 9
    pts = []
    uvs = []
    faces = []
    for i in range(nl):
        t = -l / 2 + l * i / (nl - 1)
        for j in range(nw):
            u = -w / 2 + w * j / (nw - 1)
            pts.append((p["x"] + p["tx"] * t + nx * u, p["z"] + p["tz"] * t + nz * u))
            uvs.append((u, t))
    for i in range(nl - 1):
        for j in range(nw - 1):
            a = i * nw + j
            faces.append((a, a + 1, a + nw + 1, a + nw))
    ob = conforming("asphalt_patch", coll, lib["asphalt_patch"], pts, faces, uvs, lift=0.006)
    # a slightly raised, rough lip: solidify a hair upward
    m = ob.modifiers.new("solid", "SOLIDIFY")
    m.thickness = 0.012
    m.offset = 1
    return ob


def fixed_pin(coll, lib):
    p = WALK.frameF(BEATS["count"])
    nx, nz = left_of(p["tx"], p["tz"])
    px, pz = p["x"] - nx * 1.4, p["z"] - nz * 1.4
    sphere("pin_head", coll, lib["pin"], 0.55, B(px, pz, 2.2), 24)
    tip = cylinder("pin_tip", coll, lib["pin"], 0.42, 0.02, 1.3, B(px, pz, 0.55), 20, smooth=True)
    return tip


def bus_stop(coll, lib):
    x, z = bus_stop_xz()
    p = WALK.frameF(0.185)
    yaw = math.atan2(p["tx"], p["tz"])
    cylinder("busstop_pole", coll, lib["galv"], 0.03, 0.033, 2.55, B(x, z, 0.0), 10)
    # sign panel, face perpendicular to the street so riders and the driver read it
    panel = box("busstop_sign", coll, lib["sign_white"], 0.46, 0.028, 0.62, B(x, z, 1.95), yaw)
    head = box("busstop_head", coll, lib["capmetro_blue"], 0.46, 0.006, 0.17, B(x, z, 2.395), yaw)
    head.location.y += 0.0
    font = load_font(True)
    for side in (1, -1):
        off = 0.018 * side
        for body, size, h, mat in (("CapMetro", 0.075, 2.395, lib["sign_white"]), ("383", 0.2, 2.12, lib["capmetro_text"]), ("BUS STOP", 0.05, 1.86, lib["capmetro_text"])):
            t = text_object("busstop_text", coll, mat, body, size, (0, 0, 0), 0.0, 0.0, extrude=0.0015)
            t.rotation_mode = "XYZ"
            # stand upright in the panel plane (yaw about Z), facing +/- the panel normal
            t.location = B(x, z, h) + Vector((-math.sin(yaw) * 0, 0, 0))
            t.rotation_euler = (math.pi / 2, 0.0, yaw + (0.0 if side > 0 else math.pi))
            nrm = Vector((-math.sin(yaw), -math.cos(yaw), 0.0))  # local -Y after yaw (Blender)
            t.location = t.location + nrm * (off + 0.014)
            if font:
                t.data.font = font
    # the trash can and a worn dirt patch
    tc = load_proto("trash_can", "models/polyhaven/metal_trash_can", keep="named:rust;exclude:lid", center="bbox")
    if tc:
        instance(tc, "busstop_can", coll, x + p["tx"] * 1.3, z + p["tz"] * 1.3, yaw + 0.4, 1.0)
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=32, radius=1.0)
    me = bpy.data.meshes.new("busstop_dirt")
    bm.to_mesh(me)
    bm.free()
    uv = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = (co.x * 0.6, co.y * 0.6)
    d = new_object("busstop_dirt", me, coll, lib["dirt"])
    d.location = B(x + p["tx"] * 0.4, z + p["tz"] * 0.4, 0.011)
    d.scale = (1.6, 2.1, 1.0)
    d.rotation_euler = (0, 0, yaw)


def cane(coll, lib):
    """A dropped wooden cane on the lifted slab at the root heave."""
    rh = DEFECTS["rootHeave"]
    p = WALK.frameF(rh["f"] + 0.0017)
    nx, nz = left_of(p["tx"], p["tz"])
    cx, cz = p["x"] + nx * -0.12 + p["tx"] * 0.1, p["z"] + nz * -0.12 + p["tz"] * 0.1
    h, n = surface(cx, cz)
    cu = bpy.data.curves.new("cane", "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = 0.011
    cu.bevel_resolution = 4
    cu.resolution_u = 8
    cu.use_fill_caps = True
    sp = cu.splines.new("POLY")
    pts = [(-0.45, 0.0), (0.42, 0.0)]
    for k in range(1, 8):
        a = -math.pi / 2 + math.pi * k / 7
        pts.append((0.42 + math.cos(a) * 0.075, 0.075 + math.sin(a) * 0.075))
    sp.points.add(len(pts) - 1)
    for i, (x, y) in enumerate(pts):
        sp.points[i].co = (x, y, 0.0, 1.0)
    sp.use_smooth = True
    ob = bpy.data.objects.new("cane", cu)
    coll.objects.link(ob)
    wood = mats.simple("sq_cane_wood", "#4a2e1c", rough=0.35)
    cu.materials.append(wood)
    yaw = math.atan2(p["tx"], p["tz"]) + 0.55
    rot = n.to_track_quat("Z", "Y").to_matrix() @ Matrix.Rotation(yaw, 3, "Z")
    ob.matrix_world = Matrix.Translation(B(cx, cz, h + 0.011)) @ rot.to_4x4()
    tip = cylinder("cane_tip", coll, lib["rubber"], 0.014, 0.016, 0.03, (0, 0, 0), 10)
    tip.matrix_world = ob.matrix_world @ Matrix.Translation(Vector((-0.45, 0, 0))) @ Matrix.Rotation(math.pi / 2, 4, "Y")
    return ob


# ---------- assembly ----------


def build(lib):
    coll = collection("Props")
    r = rng(4242)

    # mailboxes (scanned low-poly US box on a post), door toward the street
    mb = load_proto("mailbox", "models/polypizza", gltf_glob="mailbox_creativetrio_*.glb", center="bbox")
    for lot in LOTS:
        m = lot.get("mailbox")
        if not m:
            continue
        yaw = m["yaw"]
        if mb:
            instance(mb, "mailbox_" + lot["id"], coll, m["x"], m["z"], yaw + math.pi / 2, 1.0)
        else:
            box("mailbox_post", coll, lib["pole_wood"], 0.09, 0.09, 1.05, B(m["x"], m["z"], 0.0), yaw)
            box("mailbox_box", coll, lib["metal_dark"], 0.26, 0.52, 0.3, B(m["x"], m["z"], 1.02), yaw)

    # stop signs at the 4-way (I1), each facing the traffic it stops
    i1 = INTERSECTIONS[0]
    for sx, sz, dx, dz in ((6.3, 7.6, 0, 1), (-6.3, -7.6, 0, -1), (7.6, -6.3, 1, 0), (-7.6, 6.3, -1, 0)):
        stop_sign(coll, lib, i1["at"]["x"] + sx, i1["at"]["z"] + sz, math.atan2(dx, dz))

    # streetlights: downtown pairs + suburban every ~47 m alternating sides
    spots = []
    for side in (-1, 1):
        z = 92
        while z > -54:
            if not any(i["signal"] and abs(i["at"]["z"] - z) < 9 for i in INTERSECTIONS):
                spots.append((150 + side * (STREET_W / 2 + 0.9), z + (13 if side == 1 else 0), (-side, 0)))
            z -= 26
    flip = 1
    s = 20.0
    bsx, bsz = bus_stop_xz()
    while s < STREET.length - 30:
        p = STREET.frame(s)
        if math.hypot(p["x"] - bsx, p["z"] - bsz) < 20.0:
            s += 47  # keep the bus stop's sightline clear
            continue
        if not (p["x"] > 120 and p["z"] < 108) and not any(math.hypot(i["at"]["x"] - p["x"], i["at"]["z"] - p["z"]) < 12 for i in INTERSECTIONS):
            nx, nz = left_of(p["tx"], p["tz"])
            off = (STREET_W / 2 + 0.9) * flip
            spots.append((p["x"] + nx * off, p["z"] + nz * off, (-nx * flip, -nz * flip)))
            flip = -flip
        s += 47
    for k, (x, z, toward) in enumerate(spots):
        cobra_light(coll, lib, x, z, toward, "lamp%d" % k)

    # wooden utility poles with transformers down the far side of block A, lines strung between them
    up = utility_pole_proto(lib)
    tops = []
    z = 420
    while z > 200:
        if up:
            ob = instance(up, "utility_pole", coll, 7.2, z, 0.0, 1.35)
            tops.append((7.2, z, up["h"] * 1.35 - 0.3))
        else:
            cylinder("utility_pole", coll, lib["pole_wood"], 0.11, 0.15, 8.2, B(7.2, z, 0.0), 10)
            box("crossarm", coll, lib["pole_wood"], 1.8, 0.09, 0.11, B(7.2, z, 7.6), 0.0)
            tops.append((7.2, z, 7.65))
        z -= 42
    for a, b in zip(tops, tops[1:]):
        wires(coll, lib, (a[0], a[1]), (b[0], b[1]), (a[2], a[2] + 0.05, a[2]), sag=0.6)
        wires(coll, lib, (a[0], a[1]), (b[0], b[1]), (a[2] - 1.3,), sag=0.5, offsets=(0.2,))

    # fire hydrants (scanned, aged variant) in the planting strip
    hy = load_proto("hydrant", "models/polyhaven/fire_hydrant", keep="named:aged", center="bbox")
    for f in (0.115, 0.52, 0.87):
        p = WALK.frameF(f)
        nx, nz = left_of(p["tx"], p["tz"])
        hx, hz = p["x"] + nx * -1.6, p["z"] + nz * -1.6
        if hy:
            instance(hy, "hydrant", coll, hx, hz, math.atan2(p["tx"], p["tz"]) + math.pi / 2, 1.0)
        else:
            cylinder("hydrant", coll, lib["hydrant"], 0.16, 0.2, 0.62, B(hx, hz, 0.0), 12)
            sphere("hydrant_cap", coll, lib["hydrant"], 0.17, B(hx, hz, 0.72), 12)

    # benches by the downtown walk (scanned modular seating, the backed module)
    bench = load_proto("bench", "models/polyhaven/modular_street_seating", keep="maxx:0.12", center="bbox")
    for z in (78, 44, -6):
        if bench:
            instance(bench, "bench", coll, 150 - 9.6, z, math.pi / 2, 1.0)
        else:
            box("bench_seat", coll, lib["trim"], 0.55, 1.9, 0.08, B(150 - 9.6, z, 0.44))
            box("bench_back", coll, lib["trim"], 0.08, 1.9, 0.5, B(150 - 9.6 - 0.28, z, 0.53))

    # Type III barricades closing the never-built stretches
    for bi, f in enumerate(DEFECTS["barricades"]):
        p = WALK.frameF(f)
        barricade(coll, lib, p["x"], p["z"], math.atan2(p["tx"], p["tz"]) + math.pi / 2, 4000 + bi)

    # story props
    ada_ring(coll, lib)
    asphalt_patch(coll, lib)
    fixed_pin(coll, lib)
    bus_stop(coll, lib)
    cane(coll, lib)

    # downtown walk clutter: cones and steel plates (the scooters are not modelled)
    cone_proto = load_proto("cone", "models/polypizza", gltf_glob="traffic_cone_*.glb", center="bbox")
    if cone_proto:
        for m in cone_proto["ob"].data.materials:
            pass
        mats_ = cone_proto["ob"].data.materials
        for i, m in enumerate(mats_):
            if m and "orange" in m.name.lower():
                mats_[i] = lib["cone_orange"]
            elif m and "white" in m.name.lower():
                mats_[i] = lib["sign_white"]

    def at(f, lat):
        p = WALK.frameF(f)
        nx, nz = left_of(p["tx"], p["tz"])
        return p["x"] + nx * lat, p["z"] + nz * lat, math.atan2(p["tx"], p["tz"])

    for f, lat, seed in ((0.8, 0.55, 5110), (0.812, -0.4, 5120), (0.772, 0.6, 5130), (0.882, -0.45, 5140), (0.937, 0.5, 5150)):
        x, z, _ = at(f, lat)
        cone(coll, lib, x, z, seed, cone_proto)
    for f, lat in ((0.806, 0.15), (0.926, 0.3)):
        x, z, yaw = at(f, lat)
        box("steel_plate", coll, lib["plate"], 1.5, 2.4, 0.025, B(x, z, 0.13), yaw, bevel=0.01)

    # curb ramps at the signalised corners, manhole covers on the street
    for i in INTERSECTIONS:
        if not i["signal"]:
            continue
        p = STREET.frame(i["mainS"])
        nx, nz = left_of(p["tx"], p["tz"])
        for sgn in (-1, 1):
            box("curb_ramp", coll, lib["concrete_plain"], 1.3, 1.3, 0.09, B(p["x"] + p["tx"] * sgn * 6.4 + nx * 6.4, p["z"] + p["tz"] * sgn * 6.4 + nz * 6.4, 0.05), 0.0, 0.06 * sgn)
    mh = load_proto("manhole", "models/polyhaven/water_manhole_cover", center="bbox")
    for s, lat in ((62, 0.8), (208, -0.9), (356, 0.6), (492, -0.7), (600, 0.9)):
        p = STREET.frame(s)
        nx, nz = left_of(p["tx"], p["tz"])
        if mh:
            instance(mh, "manhole", coll, p["x"] + nx * lat, p["z"] + nz * lat, r() * 6.28, 1.0, y=0.02 - mh["h"] + 0.006)
    # a pad-mount utility cabinet behind the walk near the gap
    ub = load_proto("utility_box", "models/polyhaven/utility_box_02", center="bbox")
    if ub:
        p = WALK.frameF(0.235)
        nx, nz = left_of(p["tx"], p["tz"])
        instance(ub, "utility_box", coll, p["x"] + nx * 1.6, p["z"] + nz * 1.6, math.atan2(p["tx"], p["tz"]), 1.0)
    print("PROPS: built")
    return coll
