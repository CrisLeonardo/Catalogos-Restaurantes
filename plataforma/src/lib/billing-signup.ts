import { DIAS_PRUEBA, type PlanCode } from '@/lib/plans';

/* ============================================================
   COBRO DE UN RESTAURANTE RECIÉN CREADO
   ------------------------------------------------------------
   Vive aparte —y sin dependencias de servidor— porque la misma decisión se
   toma en dos altas distintas: la de la calle (registro) y la de "crear
   otro restaurante" dentro de Mi cuenta. Estaban duplicadas literalmente,
   que es como una regla de negocio acaba diciendo dos cosas distintas sin
   que nadie lo note.

   La prueba voluntaria es una por establecimiento.
   ============================================================ */

/* ── El día de cobro es el del alta ───────────────────────────
   Auditoría de lanzamiento 2026-11-23 (LZ-01). Sin esto la fila nacía con
   billing_day = 1: el cron generaba la mensualidad del mes con vencimiento
   el día 1, ya pasado, y desde el día 12 (10 de gracia) quien se daba de
   alta contaba como moroso, con suspensión automática si está encendida.
   Ahora cada mensualidad vence en el aniversario del alta. El 29, 30 y 31
   se cobran el 28, como todo el sistema (billing_day va de 1 a 28). */
export function diaDeCobroDelAlta(now: number = Date.now()): { billing_day: number; started_at: string } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(now));
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? '';
  return { billing_day: Math.min(28, Number(v('day'))), started_at: `${v('year')}-${v('month')}-${v('day')}` };
}

/** La fila de `restaurant_billing` con la que nace un restaurante. */
export type NewRestaurantBilling = {
  auto_price: true;
  /** Día del mes en que vence cada mensualidad: el del alta (máx. 28). */
  billing_day: number;
  /** Inicio del servicio, en fecha de Guatemala. */
  started_at: string;
  /** Suscripción en marcha (se cobra). En prueba es `false`. */
  active: boolean;
  trial_ends_at: string | null;
  trial_started_at?: string;
  trial_started_by?: string;
  trial_plan?: PlanCode;
  currency: 'GTQ';
};

export function newRestaurantBilling(input: {
  planCode: PlanCode;
  /** Días de prueba configurados en /super/configuracion. */
  trialDays: number;
  ownerId?: string;
  now?: number;
}): NewRestaurantBilling {
  const base = { auto_price: true, currency: 'GTQ', ...diaDeCobroDelAlta(input.now) } as const;

  // BÁSICO es gratis para siempre: no hay nada que probar ni que graduar,
  // así que nace activo y sin prueba, sea el primero o el quinto.
  if (input.planCode === 'BASICO') {
    return { ...base, active: true, trial_ends_at: null };
  }

  if (!(input.trialDays > 0)) {
    return { ...base, active: true, trial_ends_at: null };
  }

  const inicio = input.now ?? Date.now();
  return {
    ...base,
    active: false,
    trial_started_at: new Date(inicio).toISOString(),
    trial_started_by: input.ownerId,
    trial_plan: input.planCode,
    trial_ends_at: new Date(inicio + DIAS_PRUEBA * 86_400_000).toISOString(),
  };
}
