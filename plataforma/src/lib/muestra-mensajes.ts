/* Lo que se dicen la vitrina de diseños de la portada y el menú de muestra
   que lleva dentro (/preview/muestra, en un iframe del mismo origen).
   Aparte del componente para que la portada no cargue las plantillas: el
   que calcula el tema es el menú, no la portada. */

/** La portada pide un estilo (id de plantilla) y un nombre de restaurante. */
export interface MuestraPedido {
  type: 'leogin-muestra';
  estilo: string;
  nombre: string;
}

/** El menú avisa que ya puede recibir (`lista`) o que ya pintó un estilo
    (`aplicada`), para que la portada lo recorra desde arriba. */
export interface MuestraAviso {
  type: 'leogin-muestra-lista' | 'leogin-muestra-aplicada';
  estilo?: string;
}

export function esMuestraPedido(d: unknown): d is MuestraPedido {
  const m = d as Partial<MuestraPedido> | null;
  return !!m && m.type === 'leogin-muestra' && typeof m.estilo === 'string' && typeof m.nombre === 'string';
}

export function esMuestraAviso(d: unknown): d is MuestraAviso {
  const m = d as Partial<MuestraAviso> | null;
  return !!m && (m.type === 'leogin-muestra-lista' || m.type === 'leogin-muestra-aplicada');
}

/** Dónde se guarda la elección para traerla al crear el restaurante. */
export const MUESTRA_ELECCION_KEY = 'leogin:muestra-eleccion';

/** Cuánto tiempo vale la elección: una semana. Después ya no es «la que
    acabas de elegir». */
export const MUESTRA_ELECCION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface MuestraEleccion {
  estilo: string;
  nombre: string;
  /** Cuándo se eligió (ms). */
  t: number;
}

/** Lee la elección guardada si sigue vigente. Nunca lanza. */
export function leerEleccionMuestra(now = Date.now()): MuestraEleccion | null {
  try {
    const raw = window.localStorage.getItem(MUESTRA_ELECCION_KEY);
    if (!raw) return null;
    const e = JSON.parse(raw) as Partial<MuestraEleccion>;
    if (typeof e.estilo !== 'string' || typeof e.t !== 'number') return null;
    if (now - e.t > MUESTRA_ELECCION_TTL_MS) return null;
    return { estilo: e.estilo, nombre: typeof e.nombre === 'string' ? e.nombre.slice(0, 60) : '', t: e.t };
  } catch {
    return null;
  }
}

/** Ya se usó (el restaurante quedó creado): que no se arrastre a otro. */
export function borrarEleccionMuestra(): void {
  try {
    window.localStorage.removeItem(MUESTRA_ELECCION_KEY);
  } catch {
    /* nada que borrar */
  }
}

export function guardarEleccionMuestra(estilo: string, nombre: string): void {
  try {
    const e: MuestraEleccion = { estilo, nombre: nombre.trim().slice(0, 60), t: Date.now() };
    window.localStorage.setItem(MUESTRA_ELECCION_KEY, JSON.stringify(e));
  } catch {
    /* modo privado o almacenamiento bloqueado: se registra sin la elección */
  }
}
