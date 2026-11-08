# Haber gorsel kutuphanesi: Wikimedia Commons'tan lisansi uygun (CC0/PD/CC BY/CC BY-SA) fotograflar indirir.
# Cikti: apps/mobile/assets/haber/<anahtar>.jpg + apps/mobile/assets/haber/KAYNAKLAR.json (yazar + lisans).
import json, os, re, sys, urllib.parse, urllib.request, io
from PIL import Image
ROOT = os.path.join(os.path.dirname(__file__), '..', 'apps', 'mobile', 'assets', 'haber')
os.makedirs(ROOT, exist_ok=True)
UA = {'User-Agent': 'TarimPusulaBot/1.0 (https://tarimpusula.onrender.com; ileti@tarimpusula.onrender.com) python-urllib'}
OK = re.compile(r'^(CC0|Public domain|PD|CC BY(-SA)? [0-9.]+)', re.I)
KONULAR = {
 'inek': 'dairy cow pasture', 'koyun': 'sheep flock grazing', 'ari': 'honey bee beehive frame',
 'bugday': 'wheat field ripe ears', 'misir': 'corn field green maize plants rows', 'pamuk': 'cotton field open bolls',
 'domates': 'tomato plants fruit greenhouse', 'uzum': 'vineyard grape bunches', 'narenciye': 'orange tree fruit orchard',
 'findik': 'hazelnut Corylus avellana nuts', 'cay': 'tea plantation', 'sera': 'greenhouse vegetables rows',
 'sulama': 'drip irrigation field', 'don': 'hoar frost on plants winter morning', 'kuraklik': 'drought cracked soil field',
 'patates': 'potato field plants', 'aycicegi': 'sunflower field', 'bakliyat': 'lentil plants field',
 'meyve': 'apple orchard blossom', 'pancar': 'sugar beet field green leaves', 'toplanti': 'farmers training workshop agriculture extension',
 'tavuk': 'free range chickens farm', 'zeytin': 'olive grove trees Mediterranean', 'fistik': 'pistachio nuts on tree Pistacia vera',
}
def api(q):
    u = 'https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({
        'action': 'query', 'format': 'json', 'generator': 'search', 'gsrnamespace': 6, 'gsrlimit': 30,
        'gsrsearch': q + ' filetype:bitmap', 'prop': 'imageinfo', 'iiprop': 'url|extmetadata|size|mime', 'iiurlwidth': 900})
    return json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60))
kay = {}
yol = os.path.join(ROOT, 'KAYNAKLAR.json')
if os.path.exists(yol): kay = json.load(open(yol, encoding='utf8'))
hedef = sys.argv[1:] or list(KONULAR)
for k in hedef:
    if os.path.exists(os.path.join(ROOT, k + '.jpg')): continue
    try: pages = (api(KONULAR[k]).get('query') or {}).get('pages', {})
    except Exception as e: print(k, 'api hata', e); continue
    adaylar = sorted(pages.values(), key=lambda p: p.get('index', 99))
    for p in adaylar:
        ii = (p.get('imageinfo') or [{}])[0]
        if ii.get('mime') != 'image/jpeg' or (ii.get('width') or 0) < 900: continue
        m = ii.get('extmetadata', {})
        lic = m.get('LicenseShortName', {}).get('value', '')
        if not OK.match(lic): continue
        yazar = re.sub(r'<[^>]+>', '', m.get('Artist', {}).get('value', '')).strip()[:80]
        try:
            raw = urllib.request.urlopen(urllib.request.Request(ii['thumburl'], headers=UA), timeout=90).read()
            im = Image.open(io.BytesIO(raw)).convert('RGB'); im.thumbnail((900, 900))
            im.save(os.path.join(ROOT, k + '.jpg'), quality=78, optimize=True)
        except Exception as e: print(k, 'indirme hata', e); continue
        kay[k] = {'dosya': k + '.jpg', 'baslik': p['title'], 'yazar': yazar, 'lisans': lic, 'sayfa': ii.get('descriptionurl', '')}
        print(k, 'ok', p['title'][:60], lic); break
    else: print(k, 'ADAY YOK')
json.dump(kay, open(yol, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
