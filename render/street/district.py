"""Downtown backdrop: simple commercial blocks flanking the downtown leg of the
street (the site only paves this area), so the precedent/count stills have
storefronts and office walls behind the walk instead of an empty plane.
Facades are boxes with a procedural window grid over brick, stucco or glass."""
import math

import bpy
from mathutils import Vector

from common import B, DOWNTOWN_Z, INTERSECTIONS, box, collection, hexcol, rng
import mats


def facade_material(name, base_mat_key, lib, win_w=1.6, win_h=1.5, bay=3.0, floor=3.4, sill=1.0, glass_tint="#22303a"):
    """Copy of a wall material whose base colour switches to dark glass inside a window grid
    (object-space coordinates, so every box gets a clean grid)."""
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    src = lib[base_mat_key]
    mat = src.copy()
    mat.name = name
    nt = mat.node_tree
    nodes = nt.nodes
    links = nt.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    wall_color_link = bsdf.inputs["Base Color"].links[0].from_socket if bsdf.inputs["Base Color"].is_linked else None
    tc = nodes.new("ShaderNodeTexCoord")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(tc.outputs["Object"], sep.inputs[0])
    # horizontal position along the facade: use x + y (each box face is axis aligned; one of them is constant)
    add = nodes.new("ShaderNodeMath")
    add.operation = "ADD"
    links.new(sep.outputs["X"], add.inputs[0])
    links.new(sep.outputs["Y"], add.inputs[1])

    def band(inp, period, width, offset):
        m1 = nodes.new("ShaderNodeMath")
        m1.operation = "SUBTRACT"
        m1.inputs[1].default_value = offset
        links.new(inp, m1.inputs[0])
        m2 = nodes.new("ShaderNodeMath")
        m2.operation = "MODULO"
        m2.inputs[1].default_value = period
        links.new(m1.outputs[0], m2.inputs[0])
        m3 = nodes.new("ShaderNodeMath")
        m3.operation = "LESS_THAN"
        m3.inputs[1].default_value = width
        links.new(m2.outputs[0], m3.inputs[0])
        return m3.outputs[0]

    hb = band(add.outputs[0], bay, win_w, 0.7)
    vb = band(sep.outputs["Z"], floor, win_h, sill)
    both = nodes.new("ShaderNodeMath")
    both.operation = "MULTIPLY"
    links.new(hb, both.inputs[0])
    links.new(vb, both.inputs[1])
    # windows only above the plinth and below the parapet
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MIX"
    links.new(both.outputs[0], mix.inputs[0])
    if wall_color_link is not None:
        links.new(wall_color_link, mix.inputs[6])
    else:
        mix.inputs[6].default_value = bsdf.inputs["Base Color"].default_value
    mix.inputs[7].default_value = hexcol(glass_tint)
    links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    rough = nodes.new("ShaderNodeMath")
    rough.operation = "MULTIPLY_ADD"
    rough.inputs[1].default_value = -0.8
    rough.inputs[2].default_value = 0.9
    links.new(both.outputs[0], rough.inputs[0])
    if bsdf.inputs["Roughness"].is_linked:
        for l in list(bsdf.inputs["Roughness"].links):
            nt.links.remove(l)
    links.new(rough.outputs[0], bsdf.inputs["Roughness"])
    # windows are flat and glossy: kill the normal map inside them
    if bsdf.inputs["Normal"].is_linked:
        nsrc = bsdf.inputs["Normal"].links[0].from_socket
        nmix = nodes.new("ShaderNodeMix")
        nmix.data_type = "VECTOR"
        links.new(both.outputs[0], nmix.inputs[0])
        links.new(nsrc, nmix.inputs[4])
        geo = nodes.new("ShaderNodeNewGeometry")
        links.new(geo.outputs["Normal"], nmix.inputs[5])
        for l in list(bsdf.inputs["Normal"].links):
            nt.links.remove(l)
        links.new(nmix.outputs[1], bsdf.inputs["Normal"])
    return mat


def build(lib):
    coll = collection("District")
    r = rng(7711)
    fac = [
        facade_material("sq_facade_brick", "brick", lib, 1.5, 1.6, 3.2, 3.6, 1.0),
        facade_material("sq_facade_tan", "brick_tan", lib, 1.7, 1.5, 3.4, 3.4, 1.1),
        facade_material("sq_facade_stucco", "stucco", lib, 1.8, 1.4, 3.6, 3.5, 1.2),
        facade_material("sq_facade_glass", "siding", lib, 2.6, 2.6, 2.8, 3.3, 0.4, "#1d2a33"),
    ]
    tints = [(0.85, 0.72, 0.62, 1), (1.0, 0.95, 0.85, 1), (0.9, 0.9, 0.88, 1), (0.75, 0.78, 0.8, 1), (0.95, 0.85, 0.7, 1)]
    cross = [i["at"]["z"] for i in INTERSECTIONS if i["signal"]]
    # the site's precedent/count cameras stand 17-24 m up over the east side of the street, and the
    # sun (SSW) would drag west-side shadows across the walk just north of a tall block: keep the
    # east row low and set back, and leave low frontage (parking-lot height) south of those beats
    from common import BEATS, WALK
    beat_z = [WALK.frameF(BEATS[k])["z"] for k in ("precedent", "count")]
    n = 0
    for side, x_front, depth_min in ((-1, 139.5, 14.0), (1, 172.0, 12.0)):
        z = DOWNTOWN_Z + 2.0
        while z > -62:
            if any(abs(z - cz) < 11.5 for cz in cross):
                z -= 4.0
                continue
            length = 12.0 + r() * 16.0
            if any(cz < z and cz > z - length - 11 for cz in cross):
                length = max(8.0, z - (max(cz for cz in cross if cz < z) + 11.5)) if any(cz < z for cz in cross) else length
            depth = depth_min + r() * 10.0
            floors = 2 + int(r() * 4) if r() < 0.8 else 6 + int(r() * 5)
            if side > 0:
                floors = min(floors, 3)
            if side < 0 and any(bz - 8.0 < z and z - length < bz + 38.0 for bz in beat_z):
                floors = 1
            h = floors * 3.4 + 0.8
            cx = x_front + side * depth / 2
            cz = z - length / 2
            mat = fac[int(r() * len(fac))]
            ob = box("bldg_%d" % n, coll, mat, depth - 0.3, length - 0.6, h, B(cx, cz, 0.0), 0.0)
            ob.color = tints[int(r() * len(tints))]
            # parapet cap and a plinth of plain concrete
            box("bldg_cap_%d" % n, coll, lib["concrete_plain"], depth - 0.2, length - 0.5, 0.35, B(cx, cz, h - 0.05), 0.0)
            box("bldg_plinth_%d" % n, coll, lib["concrete_worn"], depth - 0.25, length - 0.55, 0.5, B(cx, cz, -0.02), 0.0)
            n += 1
            z -= length + 1.5 + (3.0 if r() < 0.3 else 0.0)
    # a few taller towers further back (west, behind the row) for the skyline
    for k, (tx, tz) in enumerate(((112, -52), (104, -96), (196, -70))):
        h = 30 + r() * 30
        ob = box("tower_%d" % k, coll, fac[3 if k % 2 == 0 else 0], 20 + r() * 8, 24 + r() * 10, h, B(tx, tz, 0.0), 0.0)
        ob.color = tints[3]
    print("DISTRICT: %d blocks" % n)
    return coll
