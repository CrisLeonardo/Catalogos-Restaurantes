-- Prueba del resumen de ventas, la prueba voluntaria y sus avisos.
begin;

do $$
declare
  persona uuid := gen_random_uuid();
  -- Un dueño por restaurante: la 205 no deja dos pruebas en curso por persona.
  duenos uuid[] := array[persona, gen_random_uuid(), gen_random_uuid()];
  i int;
  gratis uuid;
  paga uuid;
  control uuid;
  cierre timestamptz;
  realizado boolean;
  comida uuid;
  resumen jsonb;
  fechaVencimiento date;
  fecha date := (now() at time zone 'America/Guatemala')::date;
begin
  insert into auth.users (id, email) select d, d::text || '@test.local' from unnest(duenos) d;
  insert into profiles (id, role, full_name) select d, 'RESTAURANT_OWNER', 'Prueba' from unnest(duenos) d on conflict (id) do nothing;
  insert into restaurants (name, slug, status, plan_actual)
    values ('Prueba que vuelve a Básico', 'qa-prueba-basico', 'active', 'BASICO') returning id into gratis;
  insert into restaurants (name, slug, status, plan_actual)
    values ('Prueba que contrata', 'qa-prueba-contrata', 'active', 'BASICO') returning id into paga;
  insert into restaurants (name, slug, status, plan_actual)
    values ('Prueba que retira', 'qa-prueba-retira', 'active', 'BASICO') returning id into control;

  for i in 1..3 loop
    comida := (array[gratis,paga,control])[i];
    realizado := leogin_iniciar_prueba_de_plan(
      comida, duenos[i], 'EN_LINEA', 'En línea',
      (select modules from restaurants where id = comida),
      leogin_plan_module_floor('EN_LINEA'), null, '["pickup","delivery"]', 75
    );
    if not realizado or not (
      select not active and trial_ends_at - trial_started_at = interval '336 hours'
      from restaurant_billing where restaurant_id = comida
    ) then raise exception 'No empezó una prueba de 14 días exactos'; end if;
  end loop;

  perform leogin_generate_monthly_invoices();
  if exists (select 1 from invoices where restaurant_id in (gratis,paga,control)) then
    raise exception 'Generó una factura durante la prueba';
  end if;

  select trial_ends_at into cierre from restaurant_billing where restaurant_id = paga;
  begin
    perform leogin_confirmar_prueba_de_plan(paga, persona, 'EN_LINEA', 99, cierre, true);
    raise exception 'Confirmó otro precio';
  exception when sqlstate 'LGP01' then null;
  end;
  if not leogin_confirmar_prueba_de_plan(paga, persona, 'EN_LINEA', 75, cierre, true) then
    raise exception 'No confirmó la prueba';
  end if;
  if leogin_confirmar_prueba_de_plan(paga, persona, 'EN_LINEA', 75, cierre, true) then
    raise exception 'Volvió a registrar la misma autorización';
  end if;
  select trial_ends_at into cierre from restaurant_billing where restaurant_id = control;
  perform leogin_confirmar_prueba_de_plan(control, persona, 'EN_LINEA', 75, cierre, true);
  perform leogin_confirmar_prueba_de_plan(control, persona, 'EN_LINEA', 75, cierre, false);

  insert into products (restaurant_id, name, price) values (gratis, 'Brownie', 10);
  insert into orders (restaurant_id, order_number, customer_name, customer_phone, order_type, status, subtotal, total, created_at)
    values (gratis, 'QA-1', 'Cliente QA', '55551234', 'PICKUP', 'PREP', 36, 36, now()) returning id into comida;
  insert into order_items (order_id, name_snapshot, price_snapshot, quantity, subtotal)
    values (comida, 'Brownie', 1, 6, 6), (comida, 'Torta', 30, 1, 30);
  resumen := leogin_sales_report(gratis, fecha, fecha);
  if (resumen->>'revenue')::numeric <> 36 or (resumen->>'orders')::int <> 1
     or resumen #>> '{topByQuantity,0,name}' is distinct from 'Brownie' then
    raise exception 'El resumen ordenó por ingreso o cambió el total';
  end if;

  update restaurant_billing set trial_ends_at = now() + interval '70 hours', trial_started_at = now() - interval '266 hours'
    where restaurant_id = gratis;
  if not exists (select 1 from leogin_tomar_avisos_de_prueba() where restaurante = gratis and tipo = 'previo') then
    raise exception 'Falta el aviso previo al vencimiento';
  end if;
  if exists (select 1 from leogin_tomar_avisos_de_prueba() where restaurante = gratis and tipo = 'previo') then
    raise exception 'Envió dos veces el mismo aviso durante la reserva';
  end if;

  update restaurant_billing set trial_ends_at = now() - interval '1 minute', trial_started_at = now() - interval '336 hours 1 minute'
    where restaurant_id in (gratis,paga,control);
  begin
    insert into orders (restaurant_id, order_number, customer_name, customer_phone, order_type, subtotal, total)
      values (gratis, 'QA-2', 'Cliente QA', '55551234', 'PICKUP', 10, 10);
    raise exception 'Aceptó otro pedido después del vencimiento';
  exception when sqlstate 'LGP03' then null;
  end;
  fechaVencimiento := ((now() - interval '1 minute') at time zone 'America/Guatemala')::date;
  perform leogin_graduate_trials();
  perform leogin_graduate_trials();
  if (select count(*) from invoices where restaurant_id = paga and due_date = fechaVencimiento and amount = 75) <> 1
     or exists (select 1 from invoices where restaurant_id in (gratis,control)) then
    raise exception 'El vencimiento generó un cobro duplicado o sin autorización';
  end if;
  if (select plan_actual from restaurants where id = gratis) <> 'BASICO'
     or (select plan_actual from restaurants where id = control) <> 'BASICO'
     or (select plan_actual from restaurants where id = paga) <> 'EN_LINEA'
     or not exists (select 1 from products where restaurant_id = gratis)
     or (select status from orders where id = comida) <> 'PREP' then
    raise exception 'El vencimiento quitó datos, alteró un pedido o dejó un plan incorrecto';
  end if;
  if not exists (select 1 from leogin_tomar_avisos_de_prueba() where restaurante = gratis and tipo = 'vence') then
    raise exception 'Falta el aviso de vencimiento';
  end if;
  begin
    perform leogin_iniciar_prueba_de_plan(gratis, persona, 'EN_LINEA', 'En línea', null, null, null, null, 75);
    raise exception 'Permitió reiniciar la prueba';
  exception when sqlstate 'LGP01' then null;
  end;
end;
$$;

rollback;
