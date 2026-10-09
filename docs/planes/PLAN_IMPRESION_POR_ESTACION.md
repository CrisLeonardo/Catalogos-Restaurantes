# Plan · Impresión por estación (M-07)

**Fecha:** 8 de septiembre de 2026
**Origen:** hallazgo M-07 de la auditoría «Mesas vs Tomar pedidos» (7 de septiembre), el único
crítico que quedó sin arreglar.
**Estado:** **CONSTRUIDO — las cinco fases** (8 de septiembre).
Commits: `8cce060` el modelo · `34787ff` el reparto · `38f1841` los papeles ·
`d5fd0a9` la pantalla · `12db70e` sin conexión. Más `b4cd34b`, un fallo aparte que
apareció al verificar la fase 1.

**Falta lo que solo puede hacer el dueño:** pegar la migración 130 en el editor SQL
de producción, y publicar el release del agente **v0.8.0** (`npm run release` en
`agente-impresion/`) — eso lo reparte el auto-update a todos los locales, así que
no se hizo desde aquí.

El documento de abajo se conserva **tal como se escribió**, en presente y antes de
construir nada. Lo que no anticipó está en la §10.

---

## 1. El hallazgo

> Solo hay dos roles de impresora, `kitchen` y `receipt`. Un restaurante con barra y cocina
> —que es cualquiera que venda cerveza— manda las bebidas a la plancha. No hay forma de
> enrutar por categoría de producto.

Es literal en el esquema. `supabase/migrations/033_print_agents_y_jobs.sql:20`:

```sql
kitchen_target    text,
receipt_target    text,
```

Dos columnas, una fila por restaurante. Todo lo que se cocina sale por el mismo papel.

---

## 2. La premisa que hay que corregir

El plan de seis fases de la auditoría **nunca agendó M-07**, y la razón que quedó escrita fue
que el enrutado necesita que *el agente instalado en cada local* sepa a qué impresora mandar
cada línea, y que esos agentes no se pueden actualizar desde aquí.

Leyendo el código, **las dos mitades de esa frase son falsas.**

**Primera mitad.** El agente no decide nada. Lo dice su propia cabecera,
`agente-impresion/src/agent.ts:5`:

> El servidor genera los bytes ESC/POS; el agente solo obedece el destino.

Cada trabajo viaja con su destino puesto (`print_jobs.target`), y `handleJob` hace exactamente
esto y nada más:

```ts
const target = parseTarget(job.target);   // "winspool:EPSON TM-T20" | "tcp:IP:9100"
await printRaw(target, bytes);
```

El servidor puede encolar tres trabajos con tres destinos distintos y **el binario que ya está
instalado los imprime los tres**, sin cambiar una línea. El enrutado en línea no necesita al
agente.

**Segunda mitad.** El agente sí se actualiza solo. `agente-impresion/src/updater.ts` pregunta
cada hora a `/api/agent/latest`, verifica el sha256 y cambia el ejecutable en caliente; desde
agosto el canal `stable` además descubre los releases publicados en GitHub, así que publicar el
`.exe` basta. Los agentes se actualizan desde aquí — hace falta un release, no una visita.

**Lo que sí necesita el binario** es el camino **sin conexión**, y solo ese: cuando no hay nube,
el hub arma e imprime la comanda él mismo contra un destino único que tiene cacheado
(`order-intake.ts:169`, `snapshot.kitchenTarget`). Eso es la fase 5, y degrada solo: sin
actualizar, un corte de internet manda todo a la impresora principal, igual que hoy.

---

## 3. El modelo: una palabra nueva, «estación»

No «impresora 2» ni «rol extra». Una **estación** es *dónde se hace la comida*: Cocina, Barra,
Parrilla, Postres. Tiene un nombre y una impresora. Las categorías apuntan a una estación. Eso
es todo el modelo.

```
producto ─┐
          ├─→ estación ─→ impresora
categoría ┘
```

Se resuelve así, en este orden:

