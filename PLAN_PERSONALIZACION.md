# PLAN MAESTRO — Motor de Personalización + Rediseño fiel al prototipo

> **Documento vivo.** Aquí se detalla TODO lo que se va a hacer y lo que ya se hizo, para
> dar continuidad entre sesiones (por si una noche no alcanza). Cada sesión: leer este
> archivo, trabajar, y **actualizar la bitácora al final** (sección §8).
>
> Creado: 2026-06-09 · Última actualización: 2026-06-09 (sesión inicial)

---

## 1. El problema (por qué existe este plan)

El usuario (Leonardo = **Leogin**, la plataforma SaaS) reportó 3 problemas graves:

1. **El producto no captura la idea de negocio.** Leogin vende a restaurantes un servicio de
   catálogo + pedidos en línea. Cada restaurante recibe **2 URLs**: su **panel de admin** y su
   **menú para el cliente final**. Leonardo (el vendedor/creador) **diseña el sitio de cada
   restaurante** para que se sienta único — quiere personalizar **TODO**, "desde lo más sin
   sentido hasta lo más útil", para que cada restaurante plasme su personalidad y no sea "una
   plantilla más". *Azúcar Negra* es solo el restaurante de ejemplo del prototipo.

2. **El diseño no se parece al prototipo.** En el repo hay dos cosas distintas:
   - **Prototipos buenos** (los que el usuario quiere): `catalgos Restaurantes base de diseño/`
     (JSX premium "Urban Liquid Glass").
   - **App real aguada**: `plataforma/` — una versión simplificada que NO replica el prototipo.

3. **La personalización es mínima** (la tabla `restaurant_themes` solo guarda ~10 campos).

### Decisiones del usuario (preguntas iniciales, 2026-06-09)

| Pregunta | Respuesta |
|---|---|
| ¿Cómo personalizar? | **Panel Super Admin ampliado + CSS avanzado por restaurante** Y **además** override **por código por cliente** (las dos vías juntas). |
| Imágenes de producto | **Patrón generativo del prototipo por defecto + foto opcional** que lo reemplaza. |
| Alcance de textos | **Absolutamente todo el texto** editable por restaurante. |
| Prioridad de la noche | **El motor de personalización primero.** Y antes de codear, crear este `.md`. |

---

## 2. Modelo de negocio (3 niveles) — referencia rápida

- **Super Admin (Leogin / Leonardo / tú):** crea restaurantes y **diseña/personaliza** cada uno.
  La marca "Leogin" solo aparece en superficies de plataforma (landing raíz, login, panel super).
- **Owner (el restaurante, tu cliente):** administra su catálogo y sus pedidos desde su panel.
- **Cliente final (comensal):** ve el menú **con la marca del restaurante** (nunca "Leogin") y
  puede pedir a domicilio / para llevar.

Multi-tenant por subdominio: `slug.tudominio.com` → menú del cliente · panel en `/admin` ·
super admin en `/super`. (Arquitectura ya existente y correcta.)

---

## 3. Los prototipos de referencia (qué replicar)

Carpeta: `catalgos Restaurantes base de diseño/`

| Archivo | Qué define |
|---|---|
| `urban.css` | Skin "Urban Liquid Glass": fondo asphalt, sistema glass, fuentes display (Unbounded/Anton), animaciones. |
| `tokens.css` | Tokens base (colores, escala tipográfica, espaciado, radios, sombras). |
| `Glass.jsx` | `Glass` (panel con sheen), `BrandPattern` (arte generativo de producto), `Btn`, `Tag`, `Mark`, `Price`. |
| `Icons.jsx` | Registro de íconos SVG (coffee, bagel, flame, leaf, bag, truck, etc.). |
| `ClientApp.jsx` | App del cliente: `Phone` frame, `StatusBar`, **Portada con 3 variantes** (spotlight/poster/stack), reducer de carrito, animación "flying dot". |
| `ClientScreens.jsx` | Pantallas: **Catálogo** (grid/list, búsqueda, categorías con ícono), **Detalle**, **Carrito**, **Checkout**, **Confirmación**. |
| `AdminApp.jsx` | Panel admin desktop: sidebar + topbar "En vivo", **KPIs**, **gráfica de ventas 14 días**, **Top de hoy**, **tablero de pedidos** en 2 columnas, **editor modal** de platillo (foto/categoría/precio/tags/disponible), gestión de categorías. |
| `Data.jsx` | Datos semilla de Azúcar Negra (productos, categorías, pedidos, estados). |
| `tweaks-panel.jsx` | **Patrón del editor en vivo**: panel flotante con controles (slider, toggle, radio segmentado, color/paleta, número, texto). Modelo UX para "diseñar cada restaurante". |

