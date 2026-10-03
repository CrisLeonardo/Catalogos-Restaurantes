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
            color: isOperatorSession ? 'var(--u-text-2)' : 'var(--c-danger)',
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            fontSize: 13.5,
            fontWeight: 600,
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          {isOperatorSession ? 'Cambiar de usuario' : 'Salir'}
        </button>
      </form>
    );
  }
  return (
    <form action={action} style={{ flexShrink: 0 }}>
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
          whiteSpace: 'nowrap',
        }}
      >
        {/* Espacio angosto (tarjeta del sidebar): "Cambiar de usuario" completo
            envolvía en 2 líneas y se salía de la tarjeta encimándose con el
            avatar. Aquí va corto; el texto completo queda en el menú ⋮
            (variant="menu-item"), que tiene más ancho. */}
        {isOperatorSession ? 'Cambiar' : 'Salir'}
      </button>
    </form>
  );
}
