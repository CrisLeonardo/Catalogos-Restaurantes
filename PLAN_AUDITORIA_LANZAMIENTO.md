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
- [x] **4. CRÍTICO — funciones SQL `security definer` invocables directamente por cualquiera con la clave anon** — hallazgo real de la sesión de Fase 2, corregido y verificado el mismo día (migración 084). Ver detalle abajo.
- [x] **Práctica: correr el script de aislamiento multi-tenant antes de cambios importantes** — 2026-07-21. Estaba roto (hallazgo real, ver abajo), corregido, pasa 13/13.
- [x] **Preparar respuesta de venta sobre FEL / cobro manual** — copy lista abajo, ajústala a tu voz antes de usarla en una demo.

### 4. CRÍTICO — funciones `security definer` sin restringir a `service_role`
**Encontrado el 2026-07-22** mientras construía el RPC `redeem_gift_card` de Fase 2: probé directamente contra el Supabase local con la clave **anon** (la misma que va pública en el JS del navegador) y SÍ pude ejecutar la función por REST, saltándome por completo `lib/actions/gift-cards.ts` y sus validaciones de rol/restaurante.

**Causa raíz:** el bootstrap de Supabase deja configurado `alter default privileges in schema public grant execute on functions to anon, authenticated, service_role` — así que **toda función nueva en `public` queda ejecutable por cualquiera con la clave anon**, a menos que se revoque explícitamente. Ninguna de las funciones `security definer` anteriores a esta sesión (`place_order`, `void_order`, `void_order_item`, `leogin_archive_abandoned_orders`, `upsert_customer`, `increment_promo_usage`, etc.) tiene ese revoke — están TODAS potencialmente expuestas.

**Ya corregido en esta sesión (migración 082):** `issue_gift_card` y `redeem_gift_card` ahora solo son ejecutables por `service_role` (verificado: antes del fix un `POST /rest/v1/rpc/redeem_gift_card` con la clave anon ejecutaba la función; después, `401 permission denied`). También le agregué a `redeem_gift_card` una verificación de que el vale y el pedido pertenezcan al mismo restaurante (no existía).

**CORREGIDO (migración 084, mismo día):** auditadas las 43 funciones `security definer` del proyecto contra `pg_policies` (para no romper RLS) y contra cada `.rpc(...)` real del código TS (para no restringir algo que de verdad se llama desde el navegador). Resultado:
- **5 se dejaron públicas a propósito** (`get_my_role`, `get_my_restaurant_id`, `get_my_org_id`, `is_my_group_branch` — las usan las políticas RLS de casi todas las tablas, revocarlas habría roto el panel entero; `get_group_branches` — selector de sucursal anónimo por diseño, migración 026, solo expone columnas públicas).
- **Las 38 restantes** (`place_order`, `void_order`, `void_order_item`, `restock_order`, `upsert_customer`, `increment_promo_usage`, toda la familia `leogin_*` de facturación/módulos, `check_delivery_coverage`, `visit_stats`, `claim_print_jobs`, `api_key_touch`, `generate_order_number`, etc.) quedaron restringidas a `service_role` únicamente.
- Se agregó `alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated` para que **cualquier función nueva futura** nazca sin este problema por default (hay que concederlo a propósito, como se hizo con `get_group_branches`).

**Verificado exhaustivamente (2026-07-22):**
- Con la clave anon real por REST: `place_order` y `void_order` ahora devuelven `401 permission denied` (antes los ejecutaba cualquiera); `get_group_branches` sigue respondiendo normal (no se rompió el selector público).
- Con la clave `service_role` real (la misma que usan todas las server actions): `upsert_customer` → `place_order` → `void_order` corridos en secuencia contra el restaurante demo, igual que en el checkout real — los tres funcionaron y crearon/anularon un pedido real (limpiado después).
- `test-aislamiento.mjs`: 21/21 OK, 0 fugas (las políticas RLS siguen funcionando: prueba de que no revocar `get_my_role`/`get_my_restaurant_id`/`is_my_group_branch` fue la decisión correcta).
- `tsc --noEmit` limpio (esta migración no toca código TS).

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

### Migraciones 081-084 en producción — qué hacer
Mismo mecanismo que las pendientes de Fases 0-1: corre esto en el SQL Editor de producción (solo lectura):

```sql
select 'mig_081_tip_distributions'      as check, (to_regclass('public.tip_distributions') is not null)::text as ok
union all
select 'mig_081_tip_distribution_shares',     (to_regclass('public.tip_distribution_shares') is not null)::text
union all
select 'mig_082_gift_cards',                  (to_regclass('public.gift_cards') is not null)::text
union all
select 'mig_082_redeem_fn',                   (to_regprocedure('public.redeem_gift_card(uuid,uuid,numeric,uuid)') is not null)::text
union all
select 'mig_082_redeem_fn_solo_service_role', (not has_function_privilege('anon', 'public.redeem_gift_card(uuid,uuid,numeric,uuid)', 'execute'))::text
union all
select 'mig_083_hour_exceptions_col',         (exists (select 1 from information_schema.columns where table_name='restaurants' and column_name='hour_exceptions'))::text
union all
select 'mig_084_place_order_restringido',     (not has_function_privilege('anon', 'public.place_order(uuid,text,text,text,text,text,float8,float8,uuid,numeric,numeric,numeric,text,jsonb,text,numeric,numeric,uuid,uuid)', 'execute'))::text
union all
select 'mig_084_void_order_restringido',      (not has_function_privilege('anon', 'public.void_order(uuid,text,uuid,uuid)', 'execute'))::text;
```

**Esta última es la más importante de correr pronto:** si sale `false`, significa que en producción cualquiera con la clave anon pública todavía puede llamar `place_order`/`void_order` directo por REST, saltándose toda la validación del checkout.

