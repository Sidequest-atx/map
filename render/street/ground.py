"""Everything on the earth: terrain, the lawn corridor (carries the grass
hair), the asphalt road with its crown-less gutters and real potholes, swept
curbs, lane paint, crosswalks, and the sidewalk slab by slab — tilted,
lipped, missing, patched, or never built — with cracks carved as true
grooves and the hero panel broken in two."""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from common import (
    B, BEATS, DEFECTS, DIMS, DOWNTOWN_Z, GAPS, INTERSECTIONS, LOTS, STREET, WALK,
    apply_modifiers, boolean_cut, box, bus_stop_xz, clear_runs, collection, in_any_gap, is_downtown,
    left_of, mesh_from_pydata, near_intersection, new_object, ribbon, rng, select_only, sphere, sweep, yaw_euler,
)
import mats

LANE_W = DIMS["LANE_W"]
STREET_W = DIMS["STREET_W"]
CURB_W = DIMS["CURB_W"]
CURB_H = DIMS["CURB_H"]
WALK_OFF = DIMS["WALK_OFF"]
SLAB_W = DIMS["SLAB_W"]
SLAB_L = DIMS["SLAB_L"]
SLAB_T = 0.12


def _ground_uv(me, per_m=0.5):
    uv = me.uv_layers.get("UVMap") or me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = (co.x * per_m, co.y * per_m)


def terrain(coll, lib):
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=90, y_segments=130, size=0.5)
    for v in bm.verts:
        v.co.x = v.co.x * 900 + 75
        v.co.y = v.co.y * 1300 - 150
        v.co.z = -0.02
    me = bpy.data.meshes.new("terrain")
    bm.to_mesh(me)
    bm.free()
    ob = new_object("terrain", me, coll, lib["grass"])
    return ob


def lawn_corridor(coll, lib):
    """Fine mesh straddling the walk that carries hair grass; density weights
    drop to zero on pavement, driveways, walkways, the desire lines and downtown."""
    verts = []
    faces = []
    lat_min, lat_max = -(STREET_W / 2 + 26.0), 30.0
    step = 1.0
    n_lat = int((lat_max - lat_min) / step) + 1
    stations = []
    s = 0.0
    while s <= WALK.length:
        stations.append(s)
        s += step
    weights = []
    lot_rects = []
    for lot in LOTS:
        for key, w in (("drive", 3.5), ("walkway", 1.2)):
            seg = lot.get(key)
            if seg:
                lot_rects.append((seg["a"]["x"], seg["a"]["z"], seg["b"]["x"], seg["b"]["z"], w / 2))

    def seg_dist(px, pz, ax, az, bx, bz):
        dx, dz = bx - ax, bz - az
        l2 = dx * dx + dz * dz or 1e-9
        t = max(0.0, min(1.0, ((px - ax) * dx + (pz - az) * dz) / l2))
        return math.hypot(px - (ax + dx * t), pz - (az + dz * t))

    bsx, bsz = bus_stop_xz()
    for si, s in enumerate(stations):
        p = WALK.frame(s)
        nx, nz = left_of(p["tx"], p["tz"])
        f = s / WALK.length
        for j in range(n_lat):
            lat = lat_min + j * step
            x = p["x"] + nx * lat
            z = p["z"] + nz * lat
            verts.append(B(x, z, 0.0))
            w = 1.0
            if is_downtown(x, z):
                w = 0.0
            if math.hypot(x - bsx, z - bsz) < 1.9:
                w = 0.0  # the worn dirt around the bus stop pole
            if STREET.dist(x, z) < STREET_W / 2 + CURB_W + 0.25:
                w = 0.0
            for i in INTERSECTIONS:
                if i["path"].dist(x, z) < STREET_W / 2 + CURB_W + 0.25:
                    w = 0.0
            dw = abs(lat)
            if dw < SLAB_W / 2 + 0.12 and not in_any_gap(f - 0.002, f + 0.002):
                w = 0.0
            elif dw < 0.9 and in_any_gap(f - 0.002, f + 0.002):
                w = 0.15
            for ax, az, bx, bz, hw in lot_rects:
                if seg_dist(x, z, ax, az, bx, bz) < hw + 0.15:
                    w = 0.0
                    break
            # thin out with distance from the walk: dense near the camera path
            if w > 0:
                w *= 1.0 if dw < 9 else max(0.12, 1.0 - (dw - 9) / 22.0)
            weights.append(w)
            if si > 0 and j > 0:
                a = (si - 1) * n_lat + (j - 1)
                b = si * n_lat + (j - 1)
                faces.append((a, b, b + 1, a + 1))
    me = mesh_from_pydata("lawn_corridor", verts, faces)
    _ground_uv(me, 0.4)
    ob = new_object("lawn_corridor", me, coll, lib["grass"])
    ob.location.z = 0.004
    vg = ob.vertex_groups.new(name="grass")
    for i, w in enumerate(weights):
        if w > 0:
            vg.add([i], w, "REPLACE")
    return ob


