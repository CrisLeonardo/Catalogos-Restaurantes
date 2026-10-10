# Auditoría de salida a producción y a la venta — 2026-10-09

> **Encargo:** revisar todo el sistema y decir qué le falta, grande o
> pequeño, para salir a producción y venderse: errores del propio sistema,
> errores humanos (del dueño, del personal y del comensal), y funciones o
> modalidades que hacen falta sí o sí.
>
> **Cómo se hizo:** lectura del código de pedidos, caja, cobro de mesa,
> anulaciones, catálogo, registro, almacenamiento, suscripción, rutas de la
> API y del agente; documentación, planes y checklist vigentes; `npm audit`;
> las 947 pruebas unitarias (todas en verde); y pruebas directas contra la
> base local cuando un hallazgo lo permitía (marcadas 🧪).
>
> No repite lo que ya está en
> [`PLAN_ACCESO_Y_MONITOREO_2026-10-08.md`](../planes/PLAN_ACCESO_Y_MONITOREO_2026-10-08.md)
> ni en [`CHECKLIST_CORRECCIONES.md`](../registros/CHECKLIST_CORRECCIONES.md);
> solo los cita cuando siguen bloqueando la salida.

## Veredicto

El núcleo está bien construido: precios siempre calculados en el servidor,
pedidos idempotentes, stock atómico con devolución al anular, anulaciones con
motivo y firma, segundo factor para el super admin, RLS auditada en la CI,
modo sin internet. **No está listo para vender todavía** por cuatro bloques:

1. **Un error que rompe el alta de clientes nuevos** (PROD-01): quien se
   registra solo no puede subir fotos ni logo. Es exactamente el camino por
   el que entra un cliente que compra.
2. **La caja no cuadra en casos normales** (PROD-02/03/04): mesas abiertas,
   dos turnos el mismo día y bares que cierran después de medianoche.
3. **Infraestructura gratuita y sin respaldos** (INF-01/02) y una
   vulnerabilidad **crítica** de Next.js (SEG-01).
4. **Lo legal y fiscal de Leogin como negocio** (LEG-01/02/03): sin empresa
   inscrita ni FEL propio no se puede cobrar legalmente la mensualidad.

## Cómo leer este documento

- **P0** antes de vender · **P1** primeras semanas con clientes · **P2** después.
- 🧪 = reproducido o medido, no solo leído. 🙋 = solo lo puedes hacer tú
  (proveedores, dinero, trámites, producción).
- Cada hallazgo: qué pasa, cómo se ve en el restaurante, qué hacer.

## Resumen

