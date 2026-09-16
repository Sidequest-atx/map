"""Materials. Scanned PBR sets from render/assets (CC0, see manifest.json)
when present, honest procedural fallbacks when not, so the build always runs."""
import json
import os

import bpy

from common import ASSETS, hexcol

_MANIFEST = None
_CACHE = {}


def manifest():
    global _MANIFEST
    if _MANIFEST is None:
        p = os.path.join(ASSETS, "manifest.json")
        _MANIFEST = json.load(open(p, encoding="utf-8")) if os.path.exists(p) else []
        if isinstance(_MANIFEST, dict):
            _MANIFEST = _MANIFEST.get("assets") or _MANIFEST.get("entries") or []
    return _MANIFEST


_KEY_ALIASES = {"normal_gl": "normal", "diffuse": "color", "albedo": "color", "rough": "roughness", "disp": "displacement", "height": "displacement", "alpha": "opacity"}


def _entry_files(e):
    """Resolve an entry's texture files to absolute paths (manifest uses folder + files;
    keys are normalised: normal_gl -> normal, opacity kept, lists skipped)."""
    files = dict(e.get("files") or {})
    folder = e.get("folder") or ""
    out = {}
    for k, v in files.items():
        if not v or isinstance(v, (list, dict)):
            continue
        key = _KEY_ALIASES.get(k, k)
        if key == "normal" and "normal" in out:
            continue
        p = v if os.path.isabs(v) else os.path.join(ASSETS, folder, v)
        if not os.path.exists(p):
            p2 = os.path.join(ASSETS, v)
            p = p2 if os.path.exists(p2) else p
        if os.path.exists(p):
            out[key] = p
    if "normal" not in out and files.get("normal_dx"):
        p = os.path.join(ASSETS, folder, files["normal_dx"])
        if os.path.exists(p):
            out["normal"] = p
            out["normal_is_dx"] = True
    return out


def entry_tile(e, default=2.0):
    """(w, h) tile size in meters from the manifest's dimensions_m, else default."""
    d = (e or {}).get("dimensions_m")
    if isinstance(d, (list, tuple)) and len(d) >= 2 and d[0] and d[1]:
        return float(d[0]), float(d[1])
    return default, default


def by_id(*ids):
    """First manifest entry whose id matches (any kind); the folder must exist on disk."""
    for want in ids:
        for e in manifest():
            if e.get("id") == want:
                folder = os.path.join(ASSETS, e.get("folder") or "")
                if os.path.isdir(folder):
                    return e
    return None


def find(kind, *keywords, exclude=()):
    """First manifest entry of `kind` whose id/category/notes contain every keyword."""
    for e in manifest():
        if e.get("kind") != kind:
            continue
        hay = " ".join(str(e.get(k, "")) for k in ("id", "category", "notes", "folder")).lower()
        if all(k.lower() in hay for k in keywords) and not any(x.lower() in hay for x in exclude):
            return e
    return None


def asset_path(e, key):
    """Absolute path of one file of a manifest entry (e.g. an hdri's 'hdr_4k' or a model's 'gltf')."""
    if not e:
        return None
    v = (e.get("files") or {}).get(key)
    if not v or isinstance(v, (list, dict)):
        return None
    p = os.path.join(ASSETS, e.get("folder") or "", v)
    return p if os.path.exists(p) else None


def cache_path_for(src):
    """(path of the downscaled copy shrink_images/prep_textures would make for `src`, its pixel limit)."""
    low = src.lower().replace("\\", "/")
    limit = 2048
    for token, lim in DOWNSCALE_RULES:
        if token in low:
            limit = lim
    base = os.path.splitext(os.path.basename(src))[0]
    ext = ".png" if low.endswith(".png") else ".jpg"
    return os.path.join(TEX_CACHE, "%s_%d%s" % (base, limit, ext)), limit


def img(path, noncolor=False):
    """Load an image, preferring its downscaled cache copy (the main build never holds 4K pixels)."""
    key = os.path.abspath(path)
    im = _CACHE.get(key)
    if im is None:
        cp, _lim = cache_path_for(path)
        im = bpy.data.images.load(cp if os.path.exists(cp) else path, check_existing=True)
        _CACHE[key] = im
    if noncolor:
        try:
            im.colorspace_settings.name = "Non-Color"
        except Exception:
            pass
    return im


