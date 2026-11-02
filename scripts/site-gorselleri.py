"""Tanıtım sitesi (site/) görsellerini üretir: telefon ekran görüntüleri, arka plan fotoğrafları, ürün kartları,
WhatsApp paylaşım önizlemesi (og.jpg). Kaynaklar: images/ ve images/duyuru/ (fotoğraf atıfları KAYNAKLAR.json).

Ekran görüntüleri telefon testinde alınmıştır (demo veri); durum çubuğu (saat, pil) kırpılır.
Kullanım: python scripts/site-gorselleri.py <ekran-goruntuleri-klasoru>
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "images"
OUT = ROOT / "site" / "img"
OUT.mkdir(parents=True, exist_ok=True)

EKRANLAR = {
    "ana": "a05",
    "hava": "b07",
    "tasarruf": "b05",
    "uzman": "b09",
    "haber": "c03",
    "pazar": "d_pazar",
}
ARKA = ["genis_tarla", "genis_fistik", "genis_iklim", "genis_hizmet"]


def kaydet(im: Image.Image, ad: str, genislik: int, kalite: int = 78) -> None:
    im = im.convert("RGB")
    if im.width > genislik:
        im = im.resize((genislik, round(im.height * genislik / im.width)), Image.LANCZOS)
    im.save(OUT / ad, quality=kalite, optimize=True, progressive=True)


def main() -> None:
    klasor = Path(sys.argv[1])
    for ad, dosya in EKRANLAR.items():
        im = Image.open(klasor / f"{dosya}.png").convert("RGB")
        im = im.crop((0, 96, im.width, im.height))  # durum çubuğu (saat, pil, bildirim simgeleri)
        kaydet(im, f"ekran_{ad}.jpg", 520, 80)
    for ad in ARKA:
        kaydet(Image.open(IMG / f"{ad}.jpg"), f"{ad}.jpg", 1280, 80)
    for ad in ("kiraz_bahce", "kiraz_cicek", "fistik_sira", "fistik_salkim", "zeytin_ortu", "zeytin_kasa"):
        kaydet(Image.open(IMG / "duyuru" / f"{ad}.jpg"), f"{ad}.jpg", 900, 78)
    Image.open(IMG / "logo_daire.png").resize((256, 256), Image.LANCZOS).save(OUT / "amblem.png", optimize=True)

    # WhatsApp/sosyal paylaşım önizlemesi 1200x630.
    zemin = Image.open(IMG / "genis_tarla.jpg").convert("RGB")
    zemin = zemin.resize((1200, round(zemin.height * 1200 / zemin.width)), Image.LANCZOS)
    zemin = zemin.crop((0, (zemin.height - 630) // 2, 1200, (zemin.height - 630) // 2 + 630))
    kar = Image.new("RGBA", (1200, 630), (10, 44, 40, 205))
    og = Image.alpha_composite(zemin.convert("RGBA"), kar)
    amblem = Image.open(IMG / "logo_daire.png").resize((330, 330), Image.LANCZOS)
    og.alpha_composite(amblem, (90, 150))
    f_bold = next((ROOT / "node_modules" / ".pnpm").glob("@expo-google-fonts+manrope*/node_modules/@expo-google-fonts/manrope/800ExtraBold/*.ttf"))
    f_yari = next((ROOT / "node_modules" / ".pnpm").glob("@expo-google-fonts+manrope*/node_modules/@expo-google-fonts/manrope/600SemiBold/*.ttf"))
    d = ImageDraw.Draw(og)
    d.text((470, 175), "Tarım Pusula", font=ImageFont.truetype(str(f_bold), 88), fill=(255, 255, 255))
    d.text((472, 285), "Bilinçli Tarım, Verimli Üretim", font=ImageFont.truetype(str(f_yari), 42), fill=(178, 226, 218))
    d.rounded_rectangle((472, 370, 960, 436), radius=33, fill=(217, 164, 65))
    d.text((502, 382), "Android için ücretsiz indir", font=ImageFont.truetype(str(f_bold), 34), fill=(14, 59, 55))
    og.convert("RGB").save(OUT / "og.jpg", quality=84, optimize=True)
    print("site/img yazıldı:", len(list(OUT.iterdir())), "dosya")


if __name__ == "__main__":
    main()
