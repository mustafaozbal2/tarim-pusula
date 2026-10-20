'use client';
import type { CSSProperties, ReactNode } from 'react';

export const C = {
  forest: '#14392B',
  pistachio: '#E3EFD2',
  water: '#1D5B7A',
  amber: '#F2C14E',
  amberSoft: '#FBEFC9',
  danger: '#9B2F1E',
  bg: '#F4F6F0',
  border: '#C9D4C0',
  white: '#FFFFFF',
} as const;

export const card: CSSProperties = {
  background: C.white,
  border: `1px solid ${C.border}`,
  borderRadius: 16,
  padding: 20,
  marginBottom: 16,
};

export const input: CSSProperties = {
  minHeight: 56,
  fontSize: 18,
  padding: '0 14px',
  borderRadius: 12,
  border: `2px solid ${C.border}`,
  width: '100%',
  boxSizing: 'border-box',
  background: C.white,
  color: C.forest,
};

export const label: CSSProperties = {
  display: 'block',
  fontSize: 18,
  fontWeight: 700,
  margin: '14px 0 6px',
};

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  testId,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  testId?: string;
  type?: 'button' | 'submit';
}) {
  const bg = variant === 'primary' ? C.forest : variant === 'danger' ? C.danger : C.pistachio;
  const fg = variant === 'secondary' ? C.forest : C.white;
  return (
    <button
      type={type}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      style={{
        minHeight: 56,
        minWidth: 56,
        fontSize: 18,
        fontWeight: 800,
        padding: '0 22px',
        borderRadius: 14,
        border: variant === 'secondary' ? `2px solid ${C.forest}` : 'none',
        background: bg,
        color: fg,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        marginRight: 10,
        marginTop: 10,
      }}
    >
      {children}
    </button>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-block',
        background: C.amberSoft,
        border: `1px solid ${C.amber}`,
        borderRadius: 20,
        padding: '4px 12px',
        fontSize: 16,
        fontWeight: 700,
        color: '#5A3F00',
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
        fontSize: 18,
        padding: '12px 16px',
        borderRadius: 12,
        background: kind === 'ok' ? C.pistachio : '#F6DAD5',
        color: kind === 'ok' ? C.forest : C.danger,
        fontWeight: 700,
      }}
    >
      {children}
    </p>
  );
}

export const h1: CSSProperties = { fontSize: 30, margin: '0 0 16px' };
