'use client';
import { useState, type CSSProperties, type ReactNode } from 'react';
import {
  distinct,
  EMPTY_QUERY,
  nextSort,
  queryTable,
  type Row,
  type TableQuery,
} from './lib/table';

/** Renkler: docs/TASARIM_REFERANSI.md (eski uygulama temelli; mobil ile aynı palet). */
export const C = {
  forest: '#064D3B',
  forestHover: '#0B6149',
  listGreen: '#1B7F5A',
  card: '#F3FAF9',
  pistachio: '#E3F2EC',
  water: '#1D5B7A',
  amber: '#F2C14E',
  amberSoft: '#FFF4DC',
  amberText: '#5A3D00',
  danger: '#B01B4A',
  dangerSoft: '#FCE4EC',
  bg: '#F1F3F4',
  border: '#D9DEE0',
  muted: '#4F6258',
  white: '#FFFFFF',
} as const;

export const card: CSSProperties = {
  background: C.white,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: 16,
  marginBottom: 14,
};

export const input: CSSProperties = {
  minHeight: 38,
  fontSize: 14,
  padding: '0 10px',
  borderRadius: 6,
  border: `1px solid ${C.border}`,
  width: '100%',
  boxSizing: 'border-box',
  background: C.white,
  color: C.forest,
};

export const label: CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 700,
  margin: '10px 0 4px',
  color: C.forest,
};

