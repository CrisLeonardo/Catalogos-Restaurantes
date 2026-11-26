-- 198 · Confirmación de cambio de plan en una sola transacción
-- Aplicar después de la 196 y antes del código que usa este RPC.
-- Comprueba el importe confirmado y conserva facturas ya emitidas.

create or replace function public.leogin_confirmar_cambio_de_plan(
  p_restaurante uuid, p_actor uuid, p_anterior text, p_nuevo text, p_nombre text,
  p_modulos_anteriores jsonb, p_modulos_nuevos jsonb,
  p_modos_anteriores jsonb, p_modos_nuevos jsonb, p_importe numeric, p_moneda text
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  local restaurants%rowtype;
  cobro restaurant_billing%rowtype;
  modo_actual jsonb;
  importe numeric;
  moneda text;
begin
  if p_nuevo is null or p_nuevo not in ('BASICO','EN_LINEA','ESTANDAR','PREMIUM') then
    raise exception 'Ese plan no está disponible.' using errcode = 'LGP01';
  end if;

  select * into local from restaurants where id = p_restaurante for update;
  if not found then
    raise exception 'Restaurante no encontrado.' using errcode = 'LGP01';
  end if;
  select * into cobro from restaurant_billing where restaurant_id = p_restaurante for update;

  -- Reintento de una confirmación ya aplicada: conserva su auditoría y precio.
  if local.plan_actual = p_nuevo then
    if cobro.monthly_fee = p_importe and coalesce(cobro.currency, 'GTQ') = p_moneda then
      return false;
    end if;
    raise exception 'Ya tienes ese plan con otra mensualidad.' using errcode = 'LGP01';
  end if;
  if local.plan_actual is distinct from p_anterior or local.modules is distinct from p_modulos_anteriores then
    raise exception 'Tu plan o sus funciones cambiaron. Actualiza la página y vuelve a confirmar.' using errcode = 'LGP01';
  end if;
  if cobro.trial_ends_at is not null and cobro.active = false then
    raise exception 'Contacta a Leogin para cambiar de plan mientras tienes una prueba.' using errcode = 'LGP01';
  end if;

  importe := case
    when p_nuevo = 'BASICO' then 0
    when cobro.auto_price = false then cobro.monthly_fee
    else greatest(round(leogin_catalog_plan_fee(p_nuevo), 2), 0)
  end;
  moneda := case when p_nuevo = 'BASICO' or cobro.auto_price is distinct from false
                then 'GTQ' else cobro.currency end;
  if importe is distinct from p_importe or moneda is distinct from p_moneda then
    raise exception 'La mensualidad cambió. Actualiza la página y revisa el nuevo importe.' using errcode = 'LGP01';
  end if;

  -- Solo espera los pedidos que perderían su modo o su flujo de atención.
  if exists (
    select 1 from orders
    where restaurant_id = p_restaurante and status not in ('DELIVERED','CANCEL')
      and (
        p_nuevo = 'BASICO'
        or (p_nuevo = 'EN_LINEA' and order_type = 'DINE_IN')
        or (p_nuevo = 'ESTANDAR' and p_anterior in ('PREMIUM','PRO') and table_number is not null)
      )
  ) then
    raise exception 'Completa o anula tus pedidos abiertos antes de bajar de plan.' using errcode = 'LGP01';
  end if;

  select config->'orderTypes' into modo_actual from restaurant_themes
  where restaurant_id = p_restaurante for update;
  if modo_actual is distinct from p_modos_anteriores then
    raise exception 'Tus modalidades de pedido cambiaron. Actualiza la página y vuelve a confirmar.' using errcode = 'LGP01';
  end if;

  update restaurants set plan_actual = p_nuevo, modules = p_modulos_nuevos where id = p_restaurante;

  if p_modos_nuevos is distinct from modo_actual then
    insert into restaurant_themes (restaurant_id, config)
      values (p_restaurante, jsonb_build_object('orderTypes', p_modos_nuevos))
    on conflict (restaurant_id) do update
      set config = coalesce(restaurant_themes.config, '{}'::jsonb) || excluded.config;
  end if;

  insert into restaurant_billing (restaurant_id, monthly_fee, currency, billing_day, started_at,
                                  plan_del_precio, precio_fijado_en)
    values (p_restaurante, importe, moneda,
            least(28, extract(day from now() at time zone 'America/Guatemala')::int),
            (now() at time zone 'America/Guatemala')::date, p_nuevo, now())
  on conflict (restaurant_id) do update
    set monthly_fee = excluded.monthly_fee, currency = excluded.currency, plan_del_precio = excluded.plan_del_precio,
        precio_fijado_en = excluded.precio_fijado_en, updated_at = now(),
        auto_price = case when p_nuevo = 'BASICO' then true else restaurant_billing.auto_price end;

  insert into activity_log (restaurant_id, actor_id, action, entity, meta)
    values (p_restaurante, p_actor, 'plan_cambiado', p_nombre,
            jsonb_build_object('antes', p_anterior, 'despues', p_nuevo, 'mensualidad', importe, 'moneda', moneda));

  return true;
end;
$$;

revoke execute on function public.leogin_confirmar_cambio_de_plan(uuid,uuid,text,text,text,jsonb,jsonb,jsonb,jsonb,numeric,text)
  from public, anon, authenticated;
grant execute on function public.leogin_confirmar_cambio_de_plan(uuid,uuid,text,text,text,jsonb,jsonb,jsonb,jsonb,numeric,text)
  to service_role;