def grass_hair(ob, lib, count=300000, quick=False):
    """Dry late-summer lawn as Cycles hair strands, weighted by the corridor's density group
    (~3M rendered strands in the full build; the scan texture carries the far field)."""
    mod = ob.modifiers.new("grass", "PARTICLE_SYSTEM")
    ps = mod.particle_system
    st = ps.settings
    st.type = "HAIR"
    st.count = 120000 if quick else count
    st.hair_length = 0.075
    st.use_advanced_hair = True
    st.hair_step = 3
    st.render_step = 2
    st.child_type = "INTERPOLATED"
    st.child_percent = 8
    st.rendered_child_count = 8 if quick else 10
    st.child_length = 1.0
    st.child_length_threshold = 0.0
    st.roughness_1 = 0.03
    st.roughness_1_size = 0.6
    st.roughness_endpoint = 0.02
    st.clump_factor = 0.15
    st.child_radius = 0.045
    st.use_emit_random = True
    st.phase_factor = 0.0
    st.tangent_factor = 0.0
    st.size_random = 0.45
    st.brownian_factor = 0.0
    st.use_hair_bspline = True
    st.display_step = 2
    st.display_percentage = 5
    # NOTE: hair_length is stored as normal_factor * 4, so the velocity factors must be set
    # relative to it (a normal_factor of 1.0 would make 4 m blades) and hair_length goes last.
    st.factor_random = 0.006
    st.hair_length = 0.075
    try:
        st.root_radius = 1.0
        st.tip_radius = 0.0
        st.radius_scale = 0.005
        st.shape = 0.0
    except Exception:
        pass
    ps.vertex_group_density = "grass"
    ps.vertex_group_length = "grass"
    grass_mat = mats.simple("sq_grass_hair", "#8f9250", rough=0.7)
    # blade color varies root->tip and strand to strand
    nt = grass_mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    hi = nt.nodes.new("ShaderNodeHairInfo")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.11, 0.13, 0.05, 1)
    ramp.color_ramp.elements[1].color = (0.42, 0.44, 0.18, 1)
    nt.links.new(hi.outputs["Intercept"], ramp.inputs["Fac"])
    rnd = nt.nodes.new("ShaderNodeValToRGB")
    rnd.color_ramp.elements[0].color = (0.75, 0.8, 0.55, 1)
    rnd.color_ramp.elements[1].color = (1.2, 1.05, 0.7, 1)
    nt.links.new(hi.outputs["Random"], rnd.inputs["Fac"])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs[0].default_value = 1.0
    nt.links.new(ramp.outputs["Color"], mix.inputs[6])
    nt.links.new(rnd.outputs["Color"], mix.inputs[7])
    nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    if not ob.data.materials:
        ob.data.materials.append(bpy.data.materials["sq_grass"])
    ob.data.materials.append(grass_mat)
    st.material_slot = grass_mat.name
    return ps


