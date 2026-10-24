'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { statusLabel } from '../lib/labels';
import {
  Badge,
  Button,
  card,
  ConfirmDialog,
  DataTable,
  h2,
  input,
  label,
  Message,
  PageTitle,
} from '../ui';

interface Stage {
  seq: number;
  nameTr: string;
  kc: string | null;
  frostCriticalC: string | null;
  reviewStatus: string;
  source: string;
}
interface Pack {
  packId: string;
  cropName: string;
  version: number;
  reviewStatus: string;
  kcIni: string;
  kcMid: string;
  kcEnd: string;
  source: string;
  stages: Stage[];
}
interface Pending {
  path: string;
  title: string;
  text: string;
  confirm: string;
  ok: string;
}

const kc = (v: string | null) =>
  v === null ? '-' : Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2 });

/**
 * Bitki paketleri (Kc): eski uygulamadaki Bitki türü + Kc tablosu. Arama, süzgeç, sıralama, sayfalama.
 * Değerler sürümlüdür ve silinmez (denetlenebilirlik); değişiklik "Evre ekle" ile yeni, kaynaklı, taslak
 * kayıt olarak girilir ve başka bir uzman onaylar (dört göz). Onaylı paket gerekçeyle geri çekilebilir.
 */
export default function Packs() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [f, setF] = useState({ name: '', frost: '', kc: '', source: '' });
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const reload = useCallback(
    () =>
      api<Pack[]>('GET', '/panel/packs')
        .then(setPacks)
        .catch(() => undefined),
    [],
  );
  useEffect(() => {
    void reload();
  }, [reload]);

  const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

  const add = async (packId: string) => {
    setMsg(null);
    try {
      await api('POST', `/panel/packs/${packId}/stages`, {
        nameTr: f.name,
        frostCriticalC: num(f.frost),
        kc: num(f.kc),
        source: f.source,
      });
      setMsg({ kind: 'ok', text: 'Evre kaydedildi. Başka bir uzmanın onayını bekliyor.' });
      setF({ name: '', frost: '', kc: '', source: '' });
      await reload();
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof ApiError ? e.message : 'Kaydedilemedi' });
    }
  };

  const withdraw = async (path: string, ok: string, reason: string) => {
    setMsg(null);
    try {
      await api('POST', path, { reason });
      setMsg({ kind: 'ok', text: ok });
      await reload();
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof ApiError ? e.message : 'İşlem yapılamadı' });
    }
  };

  const current = packs.find((p) => p.packId === open) ?? null;

  return (
    <>
      <PageTitle title="Bitki paketleri (Kc)" trail={['Bitki paketleri (Kc)']} />
      {msg ? <Message kind={msg.kind}>{msg.text}</Message> : null}
      <section style={card} aria-label="Bitki türü ve Kc tablosu">
        <h2 style={h2}>Bitki türü ve Kc</h2>
        <DataTable
          testId="kc-tablo"
          searchLabel="Bitki ara"
          searchKeys={['bitki', 'kaynak']}
          empty="Kayıt yok."
          columns={[
            { key: 'bitki', title: 'Bitki türü', sortable: true },
            { key: 'surum', title: 'Sürüm', sortable: true },
            { key: 'ilk', title: 'Kc ilk', sortable: true },
            { key: 'orta', title: 'Kc orta', sortable: true },
            { key: 'son', title: 'Kc son', sortable: true },
            {
              key: 'durum',
              title: 'Onay',
              sortable: true,
              filter: true,
              render: (r) => (
                <Badge tone={statusLabel(String(r['durumKod'])).tone}>{String(r['durum'])}</Badge>
              ),
            },
            { key: 'kaynak', title: 'Kaynak' },
          ]}
          rows={packs.map((p) => ({
            id: p.packId,
            bitki: p.cropName,
            surum: p.version,
            ilk: kc(p.kcIni),
            orta: kc(p.kcMid),
            son: kc(p.kcEnd),
            durum: statusLabel(p.reviewStatus).text,
            durumKod: p.reviewStatus,
            kaynak: p.source,
          }))}
          actions={(r) => {
            const p = packs.find((x) => x.packId === r.id)!;
            return (
              <>
                <Button
                  small
                  variant="secondary"
                  testId="paket-duzenle"
                  onClick={() => setOpen(open === r.id ? null : r.id)}
                >
                  Evre ekle
                </Button>
                {p.reviewStatus === 'uzman-onayli' ? (
                  <Button
                    small
                    variant="danger"
                    testId="paket-geri-cek"
                    onClick={() =>
                      setPending({
                        path: `/panel/packs/${p.packId}/revoke`,
                        title: 'Paket onayı geri çekilsin mi?',
                        text: `${p.cropName} paketi taslağa döner; yeniden onaylanana dek öneri üretmez.`,
                        confirm: 'Onayı geri çek',
                        ok: 'Paket onayı geri çekildi.',
                      })
                    }
                  >
                    Onayı geri çek
                  </Button>
                ) : null}
              </>
            );
          }}
        />
      </section>

      {current ? (
        <section style={card} data-testid="paket" aria-label="Evreler">
          <h2 style={h2}>
            {current.cropName} · sürüm {current.version} evreleri
          </h2>
          {current.stages.length === 0 ? <p>Evre yok.</p> : null}
          {current.stages.map((s) => (
            <div key={s.seq} style={{ padding: '4px 0' }}>
              {s.nameTr}
              {s.frostCriticalC !== null ? ` · don eşiği ${s.frostCriticalC} °C` : ''}
              {s.kc !== null ? ` · Kc ${s.kc}` : ''} ·{' '}
              <Badge tone={statusLabel(s.reviewStatus).tone}>
                {statusLabel(s.reviewStatus).text}
              </Badge>
              {s.reviewStatus === 'uzman-onayli' ? (
                <Button
                  small
                  variant="secondary"
                  onClick={() =>
                    setPending({
                      path: `/panel/packs/${current.packId}/stages/${s.seq}/revoke`,
                      title: 'Evre onayı geri çekilsin mi?',
                      text: `${s.nameTr} evresi taslağa döner; yeniden onaylanana dek uyarı üretmez.`,
                      confirm: 'Onayı geri çek',
                      ok: 'Evre onayı geri çekildi.',
                    })
                  }
                >
                  Onayı geri çek
                </Button>
              ) : null}
            </div>
          ))}
          <h3 style={{ ...h2, marginTop: 12 }}>Yeni evre (taslak başlar, başka uzman onaylar)</h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '0 12px',
            }}
          >
            <div>
              <label htmlFor="e-ad" style={label}>
                Evre adı
              </label>
              <input
                id="e-ad"
                style={input}
                value={f.name}
                onChange={(e) => setF({ ...f, name: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="e-don" style={label}>
                Don eşiği, °C (isteğe bağlı)
              </label>
              <input
                id="e-don"
                style={input}
                inputMode="decimal"
                value={f.frost}
                onChange={(e) => setF({ ...f, frost: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="e-kc" style={label}>
                Bitki katsayısı Kc (isteğe bağlı)
              </label>
              <input
                id="e-kc"
                style={input}
                inputMode="decimal"
                value={f.kc}
                onChange={(e) => setF({ ...f, kc: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="e-kaynak" style={label}>
                Kaynak (zorunlu)
              </label>
              <input
                id="e-kaynak"
                style={input}
                value={f.source}
                onChange={(e) => setF({ ...f, source: e.target.value })}
              />
            </div>
          </div>
          <Button onClick={() => void add(current.packId)}>Kaydet</Button>
          <Button variant="secondary" onClick={() => setOpen(null)}>
            İptal
          </Button>
        </section>
      ) : null}

      {pending ? (
        <ConfirmDialog
          danger
          askReason
          title={pending.title}
          text={pending.text}
          confirmLabel={pending.confirm}
          onCancel={() => setPending(null)}
          onConfirm={(reason) => {
            const p = pending;
            setPending(null);
            void withdraw(p.path, p.ok, reason);
          }}
        />
      ) : null}
    </>
  );
}
