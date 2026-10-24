'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Badge, card, DataTable, h2, PageTitle } from '../../ui';

/** Ürün arz talep: fiyat kaynağı olan ürünler. Arz (üretim miktarı) ve talep verisi için resmi kaynak bağlanmadı. */
export default function SupplyDemand() {
  const [rows, setRows] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    void api<{ id: string; name: string }[]>('GET', '/market/crops')
      .then(setRows)
      .catch(() => undefined);
  }, []);
  return (
    <>
      <PageTitle title="Ürün arz talep" trail={['Üretim planlama', 'Ürün arz talep']} />
      <section style={{ ...card, borderLeft: '4px solid #F2C14E' }} data-testid="veri-bekleniyor">
        <h2 style={h2}>Arz ve talep verisi henüz bağlı değil</h2>
        <p style={{ margin: '0 0 6px' }}>
          Üretim miktarı (arz) ve talep için resmi, atıflı bir kaynak (ör. TÜİK, TEPGE) bağlanana
          kadar bu ekranda sayı gösterilmez; kaynaksız tahmin uydurulmaz.
        </p>
        <Badge>Uzman onayı ve veri kaynağı bekleniyor</Badge>
      </section>
      <section style={card}>
        <h2 style={h2}>Fiyat kaynağı bağlı ürünler (hal, borsa, TEPGE)</h2>
        <DataTable
          testId="fiyatli-urunler"
          searchLabel="Ürün ara"
          searchKeys={['ad']}
          empty="Fiyat verisi toplayıcısı henüz bir kayıt üretmedi."
          columns={[{ key: 'ad', title: 'Ürün', sortable: true }]}
          rows={rows.map((r) => ({ id: r.id, ad: r.name }))}
        />
      </section>
    </>
  );
}
