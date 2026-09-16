"""Assemble the SideQuest street scene and save render/street.blend.

    blender -b --python render/build.py -- [--quick] [--skip nature,props,vehicles] [--out render/street.blend]
             [--exposure -0.3] [--test <viewname>] (render a 960x540 check frame after building)
"""
import argparse
import math
import os
import sys
import time

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "street"))

import common  # noqa: E402
import mats  # noqa: E402


def reset_scene():
    """Start from an empty file (keeps user preferences, unlike factory settings)."""
    bpy.ops.wm.read_homefile(use_empty=True)

# compass azimuth of the sun. South-south-west: warm late light that rakes along the walk;
# anything west of ~215 puts the west-side sidewalk in the shadow of its own houses at 20 deg.
SUN_AZIMUTH_DEG = 202.0


def hdri_sun_azimuth(image):
    """Compass azimuth (deg, from north clockwise) of the brightest pixel of an equirect HDR
    in Blender's default world mapping, plus its elevation."""
    w, h = image.size
    px = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(px)
    lum = px.reshape(h, w, 4)[:, :, :3] @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    row, col = np.unravel_index(int(np.argmax(lum)), lum.shape)
    u = (col + 0.5) / w
    v = (row + 0.5) / h
    ang = (0.5 - u) * 2 * math.pi  # atan2(y, x) of the direction
    x, y = math.cos(ang), math.sin(ang)
    compass = math.degrees(math.atan2(x, y)) % 360.0
    return compass, (v - 0.5) * 180.0


def setup_world(scene, exposure=-0.3):
    w = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    scene.world = w
    try:
        w.use_nodes = True
    except Exception:
        pass
    nt = w.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    nt.links.new(bg.outputs[0], out.inputs["Surface"])
    e = mats.by_id("qwantani_morning_puresky", "kloofendal_43d_clear_puresky", "kloofendal_48d_partly_cloudy_puresky")
    path = mats.asset_path(e, "hdr_4k") if e else None
    if path is None:
        import glob
        cands = sorted(glob.glob(os.path.join(common.ASSETS, "hdris", "*puresky*4k.hdr")))
        path = cands[0] if cands else None
    if path:
        img = bpy.data.images.load(path, check_existing=True)
        az, el = hdri_sun_azimuth(img)
        env = nt.nodes.new("ShaderNodeTexEnvironment")
        env.image = img
        tc = nt.nodes.new("ShaderNodeTexCoord")
        mp = nt.nodes.new("ShaderNodeMapping")
        # rotating the lookup by +r turns the environment by -r: sun compass goes az -> az + r
        rot = math.radians(SUN_AZIMUTH_DEG - az)
        mp.inputs["Rotation"].default_value = (0.0, 0.0, rot)
        nt.links.new(tc.outputs["Generated"], mp.inputs["Vector"])
        nt.links.new(mp.outputs[0], env.inputs["Vector"])
        nt.links.new(env.outputs[0], bg.inputs["Color"])
        bg.inputs["Strength"].default_value = 1.0
        print("WORLD: %s sun elev %.1f, image azimuth %.1f -> rotated to %.1f" % (os.path.basename(path), el, az, SUN_AZIMUTH_DEG))
    else:
        sky = nt.nodes.new("ShaderNodeTexSky")
        try:
            sky.sky_type = "MULTIPLE_SCATTERING"
        except Exception:
            pass
        sky.sun_elevation = math.radians(24)
        sky.sun_rotation = math.radians(SUN_AZIMUTH_DEG)
        nt.links.new(sky.outputs[0], bg.inputs["Color"])
        bg.inputs["Strength"].default_value = 0.25
        sd = bpy.data.lights.new("sun", "SUN")
        sd.energy = 4.0
        sd.angle = math.radians(0.55)
        sun = bpy.data.objects.new("sun", sd)
        scene.collection.objects.link(sun)
        el = math.radians(24)
        az = math.radians(SUN_AZIMUTH_DEG)
        from mathutils import Vector
        d = Vector((math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)))
        sun.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
        print("WORLD: procedural sky + sun")
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium Contrast" if "AgX - Medium Contrast" in [i.identifier for i in bpy.types.ColorManagedViewSettings.bl_rna.properties["look"].enum_items] else "None"
    scene.view_settings.exposure = exposure
    return w


