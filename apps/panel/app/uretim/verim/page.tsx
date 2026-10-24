'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Badge, card, h2, PageTitle, StatCard } from '../../ui';

/** Verim haritası: tarla sınırı + uydu (NDVI) verisi ve ürün verimi için kaynak bağlanana kadar bilgi ekranı. */
export default function YieldMap() {
  const [fields, setFields] = useState<number | null>(null);
  useEffect(() => {
    void api<{ fields: number }>('GET', '/panel/summary')
      .then((s) => setFields(s.fields))
      .catch(() => undefined);
  }, []);
  return (
    <>
      <PageTitle title="Verim haritası" trail={['Üretim planlama', 'Verim haritası']} />
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <StatCard label="Kayıtlı tarla" value={fields ?? '-'} />
        <StatCard label="Verim verisi olan tarla" value={0} hint="Kaynak bağlanmadı" />
      </div>
      <section style={{ ...card, borderLeft: '4px solid #F2C14E' }} data-testid="veri-bekleniyor">
        <h2 style={h2}>Verim haritası henüz üretilmiyor</h2>
        <ul style={{ margin: '0 0 8px', paddingLeft: 18 }}>
          <li>Bölge verimi için resmi, atıflı bir kaynak gerekir; kaynaksız değer gösterilmez.</li>
          <li>
            Tarla bazında yeşillik (NDVI) ölçümü, tarla sınırı çizilen tarlalar için uygulamada
            gösterilir.
          </li>
          <li>Verim tahmini bir uzman tarafından doğrulanıp onaylanmadan haritaya girmez.</li>
        </ul>
        <Badge>Uzman onayı ve veri kaynağı bekleniyor</Badge>
      </section>
    </>
  );
}
