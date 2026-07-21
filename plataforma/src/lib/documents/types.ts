/* ============================================================
   TIPOS COMPARTIDOS — documentos PDF/Excel descargables
   ------------------------------------------------------------
   Una sola forma de "marca" para los 3 niveles de documento:
   Leogin (recibos de cobro a restaurantes), restaurante (sus
   propios reportes) y organización (reportes de grupo/franquicia).
   Ver src/lib/documents/branding.ts para cómo se resuelve cada una.
   ============================================================ */

export interface DocumentBranding {
  kind: 'leogin' | 'restaurant' | 'organization';
  /** Nombre a mostrar: marca del restaurante, de la organización, o "Leogin". */
  name: string;
  subtitle: string | null;
  accentHex: string;
  accentRgb: [number, number, number];
  /** Color de texto legible sobre `accentHex` ('#FFFFFF' o tinta oscura), ya decidido vía isLight(). */
  onAccentHex: string;
  /** Ruta same-origin (/api/doc-logo/...) del logo, o null si no hay uno configurado. */
  logoUrl: string | null;
  currencySymbol: string;
  currencyPosition: 'prefix' | 'suffix';
  locale: string;
}

export const LEOGIN_INK = '#18181B';
export const LEOGIN_MUTED = '#71717A';

/** Marca fija de Leogin — recibos de cobro a restaurantes (nunca marca de tenant). */
export const LEOGIN_BRANDING: DocumentBranding = {
  kind: 'leogin',
  name: 'Leogin',
  subtitle: 'Menús digitales para restaurantes',
  accentHex: '#D97757',
  accentRgb: [217, 119, 87],
  onAccentHex: '#FFFFFF',
  logoUrl: null,
  currencySymbol: 'Q',
  currencyPosition: 'prefix',
  locale: 'es-GT',
};
