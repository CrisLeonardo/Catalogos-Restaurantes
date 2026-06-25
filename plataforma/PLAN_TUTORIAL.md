# PLAN_TUTORIAL — Sistema de Ayuda y Tutorial Leogin

## Estado de fases

| Fase | Descripción | Estado |
|---|---|---|
| **Fase 1** | Hub `/admin/ayuda` — contenido por plan, acordeón, búsqueda, placeholders de captura | ✅ Completada (sesión 2026-06-24) |
| **Fase 2** | Tour de bienvenida — overlay interactivo al primer login, omitible, re-activable desde /admin/ayuda | ✅ Completada (sesión 2026-06-24) |
| **Fase 3** | Botones `?` contextuales — ícono de ayuda en cada sección del admin que abre el artículo relevante | ✅ Completada (sesión 2026-06-24) |
| **Fase 4** | Screenshots reales — capturas del sistema con datos "Tu Restaurante / Bistró La Plaza" | ✅ Completada (sesión 2026-06-24) |

---

## Arquitectura general

```
Sistema de Tutorial
├── Fase 1 — /admin/ayuda (Hub central)
│   ├── src/lib/tutorial/content.ts     ← Datos de todas las secciones y pasos
│   ├── src/components/admin/tutorial-hub.tsx  ← Componente principal (client)
│   └── src/app/admin/(protected)/ayuda/page.tsx  ← Página server (pasa plan + módulos)
│
├── Fase 2 — Tour de bienvenida
│   ├── src/components/admin/welcome-tour.tsx  ← Overlay interactivo (6 pasos)
│   └── Trigger: localStorage 'tour_completed' + botón en /admin/ayuda
│
├── Fase 3 — Botones ? contextuales
│   ├── src/components/admin/help-button.tsx  ← Botón flotante por sección
│   └── Mapa: sección → id de artículo en /admin/ayuda#section
│
└── Fase 4 — Screenshots reales
    ├── public/tutorial/screenshots/   ← Imágenes PNG del sistema
    └── Convenciones: [section-id]-[step-N].png  (ej: catalogo-paso2.png)
```

### Navegación
- Link **"Ayuda"** en sidebar del admin → sección **Cuenta** (antes de Soporte)
- Key de permisos: `'ayuda'` en `ADMIN_SECTIONS` y `TITLES` de shell.tsx
- Accesible para todos los roles (Owner, Staff, incluso Staff restringido)

---

## Secciones de contenido (25 total)

### Plan Básico — todas las cuentas

| ID | Sección | Ícono |
|---|---|---|
| `primeros-pasos` | Primeros pasos en tu panel | sparkle |
| `perfil` | Perfil del restaurante | user |
| `catalogo` | Tu catálogo de platillos | bag |
| `categorias` | Categorías del menú | tag |
| `personalizar` | Personalizar tu menú | sparkle |
| `qr` | Tu código QR | image |
| `metricas` | Métricas básicas | chart |

### Plan Popular y superior

| ID | Sección | Ícono |
|---|---|---|
| `pedidos` | Configurar pedidos en línea | list |
| `panel-pedidos` | Panel de pedidos en tiempo real | list |
| `inventario` | Inventario y control de stock | box |
| `analitica` | Analítica avanzada | dashboard |
| `finanzas` | Finanzas y reportes | wallet |
| `clientes` | Base de clientes | users |
| `promociones` | Promociones y descuentos | percent |
| `personal` | Personal y permisos | userPlus |
| `cocina` | Pantalla de cocina (KDS) | flame |
| `meseros` | Rol de mesero | userPlus |

### Plan Premium

| ID | Sección | Ícono |
|---|---|---|
| `grupo` | Panel de grupo multi-sucursal | grid |

### Módulos opcionales (si están activos)

| ID | Sección | Módulo requerido | Ícono |
|---|---|---|---|
| `loyalty` | Programa de lealtad y puntos | `loyalty` | star |
| `fel` | Facturación electrónica FEL | `fel` | receipt |
| `proveedores` | Proveedores y compras | `proveedores` | truck |
| `encuestas` | Encuestas de satisfacción | `encuestas` | thumbsUp |
| `reservaciones` | Reservaciones de mesa | `reservaciones` | calendar |
| `cupones` | Cupones y códigos de descuento | `cupones` | ticket |
| `recetas` | Recetas e ingredientes | `recetas` | flask |

---

## Detalle por fase

---

## FASE 1 — Hub /admin/ayuda ✅

**Objetivo:** Página dentro del panel admin donde el restaurante puede consultar cómo usar cada función del sistema, adaptada a su plan activo.

### Archivos creados/modificados

