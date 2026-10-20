'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { card, h1, Message } from '../ui';

interface Row {
  seq: number;
  at: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
}

/** Denetim kaydı (yalnız yönetici): son işlemler ve zincir bütünlüğü. */
export default function Audit() {
  const [rows, setRows] = useState<Row[]>([]);
  const [chain, setChain] = useState<boolean | null>(null);

  useEffect(() => {
    void api<Row[]>('GET', '/admin/audit?limit=100')
      .then(setRows)
      .catch(() => undefined);
    void api<{ ok: boolean }>('GET', '/admin/audit/verify')
      .then((r) => setChain(r.ok))
      .catch(() => undefined);
  }, []);

  return (
    <>
      <h1 style={h1}>Denetim kaydı</h1>
      {chain === true ? <Message kind="ok">Kayıt zinciri sağlam.</Message> : null}
      {chain === false ? <Message kind="error">Kayıt zincirinde bozulma var.</Message> : null}
      <div style={card}>
        {rows.map((r) => (
          <div key={r.seq} style={{ padding: '8px 0', borderBottom: '1px solid #E3EFD2' }}>
            <strong>{r.action}</strong> · {new Date(r.at).toLocaleString('tr-TR')} · {r.entity}
          </div>
        ))}
      </div>
    </>
  );
}
