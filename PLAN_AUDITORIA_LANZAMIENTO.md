# PLAN — Auditoría de Lanzamiento (ejecución por fases)

> Basado en `Leogin_Auditoria_Lanzamiento.docx` (auditoría del 2026-07-21, "¿Listo para el primer cliente?").
> Este archivo es la **fuente de verdad compartida entre sesiones**: cada fase se trabaja en una sesión propia, verificada de punta a punta antes de pasar a la siguiente. Se va marcando aquí lo que se completa (con fecha y evidencia) para que la siguiente sesión tenga contexto sin releer todo el hilo ni el .docx original.

## Cómo usar este documento
- `[ ]` = pendiente · `[x]` = hecho (con fecha y una línea de evidencia).
- **Una fase = una sesión.** No mezclar fases salvo que el resto sea trivial.
- Antes de cerrar una fase: verificar en navegador si el cambio es observable ahí, correr `npx tsc --noEmit`, y si el cambio toca datos/permisos por restaurante, correr `node scripts/test-aislamiento.mjs` (debe dar 0 fugas).
- Los ítems marcados "requiere acceso tuyo" son cosas que **no puedo verificar ni aplicar yo** desde este entorno (no tengo credenciales de producción) — están documentados con instrucciones exactas para que los resuelvas y la siguiente sesión los marque `[x]`.

---

## Fase 0 — Bloqueantes de lanzamiento
**Estado: en curso** (iniciada 2026-07-21)

- [ ] **1. Migraciones 074-078 aplicadas en producción** — requiere acceso tuyo. Ver diagnóstico abajo.
- [x] **2. Cerrar fuga de dirección por teléfono** (`linkMyAccountByPhone`) — 2026-07-21, verificado en navegador. Ver detalle abajo.
- [ ] **3. Confirmar dominio real de producción + Realtime activo en la nube** — requiere acceso tuyo. Ver checklist abajo.
- [x] **Práctica: correr el script de aislamiento multi-tenant antes de cambios importantes** — 2026-07-21. Estaba roto (hallazgo real, ver abajo), corregido, pasa 13/13.
- [x] **Preparar respuesta de venta sobre FEL / cobro manual** — copy lista abajo, ajústala a tu voz antes de usarla en una demo.

### 1. Migraciones 074-078 en producción — qué hacer
Tu `.env.local` local solo apunta a tu Supabase local (`127.0.0.1:54600`), así que no tengo forma de ver tu base de producción desde aquí. Corre esto en el **SQL Editor de tu proyecto de producción** — es de solo lectura, no modifica nada:

```sql
select 'mig_074_staff_pin'          as check, (to_regclass('public.staff_pins') is not null)::text as ok
union all
select 'mig_076_plantillas',              (to_regclass('public.restaurant_theme_templates') is not null)::text
union all
select 'mig_078_module_log',              (to_regclass('public.restaurant_module_log') is not null)::text
union all
select 'mig_075_precio_estandar_299',     ((select value from platform_settings where key = 'plan_price_ESTANDAR') = '299')::text
union all
select 'mig_075_precio_premium_599',      ((select value from platform_settings where key = 'plan_price_PREMIUM') = '599')::text
union all
select 'mig_077_sin_congelados_072',      (not exists (
  select 1 from restaurant_billing where auto_price = false and notes like '%[Migración 072%'
))::text
union all
select 'mig_078_constraint_canales',      (pg_get_constraintdef(
  (select oid from pg_constraint where conname = 'restaurant_channel_log_channel_check')
) like '%dine_in%')::text;
```

Si alguna fila sale `false` (o `null`, que también cuenta como "falta"), esa migración no está aplicada — pega en la siguiente sesión el resultado de esta consulta, o directamente el contenido de `plataforma/supabase/migrations/0XX_*.sql` correspondiente en el SQL Editor y corre.

### 2. Fuga de dirección por teléfono — CERRADO (2026-07-21)
**Antes:** cualquier comensal con sesión de Google podía escribir CUALQUIER número de teléfono no enlazado de ese restaurante en "Mi cuenta" / "Recompensas" y quedaba enlazado al instante — veía nombre, dirección guardada, zona y pin de entrega de ese comensal, y se cobraba su bono de bienvenida. Bastaba con adivinar o conocer el número (hallazgo original: `AUDITORIA_2026-07-03.md` §2.4).

