'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Badge, card, DataTable, h2, PageTitle } from '../../ui';

interface Crop {
  id: string;
  nameTr: string;
  group: string;
  lifespan: string;
  commonRank: number | null;
  pack: { version: number; reviewStatus: string | null } | null;
  needsBadge: boolean;
  canDriveAdvice: boolean;
}

/** Desteklenen ürünler: uygulamada seçilebilen ürünler ve bitki paketi (Kc) durumu. Salt okunur. */
export default function Supported() {
  const [rows, setRows] = useState<Crop[]>([]);
  useEffect(() => {
    void api<Crop[]>('GET', '/crops')
      .then(setRows)
      .catch(() => undefined);
  }, []);
  return (
    <>
      <PageTitle title="Desteklenen ürünler" trail={['Üretim planlama', 'Desteklenen ürünler']} />
      <section style={card}>
        <h2 style={h2}>
          {rows.length} ürün · {rows.filter((r) => r.canDriveAdvice).length} tanesi uzman onaylı
          veriyle öneri üretir
        </h2>
        <DataTable
          testId="urun-liste"
          searchLabel="Ürün ara"
          searchKeys={['ad', 'grup']}
          columns={[
            { key: 'ad', title: 'Ürün', sortable: true },
            { key: 'grup', title: 'Grup', sortable: true, filter: true },
            { key: 'omur', title: 'Yaşam döngüsü', filter: true },
            { key: 'yaygin', title: 'Yaygın sıra', sortable: true },
            { key: 'paket', title: 'Paket sürümü', sortable: true },
            {
              key: 'durum',
              title: 'Veri durumu',
              sortable: true,
              filter: true,
              render: (r) => (
                <Badge tone={r['durum'] === 'Onaylı' ? 'ok' : 'draft'}>
                  {r['durum'] === 'Onaylı' ? 'Uzman onaylı' : 'Uzman onayı bekliyor'}
                </Badge>
              ),
            },
          ]}
          rows={rows.map((c) => ({
            id: c.id,
            ad: c.nameTr,
            grup: c.group,
            omur: c.lifespan,
            yaygin: c.commonRank ?? '-',
            paket: c.pack?.version ?? '-',
            durum: c.needsBadge ? 'Taslak' : 'Onaylı',
          }))}
        />
      </section>
    </>
  );
}