| ID | Hallazgo | Prioridad |
|---|---|---|
| PROD-01 | ✅ 🧪 Dueño registrado solo no puede subir fotos ni logo | **P0** |
| PROD-02 | Caja: mesas y pedidos sin cobrar cuentan como efectivo esperado | **P0** |
| PROD-03 | Caja: el segundo turno del día espera el efectivo de todo el día | **P0** |
| PROD-04 | Caja: después de medianoche el «día» es otro | **P0** para bares, P1 resto |
| PROD-05 | No hay forma de corregir un cobro (método o mesa equivocada) | **P0** |
| PROD-06 | Borrar un corte de caja: sin firma, sin motivo, sin bitácora | P1 |
| PROD-07 | ✅ Cobrar mesa: dos cobros a la vez o una ronda nueva al cobrar | P1 |
| PROD-08 | ✅ Cambio de estado usa el restaurante «de casa» del perfil | P1 |
| PROD-09 | ✅ Cancelación del comensal puede pisar la confirmación de cocina | P1 |
| PROD-10 | Bitácora no registra precios, borrados, cupones, gastos ni cortes | P1 |
| PROD-11 | Anular no devuelve puntos ni el uso del cupón | P2 |
| PROD-12 | Borrado definitivo de platillos y categorías, sin papelera | P2 |
| PROD-13 | Límite de usos del cupón no atómico; canje de puntos ignora errores | P2 |
| PROD-14 | El servidor deja retroceder un pedido ya entregado | P2 |
| PROD-15 | Tarjetas de regalo: existen en la base, no en pantalla | P2 |
| SEG-01 | 🧪 Next.js 16.2.7 con vulnerabilidad **crítica** (saltarse el proxy) | **P0** |
| SEG-02 | 🧪 `sharp` con vulnerabilidades altas y procesa fotos subidas | **P0** |
| SEG-03 | La CI no corre las pruebas unitarias ni el `build` | P1 |
| SEG-04 | El E2E no cubre el embudo de venta (registro → primer pedido) | P1 |
| SEG-05 | Sin Dependabot ni `npm audit` automático | P1 |
| SEG-06 | `/api/qr` abierto y sin límite | P2 |
| SEG-07 | Hashes de PIN de 4 cifras viven en la PC del local | P2 |
| INF-01 | 🙋 Render en plan gratuito | **P0** |
| INF-02 | 🙋 Supabase gratuito: sin respaldos diarios | **P0** |
| INF-03 | 🙋 Migraciones pendientes en producción (136→141) | **P0** |
| INF-04 | 🙋 Activar Sentry, monitor externo y avisos (código listo) | **P0** |
| INF-05 | 🙋 Resend: sin él no existe «olvidé mi contraseña» | **P0** |
| INF-06 | 🙋 Firma de código del instalador (antivirus lo borra) | **P0** si vendes impresión |
| INF-07 | Ambiente de pruebas (staging) y migraciones con CLI | P1 |
| INF-08 | Ensayo de restauración de un respaldo | P1 |
| INF-09 | Modo mantenimiento y `global-error.tsx` | P2 |
| LEG-01 | 🙋 Leogin como empresa: SAT, NIT, FEL para cobrar la mensualidad | **P0** |
| LEG-02 | Términos desactualizados e incompletos | **P0** |
| LEG-03 | Privacidad no nombra proveedores ni datos que se recogen | **P0** |
| LEG-04 | Contacto legal es un Gmail personal | P1 |
| LEG-05 | Ticket sin FEL no dice «no es factura» | P1 |
| LEG-06 | FEL apagado: los restaurantes formales lo van a pedir | P1 |
| FUN-01 | Turnos de caja con apertura y cierre propios | **P0** (resuelve PROD-03) |
| FUN-02 | Pantalla siempre encendida en cocina y pedidos | P1 |
| FUN-03 | Pedido sin confirmar: aviso al comensal y al local | P1 |
| FUN-04 | Tiempo estimado al aceptar el pedido | P1 |
| FUN-05 | Pedido mínimo para domicilio | P1 |
| FUN-06 | Bloquear números de clientes (pedidos falsos) | P1 |
| FUN-07 | Baja, cambio de plan y exportación completa sin pasar por WhatsApp | P1 |
| FUN-08 | Cobro de la mensualidad en línea | P2 |
| FUN-09 | Pedidos programados | P2 |
| FUN-10 | Reservas y lista de espera desde el menú del comensal | P2 |
| FUN-11 | Teléfonos extranjeros en el checkout | P2 |

---

## A. Errores del sistema

### PROD-01 · 🧪 El dueño que se registra solo no puede subir fotos — **P0**

**Qué pasa.** Las reglas del bucket `restaurant-assets`
(`supabase/migrations/003_auth_admin_rls.sql:160-190`) solo dejan escribir en
la carpeta `get_my_restaurant_id()`, que es `profiles.restaurant_id`. Pero el
registro nuevo deja ese campo **en null a propósito**
(`lib/actions/signup.ts:142`) y el restaurante se crea con acceso por
`restaurant_members` sin tocarlo (`lib/actions/mi-cuenta.ts:334-337`). Las
tablas sí tienen reglas por membresía; **el almacenamiento nunca se
actualizó**: es el único sitio que quedó con la regla vieja (consultado en
`pg_policies` de la base local).

**Prueba.** Script contra la base local: usuario con perfil sin restaurante +
membresía de dueño → `upload` a `<restaurante>/products/…` →
`new row violates row-level security policy`. Limpieza hecha.

**Cómo se ve.** Un cliente nuevo se registra, crea su restaurante, carga su
primer platillo, pone la foto… y le sale un error en inglés. Las fotos son lo
que vende el menú. Afecta también a quien administra un grupo y a cualquier
dueño en su segundo restaurante.

**Qué hacer.** Migración 142: reglas de `storage.objects` que acepten la
carpeta si la persona es miembro activo del restaurante con la sección
«Catálogo» o «Diseño» (`leogin_puede()` de la 140), además del caso de
siempre. Añadir este caso a `test-aislamiento.mjs` y al E2E (SEG-04).

> ✅ **Hecho (2026-10-10).** Migración `142_fotos_por_membresia.sql`: las
> tres reglas de escritura usan `leogin_puede_subir_foto(name)` = carpeta
> del perfil «de casa» **o** `leogin_puede(<restaurante>, 'catalogo',
> 'personalizar')`; un nombre que no empiece por uuid da «no», no error.
> Probado contra la base local antes (dueño solo con membresía → rechazo
> RLS) y después (entra), y con `INSERT` directo como `authenticated`.
> `test-aislamiento.mjs` suma 7 casos: dueño de casa, dueño registrado
> solo, miembro con Catálogo, y los rechazos cruzados (miembro de **otro**
> restaurante, dueño en carpeta ajena, miembro solo con Pedidos). Falta el
> paso del E2E (SEG-04). Independiente del código: se aplica cuando sea.

