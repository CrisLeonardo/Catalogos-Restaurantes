-- ============================================================
--  130 · Impresión por estación
--  ------------------------------------------------------------
--  Hallazgo M-07 de la auditoría «Mesas vs Tomar pedidos», el único
--  crítico que quedó sin arreglar y el que el plan de seis fases nunca
--  agendó.
--
--  Desde la migración 033 un restaurante tiene exactamente dos destinos
--  de impresión —`print_agents.kitchen_target` y `receipt_target`— así
--  que TODO lo que se cocina sale por el mismo papel. Un local con barra
--  y cocina —que es cualquiera que venda cerveza— manda las bebidas a la
--  plancha, y el cantinero se entera de la cerveza cuando el mesero
--  cruza el salón a decírselo.
--
--  Aquí vive la palabra que faltaba: la ESTACIÓN. No es «impresora 2»;
--  es DÓNDE SE HACE LA COMIDA —Cocina, Barra, Parrilla, Postres—, con un
--  nombre y una impresora. Las categorías apuntan a una estación, y un
--  producto suelto puede apuntar a otra.
--
--  Se resuelve en este orden, al imprimir:
--
--      producto.station_id ?? categoría.station_id ?? la de por defecto
--
--  Por PRODUCTO además de por categoría, aunque el hallazgo solo pedía
--  categoría: las categorías son la estructura del menú DE CARA AL
--  COMENSAL. Obligar a un restaurante a partir su menú para acomodar
--  dónde están sus impresoras es el intercambio equivocado; la anulación
--  por producto es una columna, viene vacía, y evita ese daño.
--
--  EL DÍA CERO NO CAMBIA NADA PARA NADIE. Esta migración siembra UNA
--  estación por restaurante que ya tenga agente —«Cocina», la de por
--  defecto, con el mismo destino que ya tenía— y no mapea ninguna
--  categoría. Así cada línea cae en la de por defecto, sale UN ticket,
--  por la MISMA impresora. Nada cambia hasta que alguien mapea una
--  categoría a mano. Es lo que permite aplicar esto sin romper un solo
--  restaurante encendido.
--
--  Lo que NO se toca, a propósito:
--
--   · `print_jobs.role` sigue siendo 'kitchen' | 'receipt', con el mismo
--     `check` de la 033. El rol dice QUÉ CLASE DE PAPEL es; la estación
--     dice POR QUÉ IMPRESORA sale. Son dos preguntas distintas, y
--     juntarlas obligaría a revisar todo lo que hoy lee `role` —el
--     agente incluido— para que no cambie de significado.
--   · `print_agents.kitchen_target` NO se borra. Lo leen ocho sitios, y
--     un agente viejo (o cualquiera sin conexión, que imprime contra su
--     copia cacheada) solo conoce esa columna. Pasa a ser un ESPEJO del
--     destino de la estación por defecto, escrito por una sola función.
--
--  Idempotente. Ejecutar DESPUÉS de 001..129.
-- ============================================================

-- ── 1. La estación ───────────────────────────────────────────
create table if not exists print_stations (
  id            uuid        primary key default gen_random_uuid(),
  restaurant_id uuid        not null references restaurants(id) on delete cascade,

  -- Cómo la llama el local. Va impreso en grande en la cabecera del
  -- ticket, así que es corto por obligación, no por gusto.
  name          text        not null,

  -- Mismo formato que print_agents.kitchen_target, porque acaba en el
  -- mismo sitio y lo lee el mismo `parseTarget` del agente:
  --   "windows:EPSON TM-T20" | "tcp://192.168.1.51:9100" | "doc:NOMBRE" | "preview:"
  -- NULL = estación declarada pero todavía sin impresora asignada.
  target        text,

  -- Orden en que salen los papeles. Fijo, para que el que recoge en el
  -- pase encuentre siempre los mismos primero.
  sort_order    int         not null default 0,

  -- La que recoge todo lo que nadie mapeó. Ver el índice de abajo.
  is_default    bool        not null default false,

  created_at    timestamptz not null default now(),

  constraint print_stations_name_check
    check (length(btrim(name)) between 1 and 40)
);

comment on table print_stations is
  'Dónde se hace la comida: Cocina, Barra, Parrilla. Nombre + impresora '
  '(migración 130, M-07). Las categorías y los productos apuntan aquí, y '
  'al imprimir la comanda se parte en un papel por estación con líneas. '
  'NO es un rol de impresión: print_jobs.role sigue siendo kitchen/receipt.';

comment on column print_stations.is_default is
  'La estación que recoge todo lo que nadie mapeó: categorías sin '
  'estación, productos sin categoría, y los ARTÍCULOS LIBRES, que no '
  'tienen producto contra el que resolver nada.';

comment on column print_stations.target is
  'Destino de impresión, mismo formato que print_agents.kitchen_target. '
  'El de la estación por defecto se copia a esa columna al guardar (es su '
  'espejo), para que todo lo que ya la lee siga funcionando sin tocarse.';

