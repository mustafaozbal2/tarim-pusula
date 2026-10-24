'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { Badge, Button, card, ConfirmDialog, DataTable, h2, Message, PageTitle } from '../ui';

interface User {
  id: string;
  phone: string;
  roles: string[];
  mfaEnrolled: boolean;
  createdAt: string;
}

const ROLE: Record<string, string> = {
  institution_admin: 'Kurum yöneticisi',
  expert: 'Uzman',
  admin: 'Yönetici',
};

/**
 * Kullanıcılar (yalnız yönetici): panel personeli. Telefon maskelidir. Telefonunu kaybeden kişinin ikinci adımı
 * (doğrulayıcı) sıfırlanır; kişi bir sonraki girişte yeniden kurar. Sıfırlama denetim kaydına yazılır.
 */
export default function Users() {
  const [rows, setRows] = useState<User[]>([]);
  const [target, setTarget] = useState<User | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const reload = useCallback(
    () =>
      api<User[]>('GET', '/panel/users')
        .then(setRows)
        .catch(() => undefined),
    [],
  );
  useEffect(() => {
    void reload();
  }, [reload]);

  const reset = async (u: User) => {
    setTarget(null);
    try {
      await api('POST', `/panel/mfa/reset/${u.id}`);
      setMsg({
        kind: 'ok',
        text: 'İkinci adım sıfırlandı. Kişi bir sonraki girişte yeniden kurar.',
      });
      await reload();
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof ApiError ? e.message : 'Sıfırlanamadı' });
    }
  };

  return (
    <>
      <PageTitle title="Kullanıcılar" trail={['Kullanıcılar']} />
      {msg ? <Message kind={msg.kind}>{msg.text}</Message> : null}
      <section style={card}>
        <h2 style={h2}>Panel personeli · {rows.length} kişi</h2>
        <DataTable
          testId="kullanici-liste"
          searchLabel="Kullanıcı ara"
          searchKeys={['telefon', 'rol']}
          empty="Kayıt yok."
          columns={[
            { key: 'telefon', title: 'Telefon (maskeli)', sortable: true },
            { key: 'rol', title: 'Rol', sortable: true, filter: true },
            {
              key: 'mfa',
              title: 'İkinci adım',
              filter: true,
              render: (r) => (
                <Badge tone={r['mfa'] === 'Kurulu' ? 'ok' : 'draft'}>{String(r['mfa'])}</Badge>
              ),
            },
            { key: 'tarih', title: 'Kayıt tarihi', sortable: true },
          ]}
          rows={rows.map((u) => ({
            id: u.id,
            telefon: u.phone,
            rol: u.roles.map((r) => ROLE[r] ?? r).join(', '),
            mfa: u.mfaEnrolled ? 'Kurulu' : 'Kurulmamış',
            tarih: new Date(u.createdAt).toLocaleDateString('tr-TR'),
          }))}
          actions={(r) => (
            <Button
              small
              variant="secondary"
              testId="mfa-sifirla"
              onClick={() => setTarget(rows.find((x) => x.id === r.id) ?? null)}
            >
              İkinci adımı sıfırla
            </Button>
          )}
        />
      </section>
      {target ? (
        <ConfirmDialog
          danger
          title="İkinci adım sıfırlansın mı?"
          text={`${target.phone} için doğrulayıcı kaydı silinir; kişi yeniden kurulum yapar.`}
          confirmLabel="Sıfırla"
          onCancel={() => setTarget(null)}
          onConfirm={() => void reset(target)}
        />
      ) : null}
    </>
  );
}
