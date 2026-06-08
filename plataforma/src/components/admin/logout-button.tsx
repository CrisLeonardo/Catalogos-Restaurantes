'use client';

import { logout } from '@/lib/actions/auth';

export default function LogoutButton() {
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