| Archivo | Tipo | Descripción |
|---|---|---|
| `src/lib/tutorial/content.ts` | Creado | Datos: 25 secciones × N pasos, tipos TS, helpers de plan |
| `src/components/admin/tutorial-hub.tsx` | Creado | UI: búsqueda, acordeón, pasos, capturas, bloqueos |
| `src/app/admin/(protected)/ayuda/page.tsx` | Creado | Server page: lee plan + módulos → pasa a TutorialHub |
| `src/components/admin/shell.tsx` | Modificado | Añade link Ayuda al nav (sección Cuenta) + TITLES |
| `src/lib/permissions.ts` | Modificado | Añade `{ key: 'ayuda', label: 'Centro de ayuda' }` |

### Funcionalidades

- [x] Página accesible en `/admin/ayuda`
- [x] Link en sidebar (sección Cuenta, antes de Soporte)
- [x] Secciones acordeón expandibles/colapsables
- [x] Badge de plan en secciones restringidas (Popular / Premium / Módulo)
- [x] Secciones bloqueadas muestran teaser + CTA de upgrade
- [x] Búsqueda en tiempo real por título y descripción de pasos
- [x] Cada paso tiene: número, título, descripción, ruta de navegación, tip (si aplica)
- [x] Placeholder de captura en cada paso (reemplazable en Fase 4)
- [x] Botón "Ver tour de bienvenida" (stub para Fase 2)
- [x] Diseño glass premium consistente con el resto del admin

---

## FASE 2 — Tour de bienvenida ✅

**Objetivo:** Al primer login del dueño, mostrar un overlay interactivo que señala las 6 áreas clave del dashboard. Omitible desde el inicio. Re-activable desde /admin/ayuda.

### Pasos del tour (6)

1. **Bienvenida** — "Este es tu panel de administración de [nombre restaurante]"
2. **Navegación** — Señala la sidebar: "Aquí encuentras todas las secciones"
3. **Catálogo** — Señala el acceso rápido: "Empieza agregando tus platillos"
4. **QR** — "Tu código QR ya está listo para compartir"
5. **Personalización** — "Pon tu marca: colores, fuente y logo"
6. **Ayuda** — "Cuando tengas dudas, este botón te lleva a la guía completa"

### Archivos creados/modificados (Fase 2)

| Archivo | Tipo | Descripción |
|---|---|---|
| `src/components/admin/welcome-tour.tsx` | Creado | Overlay SVG spotlight, burbuja prev/next/omitir, auto-expande secciones colapsadas |
| `src/components/admin/shell.tsx` | Modificado | `data-tour-step` en nav links + nav element; monta `<WelcomeTour>` |
| `src/components/admin/tutorial-hub.tsx` | Modificado | Limpia comentario stub del botón "Ver tour de bienvenida" |

### Funcionalidades

- [x] Overlay con backdrop semi-transparente
- [x] Highlight del elemento señalado (recorte en el backdrop — SVG mask)
- [x] Burbuja de texto con título, descripción, número de paso y botones
- [x] Botón "Omitir tour" en cualquier paso
- [x] Persistencia en `localStorage` key `leogin_tour_completed`
- [x] Re-activable desde /admin/ayuda con botón "Ver tour de nuevo"
- [x] Responsivo (adapta posición de burbuja en móvil)

---

## FASE 3 — Botones ? contextuales ✅

**Objetivo:** Cada sección del admin tiene un ícono `?` en el header que abre directamente el artículo de ayuda relevante en `/admin/ayuda`.

### Implementación

- Componente `HelpButton` — botón pequeño `?` que navega a `/admin/ayuda#[section-id]`
- Se añade al topbar de cada sección o al lado del título de la página
- Los IDs de sección en `content.ts` se usan como anclas HTML (`id` en el acordeón)

### Mapa sección → ID de ayuda

| Ruta del admin | ID en /admin/ayuda |
|---|---|
| `/admin/menu` | `catalogo` |
| `/admin/categorias` | `categorias` |
| `/admin/pedidos` | `panel-pedidos` |
| `/admin/inventario` | `inventario` |
| `/admin/analitica` | `analitica` |
| `/admin/finanzas` | `finanzas` |
| `/admin/clientes` | `clientes` |
| `/admin/promociones` | `promociones` |
| `/admin/personal` | `personal` |
| `/admin/cocina` | `cocina` |
| `/admin/mesero` | `meseros` |
| `/admin/personalizacion` | `personalizar` |
| `/admin/qr` | `qr` |
| `/admin/perfil` | `perfil` |
| `/admin/metricas` | `metricas` |
| `/admin/lealtad` | `loyalty` |
| `/admin/facturacion` | `fel` |
| `/admin/proveedores` | `proveedores` |
| `/admin/encuestas` | `encuestas` |
| `/admin/reservaciones` | `reservaciones` |
| `/admin/cupones` | `cupones` |
| `/admin/ingredientes` | `recetas` |

