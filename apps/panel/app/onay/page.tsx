'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { Badge, Button, card, h1, Message } from '../ui';

interface QAnnouncement {
  id: string;
  sourceOrg: string;
  title: string;
  body: string;
  publishedAt: string;
}
interface QStage {
  seq: number;
  nameTr: string;
  kc: string | null;
  frostCriticalC: string | null;
  reviewStatus: string;
  source: string;
}
interface QPack {
  packId: string;
  cropName: string;
  version: number;
  reviewStatus: string;
  kcIni: string;
  kcMid: string;
  kcEnd: string;
  source: string;
  stages: QStage[];
}
interface Queue {
  announcements: QAnnouncement[];
  packs: QPack[];
}

const DRAFT = 'taslak-uzman-onayi-bekliyor';

/** Uzman onay kuyruğu: duyurular, bitki paketleri ve evre verisi. Onay işlemleri denetim kaydına düşer. */
export default function ReviewQueue() {
  const [q, setQ] = useState<Queue | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const reload = useCallback(
    () =>
      api<Queue>('GET', '/panel/review-queue')
        .then(setQ)
        .catch(() => undefined),
    [],
  );
  useEffect(() => {
    void reload();
  }, [reload]);

  const act = async (path: string, ok: string) => {
    setMsg(null);
    try {
      await api('POST', path);
      setMsg({ kind: 'ok', text: ok });
      await reload();
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof ApiError ? e.message : 'İşlem yapılamadı' });
    }
  };

  if (!q) return <p>Yükleniyor</p>;
  const empty = q.announcements.length === 0 && q.packs.length === 0;

  return (
    <>
      <h1 style={h1}>Onay kuyruğu</h1>
      {msg ? <Message kind={msg.kind}>{msg.text}</Message> : null}
      {empty ? <p data-testid="kuyruk-bos">Onay bekleyen bir şey yok.</p> : null}

      {q.announcements.length > 0 ? <h2 style={{ fontSize: 22 }}>Duyurular</h2> : null}
      {q.announcements.map((a) => (
        <div key={a.id} style={card} data-testid="kuyruk-duyuru">
          <strong style={{ fontSize: 20 }}>{a.title}</strong>
          <p>{a.body}</p>
          <div>
            Kaynak: {a.sourceOrg} · {new Date(a.publishedAt).toLocaleDateString('tr-TR')}
          </div>
          <Button
            testId="duyuru-onayla"
            onClick={() => void act(`/announcements/${a.id}/approve`, 'Duyuru onaylandı.')}
          >
            Onayla
          </Button>
        </div>
      ))}

      {q.packs.length > 0 ? <h2 style={{ fontSize: 22 }}>Bitki paketleri</h2> : null}
      {q.packs.map((p) => (
        <div key={p.packId} style={card} data-testid="kuyruk-paket">
          <strong style={{ fontSize: 20 }}>
            {p.cropName} · sürüm {p.version}
          </strong>
          <div style={{ margin: '6px 0' }}>
            Bitki katsayısı (Kc): başlangıç {p.kcIni}, orta {p.kcMid}, son {p.kcEnd}
          </div>
          <div>Kaynak: {p.source}</div>
          {p.reviewStatus === DRAFT ? (
            <>
              <Badge>Uzman onayı bekliyor</Badge>
              <Button
                testId="paket-onayla"
                onClick={() => void act(`/panel/packs/${p.packId}/approve`, 'Paket onaylandı.')}
              >
                Paketi onayla
              </Button>
            </>
          ) : (
            <Badge>Paket onaylı</Badge>
          )}
          {p.stages
            .filter((s) => s.reviewStatus === DRAFT)
            .map((s) => (
              <div
                key={s.seq}
                style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid #C9D4C0' }}
              >
                <strong>Evre: {s.nameTr}</strong>
                <div>
                  {s.frostCriticalC !== null ? `Don eşiği ${s.frostCriticalC} °C` : ''}
                  {s.kc !== null ? ` Kc ${s.kc}` : ''}
                </div>
                <div>Kaynak: {s.source}</div>
                <Button
                  variant="secondary"
                  testId="evre-onayla"
                  onClick={() =>
                    void act(`/panel/packs/${p.packId}/stages/${s.seq}/approve`, 'Evre onaylandı.')
                  }
                >
                  Evreyi onayla
                </Button>
              </div>
            ))}
        </div>
      ))}
    </>
  );
}
