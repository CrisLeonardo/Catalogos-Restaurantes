/* ============================================================
   ¿QUÉ DICE EL PANEL SOBRE LA PC PRINCIPAL?
   ------------------------------------------------------------
   Función pura (sin React, sin Supabase) para poder probarla: la regla es
   corta pero se equivocaba en algo que importa. `is_active` es del
   RESTAURANTE, no del aparato desde el que se mira, así que el interruptor
   salía encendido en el celular del dueño, en la laptop de su casa y en la
   tablet del mesero — como si cada uno de esos aparatos fuera el servidor
   del local.

   Aquí se cruzan dos datos que antes no se cruzaban:
     · ¿el LOCAL tiene una PC principal encendida?   (is_active)
     · ¿es ESTE aparato?                             (activated_device_id)

   Y hay un tercer estado que no se puede saltar: 'unknown'. Las
   instalaciones anteriores a la migración 110 no guardaron desde dónde se
   encendieron. Inventarse un "sí, es esta" ahí sería repetir el mismo error
   que se está arreglando, así que se dice que no se sabe.
   ============================================================ */

/** Lo que la pantalla necesita saber de print_agents (subconjunto de PrintAgentConfig). */
export interface MainPcInput {
  exists: boolean;
  isActive: boolean;
  lastSeenAt: string | null;
  deviceName: string | null;
  activatedDeviceId: string | null;
  activatedDeviceLabel: string | null;
}

/** Dónde está la PC principal respecto de quien mira la pantalla. */
export type PcWhere = 'none' | 'this' | 'other' | 'unknown';

export interface PcStatus {
  /** El LOCAL tiene una PC principal encendida. No dice cuál. */
  on: boolean;
  /** Esa PC es el aparato desde el que se está mirando. */
  isThisDevice: boolean;
  /** Está respondiendo ahora mismo (heartbeat < 90 s). */
  live: boolean;
  where: PcWhere;
  label: string;
  detail: string;
  tone: 'ok' | 'warn' | 'off';
  /** Cómo llamarla en los textos ("Caja-01" / "Windows · Chrome" / null). */
  deviceLabel: string | null;
}

/** Minutos desde un ISO, o null si no hay fecha. */
function minutesSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (now - t) / 60_000;
}

function agoLabel(mins: number): string {
  return mins < 60 ? `hace ${Math.round(mins)} min` : `hace ${Math.round(mins / 60)} h`;
}

export function readMainPcStatus(
  config: MainPcInput | null,
  deviceId: string | null,
  now: number = Date.now(),
): PcStatus {
  const base = { on: false, isThisDevice: false, live: false, where: 'none' as PcWhere, deviceLabel: null };

  if (!config?.exists) {
    return {
      ...base, tone: 'off',
      label: 'Todavía no tienes una PC principal',
      detail: 'Sin ella no se imprimen comandas solas y el local se detiene si falla el internet.',
    };
  }

  // El nombre que reporta el agente manda sobre el que puso el navegador al
  // encenderla: uno es el equipo de verdad, el otro una etiqueta provisional.
  const name = config.deviceName || config.activatedDeviceLabel || null;

  if (!config.isActive) {
    return {
      ...base, tone: 'warn',
      deviceLabel: name,
      label: 'PC principal apagada',
      detail: name
        ? `La apagaste tú. Era ${name}; sus impresoras siguen guardadas.`
        : 'La apagaste tú. Las impresoras que tenías asignadas siguen guardadas.',
    };
  }

  const where: PcWhere = !config.activatedDeviceId
    ? 'unknown'
    : deviceId && config.activatedDeviceId === deviceId
      ? 'this'
      : 'other';
  const isThisDevice = where === 'this';
  const mins = minutesSince(config.lastSeenAt, now);
  const live = mins != null && mins < 1.5;

  // Cómo se nombra a sí misma la pantalla. Los agentes anteriores a 0.7.1 no
  // mandan el nombre del equipo: mejor "PC principal configurada" que
  // afirmar un "esta computadora" que puede ser falso.
  const label = isThisDevice
    ? 'Esta computadora es la PC principal'
    : name
      ? `PC principal: ${name}`
      : 'PC principal configurada';

  if (mins == null) {
    return {
      on: true, isThisDevice, live: false, where, deviceLabel: name, tone: 'warn',
      label: isThisDevice ? 'Esperando a esta computadora' : 'Esperando a la PC principal',
      detail: 'Ya quedó encendida; en cuanto el servicio arranque, aquí dirá «Conectada».',
    };
  }

  if (live) {
    return {
      on: true, isThisDevice, live: true, where, deviceLabel: name, tone: 'ok',
      label,
      detail: isThisDevice
        ? 'Conectada y funcionando. Imprime sola y cubre los cortes de internet.'
        : where === 'other'
          ? 'Conectada y funcionando. Este dispositivo no es la PC principal: solo la estás viendo desde aquí.'
          : 'Conectada y funcionando. Se encendió antes de esta versión, así que no podemos confirmar desde qué computadora.',
    };
  }

  return {
    on: true, isThisDevice, live: false, where, deviceLabel: name, tone: 'warn',
    label,
    detail: isThisDevice
      ? `Sin responder desde ${agoLabel(mins)}. El servicio de esta computadora no está corriendo.`
      : `Sin responder desde ${agoLabel(mins)}. ¿Está encendida y con internet?`,
  };
}
