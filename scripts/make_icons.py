"""Generate PWA icons + OG image from the brand mark. Run: python scripts/make_icons.py"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1] / "public"
OLIVE_DEEP = (55, 65, 42)
FIELD = (236, 230, 214)
OCHRE = (194, 138, 45)
OLIVE_LIGHT = (168, 196, 106)


def mark(size: int, padding: float = 0.0, radius: float = 0.25) -> Image.Image:
    """Draw the 64-unit mark scaled to `size` px. padding is a fraction for maskable icons."""
    s = 8  # supersample
    W = size * s
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, W - 1, W - 1], radius=int(W * radius), fill=OLIVE_DEEP)

    inner = W * (1 - 2 * padding)
    off = W * padding
    u = inner / 64.0  # one design unit

    def P(x, y):
        return (off + x * u, off + y * u)

    # two panels, right one lifted, drawn as round-capped bars
    def bar(x1, y, x2, w):
        d.line([P(x1, y), P(x2, y)], fill=FIELD, width=int(w * u))
        r = w * u / 2
        for cx in (x1, x2):
            px, py = P(cx, y)
            d.ellipse([px - r, py - r, px + r, py + r], fill=FIELD)

    bar(12, 41, 33, 7)
    bar(33, 33, 52, 7)
    px, py = P(33, 19)
    r = 4.5 * u
    d.ellipse([px - r, py - r, px + r, py + r], fill=OLIVE_LIGHT)
    return img.resize((size, size), Image.LANCZOS)


def main():
    icons = ROOT / "icons"
    icons.mkdir(exist_ok=True)
    mark(192).save(icons / "icon-192.png")
    mark(512).save(icons / "icon-512.png")
    mark(512, padding=0.12, radius=0.0).save(icons / "icon-maskable-512.png")

    # OG image 1200x630: field background, mark, wordmark drawn as simple text-free composition
    og = Image.new("RGB", (1200, 630), FIELD)
    m = mark(260)
    og.paste(m, (80, 185), m)
    d = ImageDraw.Draw(og)
    # Olive band at the bottom as a simple brand cue
    d.rectangle([0, 560, 1200, 630], fill=OLIVE_DEEP)
    og.save(ROOT / "og.png", optimize=True)
    print("icons written to", icons)


if __name__ == "__main__":
    main()