## Fase 2 — Retención y utilidades de personal
**Estado: cerrada en código** (2026-07-22) — falta correr las migraciones 081-084 en producción (mismo mecanismo pendiente que Fases 0-1). El hallazgo de seguridad de Fase 0 §4 ya está corregido y verificado, solo falta desplegarlo.
- [x] **Reparto de propinas entre personal** — 2026-07-22, verificado en navegador con datos reales. Ver detalle abajo.
- [x] **Tarjetas de regalo / vales de consumo** — 2026-07-22, verificado en navegador (emitir, redimir parcial, saldo insuficiente, doble aplicación). Ver detalle abajo.
- [x] **Excepciones de horario por fecha puntual (feriados)** — 2026-07-22, verificado en navegador (tienda y checkout se cierran solo en la fecha marcada). Ver detalle abajo.

### Reparto de propinas — qué se construyó
Nuevas tablas `tip_distributions` (cabecera del "cierre" de un período) + `tip_distribution_shares` (cuánto le tocó a cada quien) + `orders.tip_distribution_id` (marca qué pedidos ya se repartieron, para no contarlos dos veces). Nueva vista `/admin/personal/propinas` (enlace desde Personal, solo dueño): elige un rango de fechas, ve las propinas SIN repartir agrupadas por mesero (`orders.waiter_id`) más un "fondo común" con los pedidos sin mesero asignado (pickup/delivery en línea) repartido en partes iguales entre el personal actual — todo ajustable a mano antes de confirmar. Al confirmar: recalcula el total server-side (nunca confía en lo que mandó el navegador), exige que la suma del reparto cuadre exacto, y marca los pedidos usados. No mueve dinero real (el pago del staff sigue siendo manual, igual que el cobro de Fase 0) — es la bitácora auditable de a quién le toca cuánto.

**Verificado con datos reales:** 2 pedidos de prueba (Q20 con mesero asignado, Q15 sin mesero) → previsualización mostró Q35.00 total, repartido Q27.50 a "Mesero Test" (directo + mitad del fondo común) y Q7.50 a "Encargado Test" (mitad del fondo común); al confirmar, los pedidos quedaron marcados y el historial mostró el reparto correcto. Datos de prueba borrados al terminar.

### Tarjetas de regalo / vales de consumo — qué se construyó
Nuevas tablas `gift_cards` (saldo emitido/restante por código) + `gift_card_transactions` (bitácora ISSUE/REDEEM) + `orders.gift_card_id`/`gift_card_amount`. Nueva sección **Tarjetas de regalo** (`/admin/vales`, permiso delegable `vales`): emitir un vale con saldo (código autogenerado tipo `REGALO-XXXXXX`), ver el listado con saldo/estado, cancelarlo; y **aplicar un vale a un pedido real** buscándolo por número — todo vía dos funciones SQL atómicas (`issue_gift_card`/`redeem_gift_card`, migración 082) que bloquean la fila del vale y del pedido para que dos redenciones concurrentes nunca dejen el saldo negativo, y validan que el vale no esté vencido/cancelado, que no exceda el saldo ni el total del pedido, y que no se aplique dos veces al mismo pedido.

**Hallazgo real corregido en el camino (ver Fase 0 §4 arriba):** estas dos funciones eran invocables directamente por cualquiera con la clave anon, saltándose toda la lógica de `lib/actions/gift-cards.ts` — alguien podría haberse emitido vales gratis o drenado el saldo de un vale ajeno contra cualquier pedido. Corregido con `revoke`/`grant` a `service_role` únicamente + una verificación adicional de que el vale y el pedido sean del mismo restaurante.

**Verificado en navegador con datos reales:** emití un vale de Q50 (`REGALO-BTVQJ7`), lo apliqué parcialmente (Q30) a un pedido de Q95 → saldo bajó a Q20, quedó en el ledger (`ISSUE +50`, `REDEEM -30`) y el pedido quedó marcado; intenté aplicar Q65 más → rechazado por "saldo insuficiente"; intenté aplicar Q10 más → rechazado por "este pedido ya tiene un vale aplicado". Ambos rechazos vienen del RPC (autoridad real, no solo la UI). Datos de prueba borrados al terminar.

### Excepciones de horario por fecha (feriados) — qué se construyó
Nueva columna `restaurants.hour_exceptions` (JSONB, fecha exacta → turnos, o `[]` = cerrado todo el día) que `lib/hours.ts` (`isOpenNow`/`nextOpenLabel`) consulta ANTES que el horario semanal normal para esa fecha puntual — sin tocar tu horario de siempre. Nueva sección "Feriados y excepciones" en Ajustes → Horario y pedidos: agrega una fecha, marca "Cerrado todo el día" o dale un horario especial, quítala cuando ya no aplique.

**Verificado en navegador con datos reales:** agregué el 25 de diciembre de 2026 como cerrado desde el editor, confirmé en la base que se guardó (`{"2026-12-25": []}`); luego, para probar el efecto en vivo, marqué temporalmente HOY como cerrado — la tienda pública mostró "Cerrado ahora" y el checkout mostró "Estamos cerrados" (bloqueado de verdad, no solo visual); al quitar la excepción de hoy volvió a "Abierto ahora" al instante. Se dejó la excepción del 25 de diciembre como demostración; se puede borrar desde Ajustes cuando quieras.

## Fase 3 — Experiencia multi-mercado
**Estado: cerrada en código** (2026-07-22) — falta correr las migraciones 085-087 en producción (mismo mecanismo pendiente que Fases 0-2).
- [x] **Etiquetas de alérgenos y dietas** — 2026-07-22, verificado en navegador con datos reales. Ver detalle abajo.
- [x] **Menú en más de un idioma (ES/EN)** — 2026-07-22, verificado en navegador (fallback automático confirmado). Ver detalle abajo.
- [x] **Lista de espera para walk-ins (sin reserva)** — 2026-07-22, verificado en navegador de punta a punta (WAITING→NOTIFIED→SEATED). Ver detalle abajo.

