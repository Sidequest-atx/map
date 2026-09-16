"""Render CLI for render/street.blend (built by build.py).

    blender -b render/street.blend --python render/render.py -- --still broken [--res 1920x1080] [--samples 160]
    blender -b render/street.blend --python render/render.py -- --stills all          (7 stills -> out/stills)
    blender -b render/street.blend --python render/render.py -- --anim [--start 1 --end 432] [--samples 128]
    blender -b render/street.blend --python render/render.py -- --encode              (frames -> mp4/webm/posters only)
    blender -b render/street.blend --python render/render.py -- --hero-frame 0.5 [--res 960x540 --samples 24]

Stills are rendered to PNG masters and converted with ffmpeg to WebP (q88, 1920 + 960 wide).
The hero push is 18 s at 24 fps (432 frames), eased with smoothstep, 2 s hold at the panel.
"""
import argparse
import json
import os
import subprocess
import sys
import time

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "street"))

import build  # noqa: E402
import camera  # noqa: E402
from common import B, LANES  # noqa: E402

OUT = os.path.join(HERE, "out")
STILL_NAMES = ["missing", "broken", "falls", "precedent", "count", "aerial", "bus"]


def _res(s):
    w, h = s.lower().split("x")
    return int(w), int(h)


def ffmpeg(*args):
    cmd = ["ffmpeg", "-y", "-loglevel", "error"] + [str(a) for a in args]
    print("FFMPEG", " ".join(cmd))
    subprocess.run(cmd, check=True)


def to_webp(png, out_full, out_960, q=88):
    ffmpeg("-i", png, "-c:v", "libwebp", "-quality", q, "-compression_level", 6, out_full)
    ffmpeg("-i", png, "-vf", "scale=960:-2", "-c:v", "libwebp", "-quality", q, "-compression_level", 6, out_960)


def render_still(name, res, samples, outdir, exposure=None, threshold=0.02):
    scene = bpy.context.scene
    cam = camera.ensure_camera(scene)
    shots = camera.stills()
    if name.startswith("hero@"):
        pos, focus = camera.hero_pose(float(name.split("@")[1]))
    else:
        pos, focus = shots[name]
    camera.apply(cam, pos, focus)
    build.setup_render(scene, samples=samples, res=res, threshold=threshold)
    if exposure is not None:
        scene.view_settings.exposure = exposure
    os.makedirs(os.path.join(outdir, "png"), exist_ok=True)
    png = os.path.join(outdir, "png", name.replace("@", "_") + ".png")
    scene.render.filepath = png
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    dt = time.time() - t0
    print("STILL %s %dx%d %d spp: %.1fs -> %s" % (name, res[0], res[1], samples, dt, png))
    if not name.startswith("hero@"):
        to_webp(png, os.path.join(outdir, name + ".webp"), os.path.join(outdir, name + "_960.webp"))
    return dt


def keyframe_hero(scene, n_frames):
    cam = camera.ensure_camera(scene)
    scene.frame_start = 1
    scene.frame_end = n_frames
    # one key per frame; linear interpolation between them (Blender 5 actions are layered,
    # so the interpolation is set through the keying preference rather than Action.fcurves)
    try:
        bpy.context.preferences.edit.keyframe_new_interpolation_type = "LINEAR"
    except Exception:
        pass
    cam.animation_data_clear()
    for f in range(1, n_frames + 1):
        t = (f - 1) / max(1, n_frames - 1)
        pos, focus = camera.hero_pose(t)
        camera.apply(cam, pos, focus)
        cam.keyframe_insert("location", frame=f)
        cam.keyframe_insert("rotation_quaternion", frame=f)
    # the northbound sedan rolls up the street during the push
    sedan = bpy.data.objects.get("traffic_sedan")
    if sedan is not None:
        sedan.animation_data_clear()
        sedan.rotation_mode = "XYZ"
        lane = LANES["fwd"]
        s0 = lane.length * 0.238  # just ahead of the opening camera, rolling away up the street
        for f in range(1, n_frames + 1):
            s = s0 + 7.0 * (f - 1) / camera.FPS
            p = lane.frame(min(s, lane.length - 1))
            sedan.location = B(p["x"], p["z"], 0.02)
            sedan.rotation_euler = (0, 0, camera.vehicles.path_yaw(p))
            sedan.keyframe_insert("location", frame=f)
            sedan.keyframe_insert("rotation_euler", frame=f)