def road(coll, lib):
    objs = []
    r = ribbon("road_main", coll, lib["asphalt"], STREET.pts, STREET_W + 0.9, 0.02, 1 / 3.0)
    objs.append(r)
    for i in INTERSECTIONS:
        objs.append(ribbon("road_" + i["id"], coll, lib["asphalt"], i["path"].pts, STREET_W + 0.6, 0.017, 1 / 3.0))
    # cul-de-sac bulb
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=48, radius=10.6)
    me = bpy.data.meshes.new("bulb")
    bm.to_mesh(me)
    bm.free()
    _ground_uv(me, 1 / 3.0)
    bulb = new_object("road_bulb", me, coll, lib["asphalt"])
    bulb.location = B(0, 452, 0.022)
    objs.append(bulb)
    # give the pavement thickness so potholes can be cut out of it
    for o in objs:
        m = o.modifiers.new("solid", "SOLIDIFY")
        m.thickness = 0.16
        m.offset = -1
        apply_modifiers(o)
    return objs


def potholes(road_objs, coll, lib):
    """Bumpy spheroid cutters carve real holes; a gravel bowl sits inside each."""
    r = rng(8181)
    main = road_objs[0]
    for sf, lane, cell, scale in DEFECTS["streetPotholes"]:
        p = STREET.frameF(sf)
        nx, nz = left_of(p["tx"], p["tz"])
        x = p["x"] + nx * lane
        z = p["z"] + nz * lane
        rad = 0.55 * scale
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=18, v_segments=10, radius=rad)
        for v in bm.verts:
            k = 0.8 + r() * 0.45
            v.co.x *= k
            v.co.y *= 0.7 + r() * 0.5
            v.co.z *= 0.32
        me = bpy.data.meshes.new("pothole_cut")
        bm.to_mesh(me)
        bm.free()
        cut = new_object("pothole_cut", me, coll)
        cut.location = B(x, z, 0.02 + 0.02)
        # gravel bowl slightly larger than the hole, sunk below the surface
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=18, v_segments=10, radius=rad * 1.15)
        for v in bm.verts:
            v.co.z *= 0.3
        me2 = bpy.data.meshes.new("pothole_bowl")
        bm.to_mesh(me2)
        bm.free()
        bowl = new_object("pothole_bowl", me2, coll, lib["gravel"])
        # a gravel floor whose crown sits 5 cm below the pavement; the hole walls hide its sides
        bowl.location = B(x, z, -0.05 - 0.3 * rad * 1.15)
        for pobj in bowl.data.polygons:
            pobj.use_smooth = True
        boolean_cut(main, cut)


def curbs(coll, lib):
    edge = STREET_W / 2 + CURB_W / 2 + 0.18
    prof = [(-0.42, -0.005), (-CURB_W / 2, 0.0), (-CURB_W / 2 + 0.005, CURB_H * 0.45), (-CURB_W / 2 + 0.05, CURB_H), (CURB_W / 2, CURB_H), (CURB_W / 2, -0.02)]
    objs = []
    for run in clear_runs(STREET.offset(edge), 6.4, True):
        objs.append(sweep("curb_l", coll, lib["concrete_plain"], run, prof, 0.0, 0.5))
    for run in clear_runs(STREET.offset(-edge), 6.4, True):
        objs.append(sweep("curb_r", coll, lib["concrete_plain"], run, prof, 0.0, 0.5, mirror=True))
    for i in INTERSECTIONS:
        for run in clear_runs(i["path"].offset(edge), 6.4, False):
            objs.append(sweep("curb_x", coll, lib["concrete_plain"], run, prof, 0.0, 0.5))
        for run in clear_runs(i["path"].offset(-edge), 6.4, False):
            objs.append(sweep("curb_x", coll, lib["concrete_plain"], run, prof, 0.0, 0.5, mirror=True))
    # cul-de-sac ring curb
    gap = math.asin(4.4 / 10.8)
    pts = []
    n = 60
    a0 = math.pi / 2 + gap
    span = math.pi * 2 - gap * 2
    for k in range(n + 1):
        ang = a0 + span * k / n
        pts.append((0 + math.cos(ang) * 10.85, 452 + math.sin(ang) * 10.85))
    # tangent direction along the ring is CCW in (x,z) -> left of travel points inward? use mirror to place curb outward
    objs.append(sweep("curb_bulb", coll, lib["concrete_plain"], pts, prof, 0.0, 0.5, mirror=True))
    for o in objs:
        for p in o.data.polygons:
            p.use_smooth = False
    return objs


