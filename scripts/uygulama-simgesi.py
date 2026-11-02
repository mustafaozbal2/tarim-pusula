"""Uygulama simgesi: eski arşivdeki VEKTÖR amblemden (kökteki `Tarım Pusula/`, git dışı) yalnız ortadaki yuvarlak
Tarım Pusula amblemini (çiftçi, başak, yazı halkası) keser; turkuaz kare ve gümüş saat kasası simgede yok.

Üretilenler:
- apps/mobile/assets/icon.png          1024 px, saydam zemin, tam daire (eski Android ve web).
- apps/mobile/assets/adaptive-icon.png Android uyarlanabilir simge ön katmanı: daire, maskenin (72/108) biraz
  dışına taşar; yuvarlak maskeli telefonda simge yalnız amblemdir.
- apps/mobile/assets/adaptive-bg.png   Arka katman: amblem kenar renkleri dışa doğru uzatılır. Köşeli (squircle)
  maskeli telefonlarda (ör. Xiaomi) köşede ayrı renk değil, amblemin kendi kenarı görünür.
- images/logo_daire.png                512 px saydam daire (web sitesi, favicon).
- apps/mobile/public/icon-192.png, icon-512.png (web uygulaması simgesi).
- apps/mobile/assets/splash.png        Açılış ekranı: koyu turkuaz zemin, yuvarlak amblem, ad ve slogan.

Gerekli: pip install pymupdf (yalnız bu betik için; uygulama bağımlılığı değil).
Kullanım: python scripts/uygulama-simgesi.py
"""
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
KAYNAK = (
    ROOT
    / "Tarım Pusula"
    / "pusula tarım pusula web sayfa ghiriş"
    / "tekno tarım pusula web sayfa ghiriş"
    / "tekno tarım pusula"
    / "banner sol logo2.ai"
)
ASSETS = ROOT / "apps" / "mobile" / "assets"
PUBLIC = ROOT / "apps" / "mobile" / "public"
IMAGES = ROOT / "images"


def ciz() -> Image.Image:
    import pymupdf  # noqa: PLC0415 (yalnız bu betikte gerekli)

    page = pymupdf.open(KAYNAK)[0]
    pix = page.get_pixmap(dpi=800)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def daireyi_bul(im: Image.Image) -> tuple[float, float, float]:
    """Amblem diskinin merkezi ve yarıçapı: gümüş kasa (renksiz gri) başlayana kadar 36 yönde ışın."""
    w, h = im.size
    cx, cy = w * 0.5087, h * 0.5595  # kaba merkez (çizimde saat kasası sayfanın ortasında)
    px = im.load()
    for _ in range(3):
        kenar = []
        for a in range(0, 360, 10):
            t = math.radians(a)
            for r in range(int(h * 0.2), int(h * 0.32)):
                x, y = round(cx + r * math.cos(t)), round(cy + r * math.sin(t))
                p = px[x, y]
                if max(p) - min(p) < 6 and max(p) > 40:
                    kenar.append((x, y))
                    break
        xs = np.array([k[0] for k in kenar], float)
        ys = np.array([k[1] for k in kenar], float)
        # En küçük kareler çember uydurma (Kasa yöntemi).
        A = np.c_[2 * xs, 2 * ys, np.ones_like(xs)]
        b = xs**2 + ys**2
        (cx, cy, c), *_ = np.linalg.lstsq(A, b, rcond=None)
    r = math.sqrt(c + cx**2 + cy**2)
    return cx, cy, r


def disk(im: Image.Image, cx: float, cy: float, r: float, boy: int) -> Image.Image:
    """Daireyi kesip boy x boy saydam tuvale koyar; kenar 4x örneklemeyle yumuşatılır."""
    r_in = r - 4  # gri kasanın yumuşatma pikselleri girmesin
    kare = im.crop((round(cx - r_in), round(cy - r_in), round(cx + r_in), round(cy + r_in)))
    kare = kare.resize((boy, boy), Image.LANCZOS).convert("RGBA")
    m = Image.new("L", (boy * 4, boy * 4), 0)
    ImageDraw.Draw(m).ellipse((0, 0, boy * 4 - 1, boy * 4 - 1), fill=255)
    kare.putalpha(m.resize((boy, boy), Image.LANCZOS))
    return kare


