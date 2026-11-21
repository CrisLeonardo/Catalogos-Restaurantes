/* ============================================================
   DESCRIPCIÓN QUE VENDE, SIN IA (fase 4 de «La carta que vende», F4-11)
   ------------------------------------------------------------
   «Carne de 150 g, con papas» ayuda a decidir; «deliciosa» no. Al
   escribir la descripción de un platillo, el editor guía con un
   ejemplo cuando está vacía o solo dice que es rica. No corrige ni
   inventa nada: es la parte útil de CV-35 sin IA (decisión del
   dueño, 2026-11-19).
   ============================================================ */

const VAGAS = /\b(delicios[oa]s?|ric[oa]s?|exquisit[oa]s?|sabros[oa]s?|especial(es)?|incre[ií]ble(s)?|el mejor|la mejor|de la casa)\b/gi;

/** ¿La descripción no dice qué lleva? Vacía, o solo adjetivos de elogio. */
export function descripcionVaga(texto: string): boolean {
  const t = texto.trim();
  if (!t) return true;
  const sinElogios = t.replace(VAGAS, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const palabras = sinElogios ? sinElogios.split(' ').filter((w) => w.length > 2 && !/^(con|del|las|los|una|uno|muy|para|que)$/i.test(w)) : [];
  return palabras.length < 2;
}

export const GUIA_DESCRIPCION = 'Di qué lleva, cuánto es y con qué viene: «Carne de 150 g, queso cheddar y tomate. Con papas.» Ayuda a decidir más que «deliciosa».';
