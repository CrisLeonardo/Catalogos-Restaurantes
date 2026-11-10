-- ============================================================
-- 159 · Compras: creación atómica y estados válidos
-- ------------------------------------------------------------
-- Auditoría 2026-11-03, ficha 0.8 (X10, R12.1–2, PA-T12).
--
-- Dos fallos, reproducidos en la base local:
--
--  1. El estado de una compra cambiaba sin mirar el estado anterior.
--     Recibir (suma 10 kg) → volver a «borrador» → recibir otra vez
--     dejaba 20 kg y dos movimientos en el Kardex. La recepción
--     (`leogin_receive_purchase_order`, 088) ya era atómica y no
--     repetía una RECIBIDA; reabrirla le quitaba esa defensa.
--
--  2. La cabecera y los renglones se guardaban por separado. Si los
--     renglones fallaban, quedaba una orden vacía con folio y total.
--
-- Ahora:
--  · Máquina de estados en la base, para cualquier camino (acciones,
--    RLS del dueño o del grupo, SQL a mano):
--        BORRADOR → ENVIADA → RECIBIDA
--        BORRADOR → RECIBIDA            (se recibió sin mandarla)
--        BORRADOR | ENVIADA → CANCELADA
--    RECIBIDA y CANCELADA no se mueven. Corregir una compra recibida
--    se hará con una devolución (ficha 4.2), no reabriéndola.
--  · Los renglones de una compra recibida o cancelada no se tocan.
--  · `leogin_crear_compra` guarda cabecera y renglones en una sola
--    transacción, con el folio tomado bajo candado (dos órdenes a la
--    vez ya no comparten folio) y el total calculado aquí.
--
-- Se aplica ANTES de desplegar (o a la vez). El código tiene respaldo
-- si aún no corre: crea como antes, pero borra la cabecera si fallan
-- los renglones, y cambia el estado solo desde los estados válidos.
-- ============================================================

-- ── 1. Estados válidos ───────────────────────────────────────
-- NOT VALID: no revisa filas viejas (si hubiera un valor raro en
-- producción la migración no se cae); sí obliga en filas nuevas y en
-- cada cambio.
alter table purchase_orders drop constraint if exists purchase_orders_estado_valido;
alter table purchase_orders
  add constraint purchase_orders_estado_valido
  check (estado in ('BORRADOR', 'ENVIADA', 'RECIBIDA', 'CANCELADA')) not valid;

