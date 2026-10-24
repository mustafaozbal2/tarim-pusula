'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { actionLabel, entityLabel } from '../lib/labels';
import { card, DataTable, h2, Message, PageTitle } from '../ui';

interface Row {
  seq: number;
  at: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
}

/** Denetim kaydı (yalnız yönetici): son işlemler ve zincir bütünlüğü. Kayıtlar değiştirilemez. */
export default function Audit() {
  const [rows, setRows] = useState<Row[]>([]);
  const [chain, setChain] = useState<boolean | null>(null);

  useEffect(() => {
    void api<Row[]>('GET', '/admin/audit?limit=500')
      .then(setRows)
      .catch(() => undefined);
    void api<{ ok: boolean }>('GET', '/admin/audit/verify')
      .then((r) => setChain(r.ok))
      .catch(() => undefined);
  }, []);

  return (
    <>
      <PageTitle title="Denetim kaydı" trail={['Denetim kaydı']} />
      {chain === true ? <Message kind="ok">Kayıt zinciri sağlam.</Message> : null}
      {chain === false ? <Message kind="error">Kayıt zincirinde bozulma var.</Message> : null}
      <section style={card}>
        <h2 style={h2}>Son işlemler</h2>
        <DataTable
          testId="denetim-liste"
          searchLabel="İşlem ara"
          searchKeys={['islem', 'konu', 'ham']}
          pageSize={15}
          empty="Kayıt yok."
          columns={[
            { key: 'sira', title: 'No', sortable: true },
            { key: 'zaman', title: 'Zaman', sortable: true },
            { key: 'islem', title: 'İşlem', sortable: true, filter: true },
            { key: 'konu', title: 'Konu', filter: true },
            { key: 'kisi', title: 'Yapan (kısa kimlik)' },
          ]}
          rows={rows.map((r) => ({
            id: String(r.seq),
            sira: r.seq,
            zaman: new Date(r.at).toLocaleString('tr-TR'),
            islem: actionLabel(r.action),
            ham: r.action,
            konu: entityLabel(r.entity),
            kisi: r.actorId ? r.actorId.slice(0, 8) : 'sistem',
          }))}
        />
      </section>
    </>
  );
}