### PROD-02 · Caja: lo que no se ha cobrado cuenta como efectivo — **P0**

**Qué pasa.** `getCashSummary` (`lib/actions/finanzas.ts:139`) suma **todos**
los pedidos del día que no estén cancelados, cobrados o no. Un pedido de
mesero nace con `payment_method = 'CASH'` hasta que se cobra, así que cada
mesa abierta, cada pedido en cocina y cada domicilio que el repartidor aún no
liquida entran como «efectivo que debería haber en el cajón». `getCajaState`
no avisa de que hay mesas abiertas.

**Cómo se ve.** El cajero cierra a las 22:00 con dos mesas todavía comiendo:
el cuadre dice que **faltan** Q380. Cuenta otra vez, no aparecen, y el dueño
desconfía de él o del sistema.

**Qué hacer.** Esperado = solo pedidos **cobrados** (cerrados con pago en
`order_payments`, o entregados para los que no tienen filas). Antes de cerrar,
listar «Quedan 2 mesas abiertas y 1 domicilio sin liquidar» con opción de
cobrarlas o dejarlas para el siguiente turno.

### PROD-03 · Caja: el segundo turno espera el efectivo de todo el día — **P0**

**Qué pasa.** El cierre no resta lo que ya cerraron turnos anteriores del
mismo día: solo los gastos se atan al corte (`cash_count_id`). El turno de la
noche calcula como esperado el efectivo de mañana + tarde + noche.

**Cómo se ve.** Cualquier restaurante con dos turnos (muy común) ve en el
segundo cierre un faltante igual a lo que entregó el primero.

**Qué hacer.** Ver FUN-01: el corte cubre desde el cierre anterior (o la
apertura del turno), no desde medianoche.

### PROD-04 · Caja: después de medianoche el día es otro — **P0 para bares**

**Qué pasa.** El día de caja es la fecha de calendario en la zona del local
(`localDateKey(new Date(), tz)`). Un bar que cierra a la 1:30 cierra la caja
del día **siguiente**, que solo tiene lo vendido después de las 00:00. Lo
mismo pasa con los gastos (`business_date`) y el reparto de propinas.

**Qué hacer.** «Hora de corte del día» por restaurante (por omisión 05:00):
todo lo anterior a esa hora pertenece al día anterior. Usarla también en
reportes, Hoy y analítica, para que todos digan lo mismo.

### PROD-05 · No hay forma de corregir un cobro — **P0**

**Qué pasa.** `voidOrder` rechaza un pedido `DELIVERED` («ya está cerrado»,
`orders.ts:1596`) y no existe acción para reabrir una mesa ni para cambiar el
método de pago de un pedido cobrado.

**Cómo se ve.** Es el error humano más frecuente en una caja:
- cobró «Efectivo» y era «Tarjeta» → el cuadre sale descuadrado esa noche y
  no hay cómo explicarlo;
- cobró la mesa 4 cuando era la 5 → la 4 desaparece del salón con la gente
  todavía comiendo;
- el cliente pagó y luego reclama un platillo → no hay devolución.

**Qué hacer.** Tres acciones con firma de encargado (el mismo PIN de
anulaciones) y bitácora:
1. **Corregir método de pago** de un pedido cobrado hoy (antes del corte).
2. **Reabrir mesa** cobrada por error en los últimos N minutos.
3. **Devolución** (total o de una línea) sobre un pedido cobrado: queda como
   movimiento negativo en caja y en reportes, nunca borrando la venta.

### PROD-06 · Borrar un corte de caja sin firma ni rastro — P1

**Qué pasa.** `deleteCashCount` (`finanzas.ts:254`) borra **de verdad** un
corte de las últimas 24 h a cualquiera con acceso a Caja: sin motivo, sin PIN
de encargado y sin `logActivity`.

**Cómo se ve.** Un cajero cierra con faltante, borra el corte y vuelve a
cerrar «cuadrado» con otra apertura. El dueño nunca lo ve.

**Qué hacer.** No borrar: marcar el corte como **anulado** con motivo, quién
y firma; el historial enseña los dos. Solo dueño o encargado.

### PROD-07 · Cobrar mesa: carreras — P1

**Qué pasa.** `freeTable` (`orders.ts:1107`) lee los pedidos abiertos de la
mesa y luego cierra **todos los que estén abiertos en ese momento**, no los
que leyó. Y dos cobros simultáneos leen la misma lista.

**Cómo se ve.**
- El mesero manda una ronda nueva justo cuando caja cobra → esa ronda queda
  cerrada sin pago registrado y cuenta como efectivo (PROD-02).
