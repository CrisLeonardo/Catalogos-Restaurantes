/* ============================================================
   PERSONALIZAR CON AYUDA (ficha 2.7 de la auditoría: R32, X22, A04)
   ------------------------------------------------------------
   El dueño quiere que su carta se vea bien sin saber de diseño, y
   encontraba 8 estructuras × 26 paletas (208 combinaciones). Aquí se
   eligen TRES composiciones completas según lo que la carta ya tiene:
   cuántos platillos llevan foto, cuántos son y si vende sobre todo para
   llevar. Las 208 siguen en «Ver todos los diseños».

   Una combinación con poco contraste nunca se recomienda; en el catálogo
   completo lleva la marca «Poco legible» (`legibilidad`).
   ============================================================ */

import {
  composeTemplate, findPalette, findStructure, MENU_STRUCTURES, palettesForStructure,
  structureOfConfig, type BuiltinTemplate, type StructureId,
} from '@/lib/theme/templates';
import { DEFAULT_CONFIG, type ThemeConfig } from '@/lib/theme/defaults';

/* ── Contraste (WCAG 2.2) ─────────────────────────────────── */

function canal(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminancia(hex: string): number | null {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}/i.test(h)) return null;
  const n = parseInt(h.slice(0, 6), 16);
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
}

/** Razón de contraste entre dos colores (1 a 21); null si alguno no se entiende. */
export function contraste(a: string, b: string): number | null {
  const la = luminancia(a);
  const lb = luminancia(b);
  if (la == null || lb == null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * ¿Se lee? Texto sobre fondo a 4.5:1 (cuerpo) y la letra del botón sobre el
 * acento a 3:1 (botón grande y en negrita). Un color que no se entiende no
 * se da por legible.
 */
export function legibilidad(config: Partial<ThemeConfig>): { ok: boolean; texto: number | null; boton: number | null } {
  const c = { ...DEFAULT_CONFIG, ...config };
  const texto = contraste(c.colorText, c.colorBg);
  const boton = contraste(c.onAccent, c.colorAccent);
  return { ok: texto != null && boton != null && texto >= 4.5 && boton >= 3, texto, boton };
}

/* ── Lo que la carta ya tiene ─────────────────────────────── */

export interface SenalesDeCarta {
  /** Platillos activos. */
  total: number;
  /** De esos, cuántos tienen foto. */
  conFoto: number;
  /** Vende sobre todo para llevar o a domicilio (sin comer en el local). */
  paraLlevar: boolean;
}

export type ClaveRecomendacion = 'fotos' | 'rapida' | 'elegante' | 'app' | 'revista';

const DEF: Record<ClaveRecomendacion, { titulo: string; desc: string; estructura: StructureId }> = {
  fotos: { titulo: 'Fotos grandes', desc: 'Tus platillos se venden con la vista', estructura: 'clasico' },
  rapida: { titulo: 'Rápida de pedir', desc: 'Una fila por platillo, para el que tiene prisa', estructura: 'compacto' },
  elegante: { titulo: 'Carta elegante', desc: 'Sin fotos: nombre y precio, como impresa', estructura: 'carta' },
  app: { titulo: 'Como app de comida', desc: 'Se entra por categoría en tarjetas grandes', estructura: 'kiosco' },
  revista: { titulo: 'Revista', desc: 'Fotos de distintos tamaños, para lucir la carta', estructura: 'revista' },
};

/** El orden de las tres según la carta. Puro y probado. */
export function clavesRecomendadas(s: SenalesDeCarta): ClaveRecomendacion[] {
  const fotos = s.total > 0 ? s.conFoto / s.total : 0;
  let orden: ClaveRecomendacion[];
  if (fotos >= 0.6) orden = ['fotos', s.paraLlevar ? 'app' : 'revista', 'rapida'];
  else if (fotos >= 0.25) orden = ['rapida', 'fotos', s.paraLlevar ? 'app' : 'elegante'];
  /* Casi sin fotos: una rejilla de cuadros vacíos se ve peor que una buena
     carta de texto, así que «Fotos grandes» ni se ofrece. */
  else orden = ['elegante', 'rapida', s.paraLlevar ? 'app' : 'fotos'];
  // Con muchos platillos, lo que se agradece es encontrar rápido.
  if (s.total > 60 && orden[0] !== 'rapida') orden = (['rapida', ...orden.filter((k) => k !== 'rapida')] as ClaveRecomendacion[]).slice(0, 3);
  return orden;
}

export interface Recomendacion {
  clave: ClaveRecomendacion;
  titulo: string;
  desc: string;
  plantilla: BuiltinTemplate;
}

/** La primera paleta legible de la estructura, empezando por la suya. */
function plantillaLegible(estructura: StructureId): BuiltinTemplate {
  const s = findStructure(estructura) ?? MENU_STRUCTURES[0];
  for (const p of palettesForStructure(s)) {
    const t = composeTemplate(s, p);
    if (legibilidad(t.config).ok) return t;
  }
  return composeTemplate(s, findPalette(s.signature) ?? palettesForStructure(s)[0]);
}

export function recomendaciones(s: SenalesDeCarta): Recomendacion[] {
  return clavesRecomendadas(s).map((clave) => ({
    clave, titulo: DEF[clave].titulo, desc: DEF[clave].desc, plantilla: plantillaLegible(DEF[clave].estructura),
  }));
}

/** ¿Es este el diseño que la carta tiene hoy? (misma estructura y colores) */
export function esElActual(config: ThemeConfig, tpl: BuiltinTemplate): boolean {
  return structureOfConfig(config) === tpl.structure
    && (tpl.config.colorBg ?? DEFAULT_CONFIG.colorBg).toLowerCase() === config.colorBg.toLowerCase()
    && (tpl.config.colorAccent ?? DEFAULT_CONFIG.colorAccent).toLowerCase() === config.colorAccent.toLowerCase();
}

/* ── Qué cambió al publicar ───────────────────────────────── */

/** Nombre de la estructura y de los colores de una config, si son de la galería. */
export function nombreDelDiseno(config: ThemeConfig): { estructura: string; colores: string | null } {
  const sid = structureOfConfig(config);
  const estructura = findStructure(sid)?.name ?? 'A tu medida';
  const s = findStructure(sid) ?? MENU_STRUCTURES[0];
  const pal = palettesForStructure(s).find((p) => {
    const t = composeTemplate(s, p);
    return (t.config.colorBg ?? '').toLowerCase() === config.colorBg.toLowerCase()
      && (t.config.colorAccent ?? '').toLowerCase() === config.colorAccent.toLowerCase();
  });
  return { estructura, colores: pal?.name ?? null };
}