def _quad(verts, faces, uvs, cx, cz, w, l, yaw, y):
    """Flat quad w (across) by l (along yaw direction) in plan, added to buffers."""
    c = math.cos(yaw)
    s = math.sin(yaw)
    base = len(verts)
    for dx, dz in ((-w / 2, -l / 2), (w / 2, -l / 2), (w / 2, l / 2), (-w / 2, l / 2)):
        # local +z (along) = (sin yaw, cos yaw) in plan, local +x = (cos yaw, -sin yaw)
        x = cx + dx * c + dz * s
        z = cz - dx * s + dz * c
        verts.append(B(x, z, y))
        uvs.append(((dx / w) + 0.5, (dz / l) + 0.5))
    faces.append((base, base + 1, base + 2, base + 3))


def paint(coll, lib):
    yv, yf, yu = [], [], []
    wv, wf, wu = [], [], []
    # center dashes (suburban) + downtown double yellow & white edge lines
    s = 6.0
    while s < STREET.length - 6:
        p = STREET.frame(s)
        if not any(abs(i["mainS"] - s) < 8 for i in INTERSECTIONS) and not is_downtown(p["x"], p["z"]):
            _quad(yv, yf, yu, p["x"], p["z"], 0.12, 3.0, math.atan2(p["tx"], p["tz"]), 0.026)
        s += 9.5
    dt = [p for p in STREET.pts if is_downtown(p[0], p[1]) and p[1] > -52]
    if len(dt) > 2:
        for off in (-0.16, 0.16):
            pts = [(p[0] + left_of(p[2], p[3])[0] * off, p[1] + left_of(p[2], p[3])[1] * off, p[2], p[3]) for p in dt]
            for run in clear_runs(pts, 7.5, True):
                ribbon("paint_dy", coll, lib["paint_yellow"], run, 0.1, 0.026, 1)
        for off in (-(STREET_W / 2 - 0.28), STREET_W / 2 - 0.28):
            pts = [(p[0] + left_of(p[2], p[3])[0] * off, p[1] + left_of(p[2], p[3])[1] * off, p[2], p[3]) for p in dt]
            for run in clear_runs(pts, 7.5, True):
                ribbon("paint_edge", coll, lib["paint_white"], run, 0.11, 0.026, 1)
    # stop bars + crosswalks
    for i in INTERSECTIONS:
        pa = STREET.frame(i["mainS"])
        yaw_main = math.atan2(pa["tx"], pa["tz"])
        n = left_of(pa["tx"], pa["tz"])
        t = (pa["tx"], pa["tz"])
        _quad(wv, wf, wu, pa["x"] + t[0] * -6.6 + n[0] * -(LANE_W / 2), pa["z"] + t[1] * -6.6 + n[1] * -(LANE_W / 2), LANE_W - 0.5, 0.5, yaw_main, 0.027)
        _quad(wv, wf, wu, pa["x"] + t[0] * 6.6 + n[0] * (LANE_W / 2), pa["z"] + t[1] * 6.6 + n[1] * (LANE_W / 2), LANE_W - 0.5, 0.5, yaw_main, 0.027)
        pc = i["path"].frame(i["path"].length / 2)
        yaw_x = math.atan2(pc["tx"], pc["tz"])
        nc = left_of(pc["tx"], pc["tz"])
        ax, az = i["at"]["x"], i["at"]["z"]
        _quad(wv, wf, wu, ax - pc["tx"] * 6.6 - nc[0] * (LANE_W / 2), az - pc["tz"] * 6.6 - nc[1] * (LANE_W / 2), LANE_W - 0.5, 0.5, yaw_x, 0.027)
        _quad(wv, wf, wu, ax + pc["tx"] * 6.6 + nc[0] * (LANE_W / 2), az + pc["tz"] * 6.6 + nc[1] * (LANE_W / 2), LANE_W - 0.5, 0.5, yaw_x, 0.027)
        if i["signal"]:
            for along_main in (True, False):
                for sgn in (-1, 1):
                    lat = -3.4
                    while lat <= 3.4:
                        if along_main:
                            _quad(wv, wf, wu, pa["x"] + t[0] * sgn * 5.1 + n[0] * lat, pa["z"] + t[1] * sgn * 5.1 + n[1] * lat, 0.42, 2.6, yaw_main, 0.028)
                        else:
                            _quad(wv, wf, wu, ax + pc["tx"] * sgn * 5.1 + nc[0] * lat, az + pc["tz"] * sgn * 5.1 + nc[1] * lat, 0.42, 2.6, yaw_x, 0.028)
                        lat += 0.78
    if yv:
        new_object("paint_yellow", mesh_from_pydata("paint_yellow", yv, yf, yu), coll, lib["paint_yellow"])
    if wv:
        new_object("paint_white", mesh_from_pydata("paint_white", wv, wf, wu), coll, lib["paint_white"])