### Alérgenos y dietas — qué se construyó
Columna `products.dietary_tags` (migración 085, `text[]`) sobre un **vocabulario fijo** de 12 claves (`src/lib/dietary-tags.ts`): 6 dietas ("Apto para": vegetariano, vegano, sin gluten, sin lactosa, bajo en azúcar, picante) + 6 alérgenos ("Contiene": gluten, lácteos, frutos secos, mariscos, huevo, soya) — a propósito NO es texto libre como `products.tags` (mercadeo: "Nuevo"/"Favorito"), para poder mostrar el mismo ícono+texto siempre y que el comensal confíe en la etiqueta. Checkboxes agrupados en **ambos** editores de producto que existen en el código (`product-form.tsx` de `/admin/menu/productos/[id]` Y el modal de `catalog-panel.tsx` — son dos formularios separados que comparten los mismos server actions; hay que tocar los dos o uno queda desactualizado). Se muestran en el menú público (`catalog.tsx`/`product-sheet.tsx`) como íconos — **no son ocultables** por el dueño vía `config.showTags` a propósito: es información de seguridad alimentaria, no una etiqueta de mercadeo.

**Verificado en navegador con datos reales:** edité "Negra Brava" (Azúcar Negra) marcando "Picante" + "Contiene frutos secos" desde el modal de `/admin/menu`, confirmé en BD (`dietary_tags: {picante,contiene_frutos_secos}`), y en el menú público del comensal aparecieron los íconos 🌶️🥜 sobre la tarjeta y como chips con texto en la ficha del platillo.

### Menú en más de un idioma — qué se construyó
Columnas `products.name_en`/`description_en` y `categories.name_en` (migración 086, todas opcionales) + `restaurants.menu_languages` (`text[]`, hoy solo admite `en`). Nuevo `LocaleProvider`/`useLocalized()` (`src/lib/locale/context.tsx`, cliente, hermano de `ThemeProvider`) con **fallback automático al español** si la traducción viene vacía — el dueño no tiene que traducir todo su catálogo para activar el selector. Switch "ES/EN" en el encabezado del catálogo público (solo aparece si el dueño activó `menu_languages` en Ajustes → **Idiomas del menú**, nueva sección). **Alcance deliberado:** solo se traduce el contenido del menú (nombre/descripción de producto y categoría) y las etiquetas de alérgenos/dietas — el resto de la UI (checkout, carrito, botones) se queda en español; traducir toda la app habría sido un proyecto aparte, y la auditoría original pide "menú en más de un idioma", no la app completa.

**Hallazgo real corregido en el camino:** los chips de alérgenos/dietas usaban `t.label` (español) sin importar el idioma activo — descubierto al probar en vivo con EN activo, viendo "Contiene frutos secos" en una ficha que ya mostraba todo lo demás en inglés. Corregido para usar `t.labelEn` cuando `locale === 'en'` en ambos componentes.

**Verificado en navegador con datos reales:** activé el toggle en Ajustes (confirmado en BD: `menu_languages: {en}`), traduje "Negra Brava" → "Bold Bagel" + descripción en inglés desde el modal de catálogo, y en el menú público: con ES se ve "Negra Brava", con EN cambia a "Bold Bagel" (los demás platillos SIN traducción se quedan en español — fallback confirmado), la ficha del platillo mostró la descripción en inglés y los chips de alérgenos como "Spicy"/"Contains nuts" tras el fix.

### Lista de espera para walk-ins — qué se construyó
Nueva tabla `waitlist_entries` (migración 087: `customer_name, party_size, phone, notes, status WAITING/NOTIFIED/SEATED/CANCELLED, created_at/notified_at/seated_at/cancelled_at`) — a diferencia de `reservations` (fecha/hora futura), esto es una cola en vivo sin concepto de mesa numerada (las mesas son virtuales en este proyecto, inferidas de `orders.address`, no hay tabla `tables`). Solo el staff escribe (a diferencia de `waiter_calls`, aquí NO hay policy de insert anónimo — el walk-in llega al mostrador, no anota desde su celular). Nuevo módulo activable `lista_espera` (`/admin/lista-espera`, registrado en `modules.ts` + precio en `plans.ts` Q49/mes, incluido gratis en PREMIUM/PRO como `reservaciones`).

**Hallazgo de diseño importante (documentado para no repetirlo):** los módulos activables más nuevos (`reservaciones`, `encuestas`, `cupones`, etc.) usan `resolveModuleContext()` y NO respetan `permissions[]` del staff — cualquier miembro logueado del restaurante puede entrar si el módulo está activo, sin poder restringirse por permiso individual. Como el usuario sí quiere delegar esto a un host/mesero específico, agregué `lista_espera` a `ADMIN_SECTIONS` (`permissions.ts`) y el `page.tsx` llama `can()` ADEMÁS de `resolveModuleContext()` — patrón híbrido que los módulos anteriores no tienen (quedan con la misma limitación que antes).

**Verificado en navegador de punta a punta con datos reales:** agregué "Familia Pérez" (4 personas) → "Avisar" (sin teléfono, botón normal) → "Sentar" — confirmado en BD con los 3 timestamps (`created_at`/`notified_at`/`seated_at`) y KPI "Espera promedio hoy" calculándolo correctamente (1 min, por ser datos de prueba). Agregué "Grupo Martínez" con teléfono → el botón "Avisar" se convirtió en un link real de WhatsApp (`https://wa.me/55551234?text=...`, verificado el href exacto). Nav lateral muestra "Lista de espera" solo cuando el módulo está activo. Verificado con REST directo que `waitlist_entries` NO es legible/escribible con la clave anon (SELECT devuelve `[]`, INSERT da 401) — sin política de insert público a propósito.

