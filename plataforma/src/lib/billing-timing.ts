/* ============================================================
   CUÁNDO ENTRA UN CAMBIO EN EL COBRO
   ------------------------------------------------------------
   Apagar un método de pedido o un módulo no baja la factura al
   instante. La regla antiabuso (migs. 073/078) es: para el cobro
   del periodo P, algo cuenta como apagado solo si lo estuvo >= 75%
   del ciclo ANTERIOR a P — así nadie apaga delivery el día 28,
   se ahorra el mes entero y lo vuelve a encender el día 1.

   El problema no era la regla, era contarla. La UI decía "el
   descuento entra hasta tu próximo cobro… necesitas dejarlo
   apagado al menos el 75% de los días de este mes", y eso es
   FALSO la mayor parte del mes: en un mes de 30 días hay que
   apagarlo antes del día ~8 para alcanzar el 75%. Quien lo apaga
   el día 20 esperaba el descuento el mes siguiente y le llegaba
   dos meses después, sin ningún aviso.

   Aquí se traduce la regla a lo único que el dueño necesita
   saber: EN QUÉ COBRO se va a notar. Nadie tiene que entender el
   75%; le decimos la fecha.
   ============================================================ */

/** Umbral de la migración 073/078: fracción del ciclo que hay que estar apagado. */
export const OFF_FRACTION_THRESHOLD = 0.75;

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function startOfMonthUTC(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex, 1));
}

export interface ChangeTiming {
  /** Primer cobro que reflejará el cambio (1er día de ese mes, UTC). */
  effectiveOn: Date;
  /** "agosto 2026" — el mes del cobro donde se nota. */
  label: string;
  /** ¿Se nota en el cobro inmediatamente siguiente, o hay que esperar uno más? */
  nextCycle: boolean;
  /** Fracción del ciclo en curso que quedaría apagado si el cambio es ahora (0-1). */
  fractionThisCycle: number;
  /**
   * Días que quedan para alcanzar el umbral en el ciclo en curso. 0 si ya
   * pasó la fecha (entonces el cambio se nota un cobro más tarde).
   */
  daysLeftToMakeIt: number;
}

/**
 * Si el dueño apaga algo AHORA y lo deja apagado, ¿en qué cobro se nota?
 *
 * Supone que hasta este momento estuvo encendido durante el ciclo en curso,
 * que es el caso normal y el conservador: si ya llevaba rato apagado, el
 * descuento puede entrar antes, nunca después. Así el aviso jamás promete de
 * más.
 */
export function whenChangeApplies(now: Date = new Date()): ChangeTiming {
  const y = now.getUTCFullYear();
  const mo = now.getUTCMonth();

  const cycleStart = startOfMonthUTC(y, mo);
  const nextCycleStart = startOfMonthUTC(y, mo + 1);

  const cycleMs = nextCycleStart.getTime() - cycleStart.getTime();
  const remainingMs = nextCycleStart.getTime() - now.getTime();
  const fractionThisCycle = Math.max(0, Math.min(1, remainingMs / cycleMs));

  const madeIt = fractionThisCycle >= OFF_FRACTION_THRESHOLD;
  // Si alcanza el umbral, se nota en el cobro del mes que viene; si no, en el
  // siguiente (ese ciclo sí estará apagado de punta a punta).
  const effectiveOn = madeIt ? nextCycleStart : startOfMonthUTC(y, mo + 2);

  // Último instante del ciclo en que apagar algo todavía alcanza el umbral.
  const deadline = new Date(nextCycleStart.getTime() - cycleMs * OFF_FRACTION_THRESHOLD);
  const daysLeftToMakeIt = madeIt
    ? Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / 86_400_000))
    : 0;

  return {
    effectiveOn,
    label: `${MONTHS[effectiveOn.getUTCMonth()]} ${effectiveOn.getUTCFullYear()}`,
    nextCycle: madeIt,
    fractionThisCycle,
    daysLeftToMakeIt,
  };
}

/** "tu cobro de agosto 2026" — para incrustar en una frase. */
export function chargeLabel(timing: ChangeTiming): string {
  return `tu cobro de ${timing.label}`;
}
