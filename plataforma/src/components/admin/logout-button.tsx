'use client';

import { logout } from '@/lib/actions/auth';
import { changeOperatorUser } from '@/lib/actions/operator';

interface Props {
  variant?: 'pill' | 'menu-item';
  /** Sesión iniciada por PIN: "Salir" se vuelve "Cambiar de usuario" y no
      cierra la sesión de operador de golpe, solo vuelve a "¿Quién eres?" —
      Capa A (el dispositivo ya vinculado a su restaurante) no se toca. */
  isOperatorSession?: boolean;
}

export default function LogoutButton({ variant = 'pill', isOperatorSession = false }: Props) {
  const action = isOperatorSession ? changeOperatorUser : logout;
  const label = isOperatorSession ? 'Cambiar de usuario' : 'Salir';

  if (variant === 'menu-item') {
    return (
      <form action={action}>
        <button
          type="submit"
          className="press"
          style={{
            width: '100%',
            background: 'none',
            border: 'none',
            color: isOperatorSession ? 'var(--u-text-2)' : '#f87171',
            padding: '10px 12px',
            borderRadius: 9,
            fontSize: 13.5,
            fontWeight: 600,
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          {label}
        </button>
      </form>
    );
  }
  return (
    <form action={action}>
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
        {label}
      </button>
    </form>
  );
}