- Dos aparatos cobran la misma mesa a la vez → `order_payments` duplicado y
  la caja espera el doble.

**Qué hacer.** Cerrar con `.in('id', idsLeídos)` y registrar pagos solo de
las filas que esta llamada cerró de verdad (las que devuelve el `update`); si
no cerró ninguna, «Esta mesa ya se cobró».

> ✅ **Hecho (2026-10-10).** `freeTable` cierra con `.in('id', idsLeídos)`
> y conserva la condición «sigue abierto»; método, efectivo recibido y
> `order_payments` se escriben solo para los ids que devolvió su `update`.
> Si leyó pedidos y no cerró ninguno, devuelve «Esta mesa ya se cobró.» sin
> tocar pagos ni el turno (el panel lo enseña como aviso). Liberar una mesa
> sin pedidos abiertos sigue funcionando igual. Pruebas en
> `orders-carreras.test.ts` (fallan con el código anterior).

### PROD-08 · El cambio de estado usa el restaurante «de casa» — P1

**Qué pasa.** `updateOrderStatus` (`orders.ts:1318, 1338, 1363, 1377`) toma
`profile.restaurant_id` para imprimir la comanda, dar puntos, emitir FEL y
escribir la bitácora, aunque ya tiene el restaurante real del pedido
(`rowRestaurantId`). El resto del código ya usa `resolveOwnRestaurantId` /
`canActOnRestaurant` por esta razón (auditoría profiles.restaurant_id).

**Cómo se ve.**
- **Dueño registrado solo** (`restaurant_id` null): **ningún cambio de estado
  queda en la bitácora** (la condición `if (profile.restaurant_id && changed)`
  nunca se cumple).
- Dueño con restaurante «de casa» operando su segundo local, o personal que
  ayuda en otra sucursal: la comanda **no se imprime**, no se dan puntos y el
  FEL no sale (cada función busca el pedido en el restaurante equivocado y
  se calla).

**Qué hacer.** Usar siempre `rowRestaurantId` (el del pedido). Una línea por
sitio; añadir una prueba.

> ✅ **Hecho (2026-10-10).** Comanda, puntos, FEL y bitácora usan
> `rowRestaurantId` (lo devuelve el propio `update`, así que existe siempre
> que hubo cambio); se quitaron los respaldos a `profile.restaurant_id` y la
> consulta extra al pedido. Prueba: `src/lib/actions/orders-carreras.test.ts`
> (dueño sin restaurante de casa y dueño en su segundo local; falla con el
> código anterior).

### PROD-09 · Cancelación del comensal contra confirmación — P1

**Qué pasa.** `cancelPublicOrder` (`orders.ts:2649`) comprueba que el pedido
esté en `NEW`, repone stock y luego actualiza **sin** volver a exigir `NEW`.
Si cocina acepta en ese segundo, el pedido queda cancelado con la comanda ya
impresa. Además repone stock antes de saber si la cancelación entra.

**Qué hacer.** `update … where status = 'NEW'` y reponer stock solo si cambió
una fila (o hacerlo todo en un RPC como `void_order`).

> ✅ **Hecho (2026-10-10), por la vía del RPC.** Exigir `NEW` en el update
> desde la app no alcanza: `restock_order` no repone nada de un pedido ya en
> `CANCEL`, así que el stock tiene que volver antes y en la misma
> transacción. Migración `143_cancelacion_del_comensal_atomica.sql`:
> `cancel_public_order(pedido, restaurante)` bloquea la fila, comprueba
> `NEW`, repone y cancela; devuelve false si cocina llegó antes. Probado
> contra la base local (cancela y repone una vez; segunda llamada y pedido
> en `PREP` no tocan nada). `cancelPublicOrder` la usa y, si la función aún
> no existe (`PGRST202`), sigue el camino de antes. Se puede aplicar antes o
> después del despliegue; hasta que corra, la carrera sigue abierta.
>
> Queda aparte: `updateOrderStatus` deja pasar un pedido de `CANCEL` a
> `PREP` (su condición es solo «distinto del estado nuevo»); es la misma
> familia que PROD-14.

### PROD-10 · Bitácora incompleta para el antifraude — P1

`logActivity` solo se usa en pedidos, personal, aparatos, inventario, mesas y
pocos más. **No queda rastro** de: cambios de precio, borrado de platillos y
categorías, creación/edición de cupones (un cupón del 100 % para un amigo),
gastos de caja, cierres y borrado de cortes, cambios de horario o de pausa de
pedidos. Son justo las preguntas de un dueño cuando algo no cuadra: «¿quién
bajó el precio?», «¿quién borró eso?».

**Qué hacer.** Registrar esas acciones con antes/después del importe y
enseñarlas en la bitácora del panel con filtro por persona.

