"""Shared helpers for the SideQuest street build: world data, coordinate
conversion (three.js x-east/z-south/y-up -> Blender x-east/y-north/z-up),
the sampled-path class the site uses, a mulberry32 port so seeds match,
and small mesh/object utilities."""
import json
import math
import os

import bmesh
import bpy
from mathutils import Euler, Vector

RENDER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORLD = json.load(open(os.path.join(RENDER_DIR, "world.json"), encoding="utf-8"))
ASSETS = os.path.join(RENDER_DIR, "assets")
DIMS = WORLD["dims"]
BEATS = WORLD["beats"]
GAPS = WORLD["gaps"]
DOWNTOWN_Z = WORLD["downtownZ"]

# ---------- coordinates ----------


def B(x, z, y=0.0):
    """three (x, y, z) -> Blender Vector (x, -z, y)."""
    return Vector((x, -z, y))


def yaw_euler(yaw, rx=0.0, rz=0.0):
    """three YXZ euler (rx pitch, yaw about up, rz roll) -> Blender euler (mode YXZ)."""
    return Euler((rx, -rz, yaw), "YXZ")


def left_of(tx, tz):
    return (tz, -tx)


# ---------- paths ----------


class Path:
    def __init__(self, d):
        self.length = d["length"]
        self.pts = d["pts"]  # [x, z, tx, tz, s]

    def frame(self, s):
        f = min(max(s, 0.0), self.length) / self.length
        fi = f * (len(self.pts) - 1)
        i = min(len(self.pts) - 2, int(math.floor(fi)))
        t = fi - i
        a = self.pts[i]
        b = self.pts[i + 1]
        tx = a[2] + (b[2] - a[2]) * t
        tz = a[3] + (b[3] - a[3]) * t
        l = math.hypot(tx, tz) or 1.0
        return {"x": a[0] + (b[0] - a[0]) * t, "z": a[1] + (b[1] - a[1]) * t, "tx": tx / l, "tz": tz / l, "s": s}

    def frameF(self, f):
        return self.frame(f * self.length)

    def offset(self, d):
        out = []
        for p in self.pts:
            nx, nz = left_of(p[2], p[3])
            out.append((p[0] + nx * d, p[1] + nz * d, p[2], p[3]))
        return out

    def _tree(self):
        kd = getattr(self, "_kd", None)
        if kd is None:
            from mathutils import kdtree

            kd = kdtree.KDTree(len(self.pts))
            for i, p in enumerate(self.pts):
                kd.insert((p[0], p[1], 0.0), i)
            kd.balance()
            self._kd = kd
        return kd

    def nearest(self, x, z):
        co, idx, d = self._tree().find((x, z, 0.0))
        return idx, d

    def closestS(self, x, z):
        idx, _ = self.nearest(x, z)
        return self.pts[idx][4]

    def dist(self, x, z):
        return self.nearest(x, z)[1]


STREET = Path(WORLD["street"])
WALK = Path(WORLD["walk"])
LANES = {"fwd": Path(WORLD["lanes"]["fwd"]), "rev": Path(WORLD["lanes"]["rev"])}
INTERSECTIONS = []
for _i in WORLD["intersections"]:
    INTERSECTIONS.append({**_i, "path": Path(_i["path"]), "lanes": {"fwd": Path(_i["lanes"]["fwd"]), "rev": Path(_i["lanes"]["rev"])}})
LOTS = WORLD["lots"]
DEFECTS = WORLD["defects"]


# the CapMetro stop in the first never-built gap: walk fraction and lateral offset (into the planting strip)
BUS_STOP_F = 0.185
BUS_STOP_LAT = -1.3


def bus_stop_xz():
    p = WALK.frameF(BUS_STOP_F)
    nx, nz = left_of(p["tx"], p["tz"])
    return p["x"] + nx * BUS_STOP_LAT, p["z"] + nz * BUS_STOP_LAT


def load_font(bold=True):
    """A system TTF for decals/signs (falls back to Blender's built-in font when None)."""
    cands = [r"C:\Windows\Fonts\arialbd.ttf", r"C:\Windows\Fonts\verdanab.ttf"] if bold else [r"C:\Windows\Fonts\arial.ttf"]
    for c in cands:
        if os.path.exists(c):
            try:
                return bpy.data.fonts.load(c, check_existing=True)
            except Exception:
                pass
    return None


def in_any_gap(f1, f2):
    return any(f2 > g1 - 0.004 and f1 < g2 + 0.004 for g1, g2 in GAPS)


def near_intersection(x, z, r):
    return any(math.hypot(i["at"]["x"] - x, i["at"]["z"] - z) < r for i in INTERSECTIONS)


def is_downtown(x, z):
    return x > 122 and z < DOWNTOWN_Z + 2


# ---------- seeded random (mulberry32, same as the site) ----------


