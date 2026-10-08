/**
 * Íconos de la PWA "Leogin" (la puerta de entrada al panel).
 *
 * Los DOS manifests que pueden describirla —`/api/admin-manifest` (páginas del
 * panel) y `src/app/manifest.ts` sin restaurante (Mi cuenta, /login, la
 * portada)— comparten `id: '/'`, así que para Android son LA MISMA app. Si
 * declaran íconos distintos, el WebAPK instalado detecta "el ícono cambió" en
 * cada cruce entre una página y otra y pide confirmación con el diálogo
 * "Revisar actualización del ícono" (reportado el 2026-10-08, "Leogin → Leogin"
 * con el mismo nombre y casi el mismo dibujo: antes uno traía 192+512 `any` y
 * el otro 512 `any`+`maskable`).
 *
 * Una sola lista, importada por los dos, para que no puedan volver a divergir.
 */
export const LEOGIN_PWA_ICONS = [
  { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
] as const;