def setup_render(scene, samples=160, res=(1920, 1080), quick=False, denoise=True, threshold=0.02):
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    try:
        prefs.compute_device_type = "OPTIX"
        prefs.refresh_devices()
        for dev in prefs.devices:
            dev.use = dev.type == "OPTIX"
    except Exception as e:
        print("OPTIX prefs failed:", e)
    cy = scene.cycles
    cy.device = "GPU"
    cy.samples = 24 if quick else samples
    cy.use_adaptive_sampling = True
    cy.adaptive_threshold = 0.05 if quick else threshold
    cy.use_denoising = denoise
    try:
        cy.denoiser = "OPTIX"
        cy.denoising_use_gpu = True
    except Exception:
        pass
    cy.use_light_tree = True
    cy.max_bounces = 6
    cy.diffuse_bounces = 3
    cy.glossy_bounces = 3
    cy.transmission_bounces = 4
    cy.transparent_max_bounces = 16
    cy.caustics_reflective = False
    cy.caustics_refractive = False
    cy.blur_glossy = 1.0
    try:
        cy.texture_limit_render = "2048"
        cy.texture_limit = "1024"
    except Exception:
        pass
    scene.render.use_persistent_data = True
    scene.render.resolution_x = res[0]
    scene.render.resolution_y = res[1]
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.use_motion_blur = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_depth = "8"
    scene.render.fps = 24
    scene.frame_start = 1
    scene.frame_end = 1


def build(quick=False, skip=(), exposure=0.0):
    import ground, houses, nature, props, vehicles, camera  # noqa: E402

    t0 = time.time()
    scene = bpy.context.scene
    # downscaled texture cache, made by a child process so this one never holds 4K pixels
    import subprocess
    subprocess.run([bpy.app.binary_path, "-b", "--python", os.path.join(HERE, "prep_textures.py")], check=False)
    print("BUILD textures %.1fs" % (time.time() - t0))
    lib = mats.library()
    ground.build(lib, quick=quick)
    print("BUILD ground %.1fs" % (time.time() - t0))
    houses.build(lib)
    print("BUILD houses %.1fs" % (time.time() - t0))
    if "nature" not in skip:
        nature.build(lib, quick=quick)
        print("BUILD nature %.1fs" % (time.time() - t0))
    if "props" not in skip:
        props.build(lib)
        print("BUILD props %.1fs" % (time.time() - t0))
    if "district" not in skip:
        import district

        district.build(lib)
        print("BUILD district %.1fs" % (time.time() - t0))
    if "vehicles" not in skip:
        vehicles.build(lib)
        print("BUILD vehicles %.1fs" % (time.time() - t0))
    mats.shrink_images()
    print("BUILD texture cache %.1fs" % (time.time() - t0))
    camera.ensure_camera(scene)
    setup_world(scene, exposure)
    setup_render(scene, quick=quick)
    # the Protos collection never renders
    pc = bpy.data.collections.get("Protos")
    if pc is not None:
        pc.hide_render = True
        lc = bpy.context.view_layer.layer_collection.children.get("Protos")
        if lc is not None:
            lc.exclude = True
    print("BUILD done %.1fs, %d objects" % (time.time() - t0, len(bpy.data.objects)))
    return lib


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--skip", default="")
    ap.add_argument("--out", default=os.path.join(HERE, "street.blend"))
    ap.add_argument("--exposure", type=float, default=0.0)
    ap.add_argument("--test", default="", help="render a 960x540 check frame of this shot after building (see camera.stills)")
    ap.add_argument("--testout", default="")
    args = ap.parse_args(argv)
    skip = tuple(s.strip() for s in args.skip.split(",") if s.strip())
    reset_scene()
    build(quick=args.quick, skip=skip, exposure=args.exposure)
    bpy.ops.wm.save_as_mainfile(filepath=args.out)
    print("SAVED", args.out)
    if args.test:
        import camera  # noqa: E402

        scene = bpy.context.scene
        shots = camera.stills()
        cam = camera.ensure_camera(scene)
        for name in args.test.split(","):
            if name == "hero0":
                pos, focus = camera.hero_pose(0.0)
            elif name == "hero1":
                pos, focus = camera.hero_pose(1.0)
            elif name == "heromid":
                pos, focus = camera.hero_pose(0.5)
            else:
                pos, focus = shots[name]
            camera.apply(cam, pos, focus)
            setup_render(scene, res=(960, 540), quick=True)
            scene.render.filepath = (args.testout or os.path.join(HERE, "out", "test")) + "_" + name + ".png"
            t1 = time.time()
            bpy.ops.render.render(write_still=True)
            print("TEST %s rendered in %.1fs -> %s" % (name, time.time() - t1, scene.render.filepath))


if __name__ == "__main__":
    main()