def rng(seed):
    state = [int(seed) & 0xFFFFFFFF]

    def r():
        state[0] = (state[0] + 0x6D2B79F5) & 0xFFFFFFFF
        s = state[0]
        t = ((s ^ (s >> 15)) * (1 | s)) & 0xFFFFFFFF
        t = ((t + ((t ^ (t >> 7)) * (61 | t))) ^ t) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

    return r


def pick(r, arr):
    return arr[int(r() * len(arr)) % len(arr)]


def clamp(v, lo, hi):
    return min(hi, max(lo, v))


def smoothstep(t):
    return t * t * (3 - 2 * t)


def hexcol(h, a=1.0):
    h = h.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))

    def lin(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return (lin(r), lin(g), lin(b), a)


# ---------- scene utilities ----------


def collection(name, parent=None):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(c)
    return c


def mesh_from_pydata(name, verts, faces, uvs=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    if uvs is not None:
        uv = me.uv_layers.new(name="UVMap")
        if len(uvs) == len(verts):
            for poly in me.polygons:
                for li in poly.loop_indices:
                    vi = me.loops[li].vertex_index
                    uv.data[li].uv = uvs[vi]
        else:
            k = 0
            for poly in me.polygons:
                for li in poly.loop_indices:
                    uv.data[li].uv = uvs[k]
                    k += 1
    return me


def new_object(name, me, coll, mat=None, smooth=False):
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    if mat is not None:
        if me.materials:
            me.materials[0] = mat
        else:
            me.materials.append(mat)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    return ob


def box_uvs(bm, uv_scale=1.0):
    uv_layer = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        for l in f.loops:
            co = l.vert.co
            if abs(n.z) > 0.5:
                l[uv_layer].uv = (co.x * uv_scale, co.y * uv_scale)
            elif abs(n.x) > 0.5:
                l[uv_layer].uv = (co.y * uv_scale, co.z * uv_scale)
            else:
                l[uv_layer].uv = (co.x * uv_scale, co.z * uv_scale)


def box_mesh(name, sx, sy, sz, uv_scale=1.0, center_z=False):
    """Axis-aligned box mesh, origin at the bottom center (z from 0..sz) unless center_z."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    z0 = -0.5 if center_z else 0.0
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z = (v.co.z + 0.5 + z0) * sz
    bm.faces.ensure_lookup_table()
    bm.normal_update()
    box_uvs(bm, uv_scale)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


def box(name, coll, mat, sx, sy, sz, at=(0, 0, 0), yaw=0.0, rx=0.0, rz=0.0, uv_scale=1.0, center_z=False, bevel=0.0):
    """Box in Blender coords: sx along X, sy along Y, sz up. `at` is a Blender position."""
    me = box_mesh(name, sx, sy, sz, uv_scale, center_z)
    ob = new_object(name, me, coll, mat)
    ob.location = Vector(at)
    ob.rotation_mode = "YXZ"
    ob.rotation_euler = yaw_euler(yaw, rx, rz)
    if bevel > 0:
        m = ob.modifiers.new("bevel", "BEVEL")
        m.width = bevel
        m.segments = 2
        m.limit_method = "ANGLE"
    return ob


def cylinder(name, coll, mat, r_top, r_bot, h, at=(0, 0, 0), segs=16, yaw=0.0, rx=0.0, rz=0.0, uv_scale=1.0, smooth=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r_bot, radius2=r_top, depth=h)
    for v in bm.verts:
        v.co.z += h / 2
    bm.faces.ensure_lookup_table()
    bm.normal_update()
    uv_layer = bm.loops.layers.uv.verify()
    circ = 2 * math.pi * max(r_top, r_bot)
    for f in bm.faces:
        for l in f.loops:
            co = l.vert.co
            ang = math.atan2(co.y, co.x)
            l[uv_layer].uv = ((ang / (2 * math.pi)) * circ * uv_scale, co.z * uv_scale)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = new_object(name, me, coll, mat, smooth=smooth)
    ob.location = Vector(at)
    ob.rotation_mode = "YXZ"
    ob.rotation_euler = yaw_euler(yaw, rx, rz)
    return ob


def sphere(name, coll, mat, r, at=(0, 0, 0), segs=16):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=max(6, segs // 2), radius=r)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = new_object(name, me, coll, mat, smooth=True)
    ob.location = Vector(at)
    return ob


def _tangent(pts, i):
    p = pts[i]
    if len(p) >= 4:
        return p[2], p[3]
    a = pts[max(0, i - 1)]
    b = pts[min(len(pts) - 1, i + 1)]
    l = math.hypot(b[0] - a[0], b[1] - a[1]) or 1.0
    return (b[0] - a[0]) / l, (b[1] - a[1]) / l


def ribbon(name, coll, mat, pts, width, y=0.0, uv_per_m=0.125):
    """Ground strip along a plan polyline (pts of (x,z) or [x,z,tx,tz,..])."""
    n = len(pts)
    verts = []
    uvs = []
    faces = []
    run = 0.0
    for i in range(n):
        p = pts[i]
        x, z = p[0], p[1]
        tx, tz = _tangent(pts, i)
        if i > 0:
            run += math.hypot(x - pts[i - 1][0], z - pts[i - 1][1])
        nx, nz = left_of(tx, tz)
        h = width / 2
        verts.append(B(x + nx * h, z + nz * h, y))
        uvs.append((0.0, run * uv_per_m))
        verts.append(B(x - nx * h, z - nz * h, y))
        uvs.append((width * uv_per_m, run * uv_per_m))
        if i > 0:
            a = (i - 1) * 2
            faces.append((a, a + 2, a + 3, a + 1))
    me = mesh_from_pydata(name, verts, faces, uvs)
    return new_object(name, me, coll, mat)


def sweep(name, coll, mat, pts, profile, y=0.0, uv_per_m=0.25, mirror=False):
    """Sweep a 2D profile [(lateral, height), ...] (lateral + = left of travel) along a plan polyline."""
    n = len(pts)
    m = len(profile)
    verts = []
    uvs = []
    faces = []
    run = 0.0
    sgn = -1.0 if mirror else 1.0
    for i in range(n):
        p = pts[i]
        x, z = p[0], p[1]
        tx, tz = _tangent(pts, i)
        if i > 0:
            run += math.hypot(x - pts[i - 1][0], z - pts[i - 1][1])
        nx, nz = left_of(tx, tz)
        for j, (lat, h) in enumerate(profile):
            verts.append(B(x + nx * lat * sgn, z + nz * lat * sgn, y + h))
            uvs.append((j / max(1, m - 1), run * uv_per_m))
        if i > 0:
            for j in range(m - 1):
                a = (i - 1) * m + j
                b = i * m + j
                faces.append((a, b, b + 1, a + 1) if not mirror else (a, a + 1, b + 1, b))
    if m >= 3:
        cap0 = tuple(range(m - 1, -1, -1))
        cap1 = tuple((n - 1) * m + j for j in range(m))
        faces.append(cap0 if not mirror else cap0[::-1])
        faces.append(cap1 if not mirror else cap1[::-1])
    me = mesh_from_pydata(name, verts, faces, uvs)
    ob = new_object(name, me, coll, mat)
    return ob


def clear_runs(pts, clearance, of_main):
    """Split a polyline into runs that stay clear of the intersections (port of ground.tsx)."""
    runs = []
    cur = []
    for p in pts:
        x, z = p[0], p[1]
        if of_main:
            blocked = near_intersection(x, z, clearance)
        else:
            blocked = STREET.dist(x, z) < clearance
        if blocked:
            if len(cur) > 2:
                runs.append(cur)
            cur = []
        else:
            cur.append(p)
    if len(cur) > 2:
        runs.append(cur)
    return runs


def select_only(ob):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


def join(objs, name):
    """Join several objects into one (keeps materials)."""
    objs = [o for o in objs if o is not None]
    if not objs:
        return None
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


def apply_modifiers(ob):
    select_only(ob)
    for m in list(ob.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=m.name)
        except RuntimeError as e:
            print("modifier apply failed", ob.name, m.name, e)


def boolean_cut(target, cutter, op="DIFFERENCE", solver="EXACT", delete_cutter=True):
    m = target.modifiers.new("bool", "BOOLEAN")
    m.operation = op
    m.object = cutter
    try:
        m.solver = solver
    except Exception:
        pass
    apply_modifiers(target)
    if delete_cutter:
        me = cutter.data
        bpy.data.objects.remove(cutter, do_unlink=True)
        if me and me.users == 0:
            bpy.data.meshes.remove(me)
    return target


def shade_smooth(ob, angle_deg=35.0):
    select_only(ob)
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle_deg))
    except Exception:
        try:
            bpy.ops.object.shade_smooth()
        except Exception:
            pass


def text_object(name, coll, mat, body, size, at, yaw=0.0, rx=0.0, extrude=0.002, align="CENTER", bold=False):
    c = bpy.data.curves.new(name, "FONT")
    c.body = body
    c.size = size
    c.extrude = extrude
    c.align_x = align
    c.align_y = "CENTER"
    try:
        if bold:
            c.font = bpy.data.fonts.get("Bfont Bold") or c.font
    except Exception:
        pass
    ob = bpy.data.objects.new(name, c)
    coll.objects.link(ob)
    if mat is not None:
        c.materials.append(mat)
    ob.location = Vector(at)
    ob.rotation_mode = "YXZ"
    ob.rotation_euler = yaw_euler(yaw, rx, 0.0)
    return ob
