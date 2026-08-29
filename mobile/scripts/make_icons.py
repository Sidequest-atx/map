"""Generate iOS/Android app icons + splash for the SideQuest ATX mobile app from the brand mark.
Run from mobile/: python scripts/make_icons.py
Same mark as ../scripts/make_icons.py (two panels, one lifted, a point above the lip)."""
from pathlib import Path

from PIL import Image, ImageDraw

ASSETS = Path(__file__).resolve().parents[1] / "assets"
OLIVE_DEEP = (55, 65, 42)
FIELD = (236, 230, 214)
OLIVE_LIGHT = (168, 196, 106)


def mark(size: int, padding: float = 0.0, radius: float = 0.25, bg=OLIVE_DEEP, fg=FIELD, dot=OLIVE_LIGHT, opaque=False) -> Image.Image:
    s = 8
    W = size * s
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if bg is not None:
        if opaque or radius == 0:
            d.rectangle([0, 0, W - 1, W - 1], fill=bg)
        else:
            d.rounded_rectangle([0, 0, W - 1, W - 1], radius=int(W * radius), fill=bg)
    inner = W * (1 - 2 * padding)
    off = W * padding
    u = inner / 64.0

    def P(x, y):
        return (off + x * u, off + y * u)

    def bar(x1, y, x2, w):
        d.line([P(x1, y), P(x2, y)], fill=fg, width=int(w * u))
        r = w * u / 2
        for cx in (x1, x2):
            px, py = P(cx, y)
            d.ellipse([px - r, py - r, px + r, py + r], fill=fg)

    bar(12, 41, 33, 7)
    bar(33, 33, 52, 7)
    px, py = P(33, 19)
    r = 4.5 * u
    d.ellipse([px - r, py - r, px + r, py + r], fill=dot)
    return img.resize((size, size), Image.LANCZOS)


def main():
    ASSETS.mkdir(exist_ok=True)
    # iOS: 1024 square, fully opaque (Apple masks the corners itself).
    mark(1024, padding=0.04, opaque=True).convert("RGB").save(ASSETS / "icon.png", optimize=True)
    # Splash: the mark only, on transparent; splash background set in app.json.
    mark(512, padding=0.0, bg=None, fg=OLIVE_DEEP, dot=(120, 140, 70)).save(ASSETS / "splash-icon.png", optimize=True)
    # Android adaptive: foreground on transparent with safe-zone padding, plain background, monochrome.
    mark(1024, padding=0.18, bg=None).save(ASSETS / "android-icon-foreground.png", optimize=True)
    Image.new("RGB", (1024, 1024), OLIVE_DEEP).save(ASSETS / "android-icon-background.png", optimize=True)
    mark(1024, padding=0.18, bg=None, fg=(255, 255, 255), dot=(255, 255, 255)).save(ASSETS / "android-icon-monochrome.png", optimize=True)
    mark(64, padding=0.04).save(ASSETS / "favicon.png", optimize=True)
    print("icons written to", ASSETS)


if __name__ == "__main__":
    main()