**Ahora:** `linkMyAccountByPhone` (`plataforma/src/lib/actions/loyalty.ts`) exige además el **total exacto en Q del pedido más reciente** de ese número — un dato que solo conoce quien recibió ese pedido. Se compara server-side contra `orders.total`; si no coincide, no enlaza y no expone nada. Se agregó rate-limit (8 intentos/IP y 5/número cada 15 min) para que el total tampoco sea adivinable a punta de intentos. UI actualizada en `account-sheet.tsx` y `rewards-section.tsx` (nuevo campo "Total de tu pedido más reciente").

**Verificado en navegador (local, con datos de prueba):**
- Teléfono correcto + total incorrecto → rechazado ("El total no coincide..."), los campos de nombre/teléfono/dirección quedaron vacíos (no se filtró nada).
- Teléfono correcto + total correcto → enlazó y sí mostró los datos (comportamiento esperado — ya con prueba de titularidad real).

No rompe el caso legítimo de enlazar desde un dispositivo nuevo (el propósito original de la función); solo agrega la prueba de titularidad.

### 3. Confirmar dominio real + Realtime — qué hacer
1. Render → tu servicio `menuvivo` → **Environment** → revisa el valor de `NEXT_PUBLIC_ROOT_DOMAIN`. Ese es el dominio real (`leogin.com`, `leogin.online`, o si sigue en `.onrender.com` los subdominios de restaurante todavía no funcionan).
2. Supabase (producción) → **Database → Replication** → confirma que la publicación `supabase_realtime` incluye las tablas `orders` y `waiter_calls`. Si falta alguna, actívala ahí mismo.
3. Dime qué encontraste en la siguiente sesión y ajustamos lo que dependa del dominio (links de WhatsApp, CORS, etc.) si hace falta.

### Práctica: script de aislamiento multi-tenant — hallazgo real corregido
`plataforma/scripts/test-aislamiento.mjs` fallaba en su primer `insert` (`plan_actual: 'POPULAR'`) porque ese valor ya no es válido — el constraint actual de `restaurants.plan_actual` solo acepta `BASICO/ESTANDAR/PREMIUM/PRO` desde la reestructuración de planes. En otras palabras: la "única red de seguridad real" que menciona la auditoría llevaba tiempo sin poder correr. Corregido a `'PREMIUM'`; ahora pasa **13/13, 0 fugas** contra la base local.

### Respuesta de venta — FEL y cobro manual (copy sugerido)
> "Hoy no facturamos automáticamente al SAT — puedes seguir facturando con tu contador o el portal gratuito de la SAT mientras usas Leogin para menú, pedidos y operación. El cobro (mío hacia ti, y tuyo hacia tus clientes) es manual por ahora; no hay pasarela automática todavía, está en el roadmap."

Ajusta el tono a como hablas normalmente con un cliente — es solo para que la pregunta no te agarre de sorpresa en la primera demo.

---

## Fase 1 — Anti-fraude y operación de mesero
**Estado: cerrada en código** (2026-07-21) — falta correr las migraciones 079-080 en producción (mismo mecanismo pendiente que Fase 0).
- [x] **Anulación de pedido/ítem ya enviado a cocina, con motivo obligatorio + aprobación de encargado** — 2026-07-21, verificado en navegador (caso sin aprobación, con PIN correcto, con PIN incorrecto rechazado). Ver detalle abajo.
- [x] **Dividir cuenta entre comensales en una misma mesa** — 2026-07-21, verificado en navegador con datos reales de la mesa 6 (matemática exacta, redondeo cuadra). Ver detalle abajo.
- [x] **Auto-archivar pedidos/mesas abandonados tras ~24h** — 2026-07-21, verificado: el cron corrió SOLO en local y archivó 30 pedidos reales de más de 24h sin que yo lo disparara. Ver detalle abajo.

### Anulación con motivo + aprobación — qué se construyó
Nueva tabla `order_voids` (auditoría: motivo, quién pidió, quién aprobó) + dos funciones SQL: `void_order_item` (anula N unidades de un ítem sin cerrar el pedido, repone stock parcial, reduce subtotal/total) y `void_order` (anula el pedido completo). **`updateOrderStatus(id, 'CANCEL')` ya no existe como camino** — cualquier cancelación pasa por `voidOrder()`, que exige motivo siempre y, si el pedido ya salió de `NEW` (proxy de "ya se envió a cocina"), exige además el PIN de alguien con el nuevo permiso delegable **"Aprobar anulaciones"** (asignable a cualquier staff desde Personal, igual que "Pedidos" o "Finanzas") — el dueño/admin siempre puede auto-aprobar. Reutiliza el sistema de PIN de staff ya existente (sin abrir una sesión nueva, solo confirma identidad puntual).

