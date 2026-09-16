"""The seeded house generator, rebuilt for a path tracer: real eave overhangs
with fascia, framed windows with dark reflective glass, doors with jambs,
porches, garages with paneled doors, chimneys, AC pads — scanned brick,
siding, stucco and shingle materials tinted per house."""
import math

import bpy
from mathutils import Euler, Matrix, Vector

from common import B, LOTS, box, collection, cylinder, hexcol, mesh_from_pydata, new_object, pick, rng, yaw_euler

WALLS = ["#e2dbc9", "#d6cbb2", "#c4bda8", "#a9af97", "#9aa38e", "#b58a6c", "#cbb894", "#d8cfb6", "#a45140", "#b0a488", "#8f8873"]
# tints multiply the (already dark) scanned roof, so they sit well above the site's hex values
ROOFS = ["#c4bcae", "#d0c6b8", "#cdb09a", "#a9b59e", "#d6a693", "#c6c0b2", "#a8a49a"]
ACCENTS = ["#5d3f35", "#41503c", "#4e4438", "#6a3b33", "#2f4a3c", "#54442f"]


def _lin(h):
    c = hexcol(h)
    return (c[0], c[1], c[2], 1.0)


class House:
    def __init__(self, coll, lib, lot):
        self.coll = coll
        self.lib = lib
        self.lot = lot
        self.r = rng(lot["seed"])
        self.base = Matrix.Translation(B(lot["cx"], lot["cz"], 0.02)) @ yaw_euler(lot["yaw"]).to_matrix().to_4x4()
        self.objs = []

    def at(self, lx, ly, lz, ryaw=0.0, rx=0.0, rz=0.0):
        """Local three coords (x right, y up, z toward the street front) -> world matrix."""
        return self.base @ Matrix.Translation(Vector((lx, -lz, ly))) @ yaw_euler(ryaw, rx, rz).to_matrix().to_4x4()

    def part(self, name, mat, sx, sy, sz, lx, ly, lz, ryaw=0.0, rx=0.0, rz=0.0, uv_scale=1.0, color=None, bevel=0.0):
        """Box of local size sx (right) x sy (up) x sz (toward front), centered at (lx, ly, lz) in local three coords."""
        ob = box(name, self.coll, mat, sx, sz, sy, (0, 0, 0), 0.0, uv_scale=uv_scale, center_z=True, bevel=bevel)
        ob.matrix_world = self.at(lx, ly, lz, ryaw, rx, rz)
        if color:
            ob.color = color
        self.objs.append(ob)
        return ob

    def roof(self, w, d, rise, over, ly, ryaw, mat_roof, mat_wall, wall_color, roof_color, ox=0.0, oz=0.0):
        """Gable roof: two slopes with overhang (ridge along local x after ryaw), gable infill,
        fascia boards. (ox, oz) = local plan offset of the roof center (garages)."""
        hw = w / 2 + over
        hd = d / 2 + over
        drop = -over * (rise / (d / 2))  # slope continues below the wall top at the eave
        e = [Vector((-hw, drop, -hd)), Vector((hw, drop, -hd)), Vector((hw, drop, hd)), Vector((-hw, drop, hd))]
        r0 = Vector((-hw, rise, 0))
        r1 = Vector((hw, rise, 0))
        th = 0.08
        verts = []
        faces = []

        def add_quad(p0, p1, p2, p3):
            base = len(verts)
            verts.extend([p0, p1, p2, p3])
            faces.append((base, base + 1, base + 2, base + 3))

        lift = Vector((0, th, 0))
        for sgn in (1, -1):
            ea = e[3] if sgn > 0 else e[1]
            eb = e[2] if sgn > 0 else e[0]
            ra = r1 if sgn > 0 else r0
            rb = r0 if sgn > 0 else r1
            add_quad(ea, eb, ra, rb)  # underside
            add_quad(eb + lift, ea + lift, rb + lift, ra + lift)  # shingle face
            add_quad(ea, ea + lift, eb + lift, eb)  # eave edge
        # local three coords -> local blender coords: (x, y, z) -> (x, -z, y)
        bl = [Vector((v.x, -v.z, v.y)) for v in verts]
        uvs = [(v.x / 3.0, v.z / 3.0) for v in verts]
        me = mesh_from_pydata("roof", bl, faces, uvs)
        ob = new_object("roof", me, self.coll, mat_roof)
        ob.matrix_world = self.at(ox, ly, oz, ryaw)
        ob.color = roof_color
        self.objs.append(ob)
        # gable infill triangles (wall material) with a small inset
        gv = [Vector((e[0].x, 0, e[0].z + over)), Vector((e[3].x, 0, e[3].z - over)), Vector((r0.x + over, rise, 0)),
              Vector((e[2].x, 0, e[2].z - over)), Vector((e[1].x, 0, e[1].z + over)), Vector((r1.x - over, rise, 0))]
        gl = [Vector((v.x, -v.z, v.y)) for v in gv]
        gm = mesh_from_pydata("gable", gl, [(0, 1, 2), (3, 4, 5)], [(0, 0), (1, 0), (0.5, 1), (0, 0), (1, 0), (0.5, 1)])
        gob = new_object("gable", gm, self.coll, mat_wall)
        gob.matrix_world = self.at(ox, ly, oz, ryaw)
        gob.color = wall_color
        self.objs.append(gob)
        # fascia along both eaves + ridge cap, in the roof's own frame
        c, s = math.cos(ryaw), math.sin(ryaw)
        for sgn in (1, -1):
            # local (0, sgn*hd) in the roof frame -> house frame
            fx = ox + sgn * hd * s
            fz = oz + sgn * hd * c
            self.part("fascia", self.lib["trim"], hw * 2, 0.2, 0.05, fx, ly + drop + 0.1, fz, ryaw)
        self.part("ridge", mat_roof, hw * 2 + 0.02, 0.06, 0.32, ox, ly + rise + 0.03, oz, ryaw, color=roof_color)

    def window(self, lx, ly, lz, w=1.0, h=1.15, ryaw=0.0, shutters=False, accent=None):
        lib = self.lib
        fw = 0.07
        # frame: four boards proud of the wall, glass recessed
        self.part("wf", lib["trim"], w + fw * 2, fw, 0.09, lx, ly + h / 2 + fw / 2, lz, ryaw)
        self.part("wf", lib["trim"], w + fw * 2, fw, 0.09, lx, ly - h / 2 - fw / 2, lz, ryaw)
        self.part("wf", lib["trim"], fw, h, 0.09, lx - w / 2 - fw / 2, ly, lz, ryaw)
        self.part("wf", lib["trim"], fw, h, 0.09, lx + w / 2 + fw / 2, ly, lz, ryaw)
        # muntin cross
        self.part("wm", lib["trim"], 0.035, h, 0.05, lx, ly, lz - 0.01, ryaw)
        self.part("wm", lib["trim"], w, 0.035, 0.05, lx, ly, lz - 0.01, ryaw)
        # glass pane
        self.part("glass", lib["glass"], w, h, 0.01, lx, ly, lz - 0.035, ryaw)
        # sill
        self.part("sill", lib["trim"], w + fw * 2 + 0.06, 0.05, 0.16, lx, ly - h / 2 - fw - 0.02, lz + 0.03, ryaw)
        if shutters:
            self.part("shutter", lib["door"], 0.28, h + 0.1, 0.04, lx - w / 2 - fw - 0.2, ly, lz + 0.01, ryaw, color=accent)
            self.part("shutter", lib["door"], 0.28, h + 0.1, 0.04, lx + w / 2 + fw + 0.2, ly, lz + 0.01, ryaw, color=accent)

    def build(self):
        r = self.r
        lot = self.lot
        lib = self.lib
        two = (not lot["back"]) and r() < 0.34
        gable_end = (not two) and r() < 0.3
        wall_hex = pick(r, WALLS)
        roof_hex = pick(r, ROOFS)
        accent_hex = pick(r, ACCENTS)
        wall_color = _lin(wall_hex)
        roof_color = _lin(roof_hex)
        accent = _lin(accent_hex)
        scale = 0.92 if lot["back"] else 1.0
        w = (8.6 + r() * 1.6 if two else 11 + r() * 2.4) * scale
        d = (8 + r() * 1.4) * scale
        h = (5.9 if two else 3.1) * scale
        rise = (2.2 if two else 2.6) * scale * (0.85 + r() * 0.35)
        if gable_end:
            w, d = d, w
        # wall material by seed: brick / siding / stucco
        kind = r()
        wall_mat = lib["brick"] if kind < 0.4 else (lib["siding"] if kind < 0.7 else lib["stucco"])
        if wall_mat is lib["brick"]:
            wall_color = (1.0, 1.0, 1.0, 1.0) if r() < 0.6 else wall_color
        body = self.part("body", wall_mat, w, h, d, 0, h / 2, 0, uv_scale=1.0, color=wall_color)
        self.part("foundation", lib["foundation"], w + 0.16, 0.32, d + 0.16, 0, 0.16, 0)
        self.roof(d if gable_end else w, w if gable_end else d, rise, 0.55, h, math.pi / 2 if gable_end else 0.0, lib["shingle"], wall_mat, wall_color, roof_color)
        if r() < 0.42:
            cx = w * (-0.22 if r() < 0.5 else 0.22)
            self.part("chimney", lib["brick"], 0.62, rise + 1.1, 0.62, cx, h + rise / 2 + 0.2, (r() - 0.5) * d * 0.2, color=(0.7, 0.55, 0.45, 1))
            self.part("chimney_cap", lib["concrete_plain"], 0.74, 0.08, 0.74, cx, h + rise + 0.72, (r() - 0.5) * d * 0.2)
        front = d / 2
        door_x = w * (-0.16 if r() < 0.5 else 0.16)
        # door with jamb and a small step
        self.part("jamb", lib["trim"], 1.25, 2.3, 0.1, door_x, 1.15, front + 0.03)
        self.part("door", lib["door"], 1.0, 2.1, 0.06, door_x, 1.05, front + 0.03, color=accent)
        self.part("step", lib["concrete_plain"], 1.6, 0.16, 0.9, door_x, 0.08, front + 0.5)
        win_y = 1.7 if two else 1.75
        spots = [x for x in (-w * 0.34, -w * 0.1, w * 0.14, w * 0.34) if abs(x - door_x) > 1.3]
        shutters = r() < 0.3
        n_win = 2 if lot["back"] else 2 + int(r() * (len(spots) - 1))
        for i in range(min(n_win, len(spots))):
            wide = r() < 0.3
            self.window(spots[i], win_y, front, 1.7 if wide else 1.0, 1.25 if wide else 1.15, 0.0, shutters and not wide, accent)
            if two:
                self.window(spots[i], 4.4, front, 1.0, 1.15, 0.0, False, accent)
        # side windows
        self.window(w / 2, win_y, (r() - 0.5) * d * 0.4, 1.0, 1.15, math.pi / 2)
        self.window(-w / 2, win_y, (r() - 0.5) * d * 0.4, 1.0, 1.15, -math.pi / 2)
        # porch
        if (not lot["back"]) and (not two) and r() < 0.45:
            pw = 3.6
            self.part("porch_slab", lib["concrete_plain"], pw, 0.22, 1.7, door_x, 0.11, front + 0.9)
            for px in (door_x - pw / 2 + 0.25, door_x + pw / 2 - 0.25):
                post = cylinder("post", self.coll, lib["trim"], 0.07, 0.07, 2.45, (0, 0, 0), 12)
                post.matrix_world = self.at(px, 0.22, front + 1.5)
                self.objs.append(post)
            self.part("porch_roof", lib["shingle"], pw + 0.4, 0.14, 2.0, door_x, 2.62, front + 0.85, 0.0, 0.1, color=roof_color)
            self.part("porch_fascia", lib["trim"], pw + 0.4, 0.16, 0.05, door_x, 2.5, front + 1.86)
        # garage beside the drive
        if lot.get("drive"):
            gb = lot["drive"]["b"]
            fx = math.sin(lot["yaw"])
            fz = math.cos(lot["yaw"])
            dxw = gb["x"] - lot["cx"]
            dzw = gb["z"] - lot["cz"]
            along = dxw * fx + dzw * fz
            lat_x = dxw - along * fx
            lat_z = dzw - along * fz
            # lateral offset in local x: project onto local right axis (cos yaw, -sin yaw)
            lx = lat_x * math.cos(lot["yaw"]) - lat_z * math.sin(lot["yaw"])
            gw, gd, gh = 4.0, 6.2, 2.9
            self.part("garage", wall_mat, gw, gh, gd, lx, gh / 2, -0.6, color=wall_color)
            self.part("garage_found", lib["foundation"], gw + 0.12, 0.3, gd + 0.12, lx, 0.15, -0.6)
            # garage roof: gable ridge toward the street
            self.roof(gd, gw, 1.1, 0.4, gh, math.pi / 2, lib["shingle"], wall_mat, wall_color, roof_color, ox=lx, oz=-0.6)
            # paneled door
            self.part("gdoor_jamb", lib["trim"], 3.5, 2.45, 0.08, lx, 1.22, gd / 2 - 0.6 + 0.02)
            self.part("gdoor", lib["garage_door"], 3.2, 2.25, 0.05, lx, 1.12, gd / 2 - 0.6 + 0.02)
            for k in range(4):
                self.part("gdoor_line", lib["trim_dark"], 3.15, 0.02, 0.012, lx, 0.32 + k * 0.55, gd / 2 - 0.6 + 0.05)
        # AC unit on a pad
        if (not lot["back"]) and r() < 0.6:
            side = 1 if r() < 0.5 else -1
            az = (r() - 0.5) * d * 0.5
            self.part("ac_pad", lib["concrete_plain"], 0.95, 0.08, 0.95, side * (w / 2 + 0.55), 0.04, az)
            self.part("ac", lib["metal"], 0.75, 0.7, 0.75, side * (w / 2 + 0.55), 0.43, az, bevel=0.02)
        return self.objs


def build(lib):
    coll = collection("Houses")
    all_objs = []
    for lot in LOTS:
        all_objs.extend(House(coll, lib, lot).build())
    return coll
