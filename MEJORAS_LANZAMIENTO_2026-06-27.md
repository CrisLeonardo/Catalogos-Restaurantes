# Mejoras de lanzamiento — 2026-06-27

Trabajo nocturno autónomo para dejar Leogin listo para los primeros restaurantes reales.
Decisiones del dueño (Leonardo) tomadas al inicio:

1. **Descuento por canal no usado** → "Plan a tu medida": −Q100 por canal de servicio
   desactivado (domicilio / comer en local / para llevar), **con piso mínimo** para que
   nadie pueda apagar todo y dejar de pagar. Visible y transparente para el dueño.
2. **Precios verdaderos = los del código/landing**: Básico **Q199**, **Estándar Q399**,
   Premium **Q599**, Premium Pro **Q999**, Premium Ultra **Q1,499**, Alto Volumen **Q2,249**,
   Variable **1%**. El tier "Estándar" SÍ existe. Reconciliar BD + doc a esto.
3. **Landing = web corporativa**: la tarjeta física (QR + NFC) manda a leogin.online.
   Debe verse profesional y vender sola, perfecta en PC / tablet / móvil.
4. **Seguridad**: endurecer (rate-limit, cabeceras/CSP, middleware, anti-inyección) +
   scaffold de API keys (con hashing) + documentar integración de pasarela de pago.

## Workstreams

- [ ] **A. Pricing**: reconciliar precios (Estándar Q399), descuento "a tu medida" con piso,
      enganchar en `leogin_compute_monthly_fee`, UI en super admin + suscripción del dueño.
- [ ] **B. Landing** (`/`): rediseño corporativo profesional, responsive total.
- [ ] **C. Mapa de mesas** (`floor-plan-editor` / `floor-map`): usable en móvil/tablet.
- [ ] **D. Admin móvil/tablet** (`shell.tsx` + `globals.css` + super/central): ergonomía táctil.
- [ ] **E. Seguridad**: cabeceras en `proxy.ts`, rate-limit ampliado, API keys, anti-inyección, doc pagos.
- [ ] **F. QA**: dev server + Supabase local; probar como dueño/admin/cliente; corregir hallazgos.
- [ ] **G. Docs + memoria**: actualizar memoria de pricing (estaba desactualizada) y bitácora.

## Hallazgos al inicio (estado real)

- Tipos de pedido se guardan en `restaurant_themes.config.orderTypes` (JSONB array).
- Mensualidad la calcula la BD: `leogin_compute_monthly_fee()` leyendo `plan_price_*` de `platform_settings`.
- **Incoherencia corregida**: `plans.ts` y landing mostraban Q199/Q399/Q599 + tier Estándar,
  pero la mig. 049 ponía Q299/Q600 y NO permitía Estándar en el constraint de `restaurants.plan_actual`.
- Rate-limit en memoria solo en 3 acciones (pedidos/registro/métricas). Sin `middleware`/proxy de seguridad. Sin API keys.
- Mapa de mesas: los tokens escalan con el ancho del lienzo → en móvil quedan ~23px (no se pueden arrastrar).
- Middleware de Next 16 = `src/proxy.ts` (renombrado).

## Bitácora (se va llenando)

### A. Pricing — ✅ LISTO (verificado en BD local)
- **Migración 050** (`050_pricing_a_la_medida.sql`): reconcilia las 3 épocas a un solo modelo.
  Constraint de `plan_actual` ahora permite los 7 valores (incl. ESTANDAR). Precios en
  `platform_settings` = Q199/399/599/999/1499/2249. Limpia claves del modelo por-sucursal.
- **Descuento "Plan a tu medida"**: `leogin_compute_monthly_fee` reescrita. Para PREMIUM+ resta
  Q100 por canal desactivado (lee `restaurant_themes.config.orderTypes`), **con piso**: máx 2
  canales descontables ⇒ nunca baja más de Q200 (siempre se paga ≥1 canal). Helpers nuevos:
  `leogin_active_channels`, `leogin_plan_has_channel_discount`, `leogin_fee_breakdown` (desglose).
- **Verificado en BD**: PREMIUM 3 canales=Q599 · 2=Q499 · 1=Q399 (piso OK).
- **Código**: `lib/db/billing.ts` (PricingSettings + estandar + channelDiscount + `getFeeBreakdown`);
  `actions/billing.ts` (guarda Estándar + descuento, máx acotado 0..2);
  `pricing-settings-form.tsx` (campos Estándar + "Plan a tu medida");
  `actions/restaurant.ts` `updateOwnOrderTypes` ahora recalcula auto-precio;
  `suscripcion/page.tsx` tarjeta de desglose; `modules-panel.tsx` aviso; `order-types-editor` nota.
- Migraciones 049 + 050 aplicadas a la BD **local**. **Pendiente nube: aplicar 049 + 050.**
- typecheck ✅

### C/D. Mapa de mesas + Admin móvil — ✅ LISTO
- **Editor de mesas** (`floor-plan-editor.tsx`): los tokens ya NO escalan con el ancho;
  se posicionan en % con **tamaño fijo** (`--floor-token`, 56/52/46px según pantalla),
  área táctil cómoda y feedback al arrastrar (se "levanta" con sombra). Adiós tokens de 23px.
