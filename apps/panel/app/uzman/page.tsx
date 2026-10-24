'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { Badge, Button, card, DataTable, h2, input, label, Message, PageTitle } from '../ui';

interface Q {
  id: string;
  question: string;
  reason: string;
  hasImage: boolean;
  createdAt: string;
}

const REASONS: Record<string, string> = {
  'dusuk-guven': 'Yapay zekâ emin olamadı',
  'foto-teshis': 'Fotoğraf teşhisi (uzmana yönlendirildi)',
  'kaynak-yok': 'Kaynak bulunamadı',
  doz: 'İlaç dozu / karışım sorusu',
};

/**
 * Soru / uzman kuyruğu: yapay zekânın cevaplayamadığı sorular. Uzman cevabı kaynak (atıf) ister ve
 * ilaç miktarı ya da karışım oranı içeremez (sunucu da reddeder); bu durumda ilacın etiketine ve BKÜ kaydına yönlendirin.
 */
export default function ExpertQueue() {
  const [rows, setRows] = useState<Q[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [source, setSource] = useState('');
  const [cache, setCache] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const reload = useCallback(
    () =>
      api<Q[]>('GET', '/pusula/queue')
        .then(setRows)
        .catch(() => undefined),
    [],
  );
  useEffect(() => {
    void reload();
  }, [reload]);

  const send = async (id: string) => {
    setMsg(null);
    try {
      await api('POST', `/pusula/queue/${id}/answer`, { answer, source, cacheable: cache });
      setMsg({ kind: 'ok', text: 'Cevap gönderildi.' });
      setOpen(null);
      setAnswer('');
      setSource('');
      setCache(false);
      await reload();
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof ApiError ? e.message : 'Gönderilemedi' });
    }
  };

  const current = rows.find((r) => r.id === open) ?? null;
  return (
    <>
      <PageTitle title="Soru / uzman kuyruğu" trail={['Soru / uzman kuyruğu']} />
      {msg ? <Message kind={msg.kind}>{msg.text}</Message> : null}
      <section style={card}>
        <h2 style={h2}>Bekleyen sorular</h2>
        <DataTable
          testId="uzman-kuyruk"
          searchLabel="Soru ara"
          searchKeys={['soru']}
          empty="Bekleyen soru yok."
          columns={[
            { key: 'soru', title: 'Soru', sortable: true },
            { key: 'neden', title: 'Neden uzmana geldi', filter: true },
            {
              key: 'foto',
              title: 'Fotoğraf',
              render: (r) => (r['foto'] === 'Var' ? <Badge>Var</Badge> : <span>Yok</span>),
            },
            { key: 'tarih', title: 'Tarih', sortable: true },
          ]}
          rows={rows.map((r) => ({
            id: r.id,
            soru: r.question,
            neden: REASONS[r.reason] ?? r.reason,
            foto: r.hasImage ? 'Var' : 'Yok',
            tarih: new Date(r.createdAt).toLocaleString('tr-TR'),
          }))}
          actions={(r) => (
            <Button small variant="secondary" onClick={() => setOpen(open === r.id ? null : r.id)}>
              Cevapla
            </Button>
          )}
        />
      </section>
      {current ? (
        <section style={card} aria-label="Cevap">
          <h2 style={h2}>Cevap: {current.question}</h2>
          <label htmlFor="u-cevap" style={label}>
            Cevap (en çok 2000 karakter)
          </label>
          <textarea
            id="u-cevap"
            rows={5}
            style={{ ...input, padding: 10 }}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <label htmlFor="u-kaynak" style={label}>
            Kaynak (zorunlu: yayın, kurum ya da kural adı)
          </label>
          <input
            id="u-kaynak"
            style={input}
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
          <label style={{ ...label, fontWeight: 600 }}>
            <input type="checkbox" checked={cache} onChange={(e) => setCache(e.target.checked)} />{' '}
            Benzer sorularda da kullanılsın
          </label>
          <Button disabled={!answer.trim() || !source.trim()} onClick={() => void send(current.id)}>
            Cevabı gönder
          </Button>
          <Button variant="secondary" onClick={() => setOpen(null)}>
            İptal
          </Button>
        </section>
      ) : null}
    </>
  );
}
