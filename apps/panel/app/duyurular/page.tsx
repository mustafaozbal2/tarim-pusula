'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildAnnouncement,
  describeTarget,
  formFromManaged,
  IMAGE_MAX_CHARS,
  imageFits,
  targetLabel,
  type AnnouncementForm,
} from '../lib/announcement';
import { api, ApiError } from '../lib/api';
import { statusLabel } from '../lib/labels';
import {
  Badge,
  Button,
  C,
  card,
  ConfirmDialog,
  DataTable,
  h2,
  input,
  label,
  Message,
  PageTitle,
} from '../ui';

interface Crop {
  id: string;
  nameTr: string;
}
interface Managed {
  id: string;
  title: string;
  body: string;
  sourceOrg: string;
  publishedAt: string;
  reviewStatus: string;
  hasImage: boolean;
  targeting: {
    places: { province: string; district?: string; village?: string }[];
    cropIds: string[];
  };
}

const today = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

const EMPTY: AnnouncementForm = {
  sourceOrg: '',
  title: '',
  body: '',
  sourceUrl: '',
  publishDate: '',
  expireDate: '',
  province: '',
  district: '',
  village: '',
  cropIds: [],
  imageDataUrl: null,
};

/** Seçilen dosyayı küçültüp (en çok 800 px, jpeg) veri adresine çevirir; sınıra sığmazsa hata verir. */
async function readImage(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type))
    throw new Error('Görsel png, jpeg ya da webp olmalı');
  const raw = await new Promise<string>((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => fail(new Error('Dosya okunamadı'));
    r.readAsDataURL(file);
  });
  if (imageFits(raw)) return raw;
  const img = await new Promise<HTMLImageElement>((ok, fail) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => fail(new Error('Görsel açılamadı'));
    i.src = raw;
  });
  const scale = Math.min(1, 800 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  const out = c.toDataURL('image/jpeg', 0.8);
  if (!imageFits(out))
    throw new Error(`Görsel çok büyük (en çok ~${Math.round(IMAGE_MAX_CHARS / 1400)} KB)`);
  return out;
}

/**
 * Duyuru ve içerik: yeni duyuru formu (içerik türü, ürün, yayın türü, başlık, metin, görsel, hedefleme)
 * + telefon çerçevesinde canlı önizleme + yazılan duyuruların listesi (arama, süzgeç, sıralama, sayfalama,
 * Düzenle / Sil). Kaydedilen duyuru uzman onayına düşer; onaylanana dek rozetli görünür. Düzenleme onayı sıfırlar.
 */