### PROD-11 · Anular no devuelve puntos ni el cupón — P2

`void_order` y `restock_order` devuelven stock, pero no los puntos canjeados
(`leogin_loyalty_redeem_reward`) ni el contador de usos del cupón
(`increment_coupon_usage`). Un pedido anulado deja al cliente sin sus puntos.
**Qué hacer:** movimiento inverso en `loyalty_transactions` y decremento del
cupón en la misma transacción de la anulación.

### PROD-12 · Borrado definitivo, sin papelera — P2

`deleteProduct` y `deleteCategoryModal` borran de verdad (con confirmación,
pero sin deshacer). Borrar un platillo **borra su receta** (`on delete
cascade`, mig 037) y lo desconecta de recompensas e historial; borrar una
categoría deja sus platillos sin categoría. Además `deleteProduct` ignora el
error de la base. **Qué hacer:** archivar en vez de borrar, «Papelera» de 30
días y avisar «Esta categoría tiene 14 platillos».

### PROD-13 · Cupones y puntos: comprobaciones separadas — P2

En `createOrder` el límite de usos del cupón se comprueba al validar y se
incrementa después (`orders.ts:613-622`): dos pedidos a la vez pueden pasarse
del límite. El canje de recompensas (`orders.ts:627-636`) no mira el error
del RPC: si falla, el pedido sale con el platillo gratis sin descontar puntos.
**Qué hacer:** incremento condicional (`where usos < max`) y, si el canje
falla, anular la línea de regalo.

### PROD-14 · El servidor deja retroceder un pedido entregado — P2

`updateOrderStatus` acepta cualquier transición mientras el estado nuevo sea
distinto del actual. Un `DELIVERED` puede volver a `PREP` (y reimprimir) o a
`NEW`. **Qué hacer:** tabla de transiciones permitidas en el servidor; volver
atrás desde «entregado» solo por PROD-05.

### PROD-15 · Tarjetas de regalo a medias — P2

`issue_gift_card` / `redeem_gift_card` (mig 082) existen y FEL las considera,
pero no hay pantalla que las emita ni las cobre. Decidir: terminarlas (se
venden bien en temporada) o quitarlas de la oferta para no prometerlas.

---

## B. Seguridad, dependencias y pruebas

### SEG-01 · 🧪 Next.js con vulnerabilidad crítica — **P0**

`npm audit` sobre las dependencias de producción: **1 crítica, 8 altas**.
La crítica es de `next@16.2.7` (rango afectado ≤ 16.3.7), e incluye
*Middleware / Proxy bypass*, DoS con Server Actions y confusión de caché. El
proxy de este sistema decide el restaurante y **borra las cabeceras internas**
(`x-tenant-slug`, etc.) que el resto de la app trata como confiables
(`src/proxy.ts`). **Qué hacer:** subir `next` y `eslint-config-next` a la
última 16.x parcheada, `rm -rf .next`, correr typecheck, pruebas, E2E y un
barrido visual.

### SEG-02 · 🧪 `sharp` vulnerable — **P0**

`sharp ≤ 0.35.5-rc.1`: fallos de libvips, libheif y librsvg. La ruta `/img`
procesa con `sharp` **fotos que suben los restaurantes**, o sea, entrada de
terceros. Subir a `sharp@0.35.5` (cambio mayor: revisar `/img`). Los demás
avisos (`postcss` de Next, `uuid` vía `exceljs`, `source-map-js`) se van con
`npm audit fix` y con SEG-01.

### SEG-03 · La CI no corre las pruebas unitarias ni el build — P1

`.github/workflows/ci.yml` corre tipos, lint, aislamiento, auditorías de RLS y
el E2E, pero **no `npm test`** (947 pruebas que hoy pasan, 🧪) **ni
`npm run build`**. Un error de build se descubre cuando Render falla al
desplegar. Añadir los dos pasos.

### SEG-04 · El E2E no cubre el embudo de venta — P1

`tests/e2e/pedidos.spec.ts` es el único E2E. PROD-01 habría salido el primer
día con una prueba: **registrarse → crear restaurante → subir foto → crear
platillo → pedir desde el menú → aparece en el panel → cobrar → cerrar caja**.
Es el recorrido que hace cada cliente que pagas por adquirir.

### SEG-05 · Sin Dependabot — P1

No hay `.github/dependabot.yml`. Configurarlo (semanal, npm de `plataforma/`,
`agente-impresion/`, `leogin-desktop/` y las GitHub Actions) y añadir
`npm audit --omit=dev --audit-level=high` a la CI.

### SEG-06 · `/api/qr` abierto — P2