**Las 3 capturas que dejó el usuario corresponden a:** (1) Portada spotlight del cliente,
(2) Catálogo grid del cliente, (3) Pedidos en vivo del admin.

---

## 4. Arquitectura del motor de personalización

Cuatro capas, de más fácil a más potente. **Las 4 conviven.**

### Capa 1 — `ThemeConfig` (knobs visuales estructurados)
Todos los ajustes visuales con defaults sensatos. El Super Admin los cambia desde el panel.
Se guardan como **overrides parciales** en `restaurant_themes.config` (JSONB). El resolver
hace `{ ...DEFAULTS, ...row.config }`.

### Capa 2 — `ThemeContent` (TODOS los textos)
Cada cadena visible del cliente, con default en español. Overrides parciales en
`restaurant_themes.content` (JSONB). Esto cumple "absolutamente todo el texto".

### Capa 3 — `custom_css` (escotilla de CSS por restaurante)
Campo de texto libre (`restaurant_themes.custom_css`). Se inyecta **al final** del `<style>`
del tenant, así puede sobrescribir cualquier cosa. **Solo lo escribe el Super Admin** (campo de
confianza; no es input del comensal) → riesgo XSS acotado al propio operador.

### Capa 4 — Override por código por cliente (`src/tenants/`)
Registro `src/tenants/registry.ts` que mapea `slug → { config?, content?, components? }`.
Para casos "sin límite" que necesitan código real (una portada totalmente custom, un componente
propio). La página/Layout consulta el registro por slug y aplica overrides encima de la BD.
**Orden de precedencia (mayor gana):** code override > custom_css > BD `config`/`content` > DEFAULTS.

### Flujo de datos
```
slug → getRestaurantBySlug() ─┬─ restaurants row
                              └─ restaurant_themes row (config, content, custom_css, legacy cols)
        │
        ▼
   resolveTheme(row, slug)  →  ResolvedTheme { config, content, customCss }
        │                         (merge: DEFAULTS ← legacy cols ← config ← code override)
        ├──► layout.tsx: inyecta <link> fonts + <style>(:root vars + custom_css)
        └──► <ThemeProvider content/config>  (context cliente)  →  componentes leen vars CSS + textos
```

### Fuentes por restaurante (decisión técnica)
`next/font/google` exige nombres **estáticos** → no sirve para fuentes dinámicas. Solución:
inyectar `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=...">` con las
familias elegidas (React 19 permite `<link>`/`<style>` y los iza al `<head>`). Se ofrece un set
**curado** de Google Fonts en el panel (display, poster, body, serif, mono). Geist queda como
fallback de body.

---

## 5. Modelo de datos (migración 007)

```sql
alter table restaurant_themes
  add column if not exists config     jsonb not null default '{}'::jsonb,
  add column if not exists content    jsonb not null default '{}'::jsonb,
  add column if not exists custom_css text;
```
- Se **conservan** las columnas legacy (`color_*`, `font_display`, `portada_style`,
  `catalog_view`, `glass_intensity`, `brand_name`, `logo_url`, `background_image`) para no romper;
  el resolver las lee primero y `config` las sobrescribe. El editor nuevo escribe a `config`/`content`.
- RLS: lectura pública de `restaurant_themes` (ya existe). Escritura solo Super Admin (service_role).
- Actualizar también `supabase/setup_produccion.sql`.

### `ThemeConfig` (campos previstos — ver `src/lib/theme/defaults.ts`)
Marca: `brandName, tagline, logoUrl, markUrl, faviconUrl` ·
Color: `colorBg, colorBg2, colorText, colorAccent, onAccent, scheme(dark|light|auto)` ·
Tipografía: `fontDisplay, fontPoster, fontBody, fontSerif, fontMono, fontScale` ·
Glass/forma: `glassIntensity, cornerRadius` ·
Fondo: `backgroundType(asphalt|solid|gradient|image), backgroundImage, backgroundGradient,
ambientGlow, grain, watermark` ·
CTA: `ctaStyle(white|accent|outline)` ·
Portada: `portadaVariant(spotlight|poster|stack|none), portadaShowLogo, portadaShowBadge,
portadaShowStatus` ·
Catálogo: `catalogView(grid|list), catalogColumns, showSearch, showCategoryIcons,
productArt(pattern|photo|auto), showTags` ·
Pedidos: `orderTypes[], deliveryFee` ·
Moneda: `currencySymbol, currencyPosition(prefix|suffix), locale` ·
Animaciones: `animations`.

### `ThemeContent` (textos — ver `src/lib/theme/defaults.ts`)
Agrupado por pantalla: `portada, catalog, product, cart, checkout, confirmation, tags`.
(Los textos del **panel admin** quedan para una 2ª pasada — son operativos e internos; ver §7.)

---

## 6. Fases de trabajo (con checklist)

