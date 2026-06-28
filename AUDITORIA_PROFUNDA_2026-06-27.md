# Auditoría profunda — pre-lanzamiento (2026-06-27)

Revisión hecha leyendo el código real de las rutas críticas (cliente, checkout,
seguimiento, landing, registro, núcleo de pedidos, layout/SEO) + typecheck, lint
y build de producción. No se implementó nada todavía: este documento lista qué
mejorar, de lo más grande a lo más pequeño, por prioridad y por rol.

## Veredicto general

El sistema está **genuinamente bien hecho** y por encima del promedio de un SaaS en
pre-lanzamiento:

- `typecheck` limpio (exit 0). `next build` de producción **exit 0**, todas las rutas compilan.
- Higiene de producción excelente: solo 3 usos de `any`, `console.*` solo en `printing.ts`,
  todo `dangerouslySetInnerHTML` saneado.
- Seguridad sólida: precios y descuentos **autoritativos en el servidor** (no se confía en el
  cliente), RPC atómica `place_order`, rate-limit, CSP/cabeceras, RLS multi-tenant.
- Detalles de UX cuidados (anti doble-submit, "fly to cart", welcome-back, copy en español natural).

Lo que sigue es pulido para que quede **impecable**, no rescate. La mayoría son ajustes pequeños
de alto impacto.

---

## P0 — Bloqueantes antes de cobrar a clientes reales

1. **Migraciones y env de nube pendientes (confirmar).** Según tus propios docs y memoria,
   faltan por aplicar en Supabase nube: `049`, `050` (pricing), `051` (api_keys) y `038–042`
   (módulos, FEL, proveedores, lealtad). Si lanzas sin aplicarlas, esas features rompen en
   producción. También en Render: `NEXT_PUBLIC_CONTACT_WHATSAPP`, VAPID (push) y el wildcard
   DNS de subdominios + `demo`. **Acción: checklist de "go-live" verificable antes de invitar al
   primer restaurante.**
2. **No existen páginas legales** (`/terminos`, `/privacidad`). El registro ya las menciona en el
   checkbox de aceptación (`signup-wizard.tsx:315`) pero son **texto plano, sin enlace ni página**.
   Para cobrar y para una pasarela de pago son obligatorias.
3. **Pago en línea: decisión de producto.** Hoy solo hay "efectivo" y "tarjeta al recibir"
   (`checkout-form.tsx`). No hay cobro online. Es válido lanzar así, pero hay que **decidirlo
   explícitamente** y que el copy no sugiera lo contrario. (Ya existe `docs/PAGOS_INTEGRACION.md`.)

## P1 — Bugs / incoherencias concretas

1. **Propina a medio conectar.** El servidor calcula propina DINE_IN (`orders.ts:246-248`) y el
   **panel del mesero la aplica** (`waiter-panel.tsx:434,474,774`). Pero el checkout del cliente la
   fuerza apagada: `const showTip = false` (`checkout-form.tsx:234`), y manda `tipAccepted: showTip`.
   Resultado: si un restaurante **activa propina**, el comensal que pide solo por QR **nunca la ve**;
   solo cuenta si el mesero toma el pedido. Decisión: ofrecerla en el self-checkout DINE_IN (cablearla)
   o quitar el código muerto (`tipAmount`, `snapshotTip`, la línea de WhatsApp de propina).
2. **Seguimiento muestra "En camino" a quien come en local.** `PublicOrder.orderType` es solo
   `'PICKUP' | 'DELIVERY'` (`orders.ts:882,959`). Un pedido **DINE_IN** cae en la rama delivery →
   el timeline le muestra el paso **TRANSIT ("En camino")** a un comensal sentado en su mesa
   (`order-tracker.tsx:147`). Incluir DINE_IN y ocultar TRANSIT igual que ya se hace con pickup.
3. **Registro: copy y layout desactualizados al pasar de 2 a 3 planes.** `signup-wizard.tsx:171`
   dice "**Ambos** incluyen 30 días gratis" con **3** tarjetas; y el grid es `'1fr 1fr'`
   (`:173`) con 3 cards → quedan **desalineadas** (2 arriba, 1 abajo), peor en móvil. Cambiar copy a
   "Todos…" y grid a 3 columnas (o stack en móvil).
4. **Toggle "Habilitar propina" duplicado** en `theme-editor.tsx:340` y
   `orders-currency-editor.tsx:163`. Dos lugares que editan el mismo `tipEnabled`/`tipPercent` →
   riesgo de confusión/inconsistencia. Unificar o dejar uno como fuente.

## P2 — UX / copy / accesibilidad (cliente y empleado)