**Hallazgo real corregido en el camino:** `restock_order` (migración 021) no sabía de anulaciones parciales — si un ítem ya se había repuesto vía `void_order_item` y luego se cancelaba el resto del pedido, reponía esas unidades DOS VECES. Encontrado probando contra Postgres local real (no se veía con solo leer el SQL), corregido dentro de la misma migración 079.

**Verificado en navegador (local, con "Mesero Test" sin el permiso y "Encargado Test" con él):**
- Ítem de un pedido `NEW` → anula sin pedir aprobación, `order_voids.approved_by` queda NULL.
- Pedido completo ya en `PREP` → exige PIN; con el PIN de "Encargado Test" anula y audita `requested_by`/`approved_by` correctos (dos personas distintas).
- PIN incorrecto → rechazado con error visible, el pedido NO se toca (confirmado contra la BD).

### Dividir cuenta — qué se construyó
Nueva vista "Cuenta de mesa" en el panel de mesero (botón "Ver cuenta / dividir" junto a "Marcar como libre"): agrupa TODOS los pedidos activos de la mesa (antes no existía esta agregación — cada "ronda" es un `orders` separado), permite agregar/quitar comensales y asignar cada ítem a quien corresponda (por defecto todos comparten todo = partes iguales, sin que el mesero tenga que tocar nada). Los "extras" de cada pedido (propina, descuento, envío — lo que sea) se reparten siempre en partes iguales por diferencia (`total - suma de ítems`), sin necesidad de replicar la fórmula exacta de cada tipo de pedido. Es una calculadora — no persiste el split ni cambia el cobro manual actual (Fase 0). Cálculo en `plataforma/src/lib/bill-split.ts`.

**Verificado con datos reales:** Mesa 6 (2 pedidos acumulados, Q196.50) dividido en 2 partes iguales (Q98.25/Q98.25); al reasignar un ítem a un solo comensal, recalculó a Q111.25/Q85.25 — exacto.

### Auto-archivo de mesas abandonadas — qué se construyó
`orders.auto_archived_at` (distingue cierre automático de uno manual) + función `leogin_archive_abandoned_orders(p_restaurant_id)` — cancela (repone stock) pedidos DINE_IN de más de 24h; `p_restaurant_id = null` para el cron global, con valor para el botón manual. Mismo patrón que la automatización de cobros (migración 035): `pg_cron` cada hora si está disponible + botón "Archivar mesas abandonadas" (banner rojo en el panel de mesero cuando hay mesas así) como respaldo si el plan de Supabase no lo soporta.

**Verificado sin que yo lo disparara:** el cron corrió solo en Supabase local (`cron.job_run_details` confirma la corrida a la hora en punto) y archivó 30 pedidos reales de restaurantes de prueba con más de 24h — incluida la mesa 6 de Azúcar Negra que llevaba 10 días "ocupada". Las mesas recién creadas (minutos de antigüedad) no se tocaron.

### Migraciones 079-080 en producción — qué hacer
Mismo mecanismo que las pendientes de Fase 0: corre esto en el SQL Editor de producción (solo lectura):

```sql
select 'mig_079_order_voids_table' as check, (to_regclass('public.order_voids') is not null)::text as ok
union all
select 'mig_079_void_order_fn',      (to_regprocedure('public.void_order(uuid,text,uuid,uuid)') is not null)::text
union all
select 'mig_079_void_order_item_fn', (to_regprocedure('public.void_order_item(uuid,uuid,int,text,uuid,uuid)') is not null)::text
union all
select 'mig_080_auto_archived_col',  (exists (select 1 from information_schema.columns where table_name='orders' and column_name='auto_archived_at'))::text
union all
select 'mig_080_archive_fn',         (to_regprocedure('public.leogin_archive_abandoned_orders(uuid)') is not null)::text;
```

Si tu plan de Supabase no tiene `pg_cron` habilitado, la migración 080 avisa por `raise notice` y no falla — el botón manual del panel sigue funcionando igual; no hace falta activarlo para lanzar.

