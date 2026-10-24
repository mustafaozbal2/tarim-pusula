'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { Badge, Button, card, ConfirmDialog, h2, Message, PageTitle } from '../ui';

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
interface Approved {
  id: string;
  title: string;
  sourceOrg: string;
  publishedAt: string;
  reviewStatus: string;
}

const DRAFT = 'taslak-uzman-onayi-bekliyor';

/** Bekleyen işlem: hangi uç, hangi başlık; gerekçe pencereden gelir. */
interface Pending {
  path: string;
  title: string;
  text: string;
  confirm: string;
  ok: string;
}

/**
 * Uzman onay kuyruğu: duyurular, bitki paketleri ve evre verisi. Onayla, Reddet (gerekçeli) ve
 * onaylı duyurunun onayını geri çek (gerekçeli). Tüm işlemler denetim kaydına düşer.
 */
export default function ReviewQueue() {
  const [q, setQ] = useState<Queue | null>(null);
  const [approved, setApproved] = useState<Approved[]>([]);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const reload = useCallback(async () => {
    await api<Queue>('GET', '/panel/review-queue')
      .then(setQ)
      .catch(() => undefined);
    await api<Approved[]>('GET', '/announcements/managed')
      .then((l) => setApproved(l.filter((a) => a.reviewStatus === 'uzman-onayli')))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  const act = async (path: string, ok: string, body?: unknown) => {
    setMsg(null);
    try {
      await api('POST', path, body);
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
      <PageTitle title="Onay kuyruğu" trail={['Duyuru ve içerik', 'Onay kuyruğu']} />
      {msg ? <Message kind={msg.kind}>{msg.text}</Message> : null}
      {empty ? <p data-testid="kuyruk-bos">Onay bekleyen bir şey yok.</p> : null}

      {q.announcements.length > 0 ? <h2 style={h2}>Duyurular</h2> : null}
      {q.announcements.map((a) => (
        <div key={a.id} style={card} data-testid="kuyruk-duyuru">
          <strong style={{ fontSize: 16 }}>{a.title}</strong>
          <p style={{ margin: '6px 0' }}>{a.body}</p>
          <div>
            Kaynak: {a.sourceOrg} · {new Date(a.publishedAt).toLocaleDateString('tr-TR')}
          </div>
          <Button
            testId="duyuru-onayla"
            onClick={() => void act(`/announcements/${a.id}/approve`, 'Duyuru onaylandı.')}
          >
            Onayla
          </Button>
          <Button
            variant="danger"
            testId="duyuru-reddet"
            onClick={() =>
              setPending({
                path: `/announcements/${a.id}/reject`,
                title: 'Duyuru reddedilsin mi?',
                text: `"${a.title}" çiftçilere hiç gösterilmez. Gerekçe denetim kaydına yazılır.`,
                confirm: 'Reddet',
                ok: 'Duyuru reddedildi.',
              })
            }
          >
            Reddet
          </Button>
        </div>
      ))}

      {q.packs.length > 0 ? <h2 style={h2}>Bitki paketleri</h2> : null}
      {q.packs.map((p) => (
        <div key={p.packId} style={card} data-testid="kuyruk-paket">
          <strong style={{ fontSize: 16 }}>
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
              <Button
                variant="danger"
                testId="paket-reddet"
                onClick={() =>
                  setPending({
                    path: `/panel/packs/${p.packId}/reject`,
                    title: 'Paket reddedilsin mi?',
                    text: `${p.cropName} paketi hiçbir öneriyi beslemez. Gerekçe denetim kaydına yazılır.`,
                    confirm: 'Reddet',
                    ok: 'Paket reddedildi.',
                  })
                }
              >
                Reddet
              </Button>
            </>
          ) : (
            <Badge tone="ok">Paket onaylı</Badge>
          )}
          {p.stages
            .filter((s) => s.reviewStatus === DRAFT)
            .map((s) => (
              <div
                key={s.seq}
                style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid #D9DEE0' }}
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
                <Button
                  variant="danger"
                  testId="evre-reddet"
                  onClick={() =>
                    setPending({
                      path: `/panel/packs/${p.packId}/stages/${s.seq}/reject`,
                      title: 'Evre reddedilsin mi?',
                      text: `${s.nameTr} evresi hiçbir uyarıyı beslemez. Gerekçe denetim kaydına yazılır.`,
                      confirm: 'Reddet',
                      ok: 'Evre reddedildi.',
                    })
                  }
                >
                  Reddet
                </Button>
              </div>
            ))}
        </div>
      ))}

      <h2 style={{ ...h2, marginTop: 18 }}>Yayındaki duyurular</h2>
      {approved.length === 0 ? <p data-testid="onayli-bos">Onaylı duyuru yok.</p> : null}
      {approved.map((a) => (
        <div key={a.id} style={card} data-testid="onayli-duyuru">
          <strong style={{ fontSize: 16 }}>{a.title}</strong>{' '}
          <Badge tone="ok">Yayında (uzman onaylı)</Badge>
          <div style={{ margin: '4px 0' }}>
            Kaynak: {a.sourceOrg} · {new Date(a.publishedAt).toLocaleDateString('tr-TR')}
          </div>
          <Button
            variant="secondary"
            testId="duyuru-geri-cek"
            onClick={() =>
              setPending({
                path: `/announcements/${a.id}/revoke`,
                title: 'Onay geri çekilsin mi?',
                text: `"${a.title}" taslağa döner; yeniden onaylanana dek rozetli görünür. Gerekçe denetim kaydına yazılır.`,
                confirm: 'Onayı geri çek',
                ok: 'Onay geri çekildi; duyuru taslağa döndü.',
              })
            }
          >
            Onayı geri çek
          </Button>
        </div>
      ))}

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
            void act(p.path, p.ok, { reason });
          }}
        />
      ) : null}
    </>
  );
}