TEX_CACHE = os.path.join(os.path.dirname(ASSETS), "cache", "tex")


DOWNSCALE_RULES = (("models", 1024), ("grass", 1024), ("brick", 1024), ("stucco", 1024), ("wall", 1024), ("roof", 1024),
                   ("bark", 1024), ("mud", 1024), ("rocks", 1024), ("metal", 1024), ("woodchips", 1024), ("leafset", 1024))


def shrink_images(default_max=2048, skip_ext=(".hdr", ".exr")):
    """Host RAM guard (16 GB machine): every image datablock larger than its limit is swapped
    for a downscaled copy cached on disk (render/cache/tex). Colour spaces are preserved."""
    os.makedirs(TEX_CACHE, exist_ok=True)
    n = 0
    for im in list(bpy.data.images):
        if im.type != "IMAGE" or not im.filepath:
            continue
        src = bpy.path.abspath(im.filepath)
        if not os.path.exists(src) or src.lower().endswith(skip_ext):
            continue
        w, h = im.size
        if not w:
            continue
        if im.packed_file:
            # the glTF importer packs its textures; drop the packed copy (the source file exists)
            try:
                im.unpack(method="REMOVE")
            except Exception as e:
                print("unpack failed", im.name, e)
                continue
        dst, limit = cache_path_for(src)
        limit = min(limit, default_max)
        if max(w, h) <= limit:
            continue
        ext = os.path.splitext(dst)[1]
        if limit != cache_path_for(src)[1]:
            dst = os.path.join(TEX_CACHE, "%s_%d%s" % (os.path.splitext(os.path.basename(src))[0], limit, ext))
        if not os.path.exists(dst):
            s = limit / float(max(w, h))
            tmp = bpy.data.images.load(src)
            tmp.scale(max(1, int(round(w * s))), max(1, int(round(h * s))))
            tmp.file_format = "PNG" if ext == ".png" else "JPEG"
            try:
                tmp.save(filepath=dst, quality=92)
            except TypeError:
                tmp.filepath_raw = dst
                tmp.save()
            bpy.data.images.remove(tmp)
        cs = im.colorspace_settings.name
        im.filepath = dst
        im.filepath_raw = dst
        im.reload()
        try:
            im.colorspace_settings.name = cs
        except Exception:
            pass
        n += 1
    print("TEXCACHE: %d images swapped for downscaled copies" % n)
    return n


def _mix(nodes, links, a, b, blend="MULTIPLY", fac=1.0):
    m = nodes.new("ShaderNodeMix")
    m.data_type = "RGBA"
    m.blend_type = blend
    m.inputs[0].default_value = fac
    if hasattr(a, "is_output"):
        links.new(a, m.inputs[6])
    else:
        m.inputs[6].default_value = a
    if hasattr(b, "is_output"):
        links.new(b, m.inputs[7])
    else:
        m.inputs[7].default_value = b
    return m.outputs[2]


