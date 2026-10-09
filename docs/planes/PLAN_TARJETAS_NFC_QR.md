# Plan: Tarjetas de mesa NFC + QR

Contexto: Leogin ofrece a cada restaurante una tarjeta física por mesa con NFC + QR
que lleva al menú digital (con la mesa pre-seleccionada). Este documento junta todo
lo definido sobre ese sistema — lo que ya está construido en `plataforma/` y lo que
falta resolver — para que Claude Code lo continúe sin repetir trabajo ni inventar
soluciones de software para problemas que son de hardware/producción física.

---

## 1. Ya implementado ✅ — NO reimplementar

**Problema que resolvía:** el link/QR de cada mesa grababa directo la URL final
(`https://{slug}.{rootDomain}?mesa=N`). Si un restaurante cambiaba de slug, o la
plataforma cambiaba de dominio raíz, cada tarjeta ya impresa/laminada (o cada tag
NFC ya grabado) quedaba rota para siempre.

**Solución construida:** un redirector estable. El link que se imprime/graba ahora
apunta al `restaurantId` (inmutable), no al slug. Un endpoint resuelve el slug
VIGENTE en cada escaneo y redirige (302) al menú real — así cambiar de slug o de
dominio no rompe ninguna tarjeta ya impresa.

Archivos tocados (todos en `plataforma/`):

- `src/app/m/[restaurantId]/[[...mesa]]/route.ts` — **nuevo**. `GET /m/<id>` y
  `GET /m/<id>/<mesa>`. Resuelve `restaurantId` → slug vigente (vía
  `getRestaurantSlugById`) y hace `NextResponse.redirect` (302, `Cache-Control:
  no-store`) a `{subdomainUrl(slug)}?mesa=N`. Si el restaurante no existe o está
  `suspended`, redirige a `/`.
- `src/lib/tenant.ts` — agregadas `stableTableUrl(restaurantId, mesa)` y
  `stableMenuUrl(restaurantId)`, junto a `subdomainUrl`/`adminUrl` que ya existían.
- `src/lib/db/restaurants.ts` — agregada `getRestaurantSlugById(restaurantId)`
  (liviana: solo `slug` + `status`, sin el theme completo). Sin migraciones: usa
  columnas que ya existían.
- `src/components/admin/tables-panel.tsx` — `TableQRCard` ahora arma el link con
  `stableTableUrl(restaurantId, tableNumber)` en vez de `${menuUrl}?mesa=N`. UI
  sin cambios (mismo botón copiar, mismo QR, misma descarga PNG).
- `src/components/admin/qr-display.tsx` + `src/app/admin/(protected)/qr/page.tsx`
  — mismo cambio aplicado al QR general del restaurante (sin mesa).

**Decisiones de diseño a respetar** (si se toca este código después):

- El redirect es **302, no 301** — a propósito, para que el navegador nunca lo
  cachee. Un 301 rompería el propósito del sistema (un cambio de slug tardaría
  en reflejarse).
- El link impreso usa **`restaurantId`, nunca `slug`** — el slug es mutable, el id
  no.
- No se tocó `lib/table-session.ts` ni `menu-shell.tsx`: el cliente sigue leyendo
  `?mesa=N` exactamente igual que antes. El redirect solo cambia CÓMO se llega a
  esa URL, no el formato final.

**Cómo verificar que sigue andando:**

```bash
cd plataforma
npm run typecheck
npm run dev
# visitar http://localhost:3000/m/<restaurantId>/<mesa> y confirmar el redirect
```

---

## 2. Pendiente — Producción física de la tarjeta (NO es código)

Esto es proceso operativo/de producción, no una tarea de programación. Claude
Code no puede ejecutar esta parte (requiere manipular hardware NFC físico), pero
debe conocerla para no asumir que "ya está todo resuelto":

- [ ] **Bloquear cada tag NFC en modo solo-lectura** después de grabarlo (con la
  app de escritura NFC que se use). Un tag sin bloquear puede ser reescrito por
  cualquiera con una app NFC mientras la tarjeta está sola en la mesa —
  redirigiendo al cliente a un sitio falso.
- [ ] **Grabar el link NUEVO en cada NFC**: `stableTableUrl(restaurantId, mesa)`
  (formato `https://leogin.online/m/<restaurantId>/<mesa>`), no la URL vieja
  `{slug}.leogin.online?mesa=N`. El panel de Mesas (`/admin/mesas`) ya muestra
  este link nuevo listo para copiar.
- [ ] **QR con laminado a prueba de manipulación** (que se rompa visiblemente al
  despegar), para que se note si alguien pega un QR falso encima.
- [ ] **Reemplazar la tarjeta suelta por un soporte tipo tent card** (acrílico):
  se moja, se mancha con productos de limpieza, y se pierde/roba menos que una
  tarjeta suelta sobre la mesa.

---

## 3. Ideas de código para apoyar el rollout físico — A EVALUAR, no construir directo

Estas son propuestas que surgieron al auditar el sistema, no un pedido confirmado.
**Antes de programar cualquiera de estas, confirmar con Leonardo si las quiere** —
no asumir que sí:

- **Exportar todas las tarjetas QR de un restaurante en un solo PDF listo para
  imprimir** (hoy el panel de Mesas solo permite bajar el PNG de a una mesa por
  vez). El proyecto ya usa `jspdf`/`jspdf-autotable` para otros documentos
  (ver `src/lib/documents`), así que encajaría con el patrón existente.
- **Checklist de instalación por mesa** en `/admin/mesas`: marcar "NFC grabado:
  sí/no" por mesa, para llevar control de cuáles ya están físicamente
  instaladas en el restaurante durante el rollout.

---

## Notas generales para Claude Code

- La Sección 1 ya está hecha y verificada (typecheck limpio) — si algo de ahí
  parece faltar al revisar el repo, primero confirmar que no se está mirando una
  copia desactualizada antes de "corregirlo".
- La Sección 2 no se resuelve con código.
- La Sección 3 requiere luz verde explícita de Leonardo antes de implementarse.
