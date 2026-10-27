/* ============================================================
   ¿Cuándo deja de contar una llamada al mesero?
   ------------------------------------------------------------
   Una llamada quedaba pendiente hasta que alguien tocaba
   «Atendido», aunque fuera de ayer: el aviso «Mesa 4 · Solicita
   atención · hace 21 h» flotaba encima de todas las pantallas
   del panel y la mesa seguía marcada «Llaman» en el salón
   (auditoría de experiencia 2026-10-27, EV-18).

   Pasadas unas horas nadie sigue esperando en esa mesa. La
   llamada no se borra ni se marca atendida —el registro queda
   como estaba—; solo deja de leerse como pendiente.
   ============================================================ */

/** Horas tras las que una llamada sin atender deja de mostrarse. */
export const LLAMADA_VIGENTE_HORAS = 3;

/** Desde cuándo una llamada todavía cuenta, en ISO para `.gte('created_at', …)`. */
export function llamadaVigenteDesde(ahora: number = Date.now()): string {
  return new Date(ahora - LLAMADA_VIGENTE_HORAS * 3_600_000).toISOString();
}