def tuvale(d: Image.Image, boy: int, cap: int) -> Image.Image:
    t = Image.new("RGBA", (boy, boy), (0, 0, 0, 0))
    k = d.resize((cap, cap), Image.LANCZOS)
    t.alpha_composite(k, ((boy - cap) // 2, (boy - cap) // 2))
    return t


def kenar_uzat(d: Image.Image, boy: int, cap: int) -> Image.Image:
    """Arka katman: her pikselde, aynı açıdaki amblem kenar rengi (dış halkanın %95'i); hafif koyu ve bulanık."""
    src = np.asarray(d.convert("RGB").resize((cap, cap), Image.LANCZOS), dtype=np.float32)
    yy, xx = np.mgrid[0:boy, 0:boy].astype(np.float32)
    c = (boy - 1) / 2
    ang = np.arctan2(yy - c, xx - c)
    rr = cap / 2 * 0.95
    sx = np.clip(np.round(cap / 2 + rr * np.cos(ang)), 0, cap - 1).astype(int)
    sy = np.clip(np.round(cap / 2 + rr * np.sin(ang)), 0, cap - 1).astype(int)
    out = src[sy, sx] * 0.82
    bg = Image.fromarray(out.clip(0, 255).astype(np.uint8), "RGB")
    return bg.filter(ImageFilter.GaussianBlur(boy / 40))


ZEMIN = (14, 59, 55)  # #0E3B37: açılış zemini (app.json splash.backgroundColor ile aynı)
FONT = next(
    (ROOT / "node_modules" / ".pnpm").glob(
        "@expo-google-fonts+manrope*/node_modules/@expo-google-fonts/manrope/800ExtraBold/*.ttf"
    ),
    None,
)
FONT_YARI = next(
    (ROOT / "node_modules" / ".pnpm").glob(
        "@expo-google-fonts+manrope*/node_modules/@expo-google-fonts/manrope/600SemiBold/*.ttf"
    ),
    None,
)


def acilis(d: Image.Image) -> Image.Image:
    from PIL import ImageFont  # noqa: PLC0415

    w, h = 1284, 2778
    t = Image.new("RGBA", (w, h), ZEMIN + (255,))
    cap = 640
    y0 = h // 2 - cap // 2 - 160
    t.alpha_composite(d.resize((cap, cap), Image.LANCZOS), ((w - cap) // 2, y0))
    dr = ImageDraw.Draw(t)
    for metin, font, boy, renk, dy in (
        ("TARIM PUSULA", FONT, 104, (255, 255, 255), 90),
        ("Bilinçli Tarım, Verimli Üretim", FONT_YARI, 50, (178, 226, 218), 230),
    ):
        f = ImageFont.truetype(str(font), boy)
        x0, _, x1, _ = dr.textbbox((0, 0), metin, font=f)
        dr.text(((w - (x1 - x0)) // 2, y0 + cap + dy), metin, font=f, fill=renk)
    return t.convert("RGB")


def main() -> None:
    if not KAYNAK.exists():
        print("Arşiv yok (Tarım Pusula/); hiçbir şey yapılmadı.")
        return
    im = ciz()
    cx, cy, r = daireyi_bul(im)
    print(f"amblem dairesi: merkez ({cx:.0f}, {cy:.0f}), yarıçap {r:.0f} px")
    d = disk(im, cx, cy, r, 1024)

    tuvale(d, 1024, 1000).save(ASSETS / "icon.png", optimize=True)
    # Uyarlanabilir simge: görünür daire 1024*72/108 = 683 px; amblem 720 px (kenar maskenin hemen dışında).
    tuvale(d, 1024, 720).save(ASSETS / "adaptive-icon.png", optimize=True)
    kenar_uzat(d, 1024, 720).save(ASSETS / "adaptive-bg.png", optimize=True)
    tuvale(d, 512, 504).save(IMAGES / "logo_daire.png", optimize=True)
    for n in (192, 512):
        tuvale(d, n, n - 4).save(PUBLIC / f"icon-{n}.png", optimize=True)
    acilis(d).save(ASSETS / "splash.png", optimize=True)
    print("icon.png, adaptive-icon.png, adaptive-bg.png, splash.png, logo_daire.png, icon-192/512.png yazıldı")


if __name__ == "__main__":
    main()