```
estación del PRODUCTO  ??  estación de su CATEGORÍA  ??  estación POR DEFECTO
```

### Por qué también por producto, y no solo por categoría

El hallazgo pide enrutar «por categoría de producto». Con solo categorías, un restaurante que
quiera mandar el café a la barra tiene que **partir su menú** —el que ve el comensal— para
acomodar dónde están sus impresoras. Las categorías son una estructura de cara al cliente;
imponerle encima el plano de la cocina es el intercambio equivocado. La anulación por producto
es una columna y un `coalesce`, viene vacía, y evita ese daño.

---

## 4. Decisiones, con el porqué

### 4.1 La estación es una DIMENSIÓN, no un rol nuevo

`print_jobs.role` seguirá siendo `'kitchen' | 'receipt'`. El `check` de la migración 033 no se
toca.

El rol dice **qué clase de papel** es (comanda o recibo); la estación dice **por qué impresora
sale**. Son dos preguntas distintas y meterlas en la misma columna obliga a abrir el `check`,
y a revisar todo lo que hoy lee `role` —`api/agent/ack`, `pedidos/page.tsx`, el propio agente—
para que no cambie de significado. Se paga mucho por nada.

### 4.2 Se resuelve AL IMPRIMIR, no se congela en el pedido

La alternativa sería guardar la estación en `order_items` al crear el pedido. No:

- Los pedidos se crean con `place_order`, una función **SQL** (última versión en la migración
  123) que inserta los `order_items` desde un JSON. Añadir ahí una columna es reescribir la
  función por la que pasa **cada pedido del sistema**, en la nube y sin conexión. Es el único
  sitio donde un error pierde dinero.
- La comanda se imprime segundos después de tomar el pedido: el mapa no ha cambiado.
- Y en una reimpresión de dos horas después, resolver con el mapa de HOY es lo correcto: si la
  barra se mudó de impresora, la copia debe salir por la nueva.

`enqueueKitchenForOrder` ya carga el pedido con sus ítems; se le suma la unión a productos y
categorías. Una consulta más en un camino que ya hace tres.

### 4.3 `print_agents.kitchen_target` NO se borra: pasa a ser un espejo

Ocho sitios leen esa columna hoy —el snapshot del hub, `pedidos/page.tsx`, `mi-pc`, el propio
`enqueueKitchenForOrder`—. Borrarla es un cambio de doce archivos a cambio de nada.

Se queda, y **la escribe una sola función**: al guardar las estaciones, el destino de la
estación por defecto se copia a `kitchen_target`. Un espejo, con un solo escritor, documentado
como tal. Todo lo que hoy lee `kitchen_target` sigue funcionando para siempre sin tocarse — y
un agente viejo, que solo conoce esa columna, sigue imprimiendo.

### 4.4 El día cero no cambia nada para nadie

La migración crea **una** estación por restaurante que ya tenga `kitchen_target`: se llama
«Cocina», es la de por defecto, y su destino es el `kitchen_target` que ya tenía. No mapea
ninguna categoría.

Resultado: cada línea cae en la estación por defecto, sale **un** ticket, por la **misma**
impresora, con el mismo aspecto. **Nada cambia hasta que alguien mapea una categoría a mano.**
Esa es la propiedad que permite desplegar esto sin romper un solo restaurante encendido.

### 4.5 Estación sin líneas = sin papel

Si la mesa pidió solo comida, la barra no recibe un ticket vacío. Y si todo cae en una sola
estación, sale **un** ticket idéntico al de hoy — no tres papeles con un renglón cada uno.

---

## 5. Las cinco fases

Las fases 1 a 3 son **invisibles**: al terminarlas hay una estación por restaurante y el sistema
imprime exactamente como hoy. La 4 es la que enciende la función. La 5 la lleva al modo sin
internet.

### Fase 1 · El modelo (migración 130)

