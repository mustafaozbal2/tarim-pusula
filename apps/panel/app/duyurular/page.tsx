'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { buildAnnouncement, describeTarget, type AnnouncementForm } from '../lib/announcement';
import { Badge, Button, card, h1, input, label, Message } from '../ui';

interface Crop {
  id: string;
  nameTr: string;
}
interface Managed {
  id: string;
  title: string;
  sourceOrg: string;
  publishedAt: string;
  reviewStatus: string;
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
  cropIds: [],
};

/** Duyuru yazma ve hedef seçimi. Kaydedilen duyuru uzman onayına düşer; onaylanana dek rozetli görünür. */
export default function Announcements() {
  const [form, setForm] = useState<AnnouncementForm>({ ...EMPTY, publishDate: today() });
  const [provinces, setProvinces] = useState<string[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [list, setList] = useState<Managed[]>([]);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

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

  const set = <K extends keyof AnnouncementForm>(k: K, v: AnnouncementForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const cropNames = crops.filter((c) => form.cropIds.includes(c.id)).map((c) => c.nameTr);

  const publish = async () => {
    setMsg(null);
    const built = buildAnnouncement(form);
    if (!built.ok) {
      setMsg({ kind: 'error', text: built.error });
      return;
    }
    setBusy(true);
    try {
      await api('POST', '/announcements', built.value);
      setMsg({
        kind: 'ok',
        text: 'Duyuru kaydedildi. Uzman onayı bekliyor; çiftçilere rozetle görünür, bildirim gitmez.',
      });
      setForm({ ...EMPTY, publishDate: today() });
      await reload();
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof ApiError ? e.message : 'Kaydedilemedi' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1 style={h1}>Duyurular</h1>
      <section style={card} aria-label="Yeni duyuru">
        <h2 style={{ fontSize: 22, margin: 0 }}>Yeni duyuru</h2>

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
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
        />

        <label htmlFor="d-metin" style={label}>
          Duyuru metni
        </label>
        <textarea
          id="d-metin"
          data-testid="duyuru-metin"
          rows={4}
          style={{ ...input, padding: 14, minHeight: 120 }}
          value={form.body}
          onChange={(e) => set('body', e.target.value)}
        />

        <label htmlFor="d-url" style={label}>
          Kaynak bağlantısı (isteğe bağlı)
        </label>
        <input
          id="d-url"
          style={input}
          value={form.sourceUrl}
          onChange={(e) => set('sourceUrl', e.target.value)}
        />

        <label htmlFor="d-yayin" style={label}>
          Yayın tarihi
        </label>
        <input
          id="d-yayin"
          type="date"
          style={input}
          value={form.publishDate}
          onChange={(e) => set('publishDate', e.target.value)}
        />

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

        <h3 style={{ fontSize: 20, marginTop: 24 }}>Kime gösterilsin?</h3>
        <label htmlFor="d-il" style={label}>
          İl
        </label>
        <select
          id="d-il"
          data-testid="duyuru-il"
          style={input}
          value={form.province}
          onChange={(e) => setForm((f) => ({ ...f, province: e.target.value, district: '' }))}
        >
          <option value="">Tüm Türkiye</option>
          {provinces.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <label htmlFor="d-ilce" style={label}>
          İlçe (isteğe bağlı)
        </label>
        <select
          id="d-ilce"
          style={input}
          value={form.district}
          disabled={!form.province}
          onChange={(e) => set('district', e.target.value)}
        >
          <option value="">Tüm ilçeler</option>
          {districts.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <label htmlFor="d-urun" style={label}>
          Ürün (boşsa tüm ürünler)
        </label>
        <select
          id="d-urun"
          data-testid="duyuru-urun"
          multiple
          size={6}
          style={{ ...input, minHeight: 160 }}
          value={form.cropIds}
          onChange={(e) =>
            set(
              'cropIds',
              Array.from(e.target.selectedOptions, (o) => o.value),
            )
          }
        >
          {crops.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nameTr}
            </option>
          ))}
        </select>

        <p data-testid="duyuru-hedef" style={{ fontSize: 18 }}>
          <strong>Hedef:</strong> {describeTarget(form, cropNames)}
        </p>

        <Button testId="duyuru-yayinla" disabled={busy} onClick={() => void publish()}>
          Yayınla
        </Button>
        {msg ? <Message kind={msg.kind}>{msg.text}</Message> : null}
      </section>

      <section aria-label="Duyurularım">
        <h2 style={{ fontSize: 22 }}>Yazılan duyurular</h2>
        {list.length === 0 ? <p>Henüz duyuru yok.</p> : null}
        {list.map((a) => (
          <div key={a.id} style={card}>
            <strong>{a.title}</strong>
            <div style={{ margin: '6px 0' }}>
              {a.sourceOrg} · {new Date(a.publishedAt).toLocaleDateString('tr-TR')}
            </div>
            {a.reviewStatus === 'uzman-onayli' ? (
              <Badge>Yayında (uzman onaylı)</Badge>
            ) : (
              <Badge>Uzman onayı bekliyor</Badge>
            )}
          </div>
        ))}
      </section>
    </>
  );
}