- **Admin móvil** (`globals.css` + `shell.tsx`): targets táctiles más grandes en la barra
  inferior; el ítem activo se **centra solo** al navegar (descubribilidad). `/central`
  (franquicia) hereda todo. `/super` (Super Admin): barra superior ahora **desplazable**
  horizontal en móvil (antes se desbordaba).

### B. Landing — ✅ LISTO (`/`)
- `landing.tsx` reescrito como web corporativa: hero con doble CTA + tira de confianza,
  bloque Antes/Después, funciones por beneficio (cliente vs. dueño), "Todo en un solo lugar"
  (16 capacidades), cómo funciona, **precios correctos** (Q199/Q399/Q599) + "Plan a tu medida",
  link a /planes, FAQ (6), CTA final con WhatsApp, footer. Responsive (auto-fit + header que
  oculta enlaces de sección en móvil). CTA usa `NEXT_PUBLIC_CONTACT_WHATSAPP`.
- typecheck ✅

### E. Seguridad — ✅ LISTO
- **Cabeceras** en `proxy.ts`: CSP (frame-ancestors 'self' por el iframe del preview;
  connect-src https:/wss:/localhost por Supabase + impresión; sin upgrade-insecure-requests),
  X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS (prod).
- **Rate-limit** ampliado: login (10/5min IP + 6/5min IP+email), API v1 (30/min).
- **API keys** (mig. 051): tabla con hash SHA-256, `lib/api-keys.ts` (gen/verify/revoke),
  endpoint ejemplo `/api/v1/me`, gestión en `/super/configuracion`.
- **Auditoría SQL/XSS**: sin hallazgos críticos (queries parametrizadas; custom_css saneado).
- Docs: `docs/PAGOS_INTEGRACION.md` (plan pasarela Recurrente) + `SEGURIDAD_2026-06-27.md`.
- Migración 051 aplicada **local**. **Pendiente nube: aplicar 051.**
- typecheck ✅

### F. QA — ✅ (build + pruebas en vivo)
- `npm run build` (producción) **exit 0**: todas las rutas compilan, incl. `/api/v1/me`.
- Servidor de producción levantado y probado por curl:
  - **Cabeceras de seguridad** presentes y correctas (CSP, HSTS, X-Frame-Options, nosniff,
    Referrer-Policy, Permissions-Policy).
  - **Landing** renderiza en el root con todas las secciones nuevas.
  - **/planes** muestra precios correctos: Q199 / Q399 (Estándar) / Q599 / Q999 / Q1,499 / Q2,249.
  - **API keys**: `/api/v1/me` → 401 sin llave / 401 con llave falsa / 200 con llave válida.
  - **Demo** (`demo.localhost`) carga. Sin errores en el log del servidor.
- **End-to-end "Plan a tu medida"** (en BD, modo auto-precio): 3 canales=Q599, 2=Q499, 1=Q399 (piso).
  Verificado que `leogin_apply_auto_price` actualiza la mensualidad real. Datos de prueba revertidos.

---

## ✅ Resumen para producción (aplicar en la nube)

1. **Supabase nube** — aplicar en orden las migraciones nuevas en el SQL Editor:
   - `049_new_plan_tiers.sql`
   - `050_pricing_a_la_medida.sql`  ← modelo de precios definitivo + descuento
   - `051_api_keys.sql`
   (Si la nube ya tenía 049, re-aplicar 050 es idempotente y deja el estado correcto.)
2. **Render (env vars)**:
   - `NEXT_PUBLIC_CONTACT_WHATSAPP` = tu WhatsApp con código de país (ej. `5025XXXXXXXX`)
     para que el botón "Hablar con ventas" del landing y los CTA abran WhatsApp.
3. **Verificar** tras desplegar: que `/planes` y el cobro muestren los mismos precios,
   y que en un restaurante PREMIUM en modo auto-precio, desactivar un canal baje Q100.
4. **Pagos automáticos** (cuando haya volumen): seguir `plataforma/docs/PAGOS_INTEGRACION.md`.

### G. Pulidos extra (seguimiento) — ✅ LISTO
- **Lint de `shell.tsx`** (error pre-existente `react-hooks/set-state-in-effect`): reescrito el
  estado de fondo + nav plegado con `useSyncExternalStore` (lectura de localStorage SSR-safe, sin
  setState en efecto). Lint del archivo = limpio.
- **Visor de mesas del mesero** (`floor-map.tsx`): las mesas ahora son **pines de tamaño fijo**
  (estilo pin de mapa) que se quedan cómodos al tacto sin importar el zoom (antes encogían con la
  pantalla). De paso se corrigió un error de lint pre-existente (`baseScaleRef` leído en render →
  movido a estado `t.base`). Pin responsive 52/48px.
- Verificado: typecheck ✅, lint de ambos archivos ✅, `npm run build` exit 0, app arranca y
  sirve `/`, `/login`, `/admin/login` con 200 sin errores.

## Notas / decisiones
- Los precios públicos viven en `plans.ts` (display) y en `platform_settings` (cobro).
  La mig. 050 los dejó iguales. Si cambias un precio, edítalo en **ambos** (o en
  `/super/configuracion` para el cobro) para que no se desincronicen.
- El descuento "Plan a tu medida" aplica solo a PREMIUM+ y solo si el restaurante está
  en **precio automático** (auto_price). En precios pactados (manual) se muestra como informativo.
</content>
</invoke>