# ---------- the sidewalk ----------


def _slab_mesh(name, w=SLAB_W, l=SLAB_L - 0.06, t=SLAB_T, bevel=0.012):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= w
        v.co.y *= l
        v.co.z = (v.co.z + 0.5) * t
    bm.faces.ensure_lookup_table()
    bm.normal_update()
    # box UVs in meters (the material tiles at 1.8 m)
    uv_layer = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        for lp in f.loops:
            co = lp.vert.co
            if abs(n.z) > 0.5:
                lp[uv_layer].uv = (co.x, co.y)
            elif abs(n.x) > 0.5:
                lp[uv_layer].uv = (co.y, co.z)
            else:
                lp[uv_layer].uv = (co.x, co.z)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, profile=0.7, affect="EDGES")
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


def _crack_polyline(r, l, w, span=0.75, steps=None):
    """Jagged random walk across a slab in local (x across, y along) coordinates."""
    steps = steps or (14 + int(r() * 8))
    pts = []
    x = -w / 2 * span * (0.85 + r() * 0.3)
    y = (r() - 0.5) * l * 0.35
    a = (r() - 0.5) * 0.5
    total = w * span * (0.9 + r() * 0.35)
    pts.append((x, y))
    for i in range(steps):
        if r() < 0.16:
            a += (1 if r() < 0.5 else -1) * (0.5 + r() * 0.7)
        else:
            a += (r() - 0.5) * 0.6
        a = max(-1.1, min(1.1, a))
        seg = (total / steps) * (0.7 + r() * 0.7)
        x += math.cos(a) * seg
        y += math.sin(a) * seg
        y = max(-l * 0.44, min(l * 0.44, y))
        pts.append((x, y))
    return pts


def _groove_mesh(name, pts, width, depth, z_top, extra=0.04):
    """A V-groove prism along a 2D polyline (local slab coords), tall enough to cut through the top."""
    verts = []
    faces = []
    n = len(pts)
    for i, (x, y) in enumerate(pts):
        if i == 0:
            dx, dy = pts[1][0] - x, pts[1][1] - y
        elif i == n - 1:
            dx, dy = x - pts[i - 1][0], y - pts[i - 1][1]
        else:
            dx, dy = pts[i + 1][0] - pts[i - 1][0], pts[i + 1][1] - pts[i - 1][1]
        l = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / l, dx / l
        hw = width / 2
        verts.append(Vector((x + nx * hw, y + ny * hw, z_top + extra)))
        verts.append(Vector((x - nx * hw, y - ny * hw, z_top + extra)))
        verts.append(Vector((x, y, z_top - depth)))
    for i in range(n - 1):
        a = i * 3
        b = a + 3
        faces.append((a, a + 1, b + 1, b))
        faces.append((a + 1, a + 2, b + 2, b + 1))
        faces.append((a + 2, a, b, b + 2))
    faces.append((0, 2, 1))
    last = (n - 1) * 3
    faces.append((last, last + 1, last + 2))
    return mesh_from_pydata(name, verts, faces)


