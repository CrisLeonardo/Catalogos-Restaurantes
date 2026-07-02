# Auditoría visual y de personalización — 2026-07-02

Auditoría completa del sistema de personalización (panel admin → BD → menú del comensal)
con foco en: bugs visuales/interactivos, contraste adaptativo (temas claros) y opciones
del panel que no tienen efecto real.

## Arquitectura verificada

- `src/lib/theme/defaults.ts` — ThemeConfig/ThemeContent + defaults.
- `src/lib/theme/resolve.ts` — merge de capas + `buildThemeVars()` → variables CSS.
- `src/app/layout.tsx` — inyecta `:root{vars}` + `data-scheme` + `data-glass` en `<html>`.
- `src/app/globals.css` — sistema glass + overrides `html[data-scheme="light"]`.
- `src/components/admin/admin-theme-editor.tsx` — editor del dueño (7 tabs).
- Componentes cliente (`menu/*`, checkout, tracking) consumen vars vía `--u-*`, `--surface-*`, roles `ct-*`.

## Hallazgos

### A. Opciones del panel SIN efecto real (críticos de confianza)

| # | Opción | Causa raíz |
|---|--------|-----------|
| A1 | **"Escala de texto global" (`fontScale`)** | Solo alimenta `--fs-*`, que consumen la landing y páginas de plataforma. El menú del comensal fija píxeles inline multiplicados por `typography.<rol>.size` — nunca por `fontScale`. Efecto casi nulo. |
| A2 | **"Brillo que sigue al cursor" (`sheen`)** | `Glass` tiene prop `sheen` con default `true`, pero NADIE le pasa `config.sheen`. El toggle guarda en BD y no cambia nada. |
| A3 | **"Tipografía del panel" (`adminPanelFont`)** | `--admin-panel-font` solo se aplica a `.admin-sidebar` y `.admin-topbar`; el área de contenido no la hereda. |
| A4 | **"Tamaño del texto" del panel (`adminPanelTextScale`)** | `--admin-panel-scale` solo escala los navlinks del sidebar/tab bar. El contenido no cambia. |
| A5 | **"Redondez" del panel (`adminPanelRadius`)** | Ídem: solo el border-radius de los navlinks. Las tarjetas del panel no cambian. |
| A6 | **Barra "Guardar" del editor** | `background: linear-gradient(to top, var(--u-bg) …)` — **`--u-bg` no existe**. El velo tras el botón Guardar es transparente y el contenido se encima. |

### B. Contraste roto con paletas claras (herencia de plantilla oscura)

| # | Dónde | Problema |
|---|-------|----------|
| B1 | `.btn-white` (globals.css) | Chip blanco fijo (`#fff→#e9e6df`, texto `#0b0b0c`). Con fondo claro: botón lavado/invisible. Es el estilo **por defecto** del CTA. Lo usan también el "+" de agregar (catalog) y el CTA del carrito — **hardcodeados**, ignoran `ctaStyle`. |
| B2 | Verdes/rojos de estado (`#4ade80`, `#f87171`, `#ff6b6b`, `#22c55e`, `#fbbf24`) | Tonos -400 pensados para fondo oscuro. Sobre fondo claro: contraste ~2:1 (reprueba WCAG). Aparecen en checkout (descuentos, errores, cambio), banner "cerrado", combos del product-sheet, encuestas, lealtad, cuenta. |
| B3 | `button:focus-visible` | Anillo `rgba(255,255,255,0.7)` fijo → invisible en claro. |
| B4 | `::selection` | Colores fijos del tema Carbón. |
| B5 | `@keyframes pulse-ring` + usos (portada, order-tracker, topbar) | Halo blanco fijo → invisible en claro. |
| B6 | Chips/inputs con `rgba(255,255,255,0.05–0.10)` | catalog:243 (ícono "más tarde"), rewards-section:295 (input), install-banner:147/229 (botones), glass.tsx Tag. Blanco-sobre-blanco en claro. |
| B7 | Panel admin claro | Hovers del nav (`rgba(255,255,255,0.06)`), scrollbar, chip del logo, ícono de usuario, border-top de la tab bar móvil: todos blanco fijo → invisibles con sidebar claro. |
| B8 | Área de contenido del admin | `.admin-main` NO redirige `--u-text*`: si el dueño fija un "Fondo del contenido" oscuro con tema de cliente claro (o viceversa), texto ilegible. Los selects del editor fuerzan `#1a1a1a` + `color-scheme: dark` aunque el panel sea claro. |
| B9 | Controles del editor (tabs, Toggle off, Segmented off, inputs, paletas) | Rellenos `rgba(255,255,255,0.03–0.12)` fijos. |

### C. Limpieza / código muerto

