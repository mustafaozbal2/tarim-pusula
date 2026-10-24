'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Badge, card, DataTable, h2, PageTitle } from '../ui';

interface Soil {
  key: string;
  nameTr: string;
  thetaFc: number;
  thetaWp: number;
  source: string;
  needsBadge: boolean;
}

const f2 = (n: number) =>
  n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Toprak türleri: tarla kapasitesi (θFC) ve solma noktası (θWP). Faydalı su = 1000 × (θFC − θWP) mm/m.
 * Değerler FAO-56 Tablo 19 aralık ortasıdır ve uzman onayı bekler; onaysız değer öneri üretmez. Salt okunur.
 */
export default function Soils() {
  const [rows, setRows] = useState<Soil[]>([]);
  useEffect(() => {
    void api<Soil[]>('GET', '/soils')
      .then(setRows)
      .catch(() => undefined);
  }, []);
  return (
    <>
      <PageTitle title="Toprak türleri" trail={['Toprak türleri']} />
      <section style={card}>
        <h2 style={h2}>Toprak türü ve su tutma değerleri</h2>
        <DataTable
          testId="toprak-tablo"
          searchLabel="Toprak türü ara"
          searchKeys={['ad']}
          empty="Kayıt yok."
          columns={[
            { key: 'ad', title: 'Toprak türü', sortable: true },
            { key: 'fc', title: 'Tarla kapasitesi (θFC)', sortable: true },
            { key: 'wp', title: 'Solma noktası (θWP)', sortable: true },
            { key: 'faydali', title: 'Faydalı su (mm/m)', sortable: true },
            {
              key: 'durum',
              title: 'Onay',
              render: (r) => (
                <Badge tone={r['durum'] === 'Onaylı' ? 'ok' : 'draft'}>
                  {r['durum'] === 'Onaylı' ? 'Uzman onaylı' : 'Uzman onayı bekliyor'}
                </Badge>
              ),
            },
            { key: 'kaynak', title: 'Kaynak' },
          ]}
          rows={rows.map((s) => ({
            id: s.key,
            ad: s.nameTr,
            fc: f2(s.thetaFc),
            wp: f2(s.thetaWp),
            faydali: Math.round(1000 * (s.thetaFc - s.thetaWp)),
            durum: s.needsBadge ? 'Taslak' : 'Onaylı',
            kaynak: s.source,
          }))}
        />
      </section>
    </>
  );
}