def _cut_grooves(slab, mw, coll, r, count=1, width=(0.012, 0.03), depth=0.03, span=0.75, l=SLAB_L - 0.06, w=SLAB_W, yaw_local=0.0):
    """Carve `count` cracks into a slab object (which has its own mesh). `mw` = the slab's world matrix."""
    for k in range(count):
        pts = _crack_polyline(r, l, w, span)
        if yaw_local:
            c, s = math.cos(yaw_local), math.sin(yaw_local)
            pts = [(x * c - y * s, x * s + y * c) for x, y in pts]
        wd = width[0] + r() * (width[1] - width[0])
        me = _groove_mesh("groove", pts, wd, depth, SLAB_T)
        cut = new_object("groove_cut", me, coll)
        cut.matrix_world = mw.copy()
        boolean_cut(slab, cut)
        # chip the groove lips slightly: a second, shallower, wider pass on the same line
        me2 = _groove_mesh("groove2", pts, wd * 2.2, depth * 0.25, SLAB_T)
        cut2 = new_object("groove_cut2", me2, coll)
        cut2.matrix_world = mw.copy()
        boolean_cut(slab, cut2)


def _split_slab(slab, mw, coll, r, lift, tilt_deg, lib):
    """Break a slab in two along a jagged line; lift and tilt the far half (the hero panel)."""
    pts = _crack_polyline(r, SLAB_L - 0.06, SLAB_W, span=1.3, steps=16)
    # wall cutter across the full slab
    verts = []
    faces = []
    n = len(pts)
    for i, (x, y) in enumerate(pts):
        verts.append(Vector((x, y, -0.05)))
        verts.append(Vector((x, y, SLAB_T + 0.05)))
    for i in range(n - 1):
        a = i * 2
        faces.append((a, a + 2, a + 3, a + 1))
    wall = mesh_from_pydata("split_wall", verts, faces)
    wall_ob = new_object("split_wall", wall, coll)
    wall_ob.matrix_world = mw.copy()
    m = wall_ob.modifiers.new("solid", "SOLIDIFY")
    m.thickness = 0.018
    m.offset = 0
    apply_modifiers(wall_ob)
    boolean_cut(slab, wall_ob)
    # separate the two halves
    select_only(slab)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")
    parts = [o for o in bpy.context.selected_objects if o.type == "MESH"]
    if len(parts) >= 2:
        inv = mw.inverted()

        # the half further along the walk (local +y) gets lifted
        def local_y(o):
            return sum((inv @ (mw @ v.co)).y for v in o.data.vertices) / max(1, len(o.data.vertices))

        parts.sort(key=local_y)
        far = parts[-1]
        far.name = slab.name + "_lifted"
        far.location = far.location + Vector((0, 0, lift))
        far.rotation_mode = "YXZ"
        e = far.rotation_euler
        far.rotation_euler = (e[0] + math.radians(tilt_deg), e[1] + math.radians(tilt_deg * 0.35), e[2])
        for o in parts:
            o.color = slab.color
    return parts