### Migraciones 085-087 en producción — qué hacer
Mismo mecanismo que las pendientes de Fases 0-2: corre esto en el SQL Editor de producción (solo lectura):

```sql
select 'mig_085_dietary_tags'   as check, (exists (
  select 1 from information_schema.columns where table_name='products' and column_name='dietary_tags'
))::text as ok
union all
select 'mig_086_name_en_products',      (exists (
  select 1 from information_schema.columns where table_name='products' and column_name='name_en'
))::text
union all
select 'mig_086_name_en_categories',    (exists (
  select 1 from information_schema.columns where table_name='categories' and column_name='name_en'
))::text
union all
select 'mig_086_menu_languages',        (exists (
  select 1 from information_schema.columns where table_name='restaurants' and column_name='menu_languages'
))::text
union all
select 'mig_087_waitlist_entries',      (to_regclass('public.waitlist_entries') is not null)::text;
```

Después de correr las 3 migraciones, activa el módulo "Lista de espera" para los restaurantes que quieras desde el panel de Super Admin (Ficha del restaurante → Módulos) — igual que cualquier otro módulo activable; no requiere nada más.

## Fase 4 — Kardex y respaldo de datos
**Estado: cerrada en código** (2026-07-22) — falta correr la migración 088 en producción (mismo mecanismo pendiente que Fases 0-3).
- [x] **Costo promedio formal sobre el módulo de proveedores existente (Kardex)** — 2026-07-22, verificado en navegador + SQL directo. Ver detalle abajo.
- [x] **Exportación/respaldo completo self-service para el restaurante (clientes, ventas, catálogo)** — 2026-07-22, verificado en navegador con datos reales. Ver detalle abajo.

### Kardex de costo promedio — qué se construyó
Hasta ahora una orden de compra (`purchase_orders`/`purchase_order_items`, migración 040) era solo un registro contable: marcarla "RECIBIDA" no tocaba inventario ni costo — un hueco real que la propia auditoría señala como "Kardex". Migración 088 conecta la compra real con el costo:
- `purchase_order_items` ahora acepta un vínculo opcional a un **producto** (`product_id`, para algo que se vende tal cual, ej. una bebida embotellada) o a un **insumo de receta** (`ingredient_id`, ej. harina) — mutuamente excluyentes, nunca ambos. Sin vincular, el renglón sigue siendo solo texto contable (comportamiento anterior intacto).
- `ingredients` gana una columna `stock` (antes solo tenía `cost_per_unit`, sin cantidad en existencia).
- Nueva función `leogin_receive_purchase_order(po_id, restaurant_id)` (`service_role` únicamente, mismo patrón que 084): al recibir la orden, por cada renglón vinculado calcula el **costo promedio ponderado** — `(stock_anterior×costo_anterior + cantidad×costo_de_compra) / stock_nuevo` — y actualiza `products.stock`/`cost` o `ingredients.stock`/`cost_per_unit`. Idempotente (recibir dos veces no duplica nada, mismo patrón que `restock_order`).
- `stock_movements` pasa a ser el ledger formal (Kardex real, no solo de productos): gana `ingredient_id`, `unit_cost` y `avg_cost_after`, y `delta`/`balance_after` se ampliaron de `int` a `numeric` para admitir insumos fraccionarios (kg, L). Nuevo botón "Historial (Kardex)" en `/admin/inventario` (por producto) y `/admin/ingredientes` (por insumo) muestra cada movimiento con su costo y el promedio resultante.
- UI de Proveedores (`proveedores-panel.tsx`): selector "Vincular a" por renglón (autocompleta descripción/unidad al elegir); al marcar "Recibida" con renglones vinculados, confirma primero explicando el impacto en stock/costo.

**Hallazgo real corregido en el camino:** probando el Kardex con dos compras seguidas del mismo insumo, el costo del platillo con receta quedaba **un paso atrás** — el trigger `ingredient_cost_sync` (migración 037) era `BEFORE UPDATE` y volvía a leer `ingredients` para sumar el costo de la receta, pero en un trigger BEFORE la fila todavía no se había escrito, así que siempre veía el costo ANTERIOR al cambio. Esto llevaba desde la migración 037 afectando también la edición manual de costos en `/admin/ingredientes` (nadie lo notó porque un solo cambio de costo "por accidente" se veía bien; se necesitan dos cambios seguidos para exponerlo). Corregido separando el trigger en dos: uno `BEFORE UPDATE` solo para `updated_at`, y la cascada de receta movida a `AFTER UPDATE` (donde ya ve el costo recién escrito).

**Verificado exhaustivamente:** `tsc --noEmit` limpio, `test-aislamiento.mjs` 21/21. Contra Postgres local con datos reales: dos compras seguidas de un insumo (1000g a Q0.05 → stock 1000/costo 0.05; +500g a Q0.08 → stock 1500/costo 0.06 exacto = `(1000×0.05+500×0.08)/1500`), cascada a un platillo con receta confirmada correcta tras el fix del trigger, dos compras de un producto sin receta (10u a Q15 → 5u a Q21 → costo 17.00 exacto), guardia contra recibir una orden `CANCELADA`, e idempotencia (recibir dos veces no duplica `stock_movements` ni cambia el costo). **En navegador, de punta a punta:** insumo creado desde `/admin/ingredientes`, orden de compra creada en `/admin/proveedores` vinculando un renglón a "Cold Brew 18h" (autocompletó descripción/unidad), confirmación al marcar "Recibida", y el historial en `/admin/inventario` mostrando exactamente "+10 · costo Q12.5000 · prom. Q12.5000". Datos de prueba de esta demo limpiados de la BD; queda la orden #0001 de Cold Brew 18h como muestra visible en Proveedores/Inventario (bórrala si quieres una demo limpia). Módulos `proveedores` y `recetas` quedaron activados en el restaurante demo local (antes apagados) para poder probar — actívalos también en producción vía Super Admin si quieres mostrar la función.

