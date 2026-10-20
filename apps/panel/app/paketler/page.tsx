'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { Badge, Button, card, h1, input, label, Message } from '../ui';

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
  kcMid: string;
  source: string;
  stages: Stage[];
}

/** Bitki paketleri ve evre verisi girişi. Her giriş kaynak (atıf) ister ve taslak başlar; onayı başka bir uzman verir. */
export default function Packs() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [f, setF] = useState({ name: '', frost: '', kc: '', source: '' });
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

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

  return (
    <>
      <h1 style={h1}>Bitki paketleri</h1>
      {msg ? <Message kind={msg.kind}>{msg.text}</Message> : null}
      {packs.map((p) => (
        <div key={p.packId} style={card} data-testid="paket">
          <strong style={{ fontSize: 20 }}>
            {p.cropName} · sürüm {p.version}
          </strong>{' '}
          {p.reviewStatus === 'uzman-onayli' ? (
            <Badge>Onaylı</Badge>
          ) : (
            <Badge>Uzman onayı bekliyor</Badge>
          )}
          <div style={{ margin: '6px 0' }}>Kaynak: {p.source}</div>
          {p.stages.map((s) => (
            <div key={s.seq}>
              {s.nameTr}
              {s.frostCriticalC !== null ? ` · don eşiği ${s.frostCriticalC} °C` : ''}
              {s.kc !== null ? ` · Kc ${s.kc}` : ''} ·{' '}
              {s.reviewStatus === 'uzman-onayli' ? 'onaylı' : 'onay bekliyor'}
            </div>
          ))}
          <Button variant="secondary" onClick={() => setOpen(open === p.packId ? null : p.packId)}>
            Evre ekle
          </Button>
          {open === p.packId ? (
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
              <label htmlFor="e-kaynak" style={label}>
                Kaynak (zorunlu)
              </label>
              <input
                id="e-kaynak"
                style={input}
                value={f.source}
                onChange={(e) => setF({ ...f, source: e.target.value })}
              />
              <Button onClick={() => void add(p.packId)}>Kaydet</Button>
            </div>
          ) : null}
        </div>
      ))}
    </>
  );
}