### Archivos creados/modificados (Fase 3)

| Archivo | Tipo | Descripción |
|---|---|---|
| `src/components/admin/help-button.tsx` | Creado | Botón `?` con tooltip "Abrir guía" y navegación a /admin/ayuda#id |
| `src/components/admin/shell.tsx` | Modificado | Añade HelpButton en el topbar basado en pathname (22 secciones) |

> Implementación: el botón vive en el `admin-topbar` del shell (no en cada página individual), derivando el ID de sección desde el pathname activo. Esto mantiene un único punto de mantenimiento y posición consistente en todas las páginas.

---

## FASE 4 — Screenshots reales ✅

**Objetivo:** Reemplazar los placeholders de captura con screenshots reales del sistema usando el restaurante demo "Tu Restaurante / Bistró La Plaza".

### Convenciones de nombres

```
/public/tutorial/screenshots/
  primeros-pasos-paso1.png   ← Pantalla de login
  primeros-pasos-paso2.png   ← Dashboard con sidebar
  catalogo-paso1.png         ← Vista del catálogo
  catalogo-paso2.png         ← Formulario de nuevo producto
  ...
```

### Proceso para tomar screenshots (Fase 4)

1. Crear restaurante demo en local: nombre **"Tu Restaurante"** (slug: `tu-restaurante`)
2. Poblar con categorías, productos, pedidos ficticios (datos en `setup_tutorial_demo.sql`)
3. Tomar capturas de cada paso usando el navegador (recomendado: 1280×800)
4. Guardar en `/public/tutorial/screenshots/` con la convención de nombres
5. El componente `TutorialCaptura` en `tutorial-hub.tsx` detecta el archivo y lo carga

### Datos demo para el restaurante de ejemplo

- **Nombre**: Tu Restaurante / Bistró La Plaza
- **Categorías**: Entradas, Platos principales, Postres, Bebidas
- **Productos de ejemplo**: Ceviche mixto, Filete de res, Lava cake, Limonada natural
- **Pedidos ficticios**: 3-5 pedidos en estado variado para mostrar el panel
- **Staff demo**: "Carlos Mesero" (mesero), "Ana Cajera" (staff con permisos de pedidos+finanzas)

---

## Notas de sesión

### Sesión 2026-06-24 (parte 2 — Fase 4)

- ✅ `src/components/admin/tutorial-hub.tsx` — `TutorialCaptura` actualizado:
  - Carga imagen real desde `/tutorial/screenshots/{sectionId}-paso{N}.png`
  - Si la imagen no existe (404), `onError` activa el placeholder de espera
  - Los placeholders se reemplazan automáticamente al guardar el PNG en la carpeta
- ✅ `public/tutorial/screenshots/` — directorio creado (`.gitkeep`)
- ✅ `supabase/setup_tutorial_demo.sql` — script idempotente con:
  - Restaurante "Bistró La Plaza" (slug: `bistro-la-plaza`, plan PREMIUM)
  - 4 categorías + 7 productos de ejemplo
  - 3 pedidos en estados variados (DELIVERED / PREP / NEW) con items

**Capturas realizadas automáticamente con Playwright** (sesión 2026-06-24):
- Script: `scripts/take-screenshots.mjs` (secciones principales)
- Script: `scripts/take-screenshots-remaining.mjs` (módulos básicos)
- Script: `scripts/take-screenshots-modules.mjs` (módulos opcionales)
- **107 de 108 capturas completadas** — solo falta `grupo` (panel multi-sucursal, requiere subdominio `-central`)
- Restaurante demo: `bistro-la-plaza.localhost:3000` | owner@bistroplaza.com / Demo1234!
- Para retomar: `node scripts/take-screenshots.mjs` (incluye login + tour dismiss)

---

### Sesión 2026-06-24
- ✅ Creado PLAN_TUTORIAL.md
- ✅ Fase 3 implementada completa:
  - `src/components/admin/help-button.tsx` (botón `?` con icono helpCircle, glass-quiet, title tooltip)
  - `src/components/admin/shell.tsx` actualizado (HELP_SECTIONS map + HelpButton en topbar)
- ✅ Fase 1 implementada completa:
  - `src/lib/tutorial/content.ts` (25 secciones, todos los pasos)
  - `src/components/admin/tutorial-hub.tsx` (búsqueda, acordeón, plan-gating, placeholders)
  - `src/app/admin/(protected)/ayuda/page.tsx`
  - `src/components/admin/shell.tsx` actualizado (link Ayuda + TITLES)
  - `src/lib/permissions.ts` actualizado (key 'ayuda')
