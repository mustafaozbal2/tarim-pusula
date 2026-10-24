"""Yer tutucu logo: koyu yeşil zemin, pusula (kehribar halka, beyaz ibre). Yalnız Pillow kullanır.
Çıktılar: assets/icon.png (1024), assets/adaptive-icon.png, assets/splash.png, public/icon-192|512.png."""
import math
import sys
from pathlib import Path
from PIL import Image, ImageDraw

FOREST = (6, 77, 59)
AMBER = (242, 193, 78)
WHITE = (255, 255, 255)
LIST = (27, 127, 90)


def compass(size: int, bg=FOREST, pad: float = 0.0, transparent=False) -> Image.Image:
    s = size * 4  # kenar yumuşatma için büyük çiz, küçült
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0) if transparent else bg + (255,))
    d = ImageDraw.Draw(img)
    c = s / 2
    r = s * (0.36 - pad)
    d.ellipse([c - r, c - r, c + r, c + r], outline=AMBER, width=int(s * 0.04))
    r2 = r * 0.84
    d.ellipse([c - r2, c - r2, c + r2, c + r2], fill=LIST)
    # ibre: kuzey beyaz, güney kehribar
    def pt(angle, dist):
        return (c + math.sin(angle) * dist, c - math.cos(angle) * dist)
    ang = math.radians(35)
    n, so = pt(ang, r2 * 0.78), pt(ang + math.pi, r2 * 0.78)
    l, rr = pt(ang - math.pi / 2, r2 * 0.2), pt(ang + math.pi / 2, r2 * 0.2)
    d.polygon([n, l, rr], fill=WHITE)
    d.polygon([so, l, rr], fill=AMBER)
    d.ellipse([c - s * 0.02, c - s * 0.02, c + s * 0.02, c + s * 0.02], fill=FOREST)
    return img.resize((size, size), Image.LANCZOS)


def main(root: Path) -> None:
    (root / "assets").mkdir(exist_ok=True)
    compass(1024).convert("RGB").save(root / "assets" / "icon.png")
    compass(1024, pad=0.06, transparent=True).save(root / "assets" / "adaptive-icon.png")
    splash = Image.new("RGB", (1284, 2778), FOREST)
    logo = compass(512, transparent=True)
    splash.paste(logo, ((1284 - 512) // 2, (2778 - 512) // 2 - 120), logo)
    splash.save(root / "assets" / "splash.png")
    for n in (192, 512):
        compass(n).convert("RGB").save(root / "public" / f"icon-{n}.png")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
