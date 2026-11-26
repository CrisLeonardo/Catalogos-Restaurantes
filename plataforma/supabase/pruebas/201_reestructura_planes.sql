-- Ejecutar con psql después de las migraciones 196–201 en una base local.
-- Todas las filas de prueba se descartan al terminar.
begin;

do $$
declare
  en_linea uuid;
  estandar uuid;
  producto uuid;
  cup uuid;
  factura uuid;
  modulos jsonb;
  aplicado boolean;
begin
  insert into restaurants (name, slug, status, plan_actual)
    values ('Prueba En línea', 'qa-plan-linea', 'active', 'EN_LINEA') returning id into en_linea;
  insert into restaurants (name, slug, status, plan_actual)
    values ('Prueba Estándar', 'qa-plan-estandar', 'active', 'ESTANDAR') returning id into estandar;

  if leogin_compute_monthly_fee(en_linea) <> 75
     or leogin_compute_monthly_fee(estandar) <> 149
     or leogin_catalog_plan_fee('PREMIUM') <> 299
     or leogin_catalog_plan_fee('BASICO') <> 0 then
    raise exception 'Tarifa mensual incorrecta';
  end if;
  if not (select modules @> '{"cupones":true,"inventario":true}'::jsonb from restaurants where id = estandar)
     or (select modules @> '{"recetas":true}'::jsonb from restaurants where id = estandar) then
    raise exception 'Piso de Estándar incorrecto';
  end if;

  insert into restaurant_billing (restaurant_id, monthly_fee, auto_price, plan_del_precio)
    values (en_linea, 99, true, 'EN_LINEA');
  insert into invoices (restaurant_id, concept, amount, period, status)
    values (en_linea, 'MONTHLY', 99, '2026-11-01', 'PAID') returning id into factura;
  if leogin_apply_auto_price(en_linea) <> 99 then
    raise exception 'Cambió una mensualidad acordada';
  end if;

  insert into coupons (restaurant_id, code, discount_type, discount_value)
    values (en_linea, 'QA75', 'PERCENT', 10) returning id into cup;
  begin
    update coupons set max_uses = 3 where id = cup;
    raise exception 'En línea permitió configurar un cupón avanzado';
  exception when check_violation then null;
  end;
  update coupons set uses = 1 where id = cup;
  update restaurants set module_settings = '{"cupones":{"enabled":false}}' where id = en_linea;
  begin
    update coupons set uses = 2 where id = cup;
    raise exception 'Se aplicó un cupón apagado';
  exception when sqlstate 'LGC01' then null;
  end;
  update coupons set uses = 0 where id = cup;

  insert into products (restaurant_id, name, price, is_active)
    select en_linea, 'QA ' || n, 1, true from generate_series(1, 150) as n;
  insert into products (restaurant_id, name, price, is_active)
    values (en_linea, 'QA oculto', 1, false) returning id into producto;
  begin
    update products set is_active = true where id = producto;
    raise exception 'Publicó el platillo 151';
  exception when sqlstate 'LGD02' then null;
  end;
  update products set is_active = false where restaurant_id = en_linea and name = 'QA 150';
  update products set is_active = true where id = producto;

  insert into print_stations (restaurant_id, name, is_default) values (estandar, 'Cocina', true);
  begin
    insert into print_stations (restaurant_id, name) values (estandar, 'Barra');
    raise exception 'Estándar agregó una segunda estación';
  exception when sqlstate 'LGP02' then null;
  end;

  select r.modules into modulos from restaurants r where r.id = en_linea;
  begin
    perform leogin_confirmar_cambio_de_plan(en_linea, null, 'EN_LINEA', 'ESTANDAR', 'Estándar',
      modulos, '{"finanzas":true,"inventario":true}', null, '["pickup","delivery","dine_in"]', 199, 'GTQ');
    raise exception 'Aceptó un precio vencido';
  exception when sqlstate 'LGP01' then null;
  end;
  if (select plan_actual from restaurants where id = en_linea) <> 'EN_LINEA' then
    raise exception 'El intento fallido dejó un cambio parcial';
  end if;
  aplicado := leogin_confirmar_cambio_de_plan(en_linea, null, 'EN_LINEA', 'ESTANDAR', 'Estándar',
    modulos, '{"finanzas":true,"inventario":true}', null, '["pickup","delivery","dine_in"]', 149, 'GTQ');
  if not aplicado or (select monthly_fee from restaurant_billing where restaurant_id = en_linea) <> 149
     or (select config->'orderTypes' from restaurant_themes where restaurant_id = en_linea)
         is distinct from '["pickup","delivery","dine_in"]'::jsonb
     or (select amount from invoices where id = factura) <> 99 then
    raise exception 'El cambio no preservó el contrato y la factura';
  end if;
  aplicado := leogin_confirmar_cambio_de_plan(en_linea, null, 'EN_LINEA', 'ESTANDAR', 'Estándar',
    modulos, '{"finanzas":true,"inventario":true}', null, '["pickup","delivery","dine_in"]', 149, 'GTQ');
  if aplicado or (select count(*) from activity_log where restaurant_id = en_linea and action = 'plan_cambiado') <> 1 then
    raise exception 'El reintento duplicó el cambio o la bitácora';
  end if;
end $$;

rollback;