```sql
create table print_stations (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name          text not null,
  target        text,                    -- "winspool:NOMBRE" | "tcp:IP:9100"
  sort_order    int  not null default 0,
  is_default    bool not null default false,
  created_at    timestamptz not null default now()
);

-- Una sola estación por defecto por restaurante. Índice único PARCIAL, el
-- mismo truco que `table_sessions_abierta_unica` de la migración 128: la
-- regla la impone la base, no una comprobación que alguien tiene que recordar.
create unique index print_stations_defecto_unica
  on print_stations(restaurant_id) where is_default;

alter table categories add column if not exists station_id uuid
  references print_stations(id) on delete set null;
alter table products   add column if not exists station_id uuid
  references print_stations(id) on delete set null;

-- La estación por la que SALIÓ cada trabajo. Sin esto el candado
-- anti-duplicado no puede razonar por estación (§6.1).
alter table print_jobs add column if not exists station_id uuid
  references print_stations(id) on delete set null;
```

Más: RLS habilitado **sin políticas**, como `print_agents` — solo el `service_role` entra, y el
panel lee por acciones de servidor. Y el sembrado del día cero (§4.4).

`lib/db/print-stations.ts`, con `hayEstaciones()` sondeando el `42P01` — el mismo patrón que
`hayTurnosDeMesa()` de la fase 2 de la auditoría anterior. **Las migraciones aquí se corren
tarde y a mano**: sin la 130 aplicada, todo tiene que seguir funcionando con una estación
implícita.

*Sale a la pantalla:* nada.

### Fase 2 · El reparto (función pura + pruebas)

`lib/printing/routing.ts`, del mismo corte que `lib/table-payments.ts` de la fase 4: sin base de
datos, sin React, todo comprobable.

```ts
export function repartirPorEstacion(
  items: ItemParaImprimir[],
  mapa: MapaDeEstaciones,
): { estacion: Estacion; items: ItemParaImprimir[] }[]
```

Las reglas que las pruebas tienen que fijar:

- producto con estación propia → esa
- producto sin estación, categoría con estación → la de la categoría
- **ítem sin `product_id`** → la de por defecto. Pasa en dos casos reales: el **artículo libre**
  de la fase 3 (un descorche no tiene producto) y un producto borrado
  (`order_items.product_id` es `on delete set null`).
- estación sin ítems → no aparece en el resultado
- todo en una estación → **una** entrada, no una por estación existente
- el orden de salida es `sort_order`, para que los papeles salgan siempre en el mismo orden

*Sale a la pantalla:* nada.

### Fase 3 · Los papeles

1. **`enqueueKitchenForOrder` reparte.** Un `enqueuePrintJob` por estación con líneas, cada uno
   con su `target` y su `station_id`.

2. **La cabecera del ticket deja de decir «COCINA».** `escpos.ts:191` la tiene fija. Pasa a
   decir el nombre de la estación, en grande, y debajo en pequeño `Parte 2 de 3 · #ORD-2026-…`.
   El cocinero no necesita saber qué hay en los otros papeles; quien encuentra un ticket suelto
   en el suelo, sí.

3. **El candado anti-duplicado pasa a ser por estación.** Hoy `kitchenTicketAlreadyQueued`
   pregunta «¿este pedido ya tiene comanda?» (`print-agent.ts:224`). Con tres estaciones esa
   pregunta está mal en las dos direcciones: si la barra falló y la cocina salió, reintentar
   tiene que reenviar **solo la de la barra**. Pasa a filtrar por `station_id`.

   **La trampa del despliegue:** los trabajos creados antes de la migración tienen
   `station_id = null`. La regla tiene que ser explícita —*un trabajo de cocina sin estación
   cuenta como «la de por defecto ya imprimió»*— o el primer refresco del panel vuelve a
   imprimir la comanda de cada pedido abierto en el local.