Genera QR de cualquier URL `http(s)` sin sesión ni límite. Poco riesgo, pero
es CPU gratis para cualquiera y un QR «servido por tu dominio». Limitar a
URLs de la plataforma o poner `rateLimit`.

### SEG-07 · Hashes de PIN en la PC del local — P2

`/api/agent/staff-pins` manda hash+sal de cada PIN al hub para el modo sin
internet. Con 4 cifras, quien copie los datos del agente los rompe en
segundos. Es un intercambio consciente; mitigarlo con PIN de 6 cifras para
dueño y encargados (son los que firman anulaciones y devoluciones).

Siguen abiertos de antes, sin cambio: `unsafe-inline` en `style-src` y la
firma de código (INF-06).

---

## C. Infraestructura y operación

### INF-01 · 🙋 Render en plan gratuito — **P0**

`plataforma/render.yaml` dice `plan: free`: se duerme a los 15 min sin
tráfico (la primera persona que escanea el QR espera 30-60 s y muchos se
van), 0,1 CPU para `sharp` y para todo el panel. Pasar a un plan pagado
antes del primer cliente; medir memoria con tráfico real para decidir entre
Starter y Standard.

### INF-02 · 🙋 Supabase sin respaldos — **P0**

Plan gratuito = sin respaldos diarios descargables y sin recuperación a un
punto en el tiempo. Un `delete` equivocado en el SQL Editor (donde hoy se
corren las migraciones a mano) no tiene vuelta atrás. Opciones: plan Pro
(respaldos diarios), o como mínimo un `pg_dump` diario cifrado desde GitHub
Actions a un almacenamiento aparte. Lo mismo para las fotos del bucket.

### INF-03 · 🙋 Migraciones pendientes en producción — **P0**

Según los planes vigentes: 136, 139 y 140 (ya), 137 y 138 (después de
desplegar) y 141 (Vitrina). Correr primero
`plataforma/supabase/verificar_migraciones.sql` y seguir el orden de
[`PLAN_ACCESO_Y_MONITOREO`](../planes/PLAN_ACCESO_Y_MONITOREO_2026-10-08.md).
**La 142 de PROD-01 irá aquí también.**

### INF-04 · 🙋 Encender la vigilancia — **P0**

El código ya existe; falta: `SENTRY_DSN` en Render, monitor externo a
`/api/health/deep`, `SALUD_CRON_SECRET` + secretos de GitHub y «Avisarme en
este celular» en `/super` (pasos 6-8 del plan de acceso). Sin esto te
enteras de una caída por el WhatsApp de un cliente.

### INF-05 · 🙋 Resend — **P0**

Sin `RESEND_API_KEY`, «olvidé mi contraseña» no existe y cada olvido es soporte
manual tuyo. Es gratis y el código está listo (ACC-10).

### INF-06 · 🙋 Firma de código del instalador — **P0 si vendes impresión**

Ya pasó que Windows Defender borró la app (incidente 2026-07-29). En la PC de
un cliente eso es «el sistema no imprime» un viernes en la noche. Certificado
Authenticode y paso de `signtool` en `release-desktop.yml`.

### INF-07 · Ambiente de pruebas y migraciones con CLI — P1

Hoy cada migración se pega a mano en el SQL Editor de producción. Crear un
segundo proyecto Supabase (staging) + un servicio de Render para él; aplicar
con `supabase db push` y dejar de depender de la memoria de qué se corrió.

### INF-08 · Ensayar la restauración — P1

Un respaldo que nunca se restauró no es un respaldo. Una vez: restaurar el
último en staging, entrar al panel de un restaurante y comprobar pedidos y
fotos. Anotar el tiempo que tomó en `GUIA_DESPLIEGUE.md`.

### INF-09 · Mantenimiento y error global — P2

No hay `src/app/global-error.tsx` (si falla el layout raíz el navegador
enseña una página en blanco) ni un modo mantenimiento para cuando una
migración necesite parar escrituras. Una variable de entorno que muestre
«Volvemos en unos minutos» en el menú y el panel basta.

---

## D. Legal y fiscal

### LEG-01 · 🙋 Leogin como negocio formal — **P0**

Para cobrar mensualidades hace falta estar inscrito en la SAT (RTU/NIT),
con el régimen que te convenga, y **emitir FEL por cada mensualidad
cobrada**. El recibo PDF de `/super` (`lib/receipt.ts`) es un comprobante
interno, no una factura. Los restaurantes formales te van a pedir factura
para deducir el gasto. Conviene también una cuenta bancaria a nombre del
negocio para las transferencias.

### LEG-02 · Términos del servicio — **P0**

`src/app/terminos/page.tsx` es del 27 de junio y no refleja el producto de
hoy. Falta o hay que corregir:
- el **plan Básico gratis** (y su tope de 150 platillos) y que la prueba de
  30 días es **una por persona, en el primer restaurante**;