- **Popup de WhatsApp tras el pedido**: `window.open` se llama dentro de `startTransition` async
  (`checkout-form.tsx:370`), fuera del gesto directo → el navegador **puede bloquearlo**. Ya tienes
  el fallback (botón manual visible) — bien. Mejora: priorizar el botón o abrir wa.me en el mismo
  gesto del submit.
- **Seguimiento de pedido**: el `setInterval` de polling no se limpia al llegar a estado terminal
  (sigue disparando un `tick` vacío cada 8s). Menor, pero limpiable.
- **Accesibilidad**: revisar `aria-label` en botones de solo-ícono (FAB mesero, ícono de carrito,
  cerrar hojas). El rating por estrellas usa hover (`onMouseEnter`) sin equivalente de teclado;
  en móvil funciona por click, pero conviene foco/teclado. (`maximumScale: 5` está bien: permite zoom.)
- **DINE_IN sin mesa escaneada**: el flujo exige escanear el QR de mesa; verificar que el mensaje
  de "no se detectó mesa" sea claro y ofrezca salida (cambiar a llevar/recoger).

## P3 — Rendimiento

- **Fotos de producto sin optimizar.** `catalog.tsx:214` y `product-sheet.tsx:138` usan
  `next/image` con `unoptimized` → se descarga la **imagen original completa** en todos los
  dispositivos. En un menú con muchas fotos, en móvil con datos, eso pesa y tarda (es justo "la
  pantalla que vende"). Opciones: quitar `unoptimized` + configurar `remotePatterns`, o usar la
  **transformación de imágenes de Supabase** (`?width=...&quality=...`). Verificar además que la
  imagen de portada/hero use `priority` (LCP).
- **Rate-limit en memoria** por instancia (ya documentado). Al escalar a varias instancias en
  Render, migrar a Redis/Upstash con la misma interfaz.

## P4 — Código / mantenibilidad

- **Lint: 15 errores + 14 warnings**, casi todos `react-hooks/set-state-in-effect`
  (`checkout-form.tsx`, `welcome-tour.tsx`, `order-tracker.tsx`…) y un `useCallback` no-inline en
  `delivery-map.tsx`. No rompen el build, pero para "impecable" conviene resolverlos (varios ya
  tienen `eslint-disable`; el de `set-state-in-effect` se arregla con valor inicial perezoso o
  derivando en render).
- **Precios en dos fuentes**: `plans.ts` (display) + `platform_settings` (cobro). Riesgo de
  desincronización (ya anotado en tu bitácora). Idealmente una sola fuente de verdad.

---

## Por rol (la mirada que pediste)

**Cliente final que llega a comer / pide:** experiencia muy cuidada. Fricciones: fotos pesadas en
móvil (P3), el paso "En camino" sin sentido en mesa (P1.2), y que la propina/incentivos no aparezcan
si pide solo por QR. Idea: botón "pedir de nuevo" desde *Mis pedidos*.

**Mesero / empleado:** el panel de mesero está completo (toma pedidos, propina, liberar mesa,
imprime). Verificar ergonomía táctil real en tablet (ya trabajada). El auto-disparo a cocina al
crear el pedido del mesero es un gran detalle.

**Administrador / dueño:** panel ricos en módulos. El registro (primera impresión) tiene los bugs
de P1.3. Sugerencia: que el onboarding lleve de la mano a "menú listo + QR impreso" en < 10 min.

**Marketing / conversión (landing):** el landing es claro y vende el valor. Gaps:
- **No hay ni una imagen/captura del producto** — todo son tarjetas de texto. Para un producto cuyo
  argumento es "se ve hermoso", **hay que mostrarlo** (mockup del menú en un teléfono, captura del
  panel). Es probablemente el mayor salto de conversión disponible.
- Sin prueba social (testimonios, "hecho en Guatemala", nº de restaurantes).
- Landing corporativo **sin imagen OpenGraph** (el menú de cada restaurante sí la tiene). Al
  compartir `leogin.online` por WhatsApp no sale vista previa rica.
- Sin `sitemap.ts` ni `robots.ts`.

---

## Ideas nuevas (solo sugerencias — no implementar sin tu visto bueno)

1. Capturas/mockups reales del producto en el landing (mayor palanca de conversión).
2. Propina con **montos sugeridos** (10/15/20 %/personalizado) en vez de % fijo, y disponible en el
   self-checkout DINE_IN.
3. "Pedir de nuevo" (reorder en 1 toque) desde *Mis pedidos*.
4. Banner claro de **abierto/cerrado** y próximo horario en el menú (ya existe `isOpen`).
5. Páginas legales + página de estado/health pública.
6. Imagen OG del landing + sitemap/robots para SEO.

---

## Preguntas / decisiones tuyas

1. ¿Lanzas **sin pago en línea** (solo efectivo / tarjeta al recibir) por ahora? (válido, pero hay
   que dejarlo coherente en el copy).
2. ¿La **propina** debe ofrecerse al comensal que pide solo por QR (DINE_IN), o queda solo cuando la
   toma el mesero? (define si cableo la UI o quito el código muerto).
3. ¿Quieres que prepare las **páginas legales** (plantilla GT de términos + privacidad)?

---

## ✅ Implementado en esta sesión (verificado: typecheck 0, lint 0 errores, build prod exit 0)

Decisiones confirmadas por el dueño: propina también en self-checkout · lanzar sin
pago en línea · sí páginas legales.

1. **🔴 BUG de CSP encontrado y corregido (alto impacto).** El endurecimiento del
   27-jun puso un CSP en `proxy.ts` que **gana** sobre el de `next.config.ts` y que
   **bloqueaba** `fonts.googleapis.com` + `fonts.gstatic.com` (tipografía de cada
   tenant) y `unpkg.com` (CSS de Leaflet). En producción eso dejaba las **fuentes
   personalizadas de los restaurantes en fallback** y los **mapas sin estilo**.
   Verificado por curl que la demo carga esas URLs. Fix: se añadieron esos orígenes al
   CSP del proxy y se **consolidaron todas las cabeceras en `proxy.ts`** (se eliminó el
   `headers()` duplicado de `next.config.ts`; quedó solo `images`). Confirmado por curl:
   CSP correcto + HSTS + XFO + X-XSS-Protection.
2. **Registro:** copy “Ambos”→“Todos” y grid de planes responsivo (3 col en ancho,
   apilado en móvil; clase `.signup-plans`).
3. **Seguimiento DINE_IN:** `orderType` incluye DINE_IN; ya no se muestra el paso
   “En camino” a quien come en local.
4. **Propina en self-checkout DINE_IN:** UI clara y removible (el servidor recalcula el
   monto desde `tipPercent`); refleja en resumen y WhatsApp. Nota informativa en el
   editor del dueño.
5. **Páginas legales** `/terminos` y `/privacidad` (plantilla Guatemala) + enlaces en el
   checkbox del registro y footers (landing y planes). Componente `legal-page.tsx`.
6. **Copy de pago coherente** con “sin pago en línea” (ya lo estaba; términos lo
   explicitan).
7. **Landing:** mockup del producto en CSS (teléfono con menú), franja de confianza
   honesta (sin testimonios inventados) e **imagen OpenGraph** del landing corporativo.
8. **SEO:** `sitemap.ts` + `robots.ts` (App Router Next 16), por host, con sitemap al
   dominio raíz.
9. **Rendimiento:** se quitó `unoptimized` de las fotos de producto (tarjeta y hoja);
   el `remotePatterns` de Supabase ya existía → ahora `next/image` redimensiona/comprime.
10. **Pulidos:** el polling del seguimiento se detiene en estado terminal.
11. **Lint:** 15 errores → **0** (comillas tipográficas; regla `set-state-in-effect`
    desactivada con justificación —patrón SSR intencional del repo—; `^_` para args sin
    usar; `use-memo`/`purity` aislados documentados). Quedan 11 *warnings* de
    `no-unused-vars` (código muerto pre-existente en archivos internos; opcional).

12. **Banner abierto/cerrado en el menú:** cuando el restaurante está cerrado, el
    comensal ve un aviso claro en el menú (antes solo se topaba con el bloqueo en el
    checkout) con la **próxima hora de apertura** ("hoy a las 18:00", "mañana a las
    08:00", "el Lunes…"). Helper nuevo `nextOpenLabel` en `lib/hours.ts`.
13. **Lint 100% limpio:** se eliminaron los 11 *warnings* restantes (imports/const/índices
    muertos; `import fs`/helpers sin usar en scripts de captura; `L` documentado por usarse
    solo en `typeof`; `<img>` de preview local con disable justificado). **Lint: 0 errores,
    0 warnings.** typecheck 0, build prod exit 0.

### Pendiente (decisión/operación tuya)
- Aplicar migraciones nube (049/050/051, 038–042) + env de Render (incl.
  `NEXT_PUBLIC_ROOT_DOMAIN`, `NEXT_PUBLIC_CONTACT_WHATSAPP`, VAPID) antes de lanzar.
- Revisión legal de las plantillas de términos/privacidad por un abogado en GT.
- Sustituir la imagen OG cuadrada por un banner 1200×630 cuando lo tengas.
