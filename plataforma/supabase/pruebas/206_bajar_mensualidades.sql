-- Prueba de la 206: baja a la tarifa vigente solo lo automático que quedó
-- por encima. Nunca sube, no toca lo manual ni las facturas. Revierte sus datos.
begin;

do $$
declare
  caro uuid; manual uuid; barato uuid; con_factura uuid;
  hoy date := (now() at time zone 'America/Guatemala')::date;
begin
  insert into restaurants (name, slug, status, plan_actual) values ('QA 206 caro', 'qa-206-caro', 'active', 'PREMIUM') returning id into caro;
  insert into restaurants (name, slug, status, plan_actual) values ('QA 206 manual', 'qa-206-manual', 'active', 'ESTANDAR') returning id into manual;
  insert into restaurants (name, slug, status, plan_actual) values ('QA 206 barato', 'qa-206-barato', 'active', 'EN_LINEA') returning id into barato;
  insert into restaurants (name, slug, status, plan_actual) values ('QA 206 factura', 'qa-206-factura', 'active', 'PREMIUM') returning id into con_factura;

  insert into restaurant_billing (restaurant_id, monthly_fee, currency, billing_day, started_at, active, auto_price, plan_del_precio)
  values (caro, 349, 'GTQ', 1, hoy, true, true, 'PREMIUM'),
         (manual, 349, 'GTQ', 1, hoy, true, false, 'ESTANDAR'),
         (barato, 49, 'GTQ', 1, hoy, true, true, 'EN_LINEA'),
         (con_factura, 349, 'GTQ', 1, hoy, true, true, 'PREMIUM');
  insert into invoices (restaurant_id, concept, description, period, amount, currency, status, due_date)
  values (con_factura, 'MONTHLY', 'Mensualidad', date_trunc('month', hoy)::date, 349, 'GTQ', 'PENDING', hoy);

  if leogin_bajar_a_tarifa_vigente() < 2 then
    raise exception 'No bajó las mensualidades automáticas por encima de la tarifa';
  end if;
  if (select monthly_fee from restaurant_billing where restaurant_id = caro) <> 299
     or (select monthly_fee from restaurant_billing where restaurant_id = con_factura) <> 299 then
    raise exception 'Premium automático no quedó en Q299';
  end if;
  if (select monthly_fee from restaurant_billing where restaurant_id = manual) <> 349 then
    raise exception 'Cambió un precio manual';
  end if;
  if (select monthly_fee from restaurant_billing where restaurant_id = barato) <> 49 then
    raise exception 'Subió una mensualidad acordada por debajo de la tarifa';
  end if;
  if (select amount from invoices where restaurant_id = con_factura) <> 349 then
    raise exception 'Cambió una factura ya emitida';
  end if;
  if not exists (select 1 from activity_log where restaurant_id = caro and action = 'mensualidad_bajada_a_tarifa_vigente') then
    raise exception 'No dejó constancia del cambio';
  end if;
  if exists (
    select 1 from restaurant_billing where restaurant_id in (caro, con_factura) and monthly_fee <> 299
  ) or (select count(*) from activity_log where restaurant_id = caro and action = 'mensualidad_bajada_a_tarifa_vigente') <> 1 then
    raise exception 'Estado inesperado antes del reintento';
  end if;
  perform leogin_bajar_a_tarifa_vigente();
  if (select count(*) from activity_log where restaurant_id = caro and action = 'mensualidad_bajada_a_tarifa_vigente') <> 1 then
    raise exception 'Repetir la bajada volvió a tocar un restaurante ya ajustado';
  end if;
end;
$$;

rollback;
