/* Las estructuras y paletas que enseña la vitrina de diseños de la portada
   (components/landing-disenos.tsx). Se arma en el servidor: la portada solo
   recibe nombres y colores, no el catálogo de plantillas. */

import { MENU_STRUCTURES, templatesForStructure, type StructureId } from '@/lib/theme/templates';
import { DEFAULT_CONFIG } from '@/lib/theme/defaults';

export interface DisenoEstilo { id: string; nombre: string; bg: string; accent: string; text: string }
export interface Diseno { id: string; nombre: string; hint: string; estilos: DisenoEstilo[] }

/* Cada estructura con su paleta de firma y dos más escogidas para enseñar el
   rango (una clara si la de firma es oscura, y al revés). Tres y no
   veinticinco: con todas a la vista nadie elige
   (docs/planes/PLAN_EXPERIENCIA_VIVA_2026-10-26.md §1.8). */
export const PALETAS_VITRINA: Record<StructureId, [string, string]> = {
  clasico:  ['taqueria-viva', 'jardin-fresco'],
  carta:    ['marfil-oro', 'zen-carbon'],
  revista:  ['trattoria', 'neon-urbano'],
  kiosco:   ['naranja-reparto', 'medianoche-azul'],
  estantes: ['oceano', 'fuego-amarillo'],
  pizarra:  ['brasa-humo', 'cafe-barrio'],
  compacto: ['nieve-minimal', 'lounge-violeta'],
  vitrina:  ['cacao', 'pistache'],
};

export function disenosDeLaPortada(): Diseno[] {
  return MENU_STRUCTURES.map((s) => {
    const todas = templatesForStructure(s.id);
    const elegidas = [todas[0], ...PALETAS_VITRINA[s.id].map((p) => todas.find((t) => t.palette === p))]
      .filter((t): t is NonNullable<typeof t> => !!t);
    return {
      id: s.id,
      nombre: s.name,
      hint: s.hint,
      estilos: elegidas.map((t) => {
        const c = { ...DEFAULT_CONFIG, ...t.config };
        return { id: t.id, nombre: t.name, bg: c.colorBg, accent: c.colorAccent, text: c.colorText };
      }),
    };
  });
}
