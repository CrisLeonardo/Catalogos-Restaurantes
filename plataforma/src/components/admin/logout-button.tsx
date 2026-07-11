'use client';

import { logout } from '@/lib/actions/auth';

export default function LogoutButton({ variant = 'pill' }: { variant?: 'pill' | 'menu-item' }) {
  if (variant === 'menu-item') {
    return (
      <form action={logout}>
        <button
          type="submit"
          className="press"
          style={{
            width: '100%',
            background: 'none',
            border: 'none',
            color: '#f87171',
            padding: '10px 12px',
            borderRadius: 9,
            fontSize: 13.5,
            fontWeight: 600,
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          Salir
        </button>
      </form>
    );
  }
  return (
    <form action={logout}>
      <button
        type="submit"
        className="press"
        style={{
          background: 'none',
          border: '1px solid var(--u-hair-2)',
          color: 'var(--u-text-3)',
          padding: '6px 14px',
          borderRadius: 'var(--radius-full)',
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        Salir
      </button>
    </form>
  );
}