export default function Announcements() {
  const [form, setForm] = useState<AnnouncementForm>({ ...EMPTY, publishDate: today() });
  const [immediate, setImmediate] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [provinces, setProvinces] = useState<string[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [villages, setVillages] = useState<string[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [list, setList] = useState<Managed[]>([]);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<Managed | null>(null);

  const reload = useCallback(
    () =>
      api<Managed[]>('GET', '/announcements/managed')
        .then(setList)
        .catch(() => undefined),
    [],
  );
  useEffect(() => {
    void api<string[]>('GET', '/places/provinces')
      .then(setProvinces)
      .catch(() => undefined);
    void api<Crop[]>('GET', '/crops')
      .then(setCrops)
      .catch(() => undefined);
    void reload();
  }, [reload]);
  useEffect(() => {
    if (!form.province) {
      setDistricts([]);
      return;
    }
    void api<string[]>('GET', `/places/districts?province=${encodeURIComponent(form.province)}`)
      .then(setDistricts)
      .catch(() => setDistricts([]));
  }, [form.province]);
  useEffect(() => {
    if (!form.province || !form.district) {
      setVillages([]);
      return;
    }
    void api<{ name: string }[]>(
      'GET',
      `/places/villages?province=${encodeURIComponent(form.province)}&district=${encodeURIComponent(form.district)}`,
    )
      .then((v) => setVillages(v.map((x) => x.name)))
      .catch(() => setVillages([]));
  }, [form.province, form.district]);

  const set = <K extends keyof AnnouncementForm>(k: K, v: AnnouncementForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const cropNames = crops.filter((c) => form.cropIds.includes(c.id)).map((c) => c.nameTr);
  const cropMap = useMemo(() => Object.fromEntries(crops.map((c) => [c.id, c.nameTr])), [crops]);

  const reset = () => {
    setForm({ ...EMPTY, publishDate: today() });
    setImmediate(true);
    setEditing(null);
  };

  const submit = async () => {
    setMsg(null);
    const built = buildAnnouncement(form);
    if (!built.ok) {
      setMsg({ kind: 'error', text: built.error });
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await api('PUT', `/announcements/${editing}`, built.value);
        setMsg({
          kind: 'ok',
          text: 'Duyuru güncellendi. Onay sıfırlandı: uzman onayı bekliyor, çiftçilere rozetle görünür.',
        });
      } else {
        await api('POST', '/announcements', built.value);
        setMsg({
          kind: 'ok',
          text: 'Duyuru kaydedildi. Uzman onayı bekliyor; çiftçilere rozetle görünür, bildirim gitmez.',
        });
      }
      reset();
      await reload();
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof ApiError ? e.message : 'Kaydedilemedi' });
    } finally {
      setBusy(false);
    }
  };

  const startEdit = async (id: string) => {
    setMsg(null);
    try {
      const one = await api<Parameters<typeof formFromManaged>[0]>(
        'GET',
        `/announcements/managed/${id}`,
      );
      setForm(formFromManaged(one));
      setImmediate(false);
      setEditing(id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof ApiError ? e.message : 'Açılamadı' });
    }
  };

  const remove = async (a: Managed) => {
    setToDelete(null);
    try {
      await api('DELETE', `/announcements/${a.id}`);
      setMsg({ kind: 'ok', text: 'Duyuru silindi (denetim kaydına yazıldı).' });
      if (editing === a.id) reset();
      await reload();
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof ApiError ? e.message : 'Silinemedi' });
    }
  };

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    setMsg(null);
    try {
      set('imageDataUrl', await readImage(file));
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    }
  };

  const addText = (s: string) => set('body', `${form.body}${s}`);

  return (
    <>
      <PageTitle title="Duyurular" trail={['Duyuru ve içerik', 'Duyurular']} />
      {msg ? <Message kind={msg.kind}>{msg.text}</Message> : null}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <section style={{ ...card, flex: '1 1 520px', minWidth: 320 }} aria-label="Duyuru formu">
          <h2 style={h2}>{editing ? 'Duyuruyu düzenle' : 'Yeni duyuru'}</h2>
          {editing ? (
            <p style={{ fontSize: 13, color: C.amberText, margin: '0 0 6px' }}>
              Kaydedince duyuru tekrar uzman onayına gider; onaylanana kadar rozetli görünür.
            </p>
          ) : null}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '0 12px',
            }}
          >
            <div>
              <label htmlFor="d-tur" style={label}>
                İçerik türü
              </label>
              <select id="d-tur" style={input} value="duyuru" onChange={() => undefined}>
                <option value="duyuru">Duyuru</option>
              </select>
            </div>
            <div>
              <label htmlFor="d-yayin-turu" style={label}>
                Yayın türü
              </label>
              <select
                id="d-yayin-turu"
                data-testid="duyuru-yayin-turu"
                style={input}
                value={immediate ? 'hemen' : 'tarihli'}
                onChange={(e) => {
                  const now = e.target.value === 'hemen';
                  setImmediate(now);
                  if (now) set('publishDate', today());
                }}
              >
                <option value="hemen">Hemen yayınla (bugünün tarihi)</option>
                <option value="tarihli">Tarihli yayın</option>
              </select>
            </div>
          </div>
          <p style={{ fontSize: 12, color: C.muted, margin: '4px 0 0' }}>
            Duyurular uzman onayından sonra yayınlanır. Don, sulama gibi uyarıları sistem üretir;
            elle uyarı yazılamaz.
          </p>

          <label htmlFor="d-kurum" style={label}>
            Kaynak kurum
          </label>
          <input
            id="d-kurum"
            data-testid="duyuru-kurum"
            style={input}
            value={form.sourceOrg}
            onChange={(e) => set('sourceOrg', e.target.value)}
          />

          <label htmlFor="d-baslik" style={label}>
            Başlık
          </label>
          <input
            id="d-baslik"
            data-testid="duyuru-baslik"
            style={input}
            maxLength={160}
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
          />

          <label htmlFor="d-metin" style={label}>
            Duyuru metni
          </label>
          <div style={{ marginBottom: 4 }}>
            <Button small variant="secondary" onClick={() => addText('\n• ')}>
              Madde ekle
            </Button>
            <Button small variant="secondary" onClick={() => addText('\n\n')}>
              Paragraf ekle
            </Button>
          </div>
          <textarea
            id="d-metin"
            data-testid="duyuru-metin"
            rows={5}
            maxLength={2000}
            style={{ ...input, padding: 10, minHeight: 110 }}
            value={form.body}
            onChange={(e) => set('body', e.target.value)}
          />
          <div style={{ fontSize: 12, color: C.muted, textAlign: 'right' }}>
            {form.body.length}/2000
          </div>

          <label htmlFor="d-gorsel" style={label}>
            Görsel (isteğe bağlı, png/jpeg/webp)
          </label>
          <input
            id="d-gorsel"
            data-testid="duyuru-gorsel"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => void pickImage(e.target.files?.[0])}
          />
          {form.imageDataUrl ? (
            <div>
              <Button small variant="secondary" onClick={() => set('imageDataUrl', null)}>
                Görseli kaldır
              </Button>
            </div>
          ) : null}

          <label htmlFor="d-url" style={label}>
            Kaynak bağlantısı (isteğe bağlı)
          </label>
          <input
            id="d-url"
            style={input}
            value={form.sourceUrl}
            onChange={(e) => set('sourceUrl', e.target.value)}
          />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '0 12px',
            }}
          >
            <div>
              <label htmlFor="d-yayin" style={label}>
                Yayın tarihi
              </label>
              <input
                id="d-yayin"
                type="date"
                style={input}
                disabled={immediate}
                value={form.publishDate}
                onChange={(e) => set('publishDate', e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="d-bitis" style={label}>
                Bitiş tarihi (isteğe bağlı)
              </label>
              <input
                id="d-bitis"
                type="date"
                style={input}
                value={form.expireDate}
                onChange={(e) => set('expireDate', e.target.value)}
              />
            </div>
          </div>

          <h3 style={{ ...h2, marginTop: 16 }}>Kime gösterilsin?</h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '0 12px',
            }}
          >
            <div>
              <label htmlFor="d-il" style={label}>
                İl
              </label>
              <select
                id="d-il"
                data-testid="duyuru-il"
                style={input}
                value={form.province}
                onChange={(e) =>
                  setForm((f) => ({ ...f, province: e.target.value, district: '', village: '' }))
                }
              >
                <option value="">Tümü</option>
                {provinces.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="d-ilce" style={label}>
                İlçe
              </label>
              <select
                id="d-ilce"
                data-testid="duyuru-ilce"
                style={input}
                value={form.district}
                disabled={!form.province}
                onChange={(e) => setForm((f) => ({ ...f, district: e.target.value, village: '' }))}
              >
                <option value="">Tümü</option>
                {districts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="d-koy" style={label}>
                Köy
              </label>
              <select
                id="d-koy"
                data-testid="duyuru-koy"
                style={input}
                value={form.village}
                disabled={!form.district}
                onChange={(e) => set('village', e.target.value)}
              >
                <option value="">Tümü</option>
                {villages.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label htmlFor="d-urun" style={label}>
            Ürün (birden çok seçilebilir)
          </label>
          <select
            id="d-urun"
            data-testid="duyuru-urun"
            multiple
            size={6}
            style={{ ...input, minHeight: 120 }}
            value={form.cropIds.length ? form.cropIds : ['']}
            onChange={(e) =>
              set(
                'cropIds',
                Array.from(e.target.selectedOptions, (o) => o.value).filter((v) => v !== ''),
              )
            }
          >
            <option value="">Tümü</option>
            {crops.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameTr}
              </option>
            ))}
          </select>

          <p data-testid="duyuru-hedef" style={{ fontSize: 14 }}>
            <strong>Hedef:</strong> {describeTarget(form, cropNames)}
          </p>

          <Button testId="duyuru-yayinla" disabled={busy} onClick={() => void submit()}>
            {editing ? 'Güncelle' : 'Yayınla'}
          </Button>
          {editing ? (
            <Button variant="secondary" onClick={reset}>
              İptal
            </Button>
          ) : (
            <Button variant="secondary" onClick={reset}>
              Temizle
            </Button>
          )}
        </section>

        <PhonePreview form={form} />
      </div>

      <section style={card} aria-label="Yazılan duyurular">
        <h2 style={h2}>Yazılan duyurular</h2>
        <DataTable
          testId="duyuru-liste"
          searchKeys={['baslik', 'kurum', 'hedef']}
          searchLabel="Duyuru ara"
          empty="Henüz duyuru yok."
          columns={[
            { key: 'baslik', title: 'Başlık', sortable: true },
            { key: 'kurum', title: 'Kaynak kurum', sortable: true, filter: true },
            { key: 'tarih', title: 'Yayın tarihi', sortable: true },
            { key: 'hedef', title: 'Hedef' },
            {
              key: 'durum',
              title: 'Durum',
              sortable: true,
              filter: true,
              render: (r) => {
                const s = statusLabel(String(r['durumKod']));
                return <Badge tone={s.tone}>{s.text}</Badge>;
              },
            },
          ]}
          rows={list.map((a) => ({
            id: a.id,
            baslik: a.title,
            kurum: a.sourceOrg,
            tarih: new Date(a.publishedAt).toLocaleDateString('tr-TR'),
            hedef: targetLabel(a.targeting, cropMap),
            durum: statusLabel(a.reviewStatus).text,
            durumKod: a.reviewStatus,
          }))}
          actions={(r) => (
            <>
              <Button
                small
                variant="secondary"
                testId="duyuru-duzenle"
                onClick={() => void startEdit(r.id)}
              >
                Düzenle
              </Button>
              <Button
                small
                variant="danger"
                testId="duyuru-sil"
                onClick={() => setToDelete(list.find((x) => x.id === r.id) ?? null)}
              >
                Sil
              </Button>
            </>
          )}
        />
      </section>

      {toDelete ? (
        <ConfirmDialog
          danger
          title="Duyuru silinsin mi?"
          text={`"${toDelete.title}" kalıcı olarak silinir. Bu işlem denetim kaydına yazılır.`}
          confirmLabel="Evet, sil"
          onCancel={() => setToDelete(null)}
          onConfirm={() => void remove(toDelete)}
        />
      ) : null}
    </>
  );
}

