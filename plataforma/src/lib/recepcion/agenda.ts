/* ============================================================
   RECEPCIÓN · cálculos puros (auditoría 1.8: R17, R18)
   ------------------------------------------------------------
   Sin servidor ni base: los usan la agenda, la hoja de reserva y la lista
   de espera. La ocupación replica `leogin_ocupacion_reservas` (migración
   178), que es quien decide al guardar; aquí sólo se dibuja y se sugiere.
   ============================================================ */

import type { MesaRecepcion } from '@/lib/db/table-sessions';

/** Plazas que se suponen para una mesa sin plazas en el plano. */
export const PLAZAS_SUPUESTAS = 4;

export type Aforo = {
  /** Personas a la vez que caben; null si el local no tiene mesas configuradas. */
  total: number | null;
  /** Cuántas mesas no tienen plazas definidas (se contaron de 4). */
  sinPlazas: number;
};

export function aforoDeMesas(mesas: readonly MesaRecepcion[]): Aforo {
  if (mesas.length === 0) return { total: null, sinPlazas: 0 };
  const sinPlazas = mesas.filter((m) => m.capacidad == null).length;
  const total = mesas.reduce((s, m) => s + (m.capacidad ?? PLAZAS_SUPUESTAS), 0);
  return { total, sinPlazas };
}

/** «20:30» o «20:30:00» → minutos desde la medianoche. */
export function aMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function aHora(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export type ReservaViva = { time: string; party_size: number; id?: string };

/** Personas a la vez entre `desde` y `desde + duración` (mismo cálculo que la 178). */
export function ocupacionEn(reservas: readonly ReservaViva[], desde: number, duracion: number, excluir?: string): number {
  const vivas = reservas
    .filter((r) => !excluir || r.id !== excluir)
    .map((r) => ({ inicio: aMinutos(r.time), pax: r.party_size }))
    .filter((r) => r.inicio < desde + duracion && desde < r.inicio + duracion);
  const instantes = [desde, ...vivas.map((v) => v.inicio).filter((i) => i > desde)];
  let max = 0;
  for (const x of instantes) {
    const total = vivas.filter((v) => v.inicio <= x && x < v.inicio + duracion).reduce((s, v) => s + v.pax, 0);
    max = Math.max(max, total);
  }
  return max;
}

export type Franja = { hora: string; personas: number; aforo: number | null; alta: boolean };

/**
 * Agenda por horas: personas previstas a la vez dentro de cada hora. Va de
 * la primera a la última reserva del día (o del horario dado).
 */
export function franjasDelDia(
  reservas: readonly ReservaViva[], aforo: number | null, duracion: number,
  desdeHora?: number, hastaHora?: number,
): Franja[] {
  const inicios = reservas.map((r) => aMinutos(r.time));
  if (inicios.length === 0 && desdeHora == null) return [];
  const primera = desdeHora ?? Math.floor(Math.min(...inicios) / 60);
  const ultima = hastaHora ?? Math.floor(Math.max(...inicios) / 60);
  const franjas: Franja[] = [];
  for (let h = primera; h <= ultima; h++) {
    // Lo máximo que habrá a la vez en algún momento de esa hora.
    let personas = 0;
    for (const x of [h * 60, ...inicios.filter((i) => i >= h * 60 && i < h * 60 + 60)]) {
      personas = Math.max(personas, ocupadasEnInstante(reservas, x, duracion));
    }
    franjas.push({ hora: aHora(h * 60), personas, aforo, alta: aforo != null && personas >= aforo * 0.8 });
  }
  return franjas;
}

function ocupadasEnInstante(reservas: readonly ReservaViva[], x: number, duracion: number): number {
  return reservas.filter((r) => { const i = aMinutos(r.time); return i <= x && x < i + duracion; })
    .reduce((s, r) => s + r.party_size, 0);
}

/**
 * Horas cercanas (cada 30 min, hasta 3 h antes o después) donde el grupo sí
 * cabe. Las más cercanas primero.
 */
export function horasConLugar(
  reservas: readonly ReservaViva[], personas: number, aforo: number, duracion: number,
  horaPedida: number, max = 2, excluir?: string,
): { hora: string; libres: number }[] {
  const salida: { hora: string; libres: number; dist: number }[] = [];
  for (let paso = 1; paso <= 6; paso++) {
    for (const signo of [1, -1]) {
      const h = horaPedida + signo * paso * 30;
      if (h < 0 || h >= 24 * 60) continue;
      const libres = aforo - ocupacionEn(reservas, h, duracion, excluir);
      if (libres >= personas) salida.push({ hora: aHora(h), libres, dist: paso });
    }
  }
  return salida.sort((a, b) => a.dist - b.dist).slice(0, max).map(({ hora, libres }) => ({ hora, libres }));
}

export type MesaSugerida = { mesa: number; motivo: string } | null;

/** La mesa libre más justa para el grupo; sin plazas definidas, la primera libre. */
export function mesaSugerida(libres: readonly MesaRecepcion[], personas: number): MesaSugerida {
  const conPlazas = libres.filter((m) => m.capacidad != null && m.capacidad >= personas)
    .sort((a, b) => (a.capacidad! - b.capacidad!) || a.n - b.n);
  if (conPlazas[0]) {
    const m = conPlazas[0];
    const mayor = libres.some((x) => x.capacidad != null && x.capacidad > m.capacidad!);
    return {
      mesa: m.n,
      motivo: m.capacidad === personas
        ? `Justa para ${personas}.`
        : mayor ? `La más justa para ${personas}: no ocupa una más grande.` : `Tiene ${m.capacidad} plazas.`,
    };
  }
  // Una mesa sin plazas en el plano sólo se sugiere para un grupo que
  // razonablemente cabe en una mesa típica; a 14 personas no se les manda a la 1.
  const sinDato = personas <= PLAZAS_SUPUESTAS ? libres.find((m) => m.capacidad == null) : undefined;
  return sinDato ? { mesa: sinDato.n, motivo: 'Sin plazas definidas en el plano: revisa que quepan.' } : null;
}

/**
 * Espera estimada como rango (R18.6): del cuartil bajo al alto de las
 * esperas de hoy, redondeado a 5 min. Con menos de 3 grupos no se estima.
 */
export function rangoDeEspera(minutos: readonly number[]): { desde: number; hasta: number; grupos: number } | null {
  const v = minutos.filter((m) => Number.isFinite(m) && m >= 0).sort((a, b) => a - b);
  if (v.length < 3) return null;
  const q = (p: number) => v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
  const r5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);
  const desde = r5(q(0.25));
  return { desde, hasta: Math.max(desde, r5(q(0.75))), grupos: v.length };
}

export type EstadoAviso = 'sin_avisar' | 'abierto' | 'avisado';

/** Abrir WhatsApp no es avisar: sólo cuenta lo que el host confirmó (PA-T20). */
export function estadoDeAviso(e: { status: string; aviso_abierto_at?: string | null }): EstadoAviso {
  if (e.status === 'NOTIFIED') return 'avisado';
  return e.aviso_abierto_at ? 'abierto' : 'sin_avisar';
}
