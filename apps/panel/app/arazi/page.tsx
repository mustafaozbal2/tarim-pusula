'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { card, DataTable, h2, PageTitle } from '../ui';

interface FieldRow {
  id: string;
  province: string | null;
  district: string | null;
  village: string | null;
  cropId: string | null;
  areaDecare: number | null;
  createdAt: string;
  deviceCount: number;
}
interface Crop {
  id: string;
  nameTr: string;
}

/**
 * Arazi listele (salt okunur, anonim). Tarla adı ve sahibi gösterilmez (KVKK veri minimizasyonu);
 * tarlalar çiftçiye aittir, panelden düzenlenmez ya da silinmez. Her açılış denetim kaydına yazılır.
 */
export default function Fields() {
  const [rows, setRows] = useState<FieldRow[]>([]);
  const [crops, setCrops] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    void api<FieldRow[]>('GET', '/panel/fields')
      .then(setRows)
      .catch(() => setFailed(true));
    void api<Crop[]>('GET', '/crops')
      .then((c) => setCrops(Object.fromEntries(c.map((x) => [x.id, x.nameTr]))))
      .catch(() => undefined);
  }, []);

  const total = rows.reduce((s, r) => s + (r.areaDecare ?? 0), 0);
  return (
    <>
      <PageTitle title="Arazi listele" trail={['Arazi işlemleri', 'Arazi listele']} />
      {failed ? <p role="alert">Liste alınamadı.</p> : null}
      <section style={card}>
        <h2 style={h2}>
          Kayıtlı araziler · {rows.length} tarla · toplam{' '}
          {total.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} dekar
        </h2>
        <DataTable
          testId="arazi-liste"
          searchLabel="Arazi ara (il, ilçe, köy, ürün)"
          searchKeys={['il', 'ilce', 'koy', 'urun']}
          empty="Henüz arazi yok."
          columns={[
            { key: 'il', title: 'İl', sortable: true, filter: true },
            { key: 'ilce', title: 'İlçe', sortable: true },
            { key: 'koy', title: 'Köy', sortable: true },
            { key: 'urun', title: 'Ürün', sortable: true, filter: true },
            { key: 'alan', title: 'Alan (dekar)', sortable: true },
            { key: 'cihaz', title: 'Cihaz', sortable: true },
            { key: 'tarih', title: 'Kayıt tarihi', sortable: true },
          ]}
          rows={rows.map((r) => ({
            id: r.id,
            il: r.province ?? '-',
            ilce: r.district ?? '-',
            koy: r.village ?? '-',
            urun: r.cropId ? (crops[r.cropId] ?? r.cropId) : '-',
            alan: r.areaDecare ?? 0,
            cihaz: r.deviceCount,
            tarih: new Date(r.createdAt).toLocaleDateString('tr-TR'),
          }))}
        />
      </section>
    </>
  );
}