- **mora y suspensión**: cuántos días después del vencimiento se suspende
  (el sistema ya lo hace solo, mig 035/056) y cómo se reactiva;
- **cancelación**: cómo se pide, si hay reembolso proporcional, y qué pasa
  con los datos (cuánto tiempo se guardan y cuándo se borran);
- **respaldos y soporte**: horario y canal de soporte, tiempo de respuesta;
- **rol de datos**: el restaurante es el responsable de los datos de sus
  comensales y Leogin los trata por su cuenta;
- **hardware**: impresoras y PC son del restaurante; Leogin no responde por
  ellas;
- identidad de quien presta el servicio (nombre/razón social y NIT).

### LEG-03 · Política de privacidad — **P0**

`src/app/privacidad/page.tsx` (27 de junio) no nombra ninguno de los
proveedores ni varios datos que se recogen. Añadir: proveedores que tratan
datos (Supabase, Render, Cloudflare, Sentry, Google para el inicio de sesión,
Meta si se usa WhatsApp), la **ubicación** del mapa de entrega, el teléfono
como identificador de cliente, cuánto tiempo se guarda cada cosa y cómo pide
un comensal que borren sus datos (y quién lo atiende: el restaurante).

### LEG-04 · Contacto con dominio propio — P1

El contacto legal y de la landing es un Gmail personal
(`NEXT_PUBLIC_CONTACT_EMAIL`). Crear `soporte@` y `facturacion@` en el
dominio (con Resend o el reenvío gratuito de Cloudflare).

### LEG-05 · El ticket sin FEL no dice que no es factura — P1

Con FEL apagado, `buildReceiptEscPos` imprime el ticket sin bloque fiscal. El
propio código ya sabe que «un documento que parece fiscal y no lo es es peor
que no imprimir nada» (`escpos.ts`). Cuando no haya DTE, imprimir **«Este
documento no es una factura»** al pie.

### LEG-06 · FEL apagado — P1 (bloquea ventas a restaurantes formales)

El módulo está terminado y apagado hasta elegir certificador. Mientras tanto
el restaurante factura aparte (portal de la SAT). Elegir certificador y
encenderlo en un piloto es lo que convierte a Leogin en el POS completo del
local en vez de «el menú y la comanda».

---

## E. Funciones que hacen falta

### FUN-01 · Turnos de caja — **P0**

Abrir turno (quién, con cuánto fondo), cerrar turno (cuadre de **lo cobrado
en ese turno**), varios turnos por día, y el reporte del día como suma de
turnos. Resuelve PROD-03 y, con la «hora de corte», PROD-04. Es lo primero
que pregunta un dueño en la demo de la caja.

### FUN-02 · Pantalla siempre encendida — P1

Ni cocina, ni Pedidos, ni el panel piden la *Screen Wake Lock API*. Una
tablet que se apaga a los 2 minutos deja de recibir el pedido en vivo y de
sonar (el push ayuda, pero no en todos los aparatos). Pedir el bloqueo
mientras la pantalla esté visible y reponerlo al volver.

### FUN-03 · Pedido sin confirmar — P1

Un pedido a domicilio o para recoger que nadie confirma se queda en `NEW`
hasta que el archivo automático lo cancela a las 6 h (mig 099). Mientras
tanto el comensal ve «recibido» sin más. A los ~10 min sin confirmar: en el
seguimiento, «El restaurante aún no confirma — escríbeles» con su WhatsApp;
en el panel, alerta más insistente; y opción del dueño para rechazarlos solos
pasado un tiempo, avisando al cliente.

### FUN-04 · Tiempo estimado — P1

Al aceptar, elegir «listo en 15 / 30 / 45 min» y enseñarlo en el seguimiento
del comensal. Hoy el seguimiento no da ninguna hora y es la pregunta que más
llega por WhatsApp.

### FUN-05 · Pedido mínimo para domicilio — P1

No existe (`computeOrderPricing` no tiene mínimo). Un domicilio de Q15 con
envío de Q10 no le sirve a nadie. Mínimo por restaurante y, si hay zonas,
por zona; validado en el servidor como el resto del precio.

### FUN-06 · Bloquear números — P1

No hay forma de marcar un teléfono que hace pedidos falsos o no recoge. Lista
de bloqueados por restaurante (el pedido se rechaza con un mensaje neutro) y
una marca «confirmar por llamada» para clientes nuevos a domicilio.

### FUN-07 · Baja, cambio de plan y exportación sin pasar por ti — P1

Hoy cambiar de plan o darse de baja es por WhatsApp
(`admin/(protected)/suscripcion`). Para escalar: el dueño cambia de plan,
pide la baja (con la fecha en que se apaga) y descarga **todo** (menú,
clientes, pedidos, cortes) desde su panel. `/admin/respaldo` ya cubre parte.

