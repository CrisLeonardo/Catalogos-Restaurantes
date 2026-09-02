-- ============================================================
--  127 · La mesa deja de ser una cadena de texto
--  ------------------------------------------------------------
--  Hallazgo F-12 de la auditoría del salón.
--
--  Qué mesa es un pedido se decidía leyendo `address` con
--  `/Mesa\s+(\d+)/i`, en cinco sitios distintos de la aplicación. Y no
--  solo para LEERLO: el salón entero CONSULTA por esa cadena
--  (`.eq('address', 'Mesa 4')`), así que abrir una mesa, cobrarla, moverla
--  o juntarla dependen de que el texto se haya escrito exactamente igual
--  en todos lados. Funcionaba, y cerraba la puerta a lo primero que pide
--  un restaurante con más de un ambiente: mesas con nombre —«Terraza 2»,
--  «Barra A»—, porque el nombre rompería el regex y con él el salón.
--
--  A partir de aquí el NÚMERO es la identidad (una columna int) y el
--  texto es solo lo que se imprime. El plano puede ponerle nombre encima
--  sin que nada se entere.
--
--  Idempotente: se puede correr dos veces.
-- ============================================================

-- ── 1. La columna ────────────────────────────────────────────
alter table orders add column if not exists table_number int;

comment on column orders.table_number is
  'Mesa del pedido en DINE_IN (NULL en los demás tipos). Es la IDENTIDAD de '
  'la mesa: `address` pasa a ser solo el texto que se imprime. Antes esto se '
  'sacaba con un regex sobre address en cinco sitios (migración 127, F-12).';

-- ── 2. Relleno hacia atrás, con el mismo regex que se retira ──
--    Solo donde todavía está vacío, para poder recorrerla otra vez sin
--    pisar lo que la aplicación ya haya escrito.
update orders
   set table_number = (substring(address from 'Mesa\s+(\d+)'))::int
 where table_number is null
   and order_type = 'DINE_IN'
   and address ~* 'Mesa\s+\d+';

-- ── 3. El índice que el salón usaba a ciegas ─────────────────
--    Las consultas del salón son siempre «los pedidos vivos de la mesa N
--    de este restaurante». Antes eso era un filtro por igualdad sobre un
--    texto sin índice; ahora es un int con su índice parcial.
create index if not exists orders_mesa_viva_idx
  on orders (restaurant_id, table_number)
  where order_type = 'DINE_IN' and status not in ('DELIVERED', 'CANCEL');

-- ── 4. La red de seguridad ───────────────────────────────────
--    place_order tiene DIECINUEVE parámetros y añadirle uno crea una
--    sobrecarga que deja ambiguas las llamadas que no lo manden (el mismo
--    aviso de la migración 031 que ya obligó a meter `party_size` por un
--    UPDATE aparte). Así que la columna se rellena sola desde `address`,
--    que es de donde salía antes: la deducción sigue existiendo, pero
--    ocurre UNA vez al escribir en vez de en cada lectura.
--
--    Quien sepa el número lo manda explícito y gana; el disparador solo
--    entra cuando nadie lo puso.
create or replace function orders_set_table_number()
returns trigger
language plpgsql
as $$
declare
  v_leido int;
begin
  if new.order_type is distinct from 'DINE_IN' then
    return new;
  end if;

  v_leido := (substring(new.address from 'Mesa\s+(\d+)'))::int;

  -- Alta: si el llamador no lo trae, se deduce del texto. Si tampoco se
  -- puede deducir, se queda vacío: es un pedido en local sin mesa.
  if new.table_number is null then
    new.table_number := v_leido;
    return new;
  end if;

  /* Cambio de dirección sin tocar el número (mover o juntar mesas al
     estilo viejo): se recalcula, o el pedido se quedaría apuntando a la
     mesa de la que salió.

     Solo cuando el texto DICE una mesa. Sin este `v_leido is not null` el
     disparador borraba el número al ponerle nombre a una mesa: un UPDATE
     a `address = 'Terraza 2'` dejaba `table_number` en NULL y la mesa
     desaparecía del salón — exactamente el fallo que esta migración viene
     a hacer imposible. Visto al probarlo contra la base. */
  if tg_op = 'UPDATE'
     and v_leido is not null
     and new.address is distinct from old.address
     and new.table_number is not distinct from old.table_number then
    new.table_number := v_leido;
  end if;

  return new;
end;
$$;

drop trigger if exists orders_set_table_number_trg on orders;
create trigger orders_set_table_number_trg
  before insert or update of address, table_number, order_type on orders
  for each row execute function orders_set_table_number();

comment on function orders_set_table_number is
  'Mantiene orders.table_number a partir de address cuando el llamador no lo '
  'manda. Existe para no añadirle un parámetro 20 a place_order (ver el aviso '
  'de la migración 031 sobre sobrecargas ambiguas).';