def sidewalk(coll, lib, quick=False):
    r = rng(555)
    L = WALK.length
    count = int(math.floor(L / SLAB_L))
    crack_by = {}
    for c in DEFECTS["cracks"]:
        crack_by[int(round(c["f"] * L / SLAB_L))] = c
    hole_by = {}
    for h in DEFECTS["walkPotholes"]:
        hole_by[int(round(h["f"] * L / SLAB_L))] = h
    missing = set(int(round(f * L / SLAB_L)) for f in DEFECTS["missingSlabs"])
    heaves = list(DEFECTS["mildHeaves"]) + [DEFECTS["rootHeave"]]
    fresh_lo, fresh_hi = DEFECTS["freshRange"]

    def heave_at(f):
        for h in heaves:
            half = ((h["slabs"] * 1.8) / L) * 0.62
            if abs(f - h["f"]) < half:
                return h
        return None

    base_me = _slab_mesh("slab_base")
    cr = rng(9797)
    hero_slab = int(round(BEATS["broken"] * L / SLAB_L))
    root_slab = int(round(BEATS["falls"] * L / SLAB_L))
    dirt_objs = []
    for i in range(count):
        s = i * SLAB_L + SLAB_L / 2
        f = s / L
        if in_any_gap(f - SLAB_L / L / 2, f + SLAB_L / L / 2):
            continue
        p = WALK.frame(s)
        yaw = math.atan2(p["tx"], p["tz"])
        if i in missing:
            d = box("dirt_patch_%d" % i, coll, lib["dirt"], SLAB_W + 0.3, SLAB_L + 0.2, 0.03, B(p["x"], p["z"], 0.0), yaw, uv_scale=0.6)
            dirt_objs.append(d)
            for k in range(3):
                rb = box("rubble_%d_%d" % (i, k), coll, lib["concrete_plain"], 0.28 + r() * 0.3, 0.2 + r() * 0.25, 0.09,
                         B(p["x"] + (r() - 0.5) * 1.4, p["z"] + (r() - 0.5) * 1.4, 0.03), r() * 3, 0.0, (r() - 0.5) * 0.4, uv_scale=1.0)
                rb.color = (0.75, 0.72, 0.66, 1)
            continue
        heave = heave_at(f)
        fresh = fresh_lo < f < fresh_hi
        roll = r()
        if fresh:
            tint = 1.45
        elif roll < 0.42:
            tint = 1.22 + r() * 0.12
        elif roll < 0.72:
            tint = 1.1 + r() * 0.12
        elif roll < 0.9:
            tint = 0.98 + r() * 0.12
        else:
            tint = 0.88 + r() * 0.1
        lip = 0.0 if fresh else (heave["lift"] if heave else (0.0 if r() < 0.38 else (r() - 0.5) * 0.1))
        rx = math.radians(heave["tiltX"] if heave else (r() - 0.5) * 1.1)
        rz = math.radians(heave["tiltZ"] if heave else (r() - 0.5) * 0.8)
        y = 0.012 + lip
        needs_own = (i in crack_by and not fresh) or (i in hole_by and not fresh) or (heave and heave["lift"] > 0.1) or i == hero_slab
        me = _slab_mesh("slab_%d" % i) if needs_own else base_me
        ob = new_object("slab_%d" % i, me, coll, lib["concrete_fresh"] if fresh else lib["concrete"])
        ob.rotation_mode = "YXZ"
        mw = Matrix.Translation(B(p["x"], p["z"], y)) @ yaw_euler(yaw, rx, rz).to_matrix().to_4x4()
        ob.matrix_world = mw
        ob.color = (tint, tint * 0.995, tint * 0.975, 1.0)
        if quick and needs_own and i not in (hero_slab, root_slab, root_slab + 1):
            continue
        if i == hero_slab:
            # the panel the camera lands on: a real break, one side lifted, soil pushed up under it
            _cut_grooves(ob, mw, coll, cr, count=2, width=(0.006, 0.014), depth=0.02, span=0.55, yaw_local=1.2)
            _split_slab(ob, mw, coll, cr, lift=0.055, tilt_deg=3.2, lib=lib)
            hm = sphere("hero_mound", coll, lib["dirt"], 1.0, B(p["x"] + p["tx"] * 0.45, p["z"] + p["tz"] * 0.45, -0.21), segs=24)
            hm.scale = (0.95, 1.0, 0.29)
            hm.rotation_euler = (0, 0, yaw)
            continue
        if i in crack_by and not fresh:
            c = crack_by[i]
            _cut_grooves(ob, mw, coll, cr, count=1, width=(0.01, 0.028), depth=0.03, span=0.7 * c["scale"], yaw_local=c["yaw"])
        if heave and heave["lift"] > 0.1:
            _cut_grooves(ob, mw, coll, cr, count=2, width=(0.006, 0.02), depth=0.025, span=0.6, yaw_local=1.2 + r())
        if i in hole_by and not fresh:
            h = hole_by[i]
            rad = 0.22 * h["scale"] + 0.12
            bm = bmesh.new()
            bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=rad)
            for v in bm.verts:
                v.co.x *= 0.8 + r() * 0.5
                v.co.y *= 0.8 + r() * 0.5
                v.co.z *= 0.35
            hm = bpy.data.meshes.new("spall")
            bm.to_mesh(hm)
            bm.free()
            cut = new_object("spall_cut", hm, coll)
            cut.matrix_world = mw @ Matrix.Translation(Vector((h["d"], 0.0, SLAB_T + 0.01)))
            boolean_cut(ob, cut)
    # never-built stretches: a worn dirt desire line through the grass
    for g1, g2 in GAPS:
        pts = []
        s = g1 * L - 1
        k = 0
        while s <= g2 * L + 1:
            p = WALK.frame(s)
            nx, nz = left_of(p["tx"], p["tz"])
            lat = 0.5 * math.sin(k * 0.5) + 0.24 * math.sin(k * 1.35)
            pts.append((p["x"] + nx * lat, p["z"] + nz * lat))
            s += 0.6
            k += 1
        ribbon("desire_line", coll, lib["dirt"], pts, 1.1, 0.008, 1 / 3.0)
    return dirt_objs


