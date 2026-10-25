"""images/ yer tutucuları: nötr gri zemin, ortada "Resim N". Yalnız Pillow kullanır.
Var olan dosyayı ASLA ezmez (Mustafa gerçek görseli aynı adla koyar). Kullanım: python scripts/gen-images.py"""
import hashlib
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "images"
GRAY = (214, 218, 220)
LINE = (170, 176, 180)
TEXT = (90, 98, 104)


def font(size: int):
    for name in ("arial.ttf", "DejaVuSans.ttf", "LiberationSans-Regular.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def make(path: Path, w: int, h: int, n: int) -> None:
    img = Image.new("RGB", (w, h), GRAY)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w - 1, h - 1], outline=LINE, width=max(2, w // 80))
    d.line([0, 0, w, h], fill=LINE, width=1)
    d.line([0, h, w, 0], fill=LINE, width=1)
    label = f"Resim {n}"
    f = font(max(14, min(w, h) // 6))
    box = d.textbbox((0, 0), label, font=f)
    tw, th = box[2] - box[0], box[3] - box[1]
    pad = max(6, w // 40)
    x0, y0 = (w - tw) / 2 - pad, (h - th) / 2 - pad
    d.rectangle([x0, y0, x0 + tw + 2 * pad, y0 + th + 2 * pad], fill=GRAY)
    d.text(((w - tw) / 2 - box[0], (h - th) / 2 - box[1]), label, fill=TEXT, font=f)
    if path.suffix == ".png":
        img.save(path, "PNG")
    else:
        img.save(path, "JPEG", quality=85)


def main() -> int:
    OUT.mkdir(exist_ok=True)
    manifest = json.loads((OUT / "manifest.json").read_text(encoding="utf-8"))
    made = 0
    reg_path = OUT / ".placeholders.json"
    reg = json.loads(reg_path.read_text(encoding="utf-8")) if reg_path.exists() else {}
    for i, item in enumerate(manifest, start=1):
        path = OUT / item["name"]
        if path.exists():
            continue
        make(path, item["w"], item["h"], i)
        # Yer tutucunun özeti: eşleşen dosya hâlâ yer tutucudur (uygulama ikon için SVG'ye döner).
        reg[item["name"]] = hashlib.sha256(path.read_bytes()).hexdigest()
        made += 1
    reg_path.write_text(json.dumps(reg, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"images: {made} yer tutucu üretildi, {len(manifest) - made} dosya olduğu gibi bırakıldı")
    return 0


if __name__ == "__main__":
    sys.exit(main())
