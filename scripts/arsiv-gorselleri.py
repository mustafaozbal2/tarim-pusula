"""Eski proje arşivinden (kökteki `Tarım Pusula/`, git dışı) seçilen görselleri `images/` altına uygulama
boyutunda kopyalar. Var olan dosyayı EZMEZ (images/ kuralı). Arşiv yoksa hiçbir şey yapmaz.

Kullanım: python scripts/arsiv-gorselleri.py   (sonra: pnpm run images)
Kaynak eşlemesi aşağıdaki tablodadır; her görselin arşivdeki yolu burada kayıtlıdır (kural 6).
"""
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
ARSIV = ROOT / 'Tarım Pusula'
OUT = ROOT / 'images'
M = 'pusula takvim mobil arayüz/pusula takvim mobil arayüz/pusula takvim mobil arayüz/'
G = 'web mobil gri icon/'

# (hedef, kaynak, tür[, kırpma kutusu]) — tür: 'kart' = 300x500 dikey kırpma (slayt), 'ikon' = 256x256 saydam,
# 'genis' = 720x405 yatay kırpma (sayfa başlığı görseli), 'logo' = 1024x1024 kare (uygulama simgesi).
ESLEME = [
    ('kart_6.jpg', 'tarımpusula figma/62739ff586b244145c2c4140.webp', 'kart'),
    ('kart_7.jpg', 'tarımpusula figma/detay1626363417.jpg', 'kart'),
    ('kart_8.jpg', 'tarımpusula figma/esnaf-ve-ciftci-nefes-alamiyor-1014192-5.jpg', 'kart'),
    ('kart_9.jpg', 'tarımpusula figma/index.jpg', 'kart'),
    ('kart_10.jpg', 'tarım pusula pankart ve afişi/anlatım şeması/robotorumcek.png', 'kart'),
    ('kart_11.jpg', 'tarım pusula önce sonra/set-people-working-farm/2831310.jpg', 'kart', (0.52, 0.18, 0.98, 0.95)),
    ('genis_fistik.jpg', 'Fıstığın bol olsun/fıstığın bol olsun.jpg', 'genis'),
    ('kart_12.jpg', M + 'resimler/tarim-teknolojileri-ve-gsdfteelecek.jpg', 'kart'),
    ('ikon_toprak.png', G + 'toprakanaliz2.png', 'ikon'),
    ('ikon_cihaz.png', G + 'sensoricon.png', 'ikon'),
    ('ikon_rapor.png', G + 'katman.png', 'ikon'),
    ('ikon_tarla.png', M + 'icon/land.png', 'ikon'),
    ('ikon_arazi_ekle.png', M + 'icon/araziislemler.png', 'ikon'),
    ('ikon_konum.png', M + 'icon/location.png', 'ikon'),
    ('ikon_ekle.png', M + 'icon/plus.png', 'ikon'),
    ('genis_ciftciler.jpg', 'tarım pusula önce sonra/set-people-working-farm/2831310.jpg', 'genis'),
    ('genis_tarla.jpg', M + 'resimler/tarim-tEMh_cover.jpg', 'genis'),
    ('genis_gubre.jpg', M + 'resimler/Gubre-Cesitleri.jpg', 'genis'),
    ('genis_iklim.jpg', M + 'resimler/evrimagaci.org_public_content_media_01ea55c79b336b020bbc147f90176a9e.jpg', 'genis'),
    ('genis_hizmet.jpg', M + 'resimler/tarimkon-hizmetleri.png', 'genis'),
    ('logo_altin.png', M + 'tekno tarım pusula web sayfa ghiriş/tekno tarım pusula web sayfa ghiriş/tekno tarım pusula/ibrahim hocamm-06.png', 'logo'),
]


def kart(im: Image.Image) -> Image.Image:
    return ImageOps.fit(im.convert('RGB'), (300, 500), Image.LANCZOS, centering=(0.5, 0.45))


def genis(im: Image.Image) -> Image.Image:
    return ImageOps.fit(im.convert('RGB'), (720, 405), Image.LANCZOS, centering=(0.5, 0.5))


def ikon(im: Image.Image) -> Image.Image:
    im = im.convert('RGBA')
    bbox = im.getchannel('A').getbbox() or (0, 0, *im.size)
    im = im.crop(bbox)
    im.thumbnail((232, 232), Image.LANCZOS)
    out = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
    out.paste(im, ((256 - im.width) // 2, (256 - im.height) // 2), im)
    return out


def logo(im: Image.Image) -> Image.Image:
    im = im.convert('RGBA')
    bbox = im.getchannel('A').getbbox() or (0, 0, *im.size)
    im = im.crop(bbox)
    im.thumbnail((1024, 1024), Image.LANCZOS)
    out = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    out.paste(im, ((1024 - im.width) // 2, (1024 - im.height) // 2), im)
    return out


def main() -> int:
    if not ARSIV.exists():
        print('arşiv yok, atlandı')
        return 0
    for hedef, kaynak, tur, *kutu in ESLEME:
        dst = OUT / hedef
        if dst.exists():
            continue  # var olanı asla ezme
        src = ARSIV / kaynak
        im = Image.open(src)
        im.seek(0)
        if kutu:  # isteğe bağlı kırpma kutusu (oran olarak: sol, üst, sağ, alt)
            l, t, r, b = kutu[0]
            im = im.convert('RGBA').crop((int(l * im.width), int(t * im.height), int(r * im.width), int(b * im.height)))
        if tur == 'kart':
            kart(im).save(dst, quality=85)
        elif tur == 'genis':
            genis(im).save(dst, quality=85)
        elif tur == 'ikon':
            ikon(im).save(dst, optimize=True)
        else:
            logo(im).save(dst, optimize=True)
        print('yazıldı', hedef, '<-', kaynak)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
