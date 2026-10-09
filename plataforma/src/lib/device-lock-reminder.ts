/* ============================================================
   RECORDAR EL CANDADO DE APARATOS (ACC-06)
   ------------------------------------------------------------
   «El PIN solo funciona en estos aparatos» nace APAGADO a propósito (mig
   112): encenderlo con la lista vacía dejaría a todo el personal fuera en
   plena hora pico. Mientras está apagado, cada PIN correcto registra su
   aparato, así que la lista se llena sola con las tabletas y la PC que de
   verdad se usan.

   El problema es que nadie se entera de que ya se puede encender: mientras
   tanto el PIN de 4 cifras se prueba desde cualquier parte del mundo y la
   lista con los nombres del personal se ve sin sesión. Así que, pasada una
   semana con aparatos ya reconocidos, Hoy se lo recuerda al dueño. Una
   semana: lo bastante para que la lista tenga los aparatos de todos los
   turnos y no solo los del primer día.
   ============================================================ */

export const DIAS_ANTES_DE_RECORDAR = 7;

export function debeRecordarCandado(input: {
  candadoEncendido: boolean;
  aparatos: number;
  /** Cuándo se registró el primer aparato (ISO), o null si no hay. */
  primerAparatoEn: string | null;
  ahora?: number;
}): boolean {
  if (input.candadoEncendido || input.aparatos === 0 || !input.primerAparatoEn) return false;
  const desde = new Date(input.primerAparatoEn).getTime();
  if (!Number.isFinite(desde)) return false;
  return (input.ahora ?? Date.now()) - desde >= DIAS_ANTES_DE_RECORDAR * 86_400_000;
}