- `glass.tsx` exporta `Price` y `Tag` **duplicados** de `menu/ui.tsx`; ningún archivo los importa → eliminar.
- `globals.css` tiene comentarios con mojibake (UTF-8 doble-codificado por ediciones viejas con Set-Content) → normalizar.
- `border-top` de `.admin-nav` móvil con color fijo en vez de `var(--admin-panel-hair)`.

## Plan de acción (orden de ejecución)

1. **Tokens semánticos adaptativos** en `globals.css`:
   `--c-ok`, `--c-danger`, `--c-warn`, `--c-ok-solid` con override en `html[data-scheme="light"]`
   (tonos -600/-700 legibles sobre claro). `--pulse-ink` para el halo del pulso.
2. **`.btn-white` adaptativo**: en `html[data-scheme="light"]` se invierte a "chip de tinta"
   (`var(--u-text)` como fondo, `var(--brand-bg)` como texto). En oscuro queda pixel-perfect igual.
3. **CTAs coherentes**: el "+" del catálogo y el CTA del carrito pasan a `ctaClass(config.ctaStyle)`.
4. **`fontScale` real**: `roleSize()` multiplica por `config.fontScale`; los consumos directos de
   `config.typography.<rol>.size` (catalog, cart, ui.tsx) migran a `roleSize()`. Sin doble escala
   (los `--fs-*` no se usan junto a `roleSize`).
5. **`sheen` real**: `Glass` lee `useThemeConfig().sheen` cuando no recibe prop.
6. **Contenido del admin adaptativo** (`buildAdminPanelVars`): nuevas vars
   `--admin-content-text[-2/3/4]`, `--admin-content-hair[-2]`, `--admin-content-bg-solid`,
   `--admin-content-scheme`; `.admin-main` redirige `--u-*` a ellas. Texto auto por luminancia del
   fondo de contenido (o hereda el del cliente si es transparente).
7. **Opciones del panel completas**: `--admin-panel-font` y radios (`--radius-*` recalculados) a
   nivel `.admin-main`/`.admin-shell`; `zoom: var(--admin-panel-scale)` en `.admin-content`.
8. **Fix barra Guardar** (`--u-bg` → `--admin-content-bg-solid`) y controles del editor con
   `color-mix(in srgb, var(--u-text) N%, transparent)`; selects con `color-scheme` dinámico.
9. **Reemplazo de estados** (`#4ade80`/`#f87171`/…) por los tokens semánticos en los componentes
   del comensal + shell admin.
10. **Limpieza**: quitar `Price`/`Tag` muertos de glass.tsx, arreglar mojibake, hovers/scrollbar
    del admin con `color-mix`.
11. **Verificación**: build + revisión visual light/dark/móvil.

## Segunda pasada (mismo día) — cobertura total

- **Paneles internos del admin (COMPLETADO)**: los 173 `rgba(255,255,255,x)` de
  `src/components/admin/**` y `src/app/admin/**` (49 archivos: switches, tracks, knobs,
  filas de lista, chips, inputs) migrados mecánicamente a
  `color-mix(in srgb, var(--u-text) N%, transparent)` — en oscuro rinden idéntico; en
  panel/tema claro se vuelven tinta visible. Sin tocar sombras/`inset` (no había).
- **`group-shell` / `central` (comparativa, finanzas)**: mismos 4 casos migrados.
- **`branch-selector` (link de grupo)**: texto sobre el acento del grupo ahora auto por
  luminancia (antes `#fff` fijo → ilegible con acentos claros); avisos ámbar → `--c-warn`.
- **Asistente de legibilidad en el editor** (`ContrastHint`): avisa en vivo cuando
  texto/fondo < 4.5:1, texto-sobre-acento < 3:1, o el modo de color no coincide con la
  luminancia del fondo — cada aviso con botón "Corregir" de un toque.
- **Flujo de compra verificado end-to-end en modo claro** (tenant local azucar-negra):
  catálogo → agregar → carrito → checkout (tipo de pedido, campos, pago) → confirmación →
  seguimiento en vivo → cancelación. Pedido de prueba cancelado en la BD local.

### Queda como está (por diseño)
- Superficies de plataforma Leogin (landing, login, /registro, /planes, panel Super Admin):
  corren siempre en el tema oscuro fijo de la plataforma — sus blancos no dependen del tema
  del restaurante.
- Excepciones intencionales: botón de Google (blanco por lineamientos de marca), verde
  WhatsApp `#25D366`, check blanco sobre verde sólido de combos, pines del mapa Leaflet,
  marco del teléfono de la vista previa.
- Errores ESLint preexistentes (no visuales, no introducidos por esta auditoría):
  comillas sin escapar en `cash-history-panel.tsx:139` y 2 `any` en `notifications.tsx`.
- `Failed to fetch` de Supabase Auth en consola del checkout local: config del entorno
  (auth-js no alcanza el auth local), no relacionado con esta auditoría.
