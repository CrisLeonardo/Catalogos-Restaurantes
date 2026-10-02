import type { CSSProperties } from 'react';

/* ============================================================
   RÓTULO DE CAMPO — uno solo para todo el panel.
   ------------------------------------------------------------
   Cada formulario tenía su `labelStyle` propio y casi todos en
   MAYÚSCULAS espaciadas («NOMBRE *», «CÓDIGO *», «PUNTOS
   OTORGADOS»), mientras los rótulos de sección del rediseño
   (`.adm-label`) van en minúscula. Catorce copias, cuatro
   tamaños (10,5 a 12,5 px) y dos maneras de escribir lo mismo
   (auditoría 2026-10-02, T-11). Este es el único.
   ============================================================ */
export const FIELD_LABEL: CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  lineHeight: 1.35,
  color: 'var(--u-text-2)',
  marginBottom: 6,
};