### FASE A — Motor de personalización (PRIORIDAD)
- [x] A1. Migración `007_theme_engine.sql` (config/content/custom_css) + actualizar `setup_produccion.sql`. *(SQL de producción pendiente de actualizar — ver TODO en §8.)*
- [x] A2. `src/lib/theme/defaults.ts` — tipos `ThemeConfig`/`ThemeContent` + `DEFAULT_CONFIG`/`DEFAULT_CONTENT` + catálogo de fuentes curadas (`FONT_OPTIONS`).
- [x] A3. `src/lib/theme/resolve.ts` — `resolveTheme(row, slug, fallback)` (merge de capas) + `buildThemeVars()` + `buildFontsHref()` + `formatPrice()`.
- [x] A4. `src/lib/theme/context.tsx` — `ThemeProvider` + `useThemeContent()` + `useThemeConfig()` + `usePrice()`.
- [x] A5. `src/tenants/registry.ts` — registro de overrides por código por slug (capa 4).
- [x] A6. `src/types/index.ts` actualizado (`config/content/custom_css`).
- [x] A7. `getRestaurantBySlug` devuelve `resolved` (ResolvedTheme).
- [x] A8. `layout.tsx` inyecta `<link>` fonts + variables en `<html style>` + `<style>` custom_css + `ThemeBackground` (asphalt/solid/gradient/image + grain + watermark).
- [x] A9. **Editor Super Admin ampliado** ✅ (`theme-editor.tsx`: Marca, Color, Tipografía, Glass/forma, Fondo, Portada, Catálogo, Pedidos/Moneda, **Textos (todos)**, CSS avanzado) + acción `saveRestaurantTheme` (upsert de `config`/`content`/`custom_css` + sync legacy). **Verificado end-to-end:** cambié el acento en el editor → guardó → el sitio del tenant lo aplicó (`--brand-accent` cambió). Migración 007 aplicada en Supabase local.
- [x] A10. `BrandPattern` (+ `seedFromString`, PRNG mulberry32 anti-mismatch) + `Icons` portados a `src/components/`.

### FASE B — Cliente fiel al prototipo  ✅ (verificado en navegador)
- [x] B1. `Portada` 3 variantes (spotlight/poster/stack) — `src/components/menu/portada.tsx`.
- [x] B2. Catálogo: búsqueda, categorías con ícono, grid/list, `BrandPattern`/foto, tags con ícono — `src/components/menu/catalog.tsx`.
- [x] B3. Detalle de producto (hero, tiempo de prep, stepper) — `src/components/menu/product-sheet.tsx`.
- [x] B4. Carrito (barra+panel) + Checkout + Confirmación + animación flying-dot.
- [x] B5. Moneda configurable (`Q`/`$`/…) en todo el flujo — adiós al `$` hardcodeado.

### FASE C — Admin fiel al prototipo
- [x] C1. **Shell** (`components/admin/shell.tsx`): sidebar (marca+nav+user card) + topbar ("En vivo" + bell). CSS responsive en globals (`.admin-*`). Cableado en `admin/layout.tsx`. Verificado.
- [x] C2. **Pedidos**: KPIs (Ventas/Pedidos/Ticket/En preparación) + tablero "En curso"/"Cerrados hoy" en grid. *(Falta: gráfica 14 días + Top de hoy — opcional, ver TODO.)*
- [x] C3. Catálogo admin estilo prototipo — `components/admin/catalog-panel.tsx`: tabla con chips de categoría, BrandPattern/foto, tags, toggle disponibilidad, modal editor completo (foto, categoría, precio, descripción, etiquetas, disponibilidad). Ruta `/admin/menu`. *(Ya estaba implementado desde sesión anterior; confirmado build limpio.)*
- [x] C4. Categorías estilo prototipo — `components/admin/categories-panel.tsx`: lista con ↑↓ reordenar, toggle activo, edición inline, borrar (solo sin productos), nueva categoría. Ruta `/admin/categorias`. *(Ya estaba implementado; confirmado build limpio.)*

### FASE D — Pulido y verificación
- [x] D1. `typecheck` + `lint` + **`build` de producción** limpios (20 rutas).
- [x] D2. Verificación real en navegador: cliente (demo) + Super Admin editor + panel admin, con Supabase local.
- [x] D3. Capturas comparadas: portada=imagen#1 ✓, catálogo=imagen#2 ✓, admin pedidos=imagen#3 ✓.
- [x] D4. Bitácora actualizada (memoria pendiente al cierre de sesión).

---

## 7. Decisiones y notas (no perder contexto)

- **Default = Urban dark glass** (el look del prototipo) pero TODO themeable; un restaurante
  puede quedar claro, con foto de fondo, otra paleta, otras fuentes, etc.