def driveways_walkways(coll, lib):
    r = rng(4141)
    for lot in LOTS:
        d = lot.get("drive")
        if d:
            a, b = d["a"], d["b"]
            ln = math.hypot(b["x"] - a["x"], b["z"] - a["z"])
            ob = box("drive_" + lot["id"], coll, lib["concrete_plain"], 3.3, ln + 1.0, 0.05,
                     B((a["x"] + b["x"]) / 2, (a["z"] + b["z"]) / 2, 0.0), math.atan2(b["x"] - a["x"], b["z"] - a["z"]), uv_scale=1.0)
            ob.color = (1.1 + r() * 0.15,) * 3 + (1,)
            # expansion joints every ~3 m
            k = 1.5
            while k < ln - 1:
                jx = a["x"] + (b["x"] - a["x"]) * (k / ln)
                jz = a["z"] + (b["z"] - a["z"]) * (k / ln)
                box("drive_joint", coll, lib["trim_dark"], 3.3, 0.012, 0.004, B(jx, jz, 0.05), math.atan2(b["x"] - a["x"], b["z"] - a["z"]))
                k += 3.0
        wk = lot.get("walkway")
        if wk:
            a, b = wk["a"], wk["b"]
            ln = math.hypot(b["x"] - a["x"], b["z"] - a["z"])
            ob = box("walkway_" + lot["id"], coll, lib["concrete_plain"], 1.0, ln, 0.045,
                     B((a["x"] + b["x"]) / 2, (a["z"] + b["z"]) / 2, 0.0), math.atan2(b["x"] - a["x"], b["z"] - a["z"]), uv_scale=1.0)
            ob.color = (1.18, 1.16, 1.12, 1)


def downtown_paving(coll, lib):
    box("downtown_paving", coll, lib["concrete_plain"], 78, 182, 0.05, B(152, 12, -0.005), 0.0, uv_scale=1.0)


def build(lib, quick=False):
    coll = collection("Ground")
    terrain(coll, lib)
    corridor = lawn_corridor(coll, lib)
    grass_hair(corridor, lib, quick=quick)
    roads = road(coll, lib)
    potholes(roads, coll, lib)
    curbs(coll, lib)
    paint(coll, lib)
    sidewalk(coll, lib, quick=quick)
    driveways_walkways(coll, lib)
    downtown_paving(coll, lib)
    return coll