export const h1: CSSProperties = { fontSize: 22, margin: '0 0 12px', color: C.forest };
export const h2: CSSProperties = { fontSize: 16, margin: '0 0 8px', color: C.forest };

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  testId,
  type = 'button',
  small,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  testId?: string;
  type?: 'button' | 'submit';
  small?: boolean;
}) {
  const bg = variant === 'primary' ? C.forest : variant === 'danger' ? C.danger : C.white;
  const fg = variant === 'secondary' ? C.forest : C.white;
  return (
    <button
      type={type}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      style={{
        minHeight: small ? 30 : 38,
        fontSize: 14,
        fontWeight: 700,
        padding: small ? '0 10px' : '0 16px',
        borderRadius: 6,
        border: variant === 'secondary' ? `1px solid ${C.forest}` : `1px solid ${bg}`,
        background: bg,
        color: fg,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        marginRight: 8,
        marginTop: 8,
      }}
    >
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = 'draft',
}: {
  children: ReactNode;
  tone?: 'draft' | 'ok' | 'bad';
}) {
  const t =
    tone === 'ok'
      ? { bg: C.pistachio, bd: C.listGreen, fg: C.forest }
      : tone === 'bad'
        ? { bg: C.dangerSoft, bd: C.danger, fg: C.danger }
        : { bg: C.amberSoft, bd: C.amber, fg: C.amberText };
  return (
    <span
      style={{
        display: 'inline-block',
        background: t.bg,
        border: `1px solid ${t.bd}`,
        borderRadius: 6,
        padding: '1px 8px',
        fontSize: 12,
        fontWeight: 700,
        color: t.fg,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

export function Message({ kind, children }: { kind: 'ok' | 'error'; children: ReactNode }) {
  return (
    <p
      role={kind === 'error' ? 'alert' : 'status'}
      style={{
        fontSize: 14,
        padding: '8px 12px',
        borderRadius: 6,
        background: kind === 'ok' ? C.pistachio : C.dangerSoft,
        color: kind === 'ok' ? C.forest : C.danger,
        fontWeight: 700,
        margin: '8px 0',
      }}
    >
      {children}
    </p>
  );
}

/** Sayfa başlığı. */
export function PageTitle({ title }: { title: string; trail?: string[] }) {
  // Breadcrumb üst çubukta (Shell) gösterilir; `trail` yalnız çağıranların kendi belgelemesi içindir.
  return (
    <div style={{ marginBottom: 12 }}>
      <h1 style={h1}>{title}</h1>
    </div>
  );
}

/** Özet kartı (ana sayfa). */
export function StatCard({
  label: l,
  value,
  testId,
  hint,
}: {
  label: string;
  value: string | number;
  testId?: string;
  hint?: string;
}) {
  return (
    <div
      data-testid={testId}
      style={{
        ...card,
        marginBottom: 0,
        borderLeft: `4px solid ${C.listGreen}`,
        minWidth: 170,
        flex: '1 1 170px',
      }}
    >
      <div style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>{l}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: C.forest }}>{value}</div>
      {hint ? <div style={{ fontSize: 12, color: C.muted }}>{hint}</div> : null}
    </div>
  );
}

/** Onay penceresi (silme, reddetme, geri çekme). `askReason` açıksa gerekçe ister (en az 3 karakter). */
export function ConfirmDialog({
  title,
  text,
  confirmLabel,
  danger,
  askReason,
  onConfirm,
  onCancel,
}: {
  title: string;
  text: string;
  confirmLabel: string;
  danger?: boolean;
  askReason?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const bad = askReason && reason.trim().length < 3;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(6,77,59,.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="onay-penceresi"
        style={{ ...card, width: 420, maxWidth: '92vw', marginBottom: 0 }}
      >
        <h2 style={h2}>{title}</h2>
        <p style={{ fontSize: 14, margin: '0 0 8px' }}>{text}</p>
        {askReason ? (
          <>
            <label htmlFor="onay-gerekce" style={label}>
              Gerekçe (denetim kaydına yazılır)
            </label>
            <textarea
              id="onay-gerekce"
              data-testid="onay-gerekce"
              rows={3}
              style={{ ...input, padding: 8 }}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </>
        ) : null}
        <div style={{ textAlign: 'right', marginTop: 8 }}>
          <Button variant="secondary" onClick={onCancel} testId="onay-vazgec">
            Vazgeç
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            disabled={bad}
            onClick={() => onConfirm(reason.trim())}
            testId="onay-tamam"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export interface Column<T extends Row> {
  key: string;
  title: string;
  sortable?: boolean;
  render?: (r: T) => ReactNode;
  /** Süzgeç açılır listesi olarak sunulsun mu ("Tümü" açık seçenek). */
  filter?: boolean;
}

/**
 * Liste: arama kutusu, sütun süzgeçleri ("Tümü" açık seçenek), tıkla-sırala, sayfalama,
 * isteğe bağlı satır eylemleri (Düzenle / Sil gibi).
 */
export function DataTable<T extends Row & { id: string }>({
  columns,
  rows,
  searchKeys,
  actions,
  empty = 'Kayıt yok.',
  testId,
  pageSize = 10,
  searchLabel = 'Ara',
}: {
  columns: Column<T>[];
  rows: T[];
  searchKeys: string[];
  actions?: (r: T) => ReactNode;
  empty?: string;
  testId?: string;
  pageSize?: number;
  searchLabel?: string;
}) {
  const [q, setQ] = useState<TableQuery>({ ...EMPTY_QUERY, pageSize });
  const res = queryTable(rows, searchKeys, q);
  const filterCols = columns.filter((c) => c.filter);
  return (
    <div data-testid={testId}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 220px' }}>
          <label htmlFor={`${testId}-ara`} style={label}>
            {searchLabel}
          </label>
          <input
            id={`${testId}-ara`}
            data-testid={testId ? `${testId}-ara` : undefined}
            style={input}
            value={q.search}
            onChange={(e) => setQ({ ...q, search: e.target.value, page: 1 })}
            placeholder="Yazarak ara"
          />
        </div>
        {filterCols.map((c) => (
          <div key={c.key} style={{ flex: '0 1 180px' }}>
            <label htmlFor={`${testId}-f-${c.key}`} style={label}>
              {c.title}
            </label>
            <select
              id={`${testId}-f-${c.key}`}
              style={input}
              value={q.filters[c.key] ?? ''}
              onChange={(e) =>
                setQ({ ...q, filters: { ...q.filters, [c.key]: e.target.value }, page: 1 })
              }
            >
              <option value="">Tümü</option>
              {distinct(rows, c.key).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div style={{ overflowX: 'auto', marginTop: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: C.forest, color: C.white, textAlign: 'left' }}>
              {columns.map((c) => (
                <th
                  key={c.key}
                  aria-sort={
                    q.sortKey === c.key
                      ? q.sortDir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                  style={{ padding: '8px 10px', fontSize: 13 }}
                >
                  {c.sortable ? (
                    <button
                      type="button"
                      onClick={() => setQ({ ...q, ...nextSort(q, c.key) })}
                      style={{
                        all: 'unset',
                        cursor: 'pointer',
                        fontWeight: 800,
                        fontSize: 13,
                        color: C.white,
                      }}
                    >
                      {c.title}
                      {q.sortKey === c.key ? (q.sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </button>
                  ) : (
                    c.title
                  )}
                </th>
              ))}
              {actions ? <th style={{ padding: '8px 10px', fontSize: 13 }}>İşlem</th> : null}
            </tr>
          </thead>
          <tbody>
            {res.rows.map((r, i) => (
              <tr
                key={r.id}
                data-testid={testId ? `${testId}-satir` : undefined}
                style={{ background: i % 2 ? C.card : C.white, borderTop: `1px solid ${C.border}` }}
              >
                {columns.map((c) => (
                  <td key={c.key} style={{ padding: '8px 10px', verticalAlign: 'top' }}>
                    {c.render ? c.render(r) : String(r[c.key] ?? '-')}
                  </td>
                ))}
                {actions ? (
                  <td style={{ padding: '4px 10px', whiteSpace: 'nowrap' }}>{actions(r)}</td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {res.total === 0 ? <p style={{ padding: 12, margin: 0 }}>{empty}</p> : null}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 8,
          fontSize: 13,
        }}
      >
        <span data-testid={testId ? `${testId}-toplam` : undefined}>
          {res.total} kayıt · sayfa {res.page}/{res.pageCount}
        </span>
        <span>
          <Button
            small
            variant="secondary"
            disabled={res.page <= 1}
            onClick={() => setQ({ ...q, page: res.page - 1 })}
          >
            Önceki
          </Button>
          <Button
            small
            variant="secondary"
            disabled={res.page >= res.pageCount}
            onClick={() => setQ({ ...q, page: res.page + 1 })}
          >
            Sonraki
          </Button>
        </span>
      </div>
    </div>
  );
}

const ICONS: Record<string, string> = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  field: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14',
  plan: 'M5 4h14v16H5zM9 9h6M9 13h6M9 17h3',
  megaphone: 'M3 11v3l12 5V6zM15 8h3a3 3 0 010 6h-3M6 15l1 5h3',
  check: 'M5 12l4 4 10-10M4 4h16v16H4z',
  leaf: 'M12 21v-8M12 13c0-4 3-7 8-7 0 5-3 7-8 7zM12 15c0-3-2-5-6-5 0 4 2 5 6 5z',
  soil: 'M3 18h18M5 18c0-4 3-6 7-6s7 2 7 6M12 12V6M9 8l3-3 3 3',
  chat: 'M4 5h16v11H9l-5 4zM8 9h8M8 12h5',
  chip: 'M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4',
  audit: 'M6 3h9l4 4v14H6zM9 12h7M9 16h7M9 8h3',
  users:
    'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2 20c0-4 3-6 7-6s7 2 7 6M17 5a3 3 0 010 6M18 14c3 .5 4 3 4 6',
  chevron: 'M9 6l6 6-6 6',
};

/** Çizgi (stroke) simge; emoji yok. Anlam her zaman yanındaki yazıyla da verilir. */
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name] ?? ICONS['home']} />
    </svg>
  );
}