/** Telefon çerçevesinde canlı önizleme: Duyurular listesindeki satır ve açılan kart (mobildeki görünümle aynı düzen). */
function PhonePreview({ form }: { form: AnnouncementForm }) {
  const date = form.publishDate
    ? new Date(`${form.publishDate}T00:00:00+03:00`).toLocaleDateString('tr-TR')
    : '--.--.----';
  return (
    <aside
      aria-label="Telefon önizlemesi"
      data-testid="duyuru-onizleme"
      style={{
        width: 300,
        flex: '0 0 300px',
        border: '8px solid #1b1b1b',
        borderRadius: 28,
        background: C.bg,
        padding: 10,
        boxSizing: 'border-box',
        minHeight: 380,
      }}
    >
      <div style={{ fontSize: 11, color: C.muted, textAlign: 'center', marginBottom: 6 }}>
        Telefonda böyle görünür
      </div>
      <div style={{ background: C.white, borderRadius: 10, padding: 6 }}>
        <div
          style={{
            display: 'flex',
            background: C.forest,
            borderRadius: 6,
            padding: 3,
            gap: 3,
            marginBottom: 6,
          }}
        >
          <span
            style={{
              flex: 1,
              textAlign: 'center',
              background: C.forest,
              color: C.white,
              fontWeight: 700,
              fontSize: 12,
              padding: '6px 0',
            }}
          >
            Duyurular
          </span>
          <span
            style={{
              flex: 1,
              textAlign: 'center',
              background: C.white,
              color: C.muted,
              fontSize: 12,
              padding: '6px 0',
              borderRadius: 4,
            }}
          >
            Bildirimler
          </span>
        </div>
        <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', minHeight: 44 }}>
          <div
            style={{
              width: 78,
              background: C.forest,
              color: C.white,
              fontSize: 11,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {date}
          </div>
          <div
            style={{
              flex: 1,
              background: C.listGreen,
              color: C.white,
              fontWeight: 700,
              fontSize: 13,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px 8px',
              textAlign: 'center',
            }}
          >
            <span data-testid="onizleme-baslik">{form.title || 'Duyuru başlığı'}</span>
            <span style={{ fontSize: 11, fontWeight: 600 }}>Uzman onayı bekliyor</span>
          </div>
        </div>
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 8, marginTop: 6 }}>
          {form.imageDataUrl ? (
            <img
              src={form.imageDataUrl}
              alt="Duyuru görseli önizlemesi"
              data-testid="onizleme-gorsel"
              style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 6 }}
            />
          ) : null}
          <div style={{ fontWeight: 800, fontSize: 13 }}>{form.title || 'Duyuru başlığı'}</div>
          <div
            style={{ fontSize: 12, whiteSpace: 'pre-wrap', margin: '4px 0' }}
            data-testid="onizleme-metin"
          >
            {form.body || 'Duyuru metni burada görünür.'}
          </div>
          <div style={{ fontSize: 11, color: C.muted }}>
            Kaynak: {form.sourceOrg || '-'} · Yayın: {date}
          </div>
        </div>
      </div>
    </aside>
  );
}
