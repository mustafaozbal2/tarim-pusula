'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Badge, card, DataTable, h2, PageTitle } from '../ui';

interface Device {
  id: string;
  name: string;
  kind: string;
  province: string | null;
  district: string | null;
  village: string | null;
  valveOpen: boolean | null;
  lastSeenAt: string | null;
  createdAt: string;
}

/** Cihazlar (yalnız yönetici): tür, yer, vana durumu, son görülme. Cihaz sahibi gösterilmez; vana buradan açılmaz. */
export default function Devices() {
  const [rows, setRows] = useState<Device[]>([]);
  useEffect(() => {
    void api<Device[]>('GET', '/panel/devices')
      .then(setRows)
      .catch(() => undefined);
  }, []);
  return (
    <>
      <PageTitle title="Cihazlar" trail={['Cihazlar']} />
      <section style={card}>
        <h2 style={h2}>{rows.length} cihaz</h2>
        <DataTable
          testId="cihaz-liste"
          searchLabel="Cihaz ara"
          searchKeys={['ad', 'yer']}
          empty="Henüz cihaz yok."
          columns={[
            { key: 'ad', title: 'Cihaz', sortable: true },
            { key: 'tur', title: 'Tür', filter: true },
            { key: 'yer', title: 'Yer', sortable: true },
            {
              key: 'vana',
              title: 'Vana',
              filter: true,
              render: (r) => (
                <Badge tone={r['vana'] === 'Açık' ? 'draft' : 'ok'}>{String(r['vana'])}</Badge>
              ),
            },
            { key: 'son', title: 'Son görülme', sortable: true },
          ]}
          rows={rows.map((d) => ({
            id: d.id,
            ad: d.name,
            tur: d.kind,
            yer: [d.province, d.district, d.village].filter(Boolean).join(' / ') || '-',
            vana: d.valveOpen === null ? 'Bilinmiyor' : d.valveOpen ? 'Açık' : 'Kapalı',
            son: d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString('tr-TR') : 'Hiç',
          }))}
        />
      </section>
    </>
  );
}
