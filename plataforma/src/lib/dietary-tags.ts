/* ============================================================
   ALÉRGENOS Y DIETAS — vocabulario fijo (Fase 3 auditoría de lanzamiento)
   ------------------------------------------------------------
   A diferencia de `Product.tags` (texto libre de mercadeo: "Nuevo",
   "Favorito"), estas son claves estructuradas para poder mostrar el mismo
   ícono + texto en cualquier restaurante y, más adelante, traducirlas
   (ver lib/locale). El dueño solo elige de esta lista — no escribe texto
   libre — para que el comensal pueda confiar en el ícono.
   ============================================================ */

export type DietaryTagKind = 'diet' | 'allergen';

export interface DietaryTagOption {
  key: string;
  label: string;
  labelEn: string;
  icon: string;
  kind: DietaryTagKind;
}

export const DIETARY_TAG_OPTIONS: DietaryTagOption[] = [
  // ── Dietas ("apto para") ──
  { key: 'vegetariano',    label: 'Vegetariano',      labelEn: 'Vegetarian',   icon: '🥕', kind: 'diet' },
  { key: 'vegano',         label: 'Vegano',           labelEn: 'Vegan',        icon: '🌱', kind: 'diet' },
  { key: 'sin_gluten',     label: 'Sin gluten',       labelEn: 'Gluten-free',  icon: '🌾', kind: 'diet' },
  { key: 'sin_lactosa',    label: 'Sin lactosa',      labelEn: 'Dairy-free',   icon: '🥛', kind: 'diet' },
  { key: 'bajo_en_azucar', label: 'Bajo en azúcar',   labelEn: 'Low sugar',    icon: '🍬', kind: 'diet' },
  { key: 'picante',        label: 'Picante',          labelEn: 'Spicy',        icon: '🌶️', kind: 'diet' },

  // ── Alérgenos ("contiene") ──
  { key: 'contiene_gluten',       label: 'Contiene gluten',       labelEn: 'Contains gluten',    icon: '🌾', kind: 'allergen' },
  { key: 'contiene_lacteos',      label: 'Contiene lácteos',      labelEn: 'Contains dairy',     icon: '🥛', kind: 'allergen' },
  { key: 'contiene_frutos_secos', label: 'Contiene frutos secos', labelEn: 'Contains nuts',      icon: '🥜', kind: 'allergen' },
  { key: 'contiene_mariscos',     label: 'Contiene mariscos',     labelEn: 'Contains shellfish',  icon: '🦐', kind: 'allergen' },
  { key: 'contiene_huevo',        label: 'Contiene huevo',        labelEn: 'Contains egg',       icon: '🥚', kind: 'allergen' },
  { key: 'contiene_soya',         label: 'Contiene soya',         labelEn: 'Contains soy',       icon: '🫘', kind: 'allergen' },
];

export const DIETARY_TAG_MAP: Record<string, DietaryTagOption> = Object.fromEntries(
  DIETARY_TAG_OPTIONS.map((o) => [o.key, o]),
);

export const DIETARY_TAG_KEYS = new Set(DIETARY_TAG_OPTIONS.map((o) => o.key));

/** Filtra una lista cruda a solo claves válidas del vocabulario (defensa server-side). */
export function sanitizeDietaryTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v === 'string' && DIETARY_TAG_KEYS.has(v) && !out.includes(v)) out.push(v);
  }
  return out;
}