def pbr(name, entry=None, tile_m=None, base=None, rough=0.7, metallic=0.0, tint_var=0.0, object_color=False,
        offset_random=True, bump=0.02, disp_true=False, coords="UV", normal_strength=1.0, noise_fallback=0.0,
        use_ao=False, use_disp=False, rough_mul=1.0, macro_var=0.0, macro_scale=22.0):
    """Principled material fed by a scanned set. `base` tints (multiplies) the
    albedo; with no scan it is the flat color. `tint_var` = per-object value
    variation from Object Info > Random; `object_color` multiplies by the
    object's color (per-slab weathering). `tile_m` None = the scan's real size.
    AO and displacement maps are opt-in (GPU memory)."""
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nodes = nt.nodes
    links = nt.links
    bsdf = nodes["Principled BSDF"]
    out = nodes["Material Output"]
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metallic
    if base:
        bsdf.inputs["Base Color"].default_value = hexcol(base)

    files = _entry_files(entry) if entry else {}
    if not use_ao:
        files.pop("ao", None)
    if not use_disp:
        files.pop("displacement", None)
    tc = nodes.new("ShaderNodeTexCoord")
    mp = nodes.new("ShaderNodeMapping")
    links.new(tc.outputs["UV"] if coords == "UV" else tc.outputs["Object"], mp.inputs["Vector"])
    if tile_m is None:
        tw, th = entry_tile(entry, 2.0)
    elif isinstance(tile_m, (tuple, list)):
        tw, th = tile_m
    else:
        tw = th = tile_m
    mp.inputs["Scale"].default_value = (1.0 / tw, 1.0 / th, 1.0)
    if offset_random:
        oi = nodes.new("ShaderNodeObjectInfo")
        m1 = nodes.new("ShaderNodeMath")
        m1.operation = "MULTIPLY"
        m1.inputs[1].default_value = 7.31
        links.new(oi.outputs["Random"], m1.inputs[0])
        m2 = nodes.new("ShaderNodeMath")
        m2.operation = "MULTIPLY"
        m2.inputs[1].default_value = 3.17
        links.new(oi.outputs["Random"], m2.inputs[0])
        cmb = nodes.new("ShaderNodeCombineXYZ")
        links.new(m1.outputs[0], cmb.inputs["X"])
        links.new(m2.outputs[0], cmb.inputs["Y"])
        links.new(cmb.outputs[0], mp.inputs["Location"])

    color_out = None
    if files.get("color"):
        t = nodes.new("ShaderNodeTexImage")
        t.image = img(files["color"])
        t.projection = "FLAT"
        links.new(mp.outputs[0], t.inputs["Vector"])
        color_out = t.outputs["Color"]
    elif noise_fallback > 0:
        # procedural grain so flat colors still read as a surface
        nz = nodes.new("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = 60.0 / tile_m
        nz.inputs["Detail"].default_value = 6.0
        links.new(mp.outputs[0], nz.inputs["Vector"])
        ramp = nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (1 - noise_fallback, 1 - noise_fallback, 1 - noise_fallback, 1)
        ramp.color_ramp.elements[1].color = (1 + noise_fallback, 1 + noise_fallback, 1 + noise_fallback, 1)
        links.new(nz.outputs["Fac"], ramp.inputs["Fac"])
        color_out = _mix(nodes, links, hexcol(base or "#808080"), ramp.outputs["Color"])
    if color_out is not None:
        if base and files.get("color"):
            color_out = _mix(nodes, links, color_out, hexcol(base))
        if tint_var > 0:
            oi2 = nodes.new("ShaderNodeObjectInfo")
            ramp = nodes.new("ShaderNodeValToRGB")
            lo = 1 - tint_var
            hi = 1 + tint_var * 0.6
            ramp.color_ramp.elements[0].color = (lo, lo, lo, 1)
            ramp.color_ramp.elements[1].color = (hi, hi, hi, 1)
            links.new(oi2.outputs["Random"], ramp.inputs["Fac"])
            color_out = _mix(nodes, links, color_out, ramp.outputs["Color"])
        if object_color:
            oi3 = nodes.new("ShaderNodeObjectInfo")
            color_out = _mix(nodes, links, color_out, oi3.outputs["Color"])
        if macro_var > 0:
            # metres-scale patchiness (dry patches, greener low spots) in world space
            tcw = nodes.new("ShaderNodeTexCoord")
            mn = nodes.new("ShaderNodeTexNoise")
            mn.inputs["Scale"].default_value = 1.0 / macro_scale
            mn.inputs["Detail"].default_value = 3.0
            mn.inputs["Roughness"].default_value = 0.55
            links.new(tcw.outputs["Object"], mn.inputs["Vector"])
            mr = nodes.new("ShaderNodeValToRGB")
            mr.color_ramp.elements[0].position = 0.35
            mr.color_ramp.elements[0].color = (1 - macro_var, 1 - macro_var * 0.85, 1 - macro_var * 1.2, 1)
            mr.color_ramp.elements[1].position = 0.65
            mr.color_ramp.elements[1].color = (1 + macro_var * 0.7, 1 + macro_var * 0.5, 1 + macro_var * 0.2, 1)
            links.new(mn.outputs["Fac"], mr.inputs["Fac"])
            color_out = _mix(nodes, links, color_out, mr.outputs["Color"])
        if files.get("ao"):
            ta = nodes.new("ShaderNodeTexImage")
            ta.image = img(files["ao"], True)
            links.new(mp.outputs[0], ta.inputs["Vector"])
            color_out = _mix(nodes, links, color_out, ta.outputs["Color"], fac=0.5)
        links.new(color_out, bsdf.inputs["Base Color"])
    elif object_color:
        oi3 = nodes.new("ShaderNodeObjectInfo")
        links.new(_mix(nodes, links, hexcol(base or "#808080"), oi3.outputs["Color"]), bsdf.inputs["Base Color"])

    if files.get("roughness"):
        tr = nodes.new("ShaderNodeTexImage")
        tr.image = img(files["roughness"], True)
        links.new(mp.outputs[0], tr.inputs["Vector"])
        if rough_mul != 1.0:
            rm = nodes.new("ShaderNodeMath")
            rm.operation = "MULTIPLY"
            rm.inputs[1].default_value = rough_mul
            rm.use_clamp = True
            links.new(tr.outputs["Color"], rm.inputs[0])
            links.new(rm.outputs[0], bsdf.inputs["Roughness"])
        else:
            links.new(tr.outputs["Color"], bsdf.inputs["Roughness"])
    if files.get("normal"):
        tn = nodes.new("ShaderNodeTexImage")
        tn.image = img(files["normal"], True)
        links.new(mp.outputs[0], tn.inputs["Vector"])
        nm = nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = normal_strength
        if files.get("normal_is_dx"):
            # DirectX normal: flip green
            sep = nodes.new("ShaderNodeSeparateColor")
            inv = nodes.new("ShaderNodeMath")
            inv.operation = "SUBTRACT"
            inv.inputs[0].default_value = 1.0
            comb = nodes.new("ShaderNodeCombineColor")
            links.new(tn.outputs["Color"], sep.inputs[0])
            links.new(sep.outputs[0], comb.inputs[0])
            links.new(sep.outputs[1], inv.inputs[1])
            links.new(inv.outputs[0], comb.inputs[1])
            links.new(sep.outputs[2], comb.inputs[2])
            links.new(comb.outputs[0], nm.inputs["Color"])
        else:
            links.new(tn.outputs["Color"], nm.inputs["Color"])
        links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    if files.get("displacement") and bump > 0:
        td = nodes.new("ShaderNodeTexImage")
        td.image = img(files["displacement"], True)
        links.new(mp.outputs[0], td.inputs["Vector"])
        dp = nodes.new("ShaderNodeDisplacement")
        dp.inputs["Scale"].default_value = bump
        dp.inputs["Midlevel"].default_value = 0.5
        links.new(td.outputs["Color"], dp.inputs["Height"])
        links.new(dp.outputs["Displacement"], out.inputs["Displacement"])
        try:
            mat.displacement_method = "DISPLACEMENT" if disp_true else "BUMP"
        except Exception:
            pass
    return mat


def simple(name, base, rough=0.6, metallic=0.0, emission=None, emission_strength=0.0, alpha=None, object_color=False):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = hexcol(base)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metallic
    if emission:
        bsdf.inputs["Emission Color"].default_value = hexcol(emission)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    if alpha is not None:
        bsdf.inputs["Alpha"].default_value = alpha
        try:
            mat.surface_render_method = "BLENDED"
        except Exception:
            pass
    if object_color:
        oi = nt.nodes.new("ShaderNodeObjectInfo")
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs[0].default_value = 1.0
        mix.inputs[6].default_value = hexcol(base)
        nt.links.new(oi.outputs["Color"], mix.inputs[7])
        nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    return mat


def glass(name="glass_window", tint="#0f1417", rough=0.04):
    """Archviz window: dark, mirror-smooth dielectric that reflects the sky."""
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = hexcol(tint)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = 0.0
    try:
        bsdf.inputs["IOR"].default_value = 1.52
        bsdf.inputs["Coat Weight"].default_value = 1.0
    except Exception:
        pass
    return mat


def car_paint(name, base, flake=0.0):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = hexcol(base)
    bsdf.inputs["Roughness"].default_value = 0.35
    bsdf.inputs["Metallic"].default_value = 0.15
    try:
        bsdf.inputs["Coat Weight"].default_value = 1.0
        bsdf.inputs["Coat Roughness"].default_value = 0.05
    except Exception:
        pass
    return mat


def library():
    """Every shared material, keyed by role."""
    if "_lib" in _CACHE:
        return _CACHE["_lib"]
    # explicit picks from the manifest (by id), each with a keyword fallback so any manifest shape still builds
    conc_e = by_id("gravel_concrete_03") or find("texture", "concrete", exclude=("wall", "brick"))
    conc_plain_e = by_id("brushed_concrete_03") or conc_e
    conc_worn_e = by_id("concrete_floor_worn_02") or conc_e
    asph_e = by_id("asphalt_04", "asphalt_02") or find("texture", "asphalt", exclude=("shingle", "roof", "aerial"))
    asph_patch_e = by_id("asphalt_02") or asph_e
    grass_e = by_id("withered_grass") or find("texture", "grass", exclude=("clump",))
    grass_sparse_e = by_id("sparse_grass") or grass_e
    dirt_e = by_id("brown_mud_dry") or find("texture", "dirt") or find("texture", "mud") or find("texture", "ground")
    gravel_e = by_id("dry_ground_rocks") or dirt_e
    shingle_e = by_id("grey_roof_01") or find("texture", "shingle") or find("texture", "roof")
    brick_e = by_id("brick_wall_09") or find("texture", "brick")
    brick_tan_e = by_id("brown_brick_02") or brick_e
    stucco_e = by_id("white_stucco") or find("texture", "stucco") or find("texture", "plaster")
    siding_e = by_id("beige_wall_001") or find("texture", "siding") or find("texture", "plaster", exclude=("stucco",))
    bark_e = by_id("jolcham_oak_bark_01", "bark_brown_02") or find("texture", "bark")
    metal_e = by_id("painted_metal_shutter") or find("texture", "painted", "metal") or find("texture", "metal")
    mulch_e = by_id("WoodChips003") or find("texture", "mulch")
    lib = {
        # the scans are mid-grey; real sidewalks sit around 0.45 albedo, so they are tinted UP (>1 in linear)
        "concrete": pbr("sq_concrete", conc_e, rough=0.85, tint_var=0.12, object_color=True, bump=0.012, base="#ffffff" if conc_e else "#b9b3a4", noise_fallback=0.08, use_disp=True),
        "concrete_plain": pbr("sq_concrete_plain", conc_plain_e, rough=0.85, tint_var=0.06, bump=0.008, base="#faf6ee" if conc_plain_e else "#b5afa1", noise_fallback=0.08),
        "concrete_fresh": pbr("sq_concrete_fresh", conc_plain_e, rough=0.7, tint_var=0.02, bump=0.006, base="#ffffff" if conc_plain_e else "#d8d3c6", noise_fallback=0.04),
        "concrete_worn": pbr("sq_concrete_worn", conc_worn_e, rough=0.9, tint_var=0.1, object_color=True, bump=0.012, base="#f0ebe2" if conc_worn_e else "#aaa496", noise_fallback=0.08, use_disp=True),
        "asphalt": pbr("sq_asphalt", asph_e, rough=0.92, tint_var=0.0, offset_random=False, bump=0.012, base="#a09d98" if asph_e else "#2f2f2c", noise_fallback=0.12, use_disp=True),
        "asphalt_patch": pbr("sq_asphalt_patch", asph_patch_e, tile_m=1.5, rough=0.95, base="#4a4946" if asph_patch_e else "#25251f", noise_fallback=0.1),
        "grass": pbr("sq_grass", grass_e, rough=0.95, offset_random=False, bump=0.01, base="#9fb06c" if grass_e else "#6f7a44", coords="Object", noise_fallback=0.14, macro_var=0.22),
        "grass_sparse": pbr("sq_grass_sparse", grass_sparse_e, rough=0.95, offset_random=False, bump=0.01, base="#a9b57a" if grass_sparse_e else "#7a7c48", coords="Object", noise_fallback=0.14, macro_var=0.18),
        "dirt": pbr("sq_dirt", dirt_e, rough=0.95, bump=0.012, base="#b8a480" if dirt_e else "#8a744f", noise_fallback=0.12, macro_var=0.12),
        "gravel": pbr("sq_gravel", gravel_e, tile_m=1.2, rough=1.0, bump=0.02, base="#8a8074" if gravel_e else "#5a5247", noise_fallback=0.15),
        "mulch": pbr("sq_mulch", mulch_e, tile_m=1.0, rough=0.95, base="#8a6a48" if mulch_e else "#5c4630", noise_fallback=0.15),
        "shingle": pbr("sq_shingle", shingle_e, tile_m=(3.2, 3.2), rough=0.9, tint_var=0.1, object_color=True, bump=0.012, base="#a8a49c" if shingle_e else "#57544a", noise_fallback=0.1),
        "brick": pbr("sq_brick", brick_e, rough=0.85, object_color=True, bump=0.02, base=None if brick_e else "#a8624c", noise_fallback=0.08),
        "brick_tan": pbr("sq_brick_tan", brick_tan_e, rough=0.85, object_color=True, bump=0.02, base=None if brick_tan_e else "#c9a97a", noise_fallback=0.08),
        "stucco": pbr("sq_stucco", stucco_e, rough=0.9, object_color=True, bump=0.008, base=None if stucco_e else "#d6cbb2", noise_fallback=0.05),
        "siding": pbr("sq_siding", siding_e, rough=0.75, object_color=True, bump=0.01, base=None if siding_e else "#c4bda8", noise_fallback=0.05),
        "bark": pbr("sq_bark", bark_e, rough=0.95, bump=0.03, base=None if bark_e else "#6d5b46", noise_fallback=0.15),
        "trim": simple("sq_trim", "#f1ede3", rough=0.45),
        "trim_dark": simple("sq_trim_dark", "#3a3631", rough=0.5),
        "door": simple("sq_door", "#5d3f35", rough=0.4, object_color=True),
        "garage_door": simple("sq_garage_door", "#e7e2d6", rough=0.5),
        "foundation": pbr("sq_foundation", conc_worn_e, rough=0.9, base="#9d968a" if conc_worn_e else "#8f887a", noise_fallback=0.08),
        "glass": glass(),
        "metal": pbr("sq_metal", metal_e, rough=0.45, metallic=0.6, base="#8a8e93" if metal_e else "#494e54", noise_fallback=0.05),
        "pole_wood": pbr("sq_pole_wood", bark_e, tile_m=(0.8, 1.6), rough=0.9, base="#8a7a66" if bark_e else "#6d5b46", noise_fallback=0.12),
        "metal_dark": simple("sq_metal_dark", "#2b2e33", rough=0.5, metallic=0.7),
        "galv": simple("sq_galv", "#9aa0a6", rough=0.35, metallic=0.9),
        "paint_white": simple("sq_paint_white", "#e9e6da", rough=0.7),
        "paint_yellow": simple("sq_paint_yellow", "#d8a63e", rough=0.7),
        "sign_red": simple("sq_sign_red", "#a8332e", rough=0.35),
        "sign_white": simple("sq_sign_white", "#f2ede2", rough=0.35),
        "orange": simple("sq_orange", "#e0682a", rough=0.5),
        "cone_orange": simple("sq_cone", "#ff6a1f", rough=0.45),
        "hydrant": simple("sq_hydrant", "#b23a2c", rough=0.45),
        "rubber": simple("sq_rubber", "#1f2022", rough=0.9),
        "spray": simple("sq_spray", "#ff7a26", rough=0.8, emission="#ff7a26", emission_strength=0.15),
        "pin": simple("sq_pin", "#2f7d4f", rough=0.3, emission="#2e7d4f", emission_strength=0.2),
        "leaf": simple("sq_leaf", "#4f6b33", rough=0.6),
        "leaf_dry": simple("sq_leaf_dry", "#8b8a4a", rough=0.7),
        "water": simple("sq_water", "#4f8f88", rough=0.05),
        "plate": simple("sq_plate", "#565a60", rough=0.5, metallic=0.6),
        "lamp": simple("sq_lamp", "#d8d3c4", rough=0.4, emission="#ffd9a0", emission_strength=0.0),
        "capmetro_blue": car_paint("sq_capmetro_blue", "#1c5fb0"),
        "capmetro_white": car_paint("sq_capmetro_white", "#f2f2ee"),
        "capmetro_red": car_paint("sq_capmetro_red", "#c8202f"),
        "capmetro_text": simple("sq_capmetro_text", "#12386e", rough=0.4),
        "dest_sign": simple("sq_dest_sign", "#1a1a1a", rough=0.5, emission="#ffb347", emission_strength=6.0),
    }
    # translucent leaves
    try:
        lm = lib["leaf"]
        b = lm.node_tree.nodes["Principled BSDF"]
        b.inputs["Subsurface Weight"].default_value = 0.0
        b.inputs["Transmission Weight"].default_value = 0.0
    except Exception:
        pass
    _CACHE["_lib"] = lib
    return lib