- **Textos del admin:** no se incluyen en `ThemeContent` en la 1ª pasada (son operativos, los ve
  el staff, no el comensal). Si el usuario los quiere, se agregan como `ThemeContent.admin`.
- **`custom_css` es de confianza** (solo Super Admin). Documentar que es para Leonardo, no para owners.
- **Patrón vs foto:** `productArt='auto'` (default) = usa foto si el producto la tiene, si no el
  `BrandPattern`. El admin avisa "si no subís foto, se usa el patrón de la marca".
- **Next 16.2.7 / React 19.2.4 / Tailwind v4.** Leer `node_modules/next/dist/docs/` antes de tocar
  APIs (lo exige `plataforma/AGENTS.md`). Fuentes dinámicas → `<link>`, no `next/font`.
- **PATH Windows:** `node`/`npm` en `C:\Program Files\nodejs\`; si falta en PATH:
  `$env:Path = "C:\Program Files\nodejs;" + $env:Path`.
- **Verificación:** el subdominio `demo` renderiza el menú sin BD (datos en `page.tsx`), sirve para
  ver el cliente sin Supabase. El admin necesita Supabase local (`npx supabase start`).

---

## 8. Bitácora de progreso (actualizar cada sesión)

### 2026-06-09 — Sesión inicial
- ✅ Diagnóstico completo (prototipo vs app real). Identificada la "app aguada".
- ✅ Preguntas clave respondidas por el usuario (ver §1).
- ✅ Creado este `PLAN_PERSONALIZACION.md`.
- ✅ **FASE A (motor) casi completa**: migración 007, `lib/theme/{defaults,resolve,context}.ts`,
  `tenants/registry.ts`, tipos, `getRestaurantBySlug` → `resolved`, `layout.tsx` (vars+fonts+bg+css),
  `BrandPattern`+`Icons`. Falta solo **A9 (editor Super Admin)**.
- ✅ **FASE B (cliente) completa y VERIFICADA en navegador** (demo.localhost:3000):
  portada spotlight idéntica a la imagen #1, catálogo idéntico a la imagen #2 (búsqueda, chips con
  ícono, tarjetas con BrandPattern, tags, precios `Q`). `typecheck`+`lint` limpios.
- 🐞 Arreglado hydration mismatch en `BrandPattern` (Math.sin → PRNG entero mulberry32 + redondeo).
  Verificado SSR==DOM con probe (`match:true`).
- ⏳ **EN CURSO:** A9 (editor Super Admin ampliado).

### 2026-06-09 — Continuación (motor + admin)
- ✅ **A9 editor** completo y **verificado end-to-end** (cambio en editor → BD → sitio del tenant).
- ✅ Migración 007 aplicada en Supabase **local**; `setup_produccion.sql` actualizado.
- 🐞 **Bug importante arreglado:** el embed `restaurant_themes(*)` es UNO-A-UNO (restaurant_id es PK+FK
  → PostgREST devuelve OBJETO, no array). El código hacía `[0]` → el editor SIEMPRE mostraba defaults
  en vez de lo guardado. Fix: `normalizeThemes()` en `lib/db/super-admin.ts` (coacciona a array).
  Verificado: el editor ahora carga los valores guardados. (Además: `service.ts` ahora usa `cache:'no-store'`
  y la página `[id]` es `force-dynamic` para lecturas siempre frescas.)
- ✅ **FASE C** (admin): shell sidebar+topbar + KPIs + tablero. Verificado (imagen #3).
- ✅ `build` de producción limpio (20 rutas).

**TODOs pendientes (no perder):**
- [ ] **Aplicar migración 007+008 en la NUBE** cuando se despliegue (pegar `setup_produccion.sql` completo o aplicar 007+008 por separado vía SQL Editor).
- [ ] (Futuro, opcional) Editor en vivo (tweaks-panel) sobre el sitio del cliente.

**TODOs completados esta sesión:**
- [x] `nav.tsx` muerto borrado.
- [x] Gráfica de 14 días + Top de hoy en panel de pedidos.
- [x] C3/C4 confirmados ya implementados.
- [x] CSS `.orders-grid` en globals.css.
- [x] **Migración 008** (`delivery_fee` en orders + `icon` en products). Aplicada en local.
- [x] **`deliveryFee` real** en checkout: desglose subtotal+envío en el formulario; envío solo se cobra en DELIVERY; total correcto guardado en BD; mensaje WhatsApp actualizado.
- [x] **`icon` por producto**: campo en BD, selector de 12 íconos en modal de admin, override sobre el ícono de categoría en menú cliente y product-sheet. `setup_produccion.sql` actualizado.
- [x] `build` prod limpio (21 rutas).

- **Próximo paso al retomar:** Deploy en la nube (aplicar migración 007+008) O editor en vivo (tweaks-panel).