-- ── 2. Una sola por defecto, y un solo nombre ────────────────
--    Los dos candados van en la base y no en la aplicación: dos
--    estaciones por defecto dejan el reparto a merced de qué fila
--    devuelva Postgres primero, y dos «Barra» hacen ilegible el
--    desplegable donde se mapean las categorías. Índice PARCIAL para el
--    primero, por la misma razón que `table_sessions_abierta_unica`
--    (migración 128): la regla solo aplica a un subconjunto de filas.
create unique index if not exists print_stations_defecto_unica
  on print_stations (restaurant_id)
  where is_default;

create unique index if not exists print_stations_nombre_unico
  on print_stations (restaurant_id, lower(btrim(name)));

--    Ojo: el índice impide DOS por defecto, no impide CERO. Que siempre
--    haya una es trabajo de la acción que las guarda; y si aun así no la
--    hay, el reparto cae en print_agents.kitchen_target, que es
--    exactamente lo que hacía antes de esta migración.

-- ── 3. Quién puede tocarla ───────────────────────────────────
--    RLS encendido y SIN políticas, igual que `print_agents` y
--    `print_jobs` (033): estas tablas no las lee el navegador. El panel
--    entra por acciones de servidor y el agente por /api/agent/*, las dos
--    con el service_role, que bypasea RLS. Denegado por defecto para
--    anon y authenticated.
alter table print_stations enable row level security;

-- ── 4. Quién apunta a quién ──────────────────────────────────
--    `on delete set null` en las dos: borrar una estación devuelve sus
--    categorías a la de por defecto en vez de dejar filas colgando de un
--    id que ya no existe. Es la conducta que queremos —lo que se dejó de
--    enrutar vuelve a la cocina— y sale gratis.
alter table categories add column if not exists station_id uuid
  references print_stations(id) on delete set null;

alter table products   add column if not exists station_id uuid
  references print_stations(id) on delete set null;

comment on column categories.station_id is
  'Estación donde se prepara esta categoría (migración 130). NULL = la de '
  'por defecto. Es el mapa normal: se configura una vez y no se toca.';

comment on column products.station_id is
  'Anulación por producto, por encima de la de su categoría (migración '
  '130). NULL = manda la categoría. Existe para no obligar a partir el '
  'menú del comensal por dónde estén las impresoras: el café de la carta '
  'de postres puede salir por la barra sin sacarlo de Postres.';

--    Índices parciales: solo unas pocas filas del catálogo llevan
--    estación, y la pregunta que se hace al imprimir es siempre «¿cuáles
--    de ESTOS productos tienen una?».
create index if not exists categories_station_idx
  on categories (station_id) where station_id is not null;
create index if not exists products_station_idx
  on products (station_id) where station_id is not null;

-- ── 5. Por qué estación salió cada papel ─────────────────────
--    Sin esto el candado anti-duplicado no puede razonar por estación, y
--    ese candado es lo único que separa «reintentar la barra» de
--    «reimprimir la comanda entera».
--
--    CUIDADO AL DESPLEGAR: los trabajos creados antes de esta migración
--    se quedan con station_id NULO. La regla, escrita en
--    lib/print-agent.ts, es que un trabajo de cocina SIN estación cuenta
--    como «la de por defecto ya imprimió» — sin ella, el primer refresco
--    del panel reimprime la comanda de cada pedido abierto del local.
alter table print_jobs add column if not exists station_id uuid
  references print_stations(id) on delete set null;

comment on column print_jobs.station_id is
  'Estación por la que salió este papel (migración 130). NULL = trabajo '
  'anterior a la 130, o impresión que no pasa por el reparto (recibos, '
  'pruebas): cuenta como la estación por defecto.';

--    El candado pregunta por pedido; hasta aquí no había índice por esa
--    columna y la consulta recorría la cola entera del restaurante.
create index if not exists print_jobs_pedido_idx
  on print_jobs (order_id) where order_id is not null;

-- ── 6. El día cero: una estación, la de siempre ──────────────
--    Una «Cocina» por cada restaurante que ya tenga agente, con el
--    destino que ya tenía. No se mapea ninguna categoría: todo cae en
--    ella y sale un solo papel, por la misma impresora que ayer.
--
--    Se siembra también cuando kitchen_target está vacío: la estación
--    existe igual, sin impresora, y la pantalla tiene algo que enseñar
--    en vez de un hueco. Los restaurantes SIN agente no se siembran —
--    el reparto los trata como «ninguna estación», que ya significa «como
--    antes de la 130».
insert into print_stations (restaurant_id, name, target, sort_order, is_default)
select a.restaurant_id, 'Cocina', a.kitchen_target, 0, true
  from print_agents a
 where not exists (
   select 1 from print_stations s where s.restaurant_id = a.restaurant_id
 );
