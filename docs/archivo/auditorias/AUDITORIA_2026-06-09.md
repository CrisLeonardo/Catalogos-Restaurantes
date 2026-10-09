# AUDITORÍA COMPLETA — 2026-06-09

> Revisión integral del código (`plataforma/`) en busca de errores de seguridad, lógica,
> UX y oportunidades de mejora. Los ítems marcados ✅ ya fueron corregidos en esta sesión.

---

## 1. Seguridad

### ✅ [CRÍTICO — corregido] `createOrder` confiaba en los precios del cliente
`src/lib/actions/orders.ts` insertaba el pedido con `price` y `deliveryFee` tal como los
mandaba el navegador. Cualquiera podía abrir DevTools y crear pedidos con precios de Q0.01.
**Fix aplicado:** los precios se leen SIEMPRE de la tabla `products` (validando que el
producto pertenezca al restaurante y esté disponible) y el costo de envío se resuelve del
tema del restaurante en el servidor. Los snapshots se congelan con esos valores.

### ✅ [ALTO — corregido] `api/setup-super` eliminado
`src/app/api/setup-super/route.ts` permitía resetear la contraseña de CUALQUIER usuario y
darle rol SUPER_ADMIN conociendo `SETUP_SECRET`. El propio archivo decía "Eliminar después
de usarlo". **Borrado el 2026-06-09** (nunca llegó a commitearse). Si en el futuro
necesitas configurar el super admin en producción, usa
`node scripts/crear-super-admin.mjs <email> <password>` con las variables de entorno del
proyecto en la nube (no requiere endpoint público). Si definiste `SETUP_SECRET` como
variable de entorno en Render/produccón, ya puedes quitarla.

### ✅ [MEDIO — corregido] Slugs sin validar ni reservar
Se podía crear/renombrar un restaurante con slug `demo` (chocaría con la demo pública),
`www`, con espacios o mayúsculas (URL rota). **Fix:** validación de formato
`^[a-z0-9]([a-z0-9-]*[a-z0-9])?$` + lista de reservados (`demo`, `www`, `admin`, `api`,
`app`, `super`, `preview`, `login`) en `createRestaurant` y `updateRestaurantBasic`.

### [BAJO] `generate_order_number` tiene una carrera
Usa `count(*) + 1`: dos pedidos simultáneos pueden recibir el mismo número (el fallback
`'ORD-???'` también delata esto). Para el volumen actual es improbable; el fix limpio es
una secuencia por restaurante o un `advisory lock`.

### [BAJO] `/api/qr` es un generador de QR abierto
Genera QRs para cualquier URL http(s); no es peligroso (no hay fetch), pero cualquiera
puede usar tu servidor como servicio de QRs. Sugerencia: limitar a URLs de tu dominio raíz.

---

## 2. Bugs de lógica

### ⚠️ [MEDIO] KPIs del panel "Pedidos" mezclan TODO el histórico, no "hoy"
`orders-panel.tsx` calcula "Ventas hoy", "Pedidos hoy", "Ticket promedio" y "Cerrados hoy"
sobre `initialOrders`, que es `getRestaurantOrders()` = **los últimos 100 pedidos de
cualquier fecha**. En cuanto haya más de un día de historia, los KPIs mienten.
**Fix sugerido:** filtrar por `created_at >= hoy` en la query (o en el componente).

### ⚠️ [MEDIO] Zona horaria en la gráfica de 14 días
`getOrderStats` agrupa por día con `created_at.startsWith(dateStr)` usando fechas UTC
(`toISOString`), pero los límites (`since`, `todayStart`) usan hora local del servidor.
En Guatemala (UTC−6) un pedido de las 7 p.m. cae en el día siguiente de la gráfica.
**Fix sugerido:** definir una zona horaria por restaurante (config) y agrupar con ella.

### ⚠️ [MEDIO] El tema del perfil del dueño está "muerto"
`/admin/perfil` (ProfileForm → `updateRestaurantTheme`) escribe las columnas **legacy**
(`color_primary`, `color_bg`…), pero el resolver da prioridad a `config` (JSONB). En cuanto
tú guardas una vez desde el editor del Super Admin, los cambios del dueño en su perfil
**dejan de tener efecto** (quedan enmascarados por `config`). Decide: o el perfil del dueño
escribe a `config`, o le quitas la sección de tema al dueño (modelo "Leonardo diseña").

### [BAJO] Moneda hardcodeada en el panel admin
`orders-panel.tsx` muestra `Q` fijo y `order-card.tsx` muestra `$` fijo (¡mezclados!). Si un
restaurante usa otra moneda, su panel miente. Fix: pasar `currencySymbol` del tema resuelto.