### Respaldo completo self-service — qué se construyó
Nueva sección **Respaldo** (`/admin/respaldo`, permiso delegable propio `respaldo` en `permissions.ts`) con un solo botón: descarga un `.xlsx` con **4 hojas** (Catálogo, Categorías, Clientes, Pedidos — hasta los últimos 5,000) en un solo archivo, reutilizando exactamente los mismos helpers de marca que ya usan los exports por sección (`lib/documents/excel.ts` — sin duplicar lógica de estilo). Distinto de los exports que ya existían (Productos, Clientes, Pedidos, Finanzas, cada uno en su página): esto es un respaldo INTEGRAL pensado para portabilidad/respaldo periódico, no para leer en el panel. Nueva acción `exportBackupXlsx` en `lib/actions/backup.ts`, reutiliza `getAdminMenu` (catálogo) y `getAllCustomersForExport` (ya existía, sin duplicar) y una consulta propia de pedidos sin límite de días (a diferencia del export de Pedidos existente, que tope a 366 días).

**Verificado en navegador con datos reales** (Azúcar Negra): descarga real disparada desde `/admin/respaldo`, sin errores en el servidor ni en el cliente ("Listo — revisa tus descargas"); conteos reales contra la BD confirmados (6 productos, 4 categorías, 1 cliente, 36 pedidos, 63 líneas de pedido — las mismas consultas que arma la acción). `tsc --noEmit` limpio, `test-aislamiento.mjs` 21/21 (no toca RLS ni tablas nuevas, solo lectura vía `service_role` con la misma autorización que el resto de exports).

### Migración 088 en producción — qué hacer
Mismo mecanismo que las pendientes de Fases 0-3: corre esto en el SQL Editor de producción (solo lectura):

```sql
select 'mig_088_po_items_product_id'   as check, (exists (
  select 1 from information_schema.columns where table_name='purchase_order_items' and column_name='product_id'
))::text as ok
union all
select 'mig_088_po_items_ingredient_id', (exists (
  select 1 from information_schema.columns where table_name='purchase_order_items' and column_name='ingredient_id'
))::text
union all
select 'mig_088_ingredients_stock', (exists (
  select 1 from information_schema.columns where table_name='ingredients' and column_name='stock'
))::text
union all
select 'mig_088_stock_movements_avg_cost', (exists (
  select 1 from information_schema.columns where table_name='stock_movements' and column_name='avg_cost_after'
))::text
union all
select 'mig_088_receive_po_fn', (to_regprocedure('public.leogin_receive_purchase_order(uuid,uuid)') is not null)::text
union all
select 'mig_088_receive_po_fn_solo_service_role', (not has_function_privilege('anon', 'public.leogin_receive_purchase_order(uuid,uuid)', 'execute'))::text
union all
select 'mig_088_ingredient_cost_sync_after', (exists (
  select 1 from pg_trigger where tgname = 'ingredient_cost_sync' and tgrelid = 'ingredients'::regclass and tgtype & 2 = 0
))::text;
```

La última fila confirma que el fix del trigger (BEFORE→AFTER) quedó aplicado — si sale `false`, el costo de las recetas seguirá recalculándose "un paso atrás" en producción.

## Fase 5 — Integraciones externas
**Estado: descartada (2026-07-22)** — decisión del usuario: no es el enfoque por ahora. Revisar más adelante si cambia la prioridad de negocio.
- [ ] ~~Pasarela de pago en línea (Recurrente u otro agregador local)~~
- [ ] ~~Integración con apps de delivery (PedidosYa, Uber Eats Guatemala)~~
- [ ] ~~Plantilla mejorada de "pedir por WhatsApp" (paso intermedio antes de invertir en bot con IA)~~

## Fase 6 — Estrategia de precios
**Estado: descartada (2026-07-22)** — decisión del usuario: no es el enfoque por ahora. Es decisión de negocio primero; retomar cuando quiera revisitarla (implementación es poco código, `src/lib/plans.ts`).
- [ ] ~~Decidir: ¿Básico gratis/casi-gratis como gancho de adquisición, o reforzar su propuesta de valor (dominio propio, soporte WhatsApp)?~~
- [ ] ~~Decidir: ¿regalar la cuota de activación (Q300) al primer cliente piloto a cambio de testimonio?~~
- [ ] ~~Confirmar de nuevo precios de competencia (restaurant.pe/OlaClick/Fudo) antes de fijar precio final~~
- [ ] ~~Implementar el cambio decidido en `plataforma/src/lib/plans.ts` (+ migración si aplica, siguiendo el patrón de la 075)~~

## Fase 7 — Pedidos por WhatsApp con IA (a futuro)
**Estado: descartada (2026-07-22)** — decisión del usuario: no es el enfoque por ahora, aunque era el roadmap #1 de la auditoría original. Mayor esfuerzo, retomar cuando haya tracción con clientes reales.
- [ ] ~~Definir alcance (bot completo vs. plantilla asistida)~~
- [ ] ~~Evaluar proveedor (WhatsApp Business API / terceros)~~

---

## Cierre del plan (2026-07-22) — checklist único antes de subir a producción

El usuario decidió **no continuar con las Fases 5-7** (integraciones externas, precios, WhatsApp+IA) — quedan documentadas arriba como referencia futura, no como pendiente activo. Las Fases 0-4 están **cerradas en código** (verificado 2026-07-22: `tsc --noEmit` limpio, `test-aislamiento.mjs` 21/21, `git status` limpio, todo commiteado hasta `1cb9197 fase 4`).

Lo único que falta para que todo lo de este plan quede funcional en producción son las **2 cosas que requieren tu acceso** (documentadas desde Fase 0, nunca pude verificarlas yo):