4. **El fallo tiene que verse.** Esto no está en el hallazgo y es lo más importante de la fase.
   Hoy, si la impresora de cocina falla, **no sale ninguna comanda y todo el mundo se entera en
   dos minutos**. Con tres estaciones, la cocina imprime, la barra no, y nadie se entera hasta
   que el cliente pregunta por su cerveza. Así que: la ficha del pedido enseña un chip rojo
   «Barra: no imprimió · Reintentar», y el reintento manda **solo esa estación**
   (`reprintKitchenTicket` gana un `stationId` opcional).

*Sale a la pantalla:* nada todavía —hay una sola estación—, salvo el chip de fallo, que sí
aplica desde el primer día.

### Fase 4 · La pantalla

En **`/admin/mi-pc`**, junto a `print-agent-settings.tsx`. (Ojo: el hallazgo apunta a
`kitchen-print-settings.tsx` y a `/admin/impresion`; esa ruta hoy **redirige** a `/admin/mi-pc`,
y ese componente es el camino del navegador, no el del agente — ver §7.)

- **Editor de estaciones:** nombre + impresora, reusando el `PrinterPicker` que ya existe y que
  ya lista lo que el agente reporta en el poll. Prueba de impresión por estación.
- **Mapa de categorías:** una lista compacta, cada categoría con un desplegable que empieza en
  «Cocina (por defecto)».
- **Cuenta viva** al lado de cada estación: «Cocina · 12 categorías», «Barra · 3». Sin eso,
  mapear todo a la barra por error es invisible.
- **Borrar una estación** deja sus categorías en la de por defecto (`on delete set null`) y lo
  dice antes de hacerlo.

*Sale a la pantalla:* aquí es donde el dueño puede, por fin, separar la barra de la plancha.

### Fase 5 · Sin conexión (agente v0.8)

1. `/api/agent/menu` empieza a devolver `stations` y el mapa. El snapshot del agente **ya trae
   categorías y productos con su `category_id`** (`store.ts`, `MenuSnapshot`), así que solo
   falta la tabla de estaciones.
2. `MenuSnapshot` gana `stations`; `order-intake.ts` y `hub.ts` reparten el ticket local igual
   que el servidor.
3. **La función de reparto se duplica dentro del agente.** Hay que decirlo en voz alta: son dos
   entregables separados, sin paquete compartido, y el agente ya duplica el armado de tickets
   por lo mismo. El costo se acota con una regla: **cualquier estación que el agente no sepa
   resolver cae en `kitchenTarget`**, así un snapshot viejo nunca pierde un papel.
4. Subir versión, `build-exe.mjs`, publicar el release. El auto-update lo reparte en ≤1 h.

*Sale a la pantalla:* nada. Se comprueba desconectando el internet del local.

---

## 6. Lo que puede salir mal

| # | Riesgo | Qué lo contiene |
|---|--------|-----------------|
| 1 | **Doble comanda el día del despliegue** | La regla del `station_id` nulo (fase 3.3). Es el único riesgo que rompe un servicio en marcha. |
| 2 | **Una estación muerta en silencio** | El chip de fallo + reintento por estación (fase 3.4). |
| 3 | Mapear todo a la barra por error | La cuenta viva por estación (fase 4). |
| 4 | Borrar una estación con categorías colgando | `on delete set null` → caen en la de por defecto. Seguro por construcción. |
| 5 | Un agente viejo tras la fase 3 | Ninguno: el agente solo obedece destinos, y los nuevos destinos son destinos normales. |
| 6 | Tres papeles donde antes había uno | La regla de «estación sin líneas, sin papel» (§4.5). El gasto de papel lo decide el dueño al mapear. |

---

## 7. Fuera de alcance, a propósito

- **KDS por estación.** `/admin/cocina` enseña cada pedido entero. Filtrarlo por estación es
  real y vale la pena, pero cambia cómo se canta un pedido en el pase, no por dónde sale un
  papel. Merece su propio plan.