## Fase 2 — Retención y utilidades de personal
**Estado: no iniciada**
- [ ] Reparto de propinas entre personal
- [ ] Tarjetas de regalo / vales de consumo
- [ ] Excepciones de horario por fecha puntual (feriados)

## Fase 3 — Experiencia multi-mercado
**Estado: no iniciada**
- [ ] Etiquetas de alérgenos y dietas
- [ ] Menú en más de un idioma
- [ ] Lista de espera para walk-ins (sin reserva)

## Fase 4 — Kardex y respaldo de datos
**Estado: no iniciada**
- [ ] Costo promedio formal sobre el módulo de proveedores existente (Kardex)
- [ ] Exportación/respaldo completo self-service para el restaurante (clientes, ventas, catálogo)

## Fase 5 — Integraciones externas
**Estado: no iniciada** — mayor esfuerzo cada una.
- [ ] Pasarela de pago en línea (Recurrente u otro agregador local)
- [ ] Integración con apps de delivery (PedidosYa, Uber Eats Guatemala)
- [ ] Plantilla mejorada de "pedir por WhatsApp" (paso intermedio antes de invertir en bot con IA)

## Fase 6 — Estrategia de precios
**Estado: no iniciada** — es decisión de negocio primero, implementación (poco código, `src/lib/plans.ts`) después.
- [ ] Decidir: ¿Básico gratis/casi-gratis como gancho de adquisición, o reforzar su propuesta de valor (dominio propio, soporte WhatsApp)?
- [ ] Decidir: ¿regalar la cuota de activación (Q300) al primer cliente piloto a cambio de testimonio?
- [ ] Confirmar de nuevo precios de competencia (restaurant.pe/OlaClick/Fudo) antes de fijar precio final
- [ ] Implementar el cambio decidido en `plataforma/src/lib/plans.ts` (+ migración si aplica, siguiendo el patrón de la 075)

## Fase 7 — Pedidos por WhatsApp con IA (a futuro)
**Estado: no iniciada** — roadmap #1 de la auditoría, mayor esfuerzo, no urgente para el primer cliente.
- [ ] Definir alcance (bot completo vs. plantilla asistida)
- [ ] Evaluar proveedor (WhatsApp Business API / terceros)

---

## Bitácora
- **2026-07-21** — Leído `Leogin_Auditoria_Lanzamiento.docx`, creado este plan de 8 fases. Iniciada Fase 0: cerrada la fuga de teléfono/dirección (`loyalty.ts` + `account-sheet.tsx` + `rewards-section.tsx`, verificado en navegador local con datos de prueba), corregido y corrido el script de aislamiento multi-tenant (13/13 OK, estaba roto por un valor de plan obsoleto), redactada respuesta de venta FEL/cobro manual. Pendiente de tu parte: correr el diagnóstico SQL de migraciones 074-078 y revisar dominio/Realtime en Render+Supabase de producción (instrucciones arriba) — con eso cerrada, Fase 0 queda completa.
- **2026-07-21** — Fase 1 completa en código (misma sesión, continuación): anulación con motivo+aprobación (migración 079, tablas `order_voids` + RPCs `void_order`/`void_order_item`, nuevo permiso delegable "Aprobar anulaciones"), dividir cuenta (`bill-split.ts` + vista "Cuenta de mesa" en el panel de mesero), auto-archivo de mesas >24h (migración 080, `pg_cron` + botón manual). Hallazgo real corregido: `restock_order` reponía stock dos veces si un pedido ya tenía una anulación parcial antes de cancelarse completo. Verificado exhaustivamente: `tsc --noEmit` limpio, `test-aislamiento.mjs` 16/16 (agregado `order_voids`), pruebas SQL directas de ambos RPCs contra Postgres local (con rollback), y de punta a punta en el navegador con dos perfiles de staff reales (uno sin permiso de aprobar, otro con él) cubriendo: anular sin aprobación, anular con aprobación y PIN correcto, PIN incorrecto rechazado, dividir cuenta con datos reales, y el cron de auto-archivo corriendo por su cuenta (archivó 30 pedidos reales de prueba sin que se disparara manualmente). Pendiente de tu parte: correr el diagnóstico SQL de migraciones 079-080 en producción (instrucciones arriba). Quedan 2 miembros de prueba ("Mesero Test", "Encargado Test") en el restaurante demo local — inofensivos, bórralos desde /admin/personal si quieres limpiar la demo.