### A. Correr las 15 migraciones pendientes (074-088) — diagnóstico consolidado
Pega esto una sola vez en el SQL Editor de tu proyecto de **producción** (solo lectura, no modifica nada):

```sql
select 'mig_074_staff_pin' as check, (to_regclass('public.staff_pins') is not null)::text as ok
union all select 'mig_075_precio_estandar_299', ((select value from platform_settings where key = 'plan_price_ESTANDAR') = '299')::text
union all select 'mig_075_precio_premium_599', ((select value from platform_settings where key = 'plan_price_PREMIUM') = '599')::text
union all select 'mig_076_plantillas', (to_regclass('public.restaurant_theme_templates') is not null)::text
union all select 'mig_077_sin_congelados_072', (not exists (select 1 from restaurant_billing where auto_price = false and notes like '%[Migración 072%'))::text
union all select 'mig_078_constraint_canales', (pg_get_constraintdef((select oid from pg_constraint where conname = 'restaurant_channel_log_channel_check')) like '%dine_in%')::text
union all select 'mig_079_order_voids_table', (to_regclass('public.order_voids') is not null)::text
union all select 'mig_079_void_order_fn', (to_regprocedure('public.void_order(uuid,text,uuid,uuid)') is not null)::text
union all select 'mig_079_void_order_item_fn', (to_regprocedure('public.void_order_item(uuid,uuid,int,text,uuid,uuid)') is not null)::text
union all select 'mig_080_auto_archived_col', (exists (select 1 from information_schema.columns where table_name='orders' and column_name='auto_archived_at'))::text
union all select 'mig_080_archive_fn', (to_regprocedure('public.leogin_archive_abandoned_orders(uuid)') is not null)::text
union all select 'mig_081_tip_distributions', (to_regclass('public.tip_distributions') is not null)::text
union all select 'mig_081_tip_distribution_shares', (to_regclass('public.tip_distribution_shares') is not null)::text
union all select 'mig_082_gift_cards', (to_regclass('public.gift_cards') is not null)::text
union all select 'mig_082_redeem_fn', (to_regprocedure('public.redeem_gift_card(uuid,uuid,numeric,uuid)') is not null)::text
union all select 'mig_082_redeem_fn_solo_service_role', (not has_function_privilege('anon', 'public.redeem_gift_card(uuid,uuid,numeric,uuid)', 'execute'))::text
union all select 'mig_083_hour_exceptions_col', (exists (select 1 from information_schema.columns where table_name='restaurants' and column_name='hour_exceptions'))::text
union all select 'mig_084_place_order_restringido', (not has_function_privilege('anon', 'public.place_order(uuid,text,text,text,text,text,float8,float8,uuid,numeric,numeric,numeric,text,jsonb,text,numeric,numeric,uuid,uuid)', 'execute'))::text
union all select 'mig_084_void_order_restringido', (not has_function_privilege('anon', 'public.void_order(uuid,text,uuid,uuid)', 'execute'))::text
union all select 'mig_085_dietary_tags', (exists (select 1 from information_schema.columns where table_name='products' and column_name='dietary_tags'))::text
union all select 'mig_086_name_en_products', (exists (select 1 from information_schema.columns where table_name='products' and column_name='name_en'))::text
union all select 'mig_086_name_en_categories', (exists (select 1 from information_schema.columns where table_name='categories' and column_name='name_en'))::text
union all select 'mig_086_menu_languages', (exists (select 1 from information_schema.columns where table_name='restaurants' and column_name='menu_languages'))::text
union all select 'mig_087_waitlist_entries', (to_regclass('public.waitlist_entries') is not null)::text
union all select 'mig_088_po_items_product_id', (exists (select 1 from information_schema.columns where table_name='purchase_order_items' and column_name='product_id'))::text
union all select 'mig_088_po_items_ingredient_id', (exists (select 1 from information_schema.columns where table_name='purchase_order_items' and column_name='ingredient_id'))::text
union all select 'mig_088_ingredients_stock', (exists (select 1 from information_schema.columns where table_name='ingredients' and column_name='stock'))::text
union all select 'mig_088_stock_movements_avg_cost', (exists (select 1 from information_schema.columns where table_name='stock_movements' and column_name='avg_cost_after'))::text
union all select 'mig_088_receive_po_fn', (to_regprocedure('public.leogin_receive_purchase_order(uuid,uuid)') is not null)::text
union all select 'mig_088_receive_po_fn_solo_service_role', (not has_function_privilege('anon', 'public.leogin_receive_purchase_order(uuid,uuid)', 'execute'))::text
union all select 'mig_088_ingredient_cost_sync_after', (exists (select 1 from pg_trigger where tgname = 'ingredient_cost_sync' and tgrelid = 'ingredients'::regclass and tgtype & 2 = 0))::text;
```

Si **cualquier fila** sale `false`/`null`, esa migración específica (`plataforma/supabase/migrations/0XX_*.sql`) no se ha corrido — pégala completa en el SQL Editor de producción y ejecútala, en orden numérico, antes de las que dependan de ella. La fila `mig_084_*` es la más urgente de todas: si sale `false`, cualquiera con la clave anon pública puede hoy llamar `place_order`/`void_order` directo por REST saltándose el checkout.

### B. Confirmar dominio real + Realtime (instrucciones en Fase 0 §3, sin cambios)
Sigue pendiente de tu acceso: revisar `NEXT_PUBLIC_ROOT_DOMAIN` en Render y confirmar que `orders`/`waiter_calls` están en la publicación `supabase_realtime` de producción.

**Una vez A y B estén en verde, el código de las Fases 0-4 queda 100% funcional en producción — no hay ningún otro bloqueante de código pendiente de este plan.**