create or replace function leogin_nombre_estado_compra(p_estado text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_estado
    when 'BORRADOR'  then 'borrador'
    when 'ENVIADA'   then 'enviada'
    when 'RECIBIDA'  then 'recibida'
    when 'CANCELADA' then 'cancelada'
    else coalesce(lower(p_estado), 'sin estado')
  end;
$$;

create or replace function leogin_candado_estado_compra()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if NEW.estado is not distinct from OLD.estado then
    return NEW;
  end if;

  if (OLD.estado, NEW.estado) in (
       ('BORRADOR', 'ENVIADA'),
       ('BORRADOR', 'RECIBIDA'),
       ('ENVIADA',  'RECIBIDA'),
       ('BORRADOR', 'CANCELADA'),
       ('ENVIADA',  'CANCELADA')
     ) then
    return NEW;
  end if;

  if OLD.estado = 'RECIBIDA' then
    raise exception 'Una compra recibida no puede pasar a %.', leogin_nombre_estado_compra(NEW.estado)
      using errcode = 'LGC03',
            hint = 'Lo recibido ya está en el inventario; para corregirlo hará falta una devolución.';
  end if;
  raise exception 'Una compra % no puede pasar a %.',
      leogin_nombre_estado_compra(OLD.estado), leogin_nombre_estado_compra(NEW.estado)
    using errcode = 'LGC03';
end;
$$;

drop trigger if exists candado_estado_compra on purchase_orders;
create trigger candado_estado_compra
  before update of estado on purchase_orders
  for each row execute function leogin_candado_estado_compra();

-- ── 2. Renglones de una compra cerrada ───────────────────────
-- Cambiar cantidades de una compra ya recibida descuadra el Kardex
-- (el stock sumado ya no coincide con la orden). Si la cabecera ya no
-- existe es un borrado en cascada (se borra el restaurante): se deja.
create or replace function leogin_candado_renglon_compra_cerrada()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_po     uuid := case when TG_OP = 'DELETE' then OLD.purchase_order_id else NEW.purchase_order_id end;
  v_estado text;
begin
  select estado into v_estado from purchase_orders where id = v_po;
  if v_estado in ('RECIBIDA', 'CANCELADA') then
    raise exception 'Los renglones de una compra % no se pueden cambiar.',
        leogin_nombre_estado_compra(v_estado)
      using errcode = 'LGC03';
  end if;
  if TG_OP = 'UPDATE' and NEW.purchase_order_id <> OLD.purchase_order_id then
    select estado into v_estado from purchase_orders where id = OLD.purchase_order_id;
    if v_estado in ('RECIBIDA', 'CANCELADA') then
      raise exception 'Los renglones de una compra % no se pueden cambiar.',
          leogin_nombre_estado_compra(v_estado)
        using errcode = 'LGC03';
    end if;
  end if;
  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$;

drop trigger if exists candado_renglon_compra_cerrada on purchase_order_items;
create trigger candado_renglon_compra_cerrada
  before insert or update or delete on purchase_order_items
  for each row execute function leogin_candado_renglon_compra_cerrada();

-- ── 3. Crear la compra en una sola transacción ───────────────
-- p_lineas: [{ "descripcion", "cantidad", "unidad", "costo_unitario",
--              "product_id"?, "ingredient_id"? }, …]
create or replace function leogin_crear_compra(
  p_restaurant_id uuid,
  p_supplier_id   uuid,
  p_notes         text,
  p_lineas        jsonb
)
returns table (id uuid, folio integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_folio integer;
  v_total numeric;
  v_n     integer;
begin
  if p_restaurant_id is null or p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then
    raise exception 'Orden de compra inválida.' using errcode = 'invalid_parameter_value';
  end if;

  -- Tabla de trabajo de esta transacción (se va sola al terminar).
  if to_regclass('pg_temp._lineas_compra') is null then
    create temp table _lineas_compra (
      orden          integer,
      descripcion    text,
      cantidad       numeric,
      unidad         text,
      costo_unitario numeric,
      product_id     uuid,
      ingredient_id  uuid
    ) on commit drop;
  else
    truncate _lineas_compra;
  end if;

  insert into _lineas_compra
  select l.ord::integer,
         btrim(coalesce(l.v->>'descripcion', '')),
         (l.v->>'cantidad')::numeric,
         coalesce(nullif(btrim(l.v->>'unidad'), ''), 'unidad'),
         coalesce((l.v->>'costo_unitario')::numeric, 0),
         nullif(l.v->>'product_id', '')::uuid,
         -- Vínculo excluyente: si llegan los dos, gana el producto.
         case when nullif(l.v->>'product_id', '') is null
              then nullif(l.v->>'ingredient_id', '')::uuid end
    from jsonb_array_elements(p_lineas) with ordinality as l(v, ord);

  select count(*) into v_n from _lineas_compra;
  if v_n = 0 then
    raise exception 'Agrega al menos un renglón con descripción y cantidad.' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from _lineas_compra where descripcion = '' or cantidad is null or cantidad <= 0) then
    raise exception 'Cada renglón necesita descripción y una cantidad mayor que cero.' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from _lineas_compra where costo_unitario < 0) then
    raise exception 'El costo de un renglón no puede ser negativo.' using errcode = 'invalid_parameter_value';
  end if;

  -- Referencias del mismo restaurante (la 156 también lo vigila con
  -- candados; aquí da el mensaje antes de escribir nada).
  if p_supplier_id is not null and not exists (
       select 1 from suppliers s where s.id = p_supplier_id and s.restaurant_id = p_restaurant_id) then
    raise exception 'El proveedor no es de este restaurante.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from _lineas_compra l
              where l.product_id is not null
                and not exists (select 1 from products p where p.id = l.product_id and p.restaurant_id = p_restaurant_id)) then
    raise exception 'El producto no es de este restaurante.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from _lineas_compra l
              where l.ingredient_id is not null
                and not exists (select 1 from ingredients i where i.id = l.ingredient_id and i.restaurant_id = p_restaurant_id)) then
    raise exception 'El insumo no es de este restaurante.' using errcode = 'check_violation';
  end if;

  -- Folio correlativo bajo candado: dos órdenes a la vez esperan turno
  -- en vez de leer el mismo máximo.
  perform pg_advisory_xact_lock(hashtextextended('leogin_folio_compra:' || p_restaurant_id::text, 0));
  select coalesce(max(po.folio), 0) + 1 into v_folio
    from purchase_orders po where po.restaurant_id = p_restaurant_id;

  select coalesce(sum(round(l.cantidad * l.costo_unitario, 2)), 0) into v_total from _lineas_compra l;

  insert into purchase_orders (restaurant_id, supplier_id, folio, estado, notes, total)
  values (p_restaurant_id, p_supplier_id, v_folio, 'BORRADOR', btrim(coalesce(p_notes, '')), v_total)
  returning purchase_orders.id into v_id;

  insert into purchase_order_items
    (purchase_order_id, descripcion, cantidad, unidad, costo_unitario, subtotal, product_id, ingredient_id)
  select v_id, l.descripcion, l.cantidad, l.unidad, l.costo_unitario,
         round(l.cantidad * l.costo_unitario, 2), l.product_id, l.ingredient_id
    from _lineas_compra l
   order by l.orden;

  return query select v_id, v_folio;
end;
$$;

revoke execute on function public.leogin_crear_compra(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.leogin_crear_compra(uuid, uuid, text, jsonb) to service_role;
