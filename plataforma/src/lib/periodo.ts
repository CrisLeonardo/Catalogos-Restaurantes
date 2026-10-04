/* ============================================================
   PERIODOS DE NEGOCIO › RESUMEN (auditoría 2026-10-02, D-3)
   ------------------------------------------------------------
   Hoy, Pedidos y Negocio › Resumen enseñaban las mismas cifras del día y
   la misma gráfica de 14 días. Ahora cada una contesta su pregunta: Hoy el
   pulso del día, Pedidos la operación y Resumen la semana o el mes contra
   el periodo anterior. Aquí van las cuentas, sin base de datos, para poder
   probarlas.
   ============================================================ */

/** Los días que abarca cada periodo del selector. */
export const PERIODOS = { semana: 7, mes: 30 } as const;
export type Periodo = keyof typeof PERIODOS;

export function esPeriodo(v: unknown): v is Periodo {
  return v === 'semana' || v === 'mes';
}

/** «2026-10-03» + n días (n puede ser negativo). Fechas solas, sin zona. */
export function sumarDias(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** El periodo que termina HOY (incluido) y el anterior, del mismo largo. */
export function rangoDePeriodo(hoy: string, dias: number): { from: string; to: string; prevFrom: string; prevTo: string } {
  return {
    from: sumarDias(hoy, -(dias - 1)),
    to: hoy,
    prevFrom: sumarDias(hoy, -(2 * dias - 1)),
    prevTo: sumarDias(hoy, -dias),
  };
}

/**
 * El instante (UTC) en que empieza un día en la zona del restaurante.
 * Para contar filas por `created_at` con los mismos cortes de día que los
 * reportes de ventas, que se hacen en SQL con la zona del local.
 */
export function medianocheLocalUtc(ymd: string, timezone: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d);
  let offsetMin = 0;
  try {
    // Qué hora marca el reloj del local en la medianoche UTC de ese día.
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(utc));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    const local = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
    offsetMin = (local - utc) / 60000;
  } catch {
    offsetMin = 0;
  }
  return new Date(utc - offsetMin * 60000).toISOString();
}

/** Una línea de comparación contra el periodo anterior, o null si no hay con qué. */
export function comparacion(
  actual: number,
  anterior: number,
  dias: number,
): { texto: string; signo: 'sube' | 'baja' | 'igual' } | null {
  if (!(anterior > 0)) return null;
  const pct = Math.round(((actual - anterior) / anterior) * 100);
  const contra = `vs. los ${dias} días anteriores`;
  if (pct === 0) return { texto: `= igual que los ${dias} días anteriores`, signo: 'igual' };
  return pct > 0
    ? { texto: `↑ ${pct} % ${contra}`, signo: 'sube' }
    : { texto: `↓ ${Math.abs(pct)} % ${contra}`, signo: 'baja' };
}

/** La serie diaria completa del periodo: los días sin ventas también, en 0. */
export function serieCompleta<T extends { date: string }>(
  serie: T[],
  from: string,
  dias: number,
  vacio: (date: string) => T,
): T[] {
  const porDia = new Map(serie.map((s) => [s.date, s]));
  return Array.from({ length: dias }, (_, i) => {
    const date = sumarDias(from, i);
    return porDia.get(date) ?? vacio(date);
  });
}