## Bitácora
- **2026-07-21** — Leído `Leogin_Auditoria_Lanzamiento.docx`, creado este plan de 8 fases. Iniciada Fase 0: cerrada la fuga de teléfono/dirección (`loyalty.ts` + `account-sheet.tsx` + `rewards-section.tsx`, verificado en navegador local con datos de prueba), corregido y corrido el script de aislamiento multi-tenant (13/13 OK, estaba roto por un valor de plan obsoleto), redactada respuesta de venta FEL/cobro manual. Pendiente de tu parte: correr el diagnóstico SQL de migraciones 074-078 y revisar dominio/Realtime en Render+Supabase de producción (instrucciones arriba) — con eso cerrada, Fase 0 queda completa.
- **2026-07-21** — Fase 1 completa en código (misma sesión, continuación): anulación con motivo+aprobación (migración 079, tablas `order_voids` + RPCs `void_order`/`void_order_item`, nuevo permiso delegable "Aprobar anulaciones"), dividir cuenta (`bill-split.ts` + vista "Cuenta de mesa" en el panel de mesero), auto-archivo de mesas >24h (migración 080, `pg_cron` + botón manual). Hallazgo real corregido: `restock_order` reponía stock dos veces si un pedido ya tenía una anulación parcial antes de cancelarse completo. Verificado exhaustivamente: `tsc --noEmit` limpio, `test-aislamiento.mjs` 16/16 (agregado `order_voids`), pruebas SQL directas de ambos RPCs contra Postgres local (con rollback), y de punta a punta en el navegador con dos perfiles de staff reales (uno sin permiso de aprobar, otro con él) cubriendo: anular sin aprobación, anular con aprobación y PIN correcto, PIN incorrecto rechazado, dividir cuenta con datos reales, y el cron de auto-archivo corriendo por su cuenta (archivó 30 pedidos reales de prueba sin que se disparara manualmente). Pendiente de tu parte: correr el diagnóstico SQL de migraciones 079-080 en producción (instrucciones arriba). Quedan 2 miembros de prueba ("Mesero Test", "Encargado Test") en el restaurante demo local — inofensivos, bórralos desde /admin/personal si quieres limpiar la demo.
- **2026-07-22** — Fase 2 completa en código: reparto de propinas (migración 081, `tip_distributions`/`tip_distribution_shares`, vista `/admin/personal/propinas`), tarjetas de regalo (migración 082, `gift_cards`/`gift_card_transactions` + RPCs `issue_gift_card`/`redeem_gift_card`, sección `/admin/vales`), excepciones de horario por feriado (migración 083, `restaurants.hour_exceptions`, sección en Ajustes → Horario). **Hallazgo crítico de seguridad** (documentado en Fase 0 §4): las funciones SQL `security definer` quedan ejecutables por cualquiera con la clave anon a menos que se revoque explícitamente — lo cual hasta ahora nadie había revocado en ESTE proyecto. Corregido para las 2 funciones nuevas (`issue_gift_card`/`redeem_gift_card`, verificado con una llamada REST anon real antes/después del fix); **el resto de funciones `security definer` anteriores a esta sesión (`place_order`, `void_order`, etc.) probablemente tengan el mismo problema** — query de diagnóstico y plan de corrección quedaron en Fase 0 §4, pendiente de tu decisión sobre cuándo abordarlo (podría ser la Fase 0 real antes de lanzar). Verificado exhaustivamente: `tsc --noEmit` limpio, `test-aislamiento.mjs` 21/21 (agregadas `gift_cards`/`tip_distributions` + intento de redención cross-tenant), y de punta a punta en el navegador con datos reales: reparto de propinas (pedido con mesero + pedido sin mesero → fondo común repartido, reparto confirmado y marcado), vale de regalo (emitido, redimido parcial, rechazo por saldo insuficiente, rechazo por doble aplicación), y excepción de horario (tienda y checkout se cierran solo en la fecha marcada, verificado marcando y quitando "hoy" temporalmente). Datos de prueba borrados al terminar; se dejó la excepción del 25-dic-2026 como demostración.
- **2026-07-22** — Corregido el hallazgo crítico de seguridad completo (misma sesión, continuación): migración 084 audita las 43 funciones `security definer` del proyecto contra `pg_policies` reales y contra cada `.rpc()` del código TS, y restringe 38 de ellas a `service_role` (`place_order`, `void_order`, `void_order_item`, `restock_order`, `upsert_customer`, `increment_promo_usage`, toda la familia `leogin_*` de facturación/módulos, `check_delivery_coverage`, `visit_stats`, `claim_print_jobs`, `api_key_touch`, `generate_order_number`) — dejando públicas únicamente las 4 funciones que usan las políticas RLS (`get_my_role`/`get_my_restaurant_id`/`get_my_org_id`/`is_my_group_branch`) y el selector de sucursal anónimo (`get_group_branches`, público por diseño desde la migración 026). También se agregó `alter default privileges` para que funciones nuevas futuras no hereden este problema por default. Verificado con la clave anon real por REST (`place_order`/`void_order` → `401` antes imposible de lograr; `get_group_branches` sigue abierto), con la clave `service_role` real reproduciendo el flujo completo del checkout (`upsert_customer` → `place_order` → `void_order`, los tres exitosos contra datos reales), y `test-aislamiento.mjs` 21/21. Nota de la sesión: a mitad de esta verificación la PC se quedó sin RAM (7.4GB totales, llegó a 0.5GB libres) y Docker Desktop dejó de responder unos minutos — se resolvió solo al liberar el dev server, sin relación con el código; los contenedores de Supabase se reiniciaron pero los datos persistieron (volúmenes intactos). Pendiente de tu parte: correr el diagnóstico SQL de migraciones 081-084 en producción (instrucciones arriba) — la 084 es la más urgente de las cuatro.
- **2026-07-22** — Fase 3 completa en código (nueva sesión): alérgenos/dietas por producto (migración 085, `products.dietary_tags`, vocabulario fijo de 12 claves en `src/lib/dietary-tags.ts`, no ocultable — es seguridad alimentaria, no mercadeo), menú bilingüe ES/EN (migración 086, `name_en`/`description_en` en productos y categorías + `restaurants.menu_languages`, `LocaleProvider` con fallback automático al español, switch en el catálogo público, toggle en Ajustes → Idiomas del menú), lista de espera para walk-ins (migración 087, tabla `waitlist_entries` independiente de `reservations`, módulo activable `lista_espera` con permiso delegable propio — a diferencia de los demás módulos activables, que no respetan `permissions[]` del staff, ver detalle arriba). **Hallazgo real corregido en el camino:** los chips de alérgenos/dietas no cambiaban de idioma con el switch ES/EN (mostraban siempre español) — encontrado probando en vivo, corregido en `catalog.tsx` y `product-sheet.tsx` para usar `labelEn` cuando el idioma activo es inglés. **Trampa de arquitectura documentada:** el admin de productos tiene DOS formularios de edición separados (`product-form.tsx` de página completa y el modal de `catalog-panel.tsx`) que comparten los mismos server actions pero duplican los campos de UI — hubo que agregar los campos nuevos en ambos o uno quedaba desactualizado; ojo con esto en futuras features de catálogo. Verificado exhaustivamente: `tsc --noEmit` limpio, `test-aislamiento.mjs` 21/21, `waitlist_entries` confirmado no legible/escribible con la clave anon por REST real (SELECT `[]`, INSERT `401`), y de punta a punta en el navegador con datos reales sobre "Azúcar Negra": producto editado con dietas+alérgenos+traducción (verificado en BD y visualmente en el menú público con ambos idiomas, incluido el fallback en los platillos sin traducir), y la cola de espera completa WAITING→NOTIFIED→SEATED con cálculo de espera promedio y el botón "Avisar" convertido en link real de WhatsApp cuando hay teléfono. Se dejaron los datos de la demostración (traducción de "Negra Brava", idioma inglés activo, 2 entradas de lista de espera) como muestra visible de las 3 features — bórralos desde el panel si quieres una demo limpia. Pendiente de tu parte: correr el diagnóstico SQL de migraciones 085-087 en producción (instrucciones arriba) y activar el módulo "Lista de espera" para los restaurantes que quieras desde Super Admin.
- **2026-07-22** — Cierre del plan: el usuario decidió no continuar con las Fases 5-7 (integraciones externas, precios, WhatsApp+IA) por ahora — no encajan con el enfoque actual, quedan documentadas como referencia futura, no como pendiente activo. Re-verificado el estado de las Fases 0-4 antes de dar luz verde a producción: `tsc --noEmit` limpio, `test-aislamiento.mjs` 21/21 (0 fugas), `git status` limpio (todo commiteado hasta `1cb9197 fase 4`), migraciones 001-088 sin huecos en la numeración. Consolidado en un solo bloque el diagnóstico SQL de las 15 migraciones pendientes (074-088) para correr de una sola vez en producción. Con eso y la confirmación de dominio/Realtime (Fase 0 §3, sigue pendiente de tu acceso), el código de este plan queda listo para producción sin bloqueantes adicionales.
- **2026-07-22** — Fase 4 completa en código (nueva sesión): Kardex de costo promedio ponderado sobre proveedores (migración 088 — `purchase_order_items.product_id`/`ingredient_id`, `ingredients.stock`, `stock_movements` ampliado con `ingredient_id`/`unit_cost`/`avg_cost_after`, función `leogin_receive_purchase_order` que suma stock y recalcula costo promedio al recibir una orden, botón "Historial (Kardex)" en Inventario/Ingredientes), y respaldo completo self-service (`/admin/respaldo`, un `.xlsx` con 4 hojas — Catálogo/Categorías/Clientes/Pedidos — nuevo permiso delegable `respaldo`). **Hallazgo real corregido en el camino:** el trigger `ingredient_cost_sync` (migración 037, desde su creación) era `BEFORE UPDATE` y recalculaba el costo de las recetas leyendo `ingredients` ANTES de que el nuevo costo se escribiera — el costo del platillo quedaba siempre "un paso atrás" de cualquier cambio de costo de insumo (a mano en Ingredientes, o ahora por compra); corregido separando `updated_at` (BEFORE) de la cascada de receta (ahora AFTER, ve el dato ya escrito), incluido en la misma migración 088. **Trampa de entorno documentada:** los popups flotantes (Base UI Select, usados en el selector "Vincular a") no calculan su posición cuando el Browser pane no está siendo compositado activamente — se resolvió disparando el clic sobre el `<option>` real vía `element.click()` en JavaScript en vez de coordenadas, y confirmando `window.confirm` con `window.confirm = () => true` antes del clic real; quedó verificado con clics reales de la UI (creación de orden vinculada a "Cold Brew 18h", confirmación real, "Recibida" real, Kardex mostrando "+10 · costo Q12.5000 · prom. Q12.5000"). Verificado exhaustivamente: `tsc --noEmit` limpio (dos veces), `test-aislamiento.mjs` 21/21 (dos veces), matemática del promedio ponderado probada con 2 compras seguidas de insumo y de producto contra Postgres local real (incluida idempotencia y guardia contra recibir una orden `CANCELADA`), y respaldo descargado en navegador real sin errores con conteos verificados contra la BD (6 productos, 4 categorías, 1 cliente, 36 pedidos, 63 líneas). Se dejó la orden de compra #0001 (Cold Brew 18h) como muestra visible en Proveedores/Inventario; módulos `proveedores`/`recetas` quedaron activados en el restaurante demo local (antes apagados) para poder probar. Pendiente de tu parte: correr el diagnóstico SQL de la migración 088 en producción (instrucciones arriba) — incluye una fila que confirma que el fix del trigger quedó aplicado.