def render_anim(start, end, res, samples, outdir, exposure=None, threshold=0.02):
    scene = bpy.context.scene
    n = camera.hero_frames()
    keyframe_hero(scene, n)
    build.setup_render(scene, samples=samples, res=res, threshold=threshold)
    if exposure is not None:
        scene.view_settings.exposure = exposure
    frames = os.path.join(outdir, "frames")
    os.makedirs(frames, exist_ok=True)
    scene.frame_start = start
    scene.frame_end = min(end, n)
    scene.render.filepath = os.path.join(frames, "frame_")
    scene.render.image_settings.file_format = "PNG"
    t0 = time.time()
    bpy.ops.render.render(animation=True)
    dt = time.time() - t0
    nf = scene.frame_end - scene.frame_start + 1
    print("ANIM frames %d-%d: %.1fs total, %.1fs/frame" % (scene.frame_start, scene.frame_end, dt, dt / max(1, nf)))
    return dt / max(1, nf)


def encode(outdir):
    frames = os.path.join(outdir, "frames")
    n = camera.hero_frames()
    seq = os.path.join(frames, "frame_%04d.png")
    mp4 = os.path.join(outdir, "hero_1080.mp4")
    webm = os.path.join(outdir, "hero_1080.webm")
    ffmpeg("-framerate", 24, "-i", seq, "-frames:v", n, "-c:v", "libx264", "-preset", "slow", "-crf", 20, "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4)
    ffmpeg("-framerate", 24, "-i", seq, "-frames:v", n, "-c:v", "libvpx-vp9", "-b:v", 0, "-crf", 31, "-row-mt", 1, "-pix_fmt", "yuv420p", webm)
    first = os.path.join(frames, "frame_%04d.png" % 1)
    last = os.path.join(frames, "frame_%04d.png" % n)
    ffmpeg("-i", first, "-vf", "scale=1920:-2", "-c:v", "libwebp", "-quality", 85, os.path.join(outdir, "hero_poster.webp"))
    ffmpeg("-i", last, "-vf", "scale=1920:-2", "-c:v", "libwebp", "-quality", 85, os.path.join(outdir, "hero_last.webp"))
    print("ENCODED", mp4, webm)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--still", default="")
    ap.add_argument("--stills", default="")
    ap.add_argument("--anim", action="store_true")
    ap.add_argument("--encode", action="store_true")
    ap.add_argument("--hero-frame", type=float, default=None)
    ap.add_argument("--start", type=int, default=1)
    ap.add_argument("--end", type=int, default=10000)
    ap.add_argument("--res", default="1920x1080")
    ap.add_argument("--samples", type=int, default=160)
    ap.add_argument("--threshold", type=float, default=0.02)
    ap.add_argument("--exposure", type=float, default=None)
    ap.add_argument("--out", default="")
    args = ap.parse_args(argv)
    res = _res(args.res)
    times = {}
    if args.still:
        outdir = args.out or os.path.join(OUT, "stills")
        times[args.still] = render_still(args.still, res, args.samples, outdir, args.exposure, args.threshold)
    if args.stills:
        outdir = args.out or os.path.join(OUT, "stills")
        names = STILL_NAMES if args.stills == "all" else args.stills.split(",")
        for n in names:
            times[n] = render_still(n, res, args.samples, outdir, args.exposure, args.threshold)
        tf = os.path.join(outdir, "render_times.json")
        old = json.load(open(tf)) if os.path.exists(tf) else {}
        old.update({k: {"seconds": round(v, 1), "res": "%dx%d" % res, "samples": args.samples} for k, v in times.items()})
        json.dump(old, open(tf, "w"), indent=1)
    if args.hero_frame is not None:
        outdir = args.out or os.path.join(OUT, "hero")
        render_still("hero@%.3f" % args.hero_frame, res, args.samples, outdir, args.exposure, args.threshold)
    if args.anim:
        outdir = args.out or os.path.join(OUT, "hero")
        per = render_anim(args.start, args.end, res, args.samples, outdir, args.exposure, args.threshold)
        json.dump({"seconds_per_frame": round(per, 2), "res": "%dx%d" % res, "samples": args.samples}, open(os.path.join(outdir, "render_times.json"), "w"), indent=1)
    if args.encode:
        encode(args.out or os.path.join(OUT, "hero"))


if __name__ == "__main__":
    main()