- **Enrutado por estación en el navegador (Web USB).** `lib/printing.ts` guarda la impresora
  **por dispositivo**, en `localStorage`, y cada impresora USB nueva exige un gesto del usuario
  para autorizarse. Enrutar ahí significaría que el mapa lo tiene *la tablet*, no el
  restaurante — justo lo contrario de este diseño. **Decisión: las estaciones exigen el
  Agente**, y el camino del navegador se queda con su impresora de cocina única. La pantalla lo
  dice; no se deja que se descubra solo.
- Impresoras de distinto ancho (58 mm / 80 mm) por estación, y etiquetadoras.

---

## 8. Cómo se comprueba

1. **Antes de tocar nada:** un pedido con bebida y comida sale hoy en un solo papel. Se guarda
   ese papel.
2. **Tras las fases 1-3:** el mismo pedido sale **igual** —mismo papel, misma impresora—.
   Es la comprobación de que el día cero no cambió nada.
3. **Tras la fase 4:** se crea «Barra» apuntando a `preview:`, se mapea la categoría Bebidas, y
   el mismo pedido produce **dos** trabajos con destinos distintos; el de comida no lleva la
   bebida y el de barra no lleva la comida.
4. **Una mesa que pide solo comida** no produce trabajo de barra.
5. **Un artículo libre** («descorche») aparece en el papel de la estación por defecto.
6. **Con la barra apagada:** la cocina imprime, la ficha del pedido enseña el chip rojo, y el
   reintento manda solo la barra.
7. **Tras la fase 5:** con el cable de red desconectado, un pedido tomado en el hub sale por las
   dos impresoras.

---

## 9. Dependencia

Este plan **no depende** de las siete migraciones pendientes en producción (123-129), pero
comparte su cuello de botella: la 130 también hay que pegarla a mano en el SQL Editor. Conviene
ponerla en la misma tanda.

---

## 10. Lo que apareció al construirlo

Cuatro fallos reales, ninguno en el plan, todos salidos de **verificar** y no de leer.

1. **La guarda de migración ausente comprobaba un código que nunca llega.** Los
   sitios que preguntan «¿falló porque la migración no ha corrido?» por una TABLA
   comprobaban `42P01` (lo que devuelve Postgres), pero entre nosotros y Postgres
   está PostgREST, que contesta `PGRST205`. Nunca se disparaban. En producción eso
   significa que **«Sentar» (migración 128) enseña el error crudo de la base** en vez
   de callarse. Arreglado en `b4cd34b` con `lib/db/migracion-ausente.ts`. Las de
   COLUMNA (`42703` al leer, `PGRST204` al escribir) sí eran correctas.

2. **Nombrar `station_id` siempre habría dejado al local sin comanda.** Donde la 130
   no ha corrido, la columna no existe y mencionarla tumba el `insert` entero. Solo
   se nombra cuando hay estación que escribir. El mismo cuidado en la fase 5 con
   `/api/agent/menu`: sin él, un corte de internet encontraba al hub **sin menú**.

3. **Un destino que el agente no entiende se podía guardar** (`tcp:` sin las dos
   barras). Una estación que nunca imprime y que nadie echa en falta. Lo valida ahora
   `destinoValido`, que espeja `parseTarget` del agente.

4. **`PrinterPicker` guardaba una vez por letra.** Tiene ahora `onCommit`, que salta
   al elegir del desplegable y al salir del campo manual.

**Formato canónico de destino** (lo fija `parseTarget` del agente, y el plan lo tenía
mal): `windows:NOMBRE` · `tcp://IP:9100` · `doc:NOMBRE` · `preview:`.

**Dónde vive cada cosa, al final:**

| pieza | archivo |
|---|---|
| el modelo | `supabase/migrations/130_impresion_por_estacion.sql` |
| leer el mapa | `plataforma/src/lib/db/print-stations.ts` |
| repartir (nube) | `plataforma/src/lib/print-routing.ts` + 25 pruebas |
| encolar los papeles | `plataforma/src/lib/print-agent.ts` |
| la pantalla | `plataforma/src/components/admin/print-stations-settings.tsx` |
| repartir (sin nube) | `agente-impresion/src/routing.ts` + `npm test` (11) |
