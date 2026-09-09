import { describe, it, expect } from 'vitest';
import { dejariaSinDueño } from './membership-rules';

/* ════════════════════════════════════════════════════════════
   NO DEJAR UN RESTAURANTE SIN DUEÑO (fase 4)
   ------------------------------------------------------------
   Si esta regla falla del lado permisivo, el local se queda sin nadie
   que pueda entrar a su panel y NO SE NOTA: sigue abierto, sigue
   tomando pedidos y sigue facturando. Por eso está aquí y no dentro
   de la acción.
   ════════════════════════════════════════════════════════════ */

describe('la regla del último dueño', () => {
  it('bloquea quitar al único que hay', () => {
    expect(dejariaSinDueño(['ana'], 'ana')).toBe(true);
  });

  it('deja quitar a uno cuando hay dos', () => {
    expect(dejariaSinDueño(['ana', 'beto'], 'ana')).toBe(false);
  });

  it('no bloquea a quien no es dueño', () => {
    // Un gerente no está en la lista: quitarlo no puede dejar el local sin
    // dueño, y bloquearlo sería impedir lo normal.
    expect(dejariaSinDueño(['ana'], 'carlos')).toBe(false);
  });

  it('no bloquea nada si el local YA está sin dueño', () => {
    // El caso de rescate: si un local llegó a quedarse sin nadie —por una
    // fila borrada a mano, por una migración— hay que poder tocarlo para
    // arreglarlo. Bloquear aquí lo dejaría roto para siempre.
    expect(dejariaSinDueño([], 'ana')).toBe(false);
  });

  it('cuenta a la misma persona repetida como una sola', () => {
    // No debería poder ocurrir —la clave primaria es (user_id,
    // restaurant_id)— pero si ocurriera, dos filas suyas no la convierten
    // en dos dueños distintos.
    expect(dejariaSinDueño(['ana', 'ana'], 'ana')).toBe(true);
  });
});
