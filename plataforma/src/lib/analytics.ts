/* ============================================================
   ANALÍTICA DE LA WEB COMERCIAL (auditoría 2026-10-02, WEB-01)
   ------------------------------------------------------------
   La web de ventas no medía nada: ni visitas, ni cuántos tocan «Crear
   mi restaurante», ni en qué paso del alta se van. Esto la conecta a
   una analítica SIN COOKIES (Umami o Plausible): no guarda nada en el
   navegador del visitante ni pide aviso de cookies.

   APAGADA hasta configurarla. Con las variables vacías no se carga
   ningún script, no se manda ningún evento y la CSP no cambia:

     NEXT_PUBLIC_ANALYTICS_PROVIDER = umami | plausible
     NEXT_PUBLIC_ANALYTICS_ID       = id del sitio en Umami (uuid) o
                                      dominio en Plausible (distleogin.com)
     NEXT_PUBLIC_ANALYTICS_SCRIPT   = (opcional) dirección del script, si
                                      la instancia es propia

   Solo en la web de Leogin (portada, planes, registro, Mi cuenta):
   NUNCA en el menú de un restaurante ni en el panel.

   El embudo, en cuatro eventos:
     · «Clic crear restaurante» — el botón principal (en el navegador).
     · «Cuenta creada», «Restaurante creado», «Primer platillo» — desde
       el servidor (lib/analytics-server.ts), así no los pierde un
       bloqueador de anuncios y no hace falta el script en el panel.
   ============================================================ */

export type ProveedorAnalitica = 'umami' | 'plausible';

export interface AnaliticaConfig {
  proveedor: ProveedorAnalitica;
  /** Id del sitio (Umami) o dominio (Plausible). */
  id: string;
  /** Dirección del script del navegador. */
  script: string;
  /** Origen al que el script y el servidor mandan los eventos (para la CSP). */
  origen: string;
}

const SCRIPT_POR_DEFECTO: Record<ProveedorAnalitica, string> = {
  umami: 'https://cloud.umami.is/script.js',
  // La variante «tagged-events» lee los eventos de las clases del enlace
  // (`plausible-event-name=…`), sin escribir JavaScript en cada botón.
  plausible: 'https://plausible.io/js/script.tagged-events.js',
};

/** La configuración, o null si la analítica está apagada (o mal escrita). */
export function analiticaConfig(env: Record<string, string | undefined> = {
  NEXT_PUBLIC_ANALYTICS_PROVIDER: process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER,
  NEXT_PUBLIC_ANALYTICS_ID: process.env.NEXT_PUBLIC_ANALYTICS_ID,
  NEXT_PUBLIC_ANALYTICS_SCRIPT: process.env.NEXT_PUBLIC_ANALYTICS_SCRIPT,
}): AnaliticaConfig | null {
  const proveedor = env.NEXT_PUBLIC_ANALYTICS_PROVIDER?.trim().toLowerCase();
  const id = env.NEXT_PUBLIC_ANALYTICS_ID?.trim();
  if ((proveedor !== 'umami' && proveedor !== 'plausible') || !id) return null;
  const script = env.NEXT_PUBLIC_ANALYTICS_SCRIPT?.trim() || SCRIPT_POR_DEFECTO[proveedor];
  try {
    const u = new URL(script);
    if (u.protocol !== 'https:' && u.hostname !== 'localhost') return null;
    return { proveedor, id, script: u.href, origen: u.origin };
  } catch {
    return null;
  }
}

export const EVENTOS = {
  clicCrear: 'Clic crear restaurante',
  cuentaCreada: 'Cuenta creada',
  restauranteCreado: 'Restaurante creado',
  primerPlatillo: 'Primer platillo',
} as const;
export type Evento = (typeof EVENTOS)[keyof typeof EVENTOS];

/**
 * Atributos para que un clic cuente como evento SIN JavaScript propio:
 * Umami lee `data-umami-event` y Plausible las clases `plausible-event-*`.
 * Se ponen los dos: con la analítica apagada son atributos inertes.
 */
export function eventoAlTocar(evento: Evento, lugar?: string): { className: string; data: Record<string, string> } {
  const plus = (s: string) => s.trim().replace(/\s+/g, '+');
  const data: Record<string, string> = { 'data-umami-event': evento };
  const clases = [`plausible-event-name=${plus(evento)}`];
  if (lugar) {
    data['data-umami-event-lugar'] = lugar;
    clases.push(`plausible-event-lugar=${plus(lugar)}`);
  }
  return { className: clases.join(' '), data };
}

/** Lo mismo, listo para esparcir en un enlace que ya tiene sus clases. */
export function conEvento(className: string, evento: Evento, lugar?: string): Record<string, string> {
  const ev = eventoAlTocar(evento, lugar);
  return { className: `${className} ${ev.className}`, ...ev.data };
}