### ✅ [BAJO — corregido] Locale inválido rompía todo el sitio del tenant
`formatAmount` usaba `toLocaleString(config.locale)` sin protección: escribir un locale
inválido en el editor (campo libre) lanzaba `RangeError` en cada precio. Ahora hay fallback.

### ✅ [BAJO — corregido] "Crea el tuyo →" de la demo recargaba la demo
El link era `href="/"` (relativo al subdominio demo). Ahora apunta al dominio raíz.

### [BAJO] Vaciar un texto en el editor no restaura el default
El editor muestra el contenido YA resuelto (defaults incluidos) y guarda todo como
override. Si borras un texto (p.ej. el del botón CTA), se guarda `""` y el botón queda
vacío, en vez de volver al texto por defecto. Sugerencia: tratar `""` como "usar default"
al guardar (excepto los campos donde vacío tiene significado, como título de portada).

### [BAJO] Owner que cambia datos no refresca el sitio del tenant
`updateRestaurantInfo` hace `revalidatePath('/')`, pero el menú del comensal vive en el
subdominio; con `dynamic`/sin caché hoy funciona de facto, pero si activas caching por
ruta habrá que revalidar por tag/host.

### [BAJO] Carrera teórica en reordenar productos/categorías
`moveUp/moveDown` hacen dos UPDATEs sin transacción; dos clics rápidos pueden dejar dos
filas con el mismo `sort_order`. Tolerable; un RPC transaccional lo resolvería.

---

## 3. UX / accesibilidad / detalles

- `Glass interactive onClick` produce divs clicables sin rol de botón ni soporte de
  teclado (tarjetas de producto). Añadir `role="button"`, `tabIndex=0` y Enter/Espacio.
- El buscador del catálogo solo busca en el **nombre**; incluir descripción y tags.
- `image-upload.tsx` no hace `URL.revokeObjectURL` (fuga menor) y no comprime imágenes
  (una foto de 5 MB se sube tal cual; en móvil pesa). Sugerencia: redimensionar en canvas
  antes de subir.
- `viewport.themeColor` está fijo en `#0b0b0c`; podría tomar `--brand-bg` del tenant.
- Falta `favicon`/OG image por restaurante (campo `faviconUrl` está previsto en el plan).
- Los errores del checkout se muestran en color claro (`--u-text-2`), no en rojo; dudoso
  como affordance de error.
- `getRestaurantUsers` hace N+1 (`getUserById` por perfil); fino hoy, lento con muchos.

---

## 4. Funciones nuevas recomendadas (ordenadas por valor/esfuerzo)

1. **Horarios de apertura por restaurante** — el badge "Abierto ahora" es decorativo;
   con horarios reales puede apagarse solo y bloquear pedidos fuera de horario.
2. **Pausa de pedidos ("cocina saturada")** — toggle en el panel del dueño que
   deshabilita checkout temporalmente con mensaje personalizable.
3. **Variantes/extras de producto** (tamaños, "extra queso") — hoy solo hay producto
   plano; es la petición #1 típica de restaurantes.
4. **Zona horaria + moneda por restaurante en `restaurants`** — arregla §2 (timezone) y
   centraliza formato.
5. **Notificación push/WhatsApp automática al restaurante** — hoy el comensal debe tocar
   "Notificar al restaurante" (wa.me); un webhook (Twilio/Meta Cloud API) lo haría solo.
6. **Estados de pedido visibles para el comensal** — página pública `pedido/[id]` con el
   estado en vivo (ya tienes Realtime en orders).
7. **Métricas para el dueño** — la gráfica de 14 días ya existe; añadir export CSV y
   rango de fechas.
8. **Duplicar restaurante / plantillas de tema** — guardar un tema como plantilla y
   aplicarlo al crear (acelera tu flujo de diseño).
9. **Subir el tema a la galería de presets** en el editor (botón "Guardar como preset").
10. **Modo "borrador" del tema** — guardar config sin publicar (columna `draft_config`) y
    botón "Publicar"; hoy guardar = publicar al instante.
11. **PWA/manifest por restaurante** (nombre/íconos del tenant; hoy el manifest es global).
12. **Búsqueda con descripción + sin acentos** en el catálogo del comensal.

---

## 5. Verificación de esta sesión

- `npm run typecheck` ✓ · `npm run lint` ✓ (2 warnings preexistentes) · `npm run build` ✓ (23 rutas).
- Demo (`demo.localhost:3000`) verificada en navegador tras el refactor.
- `/preview/...` sin sesión redirige a `/login` ✓ (guard de Super Admin).
