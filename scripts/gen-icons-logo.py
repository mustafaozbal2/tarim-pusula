"""G23.18: uygulama simgesi ve açılış ekranı Tarım Pusula amblemiyle (images/logo_altin.png, eski proje
arşivinden). Zemin ana sayfa bandının turkuazı. Yalnız Pillow kullanır.

Çıktılar (apps/mobile): assets/icon.png (1024), assets/adaptive-icon.png (1024, saydam, güvenli alan),
assets/splash.png (1284x2778), public/icon-192.png, public/icon-512.png.
Kullanım: python scripts/gen-icons-logo.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
LOGO = ROOT / 'images' / 'logo_altin.png'
APP = ROOT / 'apps' / 'mobile'
BAND = (77, 180, 181)  # #4DB4B5


def parts() -> tuple[Image.Image, Image.Image]:
    """Saat (yazısız) ve tam logo (yazılı), saydam kenarlar kırpılmış."""
    im = Image.open(LOGO).convert('RGBA')
    full = im.crop(im.getchannel('A').getbbox())
    # Saat ile "TARIM PUSULA" yazısı arasında boş satır var: üst parça saat.
    a = im.getchannel('A')
    w, h = im.size
    filled = [any(a.getpixel((x, y)) > 20 for x in range(0, w, 2)) for y in range(h)]
    top = filled.index(True)
    end = top
    while end < h and filled[end]:
        end += 1
    watch = im.crop((0, top, w, end))
    watch = watch.crop(watch.getchannel('A').getbbox())
    return watch, full


def place(canvas: Image.Image, img: Image.Image, max_w: float, max_h: float, cy: float) -> None:
    im = img.copy()
    im.thumbnail((int(max_w), int(max_h)), Image.LANCZOS)
    x = (canvas.width - im.width) // 2
    y = int(cy - im.height / 2)
    canvas.alpha_composite(im, (x, y))


def main() -> int:
    watch, full = parts()
    icon = Image.new('RGBA', (1024, 1024), BAND + (255,))
    place(icon, watch, 820, 820, 512)
    (APP / 'assets').mkdir(exist_ok=True)
    icon.convert('RGB').save(APP / 'assets' / 'icon.png', optimize=True)
    for s in (192, 512):
        icon.convert('RGB').resize((s, s), Image.LANCZOS).save(APP / 'public' / f'icon-{s}.png')
    # Android uyarlanabilir simge: içerik ortadaki %66'lık güvenli alanda kalmalı.
    adaptive = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    place(adaptive, watch, 600, 600, 512)
    adaptive.save(APP / 'assets' / 'adaptive-icon.png', optimize=True)
    splash = Image.new('RGBA', (1284, 2778), BAND + (255,))
    place(splash, full, 760, 900, 1389)
    splash.convert('RGB').save(APP / 'assets' / 'splash.png', optimize=True)
    print('simgeler yazıldı')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
