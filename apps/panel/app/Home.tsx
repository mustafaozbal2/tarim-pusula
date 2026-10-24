'use client';
import { useEffect, useState } from 'react';
import { api, type PanelMe } from './lib/api';
import { actionLabel, entityLabel } from './lib/labels';
import { Badge, C, card, DataTable, h2, PageTitle, StatCard } from './ui';

interface Summary {
  announcements: number;
  pending: number;
  fields: number;
  devices: number;
  recent: { at: string; action: string; entity: string }[];
}

/** Ana sayfa: özet kartları (duyuru, bekleyen onay, aktif tarla, cihaz) + son işlemler tablosu. */
export function Home({ me }: { me: PanelMe }) {
  const [s, setS] = useState<Summary | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    void api<Summary>('GET', '/panel/summary')
      .then(setS)
      .catch(() => setFailed(true));
  }, []);

  const reviewer = me.roles.includes('expert') || me.roles.includes('admin');
  return (
    <>
      <PageTitle title="Ana sayfa" />
      {failed ? (
        <p role="alert" style={{ color: C.danger }}>
          Özet alınamadı. Sayfayı yenileyin.
        </p>
      ) : null}
      <div
        data-testid="ozet"
        style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}
      >
        <StatCard
          testId="ozet-duyuru"
          label={reviewer ? 'Duyuru sayısı' : 'Duyurularım'}
          value={s?.announcements ?? '-'}
        />
        <StatCard testId="ozet-bekleyen" label="Bekleyen onay" value={s?.pending ?? '-'} />
        <StatCard testId="ozet-tarla" label="Aktif tarla" value={s?.fields ?? '-'} />
        <StatCard testId="ozet-cihaz" label="Cihaz" value={s?.devices ?? '-'} />
      </div>

      <section style={card} aria-label="Son işlemler">
        <h2 style={h2}>Son işlemler</h2>
        <DataTable
          testId="son-islemler"
          searchKeys={['islem', 'varlik']}
          pageSize={5}
          empty="Henüz işlem yok."
          columns={[
            { key: 'zaman', title: 'Zaman', sortable: true },
            { key: 'islem', title: 'İşlem', sortable: true },
            { key: 'varlik', title: 'Konu', filter: true },
          ]}
          rows={(s?.recent ?? []).map((r, i) => ({
            id: String(i),
            zaman: new Date(r.at).toLocaleString('tr-TR'),
            islem: actionLabel(r.action),
            varlik: entityLabel(r.entity),
          }))}
        />
        {s && s.pending > 0 && reviewer ? (
          <p style={{ margin: '8px 0 0' }}>
            <Badge>{s.pending} kayıt uzman onayı bekliyor</Badge>
          </p>
        ) : null}
      </section>
    </>
  );
}
