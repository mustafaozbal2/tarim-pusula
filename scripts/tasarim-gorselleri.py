"""G26 tasarım: eski proje arşivindeki (kökteki `Tarım Pusula/`, git dışı) özgün dosyalardan uygulama görsellerini
üretir ve `images/` altına YAZAR (bilerek üzerine yazar; sonra `pnpm run images`).

- amblem.png: "TARIM PUSULA" yazılı gümüş pusula, SAYDAM zemin (eski dosyada turkuaz kare zemin vardı). Ana sayfa
  yuvası 77x97 olduğundan tuval bu oranda; amblem ortalanır, kenarlar arşivdeki yumuşatılmış (anti-aliased) kesimdir.
- amblem_yalin.png: yazısız pusula (giriş ekranı; yazı uygulamada canlı metin olarak çizilir, her boyutta net).
- giris_fidan.jpg: giriş ekranı arka planı (avuçta gübre ve fide, yumuşak bulanık zemin).

Kullanım: python scripts/tasarim-gorselleri.py
"""
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ARSIV = ROOT / "Tarım Pusula"
WEB = ARSIV / "pusula tarım pusula web sayfa ghiriş" / "tekno tarım pusula web sayfa ghiriş" / "tekno tarım pusula"
RESIM = ARSIV / "pusula takvim mobil arayüz 2023" / "pusula takvim mobil arayüz" / "resimler"
OUT = ROOT / "images"


def tight(im: Image.Image, pad: float = 0.02) -> Image.Image:
    """Saydam kenarları kırpar, çevreye küçük saydam pay bırakır."""
    im = im.convert("RGBA")
    box = im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    im = im.crop(box)
    p = int(max(im.size) * pad)
    canvas = Image.new("RGBA", (im.width + 2 * p, im.height + 2 * p), (0, 0, 0, 0))
    canvas.alpha_composite(im, (p, p))
    return canvas


def fit(im: Image.Image, w: int, h: int) -> Image.Image:
    """Oranı koruyarak w x h saydam tuvale ortalar."""
    scale = min(w / im.width, h / im.height)
    r = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    canvas.alpha_composite(r, ((w - r.width) // 2, (h - r.height) // 2))
    return canvas


# Dikey koyu yeşil geçiş (üstte amblem ve yazı, altta kart okunaklı olsun); fotoğrafa gömülür ki her
# cihazda aynı görünsün ve çalışma anında ek katman çizilmesin. (konum 0..1, opaklık 0..1)
GECIS = [(0.0, 0.80), (0.18, 0.62), (0.42, 0.22), (0.6, 0.18), (0.8, 0.5), (1.0, 0.8)]
KOYU = (9, 38, 31)


def golge(foto: Image.Image) -> Image.Image:
    w, h = foto.size
    maske = Image.new("L", (1, h))
    for y in range(h):
        t = y / (h - 1)
        for (a, oa), (b, ob) in zip(GECIS, GECIS[1:]):
            if a <= t <= b:
                k = (t - a) / (b - a)
                k = k * k * (3 - 2 * k)  # yumuşak (smoothstep) geçiş
                maske.putpixel((0, y), round(255 * (oa + (ob - oa) * k)))
                break
    maske = maske.resize((w, h))
    return Image.composite(Image.new("RGB", (w, h), KOYU), foto, maske)


def main() -> None:
    if not ARSIV.exists():
        print("Arşiv yok (Tarım Pusula/); hiçbir şey yapılmadı.")
        return
    yazili = tight(Image.open(WEB / "ibrahim hocamm-05.png"))
    fit(yazili, 462, 582).save(OUT / "amblem.png", optimize=True)

    yalin = tight(Image.open(WEB / "ibrahim hocam-05.png"))
    h = 640
    yalin.resize((round(yalin.width * h / yalin.height), h), Image.LANCZOS).save(
        OUT / "amblem_yalin.png", optimize=True
    )

    foto = Image.open(RESIM / "Gubre-Cesitleri.jpg").convert("RGB")
    foto = foto.filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))
    foto = ImageEnhance.Color(foto).enhance(1.06)
    golge(foto).save(OUT / "giris_fidan.jpg", quality=88, optimize=True, progressive=True)
    print("amblem.png, amblem_yalin.png, giris_fidan.jpg yazıldı")


if __name__ == "__main__":
    main()
