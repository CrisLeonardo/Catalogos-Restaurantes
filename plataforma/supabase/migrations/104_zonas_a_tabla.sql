-- ============================================================
--  Migración 104 — Las zonas pasan a tabla (y traen tarifa)
--  ------------------------------------------------------------
--  La migración 103 creó la tabla `delivery_zones` para poder cobrar una
--  tarifa distinta por zona, pero las zonas YA existían desde la migración
--  010 como un arreglo de nombres en `restaurants.delivery_zones` (jsonb).
--  Dejar las dos vivas es peor que no haber creado la tabla: dos fuentes de
--  verdad para "a dónde llega el reparto" terminan divergiendo el día que
--  alguien edite una y no la otra.
--
--  Esta migración cierra eso: copia los nombres ya configurados a la tabla
--  y deja la columna jsonb como HISTÓRICA. Nadie pierde su configuración —
--  el que tenía "Zona 1, Zona 10, Villa Nueva" las sigue viendo, ahora con
--  una tarifa editable al lado (0 = envío gratis, que es lo que de hecho
--  tenían antes si la tarifa plana era 0).
--
--  La tarifa arranca en el valor de la tarifa PLANA vigente del restaurante
--  y no en 0: así el cobro no cambia solo por aplicar esta migración. Quien
--  cobraba Q15 a todos sigue cobrando Q15 a todos hasta que decida
--  diferenciar por zona.
--
--  CORRECCIÓN (2026-08-05): la primera versión de esta migración leía
--  `restaurants.delivery_fee`, una columna que NO EXISTE — fallaba con
--  «column r.delivery_fee does not exist» y no dejaba aplicar nada. El
--  comentario original citaba la migración 008, pero esa migración agrega
--  `delivery_fee` a ORDERS (el monto cobrado en cada pedido), no a
--  restaurants.
--
--  La tarifa plana real vive en `restaurant_themes.config->>'deliveryFee'`
--  (jsonb, migración 007), que es de donde la lee el checkout hoy — ver
--  computeOrderPricing() en src/lib/actions/orders.ts.
--
--  El valor se valida con una expresión regular antes de convertirlo: es un
--  jsonb editable desde el panel y un valor no numérico ahí tumbaría la
--  migración entera. Ante cualquier cosa rara, 0 — que es el mismo default
--  que usa el tema.
--
--  Idempotente: solo copia zonas que aún no existen en la tabla, así que
--  re-ejecutarla no duplica ni pisa tarifas ya editadas.
--
--  Ejecutar tras 001..103.
-- ============================================================

insert into delivery_zones (restaurant_id, nombre, tarifa, sort_order)
select
  r.id,
  z.nombre,
  case
    when rt.config->>'deliveryFee' ~ '^[0-9]+(\.[0-9]+)?$'
      then (rt.config->>'deliveryFee')::numeric
    else 0
  end,
  z.orden - 1
from restaurants r
-- left join: un restaurante sin fila de tema no se queda sin sus zonas.
-- Cae a 0, que es exactamente lo que el tema por defecto ya cobraba.
left join restaurant_themes rt on rt.restaurant_id = r.id
cross join lateral (
  select value::text as nombre, ordinality as orden
  from jsonb_array_elements_text(r.delivery_zones) with ordinality as t(value, ordinality)
) z
where r.delivery_zones is not null
  and jsonb_typeof(r.delivery_zones) = 'array'
  and not exists (
    select 1 from delivery_zones dz
    where dz.restaurant_id = r.id
      and lower(dz.nombre) = lower(z.nombre)
  );

comment on column restaurants.delivery_zones is
  'HISTÓRICO (migración 104): las zonas viven ahora en la tabla '
  'delivery_zones, que además guarda la tarifa de cada una. Esta columna se '
  'conserva por si hay que auditar la configuración previa, pero ya no se '
  'lee ni se escribe. No agregar lecturas nuevas contra ella.';
