"""Camera math shared by build.py and render.py: the site's shot keys become a
perspective camera (vertical FOV 40 deg) whose distance from the focus is
view / (2 tan 20 deg); the subject is pushed left of centre by shifting the rig
to the camera's right by 0.18 x view x aspect (the site's text column lives on
the left). Also the hero aerial push (parameters eased with smoothstep)."""
import math

import bpy
from mathutils import Vector

from common import B, BEATS, WALK, WORLD, left_of, smoothstep
import vehicles

VFOV = 40.0
KEYS = WORLD["camera"]["keys"]
ASPECT = 16 / 9
SHIFT = 0.18
FOCUS_Y = 0.13  # the walk surface


def key_for(f):
    return min(KEYS, key=lambda k: abs(k["f"] - f))


def walk_focus(f, lat=0.0, fwd=0.0, y=FOCUS_Y):
    """Three-space focus point: `fwd` metres ahead of the station at fraction f, `lat` to its left."""
    p = WALK.frameF(f)
    nx, nz = left_of(p["tx"], p["tz"])
    return Vector((p["x"] + p["tx"] * fwd + nx * lat, y, p["z"] + p["tz"] * fwd + nz * lat))


def rig(focus, el, az, view, shift=SHIFT, aspect=ASPECT):
    """(camera position, look-at point) in three coords for a focus point and the site's el/az/view."""
    el_r = math.radians(el)
    az_r = math.radians(az)
    d = Vector((math.sin(az_r) * math.cos(el_r), math.sin(el_r), math.cos(az_r) * math.cos(el_r)))
    dist = view / (2 * math.tan(math.radians(VFOV / 2)))
    cam = focus + d * dist
    right = Vector((d.z, 0.0, -d.x))
    if right.length > 1e-6:
        right.normalize()
    off = right * (shift * view * aspect)
    return cam + off, focus + off


def rig_from_key(k, f=None, shift=SHIFT):
    f = k["f"] if f is None else f
    focus = walk_focus(f, k.get("lat", 0.0), k.get("fwd", 6.0))
    return rig(focus, k["el"], k["az"], k["view"], shift)


def ensure_camera(scene, name="ShotCam"):
    cam = bpy.data.objects.get(name)
    if cam is None:
        cd = bpy.data.cameras.new(name)
        cam = bpy.data.objects.new(name, cd)
        scene.collection.objects.link(cam)
    cd = cam.data
    cd.sensor_fit = "VERTICAL"
    cd.angle_y = math.radians(VFOV)
    cd.clip_start = 0.1
    cd.clip_end = 2500.0
    cam.rotation_mode = "QUATERNION"
    scene.camera = cam
    return cam


def apply(cam, cam_three, focus_three):
    """Place a camera object from three-space position and look-at point."""
    loc = B(cam_three.x, cam_three.z, cam_three.y)
    tgt = B(focus_three.x, focus_three.z, focus_three.y)
    cam.location = loc
    cam.rotation_quaternion = (tgt - loc).to_track_quat("-Z", "Y")
    return cam


# ---------- the still shot list ----------


def bus_shot():
    """Eye level on the desire line south of the stop: the bus's nose and door side, the pole,
    the trampled dirt where a sidewalk should be. (A site-style rig lands inside the yard trees.)"""
    p, yaw, lane, s = vehicles.bus_stop_pose()
    wp = WALK.frameF(0.185)
    bx, bz = p["x"], p["z"]
    focus = Vector((bx - 0.9, 1.3, bz + 2.4))
    cam = Vector((wp["x"] - 0.2, 1.7, bz + 13.5))
    fwd = focus - cam
    right = Vector((-fwd.z, 0.0, fwd.x)).normalized()
    return cam + right * 1.3, focus + right * 1.3


def stills():
    """name -> (cam, focus) in three coords."""
    out = {}
    for name, f in (("missing", BEATS["missing"]), ("broken", BEATS["broken"]), ("falls", BEATS["falls"]), ("precedent", BEATS["precedent"]), ("count", BEATS["count"])):
        k = key_for(f)
        out[name] = rig_from_key(k, f)
    # the aerial: ~70 m up at 45 deg over the first block, the walk running up the frame
    focus = walk_focus(0.27, -2.0, 0.0, 0.0)
    dist = 70.0 / math.sin(math.radians(45))
    view = 2 * dist * math.tan(math.radians(VFOV / 2))
    out["aerial"] = rig(focus, 45.0, 22.0, view, shift=0.08)
    out["bus"] = bus_shot()
    return out


# ---------- the hero push ----------

HERO_START = {"f": 0.30, "lat": -1.0, "fwd": 0.0, "el": 50.0, "az": 14.0, "height": 55.0}
HERO_END_KEY = key_for(BEATS["broken"])
HERO_SECONDS = 18.0
HERO_HOLD = 2.0
FPS = 24


def hero_pose(t):
    """t in [0, 1] over the whole clip; the move takes the first (18 - 2) s, then holds."""
    move = max(0.0, min(1.0, t * HERO_SECONDS / (HERO_SECONDS - HERO_HOLD)))
    u = smoothstep(move)
    a = HERO_START
    k = HERO_END_KEY
    dist_a = a["height"] / math.sin(math.radians(a["el"]))
    view_a = 2 * dist_a * math.tan(math.radians(VFOV / 2))
    fa = walk_focus(a["f"], a["lat"], a["fwd"], 0.0)
    fb = walk_focus(k["f"], k.get("lat", 0.0), k.get("fwd", 6.0))
    focus = fa.lerp(fb, u)
    el = a["el"] + (k["el"] - a["el"]) * u
    az = a["az"] + (k["az"] - a["az"]) * u
    # ease the distance in log space so the descent reads evenly
    view = math.exp(math.log(view_a) + (math.log(k["view"]) - math.log(view_a)) * u)
    return rig(focus, el, az, view)


def hero_frames():
    return int(round(HERO_SECONDS * FPS))