### FUN-08 · Cobro de la mensualidad en línea — P2

Hoy: transferencia + comprobante por WhatsApp + marcar pagado a mano. Con
pocos clientes funciona; con 50 no. Las tablas ya soportan un webhook
(RECOMENDACIONES_PENDIENTES §3). Pasarela local con cobro recurrente.

### FUN-09 · Pedidos programados — P2

«Para el sábado a las 13:00» o pedir antes de abrir. Hoy un local cerrado
rechaza el pedido.

### FUN-10 · Reservas y lista de espera desde el menú — P2

`createReservation` y `addToWaitlist` solo los usa el personal. Que el
comensal reserve o se anote desde el menú (con límite y confirmación del
local) es un argumento de venta frente a la competencia.

### FUN-11 · Teléfonos extranjeros — P2

El checkout solo acepta 8 dígitos de Guatemala (`schemas.ts:80`). Turistas y
cualquier expansión a otro país quedan fuera. Aceptar `+código` además del
formato local.

---

## F. Errores humanos: qué pasa hoy

| Situación | Hoy | Necesita |
|---|---|---|
| Cajero toca «Efectivo» y era tarjeta | Caja descuadrada sin explicación | PROD-05 |
| Cobran la mesa que no era | La mesa desaparece con gente comiendo | PROD-05 |
| Cierran caja con mesas abiertas | «Faltante» falso | PROD-02 |
| Dos turnos en el día | Faltante del tamaño del primer turno | FUN-01 |
| Bar cierra a la 1:30 | La caja ve solo lo de después de medianoche | PROD-04 |
| Cajero cierra con faltante y borra el corte | Nadie se entera | PROD-06 |
| Alguien cambia un precio o crea un cupón del 100 % | Sin rastro | PROD-10 |
| Dueño borra una categoría por error | Platillos sin categoría, sin deshacer | PROD-12 |
| Dueño borra un platillo con receta | Se pierde la receta | PROD-12 |
| Comensal cancela justo cuando cocina acepta | Pedido cancelado ya impreso | PROD-09 |
| Pedido anulado que usó puntos | El cliente pierde sus puntos | PROD-11 |
| Nadie mira la tablet | El pedido espera hasta 6 h; el cliente no sabe | FUN-02, FUN-03 |
| Bromista hace pedidos falsos | Solo el límite de 6/min por IP | FUN-06 |
| Dueño olvida la contraseña | Te escribe a ti | INF-05 |
| Dueño nuevo sube la foto de su platillo | Error de seguridad en inglés | PROD-01 |
| Antivirus borra el agente | No imprime | INF-06 |

Lo que ya está bien cubierto y no hace falta tocar: precios y envío
calculados en el servidor, pedidos repetidos por mala señal (idempotencia),
platillo agotado que vuelve solo, horario y pausa validados al pedir,
anulación con motivo y firma, límite de intentos de PIN, sesión por
inactividad, PIN de 4 cifras con bloqueo, confirmación antes de borrar.

---

## Orden sugerido

1. **Esta semana (código):** SEG-01 y SEG-02 (actualizar), PROD-01 (mig 142),
   PROD-08 (una línea por sitio), PROD-07 y PROD-09 (candados de carrera),
   SEG-03 (CI). Todo pequeño y de alto impacto.
2. **Esta semana (tú):** INF-01, INF-02, INF-03, INF-04, INF-05.
3. **Antes del primer cliente de pago:** FUN-01 + PROD-02/04 (caja), PROD-05
   (corregir cobros), LEG-01/02/03, SEG-04 (E2E del embudo).
4. **Primeras semanas:** PROD-06, PROD-10, FUN-02…FUN-07, LEG-04…06, INF-06…08.
5. **Después:** el resto de P2.

## Bitácora

- **2026-10-09** — Auditoría hecha. 947 pruebas unitarias en verde. PROD-01
  reproducido contra la base local (subida rechazada por RLS); `npm audit`:
  1 crítica, 8 altas, 4 moderadas en dependencias de producción.
- **2026-10-10** — PROD-01 hecho: migración 142 (fotos por membresía y
  sección), probada contra la base local y añadida a `test-aislamiento.mjs`.
- **2026-10-10** — PROD-08 hecho: `updateOrderStatus` usa el restaurante
  del pedido en comanda, puntos, FEL y bitácora.
- **2026-10-10** — PROD-07 hecho: cobrar mesa cierra solo lo leído y
  registra el pago una vez.
- **2026-10-10** — PROD-09 hecho: migración 143, la cancelación del
  comensal es atómica.
