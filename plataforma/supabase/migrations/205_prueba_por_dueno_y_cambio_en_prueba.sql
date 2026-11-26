-- 205 · Una prueba por dueño a la vez y cambio de plan durante la prueba
-- Aplicar después de la 204 y antes del código que llama a
-- leogin_cambiar_plan_en_prueba y leogin_motivo_sin_prueba.
--
-- La 203 dejó la prueba por establecimiento sin ningún control por persona:
-- bastaba con crear otro restaurante cada 14 días para no pagar nunca. La
-- regla de aquí es proporcionada (especificación del 25 de noviembre, §6):
--   · cada establecimiento tiene una sola prueba (sigue igual);
--   · un dueño no puede tener dos pruebas en curso a la vez;
--   · si una prueba suya venció o terminó sin contratar, sus restaurantes
--     nuevos ya no llevan prueba. Quien contrató sí puede probar en el
--     siguiente local, que es el caso legítimo de abrir una sucursal.
-- Las pruebas del flujo anterior (sin trial_started_at) no cuentan.

-- ── 1. ¿Puede este dueño empezar una prueba aquí? ──────────────
-- null = sí; 'en_curso' = tiene otra prueba abierta; 'usada' = una prueba
-- anterior terminó sin contratar.
create or replace function public.leogin_motivo_sin_prueba(p_dueno uuid, p_restaurante uuid default null)
returns text
language sql stable security definer set search_path = public
as $$
  select case
    when p_dueno is null then 'usada'
    when exists (
      select 1 from restaurant_billing b
       where b.trial_started_by = p_dueno
         and b.trial_started_at is not null
         and b.trial_finished_at is null
         and b.restaurant_id is distinct from p_restaurante
    ) then 'en_curso'
    when exists (
      select 1 from restaurant_billing b
       where b.trial_started_by = p_dueno
         and b.trial_started_at is not null
         and b.trial_finished_at is not null
         and b.trial_confirmed_at is null
         and b.restaurant_id is distinct from p_restaurante
    ) then 'usada'
    else null
  end;
$$;

-- ── 2. La regla vale por cualquier camino que abra una prueba ──
-- Alta desde Mi cuenta (insert) y prueba desde Suscripción (update). El
-- candado por dueño evita que dos altas simultáneas se salten la regla.
create or replace function public.leogin_validar_prueba_del_dueno()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  motivo text;
begin
  if new.trial_started_at is null then return new; end if;
  if tg_op = 'UPDATE' and old.trial_started_at is not null then return new; end if;
  if new.trial_started_by is null then
    raise exception 'La prueba necesita al dueño que la inicia.' using errcode = 'LGP01';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('leogin_prueba:' || new.trial_started_by::text, 0));
  motivo := leogin_motivo_sin_prueba(new.trial_started_by, new.restaurant_id);
  if motivo = 'en_curso' then
    raise exception 'Ya tienes una prueba en curso en otro restaurante. Puedes contratar este plan directamente.'
      using errcode = 'LGP01';
  elsif motivo = 'usada' then
    raise exception 'Ya usaste tu prueba gratis en otro restaurante. Puedes contratar este plan directamente.'
      using errcode = 'LGP01';
  end if;
  return new;
end;
$$;

drop trigger if exists leogin_validar_prueba_del_dueno on public.restaurant_billing;
create trigger leogin_validar_prueba_del_dueno
before insert or update of trial_started_at on public.restaurant_billing
for each row execute function public.leogin_validar_prueba_del_dueno();

-- ── 3. Cambiar de plan mientras dura la prueba ─────────────────
-- Antes la 198 respondía «Contacta a Leogin». Ahora el dueño puede:
--   · probar otro plan de pago: la prueba sigue con la misma fecha de
--     vencimiento y la contratación confirmada se retira (la confirma de
--     nuevo con el precio del plan nuevo);
--   · volver a Básico: la prueba termina en ese momento, sin cobro.
create or replace function public.leogin_cambiar_plan_en_prueba(
  p_restaurante uuid, p_actor uuid, p_anterior text, p_nuevo text, p_nombre text,
  p_modulos_anteriores jsonb, p_modulos_nuevos jsonb,
  p_modos_anteriores jsonb, p_modos_nuevos jsonb, p_importe numeric
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  local restaurants%rowtype;
  cobro restaurant_billing%rowtype;
  modo_actual jsonb;
  importe numeric;
  hoy date := (now() at time zone 'America/Guatemala')::date;
begin
  if p_nuevo is null or p_nuevo not in ('BASICO','EN_LINEA','ESTANDAR','PREMIUM') then
    raise exception 'Ese plan no está disponible.' using errcode = 'LGP01';
  end if;

  select * into local from restaurants where id = p_restaurante for update;
  if not found then
    raise exception 'Restaurante no encontrado.' using errcode = 'LGP01';
  end if;
  select * into cobro from restaurant_billing where restaurant_id = p_restaurante for update;

  -- Reintento de un cambio ya aplicado.
  if local.plan_actual = p_nuevo then return false; end if;

  if cobro.trial_started_at is null or cobro.trial_finished_at is not null
     or cobro.active or cobro.trial_ends_at <= clock_timestamp() then
    raise exception 'Tu prueba ya terminó. Actualiza la página.' using errcode = 'LGP01';
  end if;
  if local.plan_actual is distinct from p_anterior or local.modules is distinct from p_modulos_anteriores then
    raise exception 'Tu plan o sus funciones cambiaron. Actualiza la página y vuelve a confirmar.' using errcode = 'LGP01';
  end if;

  importe := case when p_nuevo = 'BASICO' then 0
                  else greatest(round(leogin_catalog_plan_fee(p_nuevo), 2), 0) end;
  if importe is distinct from p_importe then
    raise exception 'La mensualidad cambió. Actualiza la página y revisa el nuevo importe.' using errcode = 'LGP01';
  end if;

  -- Misma regla que la 198: solo esperan los pedidos que perderían su modo o su mesa.
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

  if p_nuevo = 'BASICO' then
    update restaurant_billing
       set active = true, monthly_fee = 0, auto_price = true, plan_del_precio = 'BASICO',
           precio_fijado_en = now(), started_at = hoy, billing_day = least(28, extract(day from hoy)::int),
           trial_confirmed_at = null, trial_confirmed_fee = null, trial_finished_at = now(), updated_at = now()
     where restaurant_id = p_restaurante;
  else
    update restaurant_billing
       set monthly_fee = importe, currency = 'GTQ', plan_del_precio = p_nuevo, precio_fijado_en = now(),
           trial_plan = p_nuevo, trial_confirmed_at = null, trial_confirmed_fee = null, updated_at = now()
     where restaurant_id = p_restaurante;
  end if;

  insert into activity_log (restaurant_id, actor_id, action, entity, meta)
    values (p_restaurante, p_actor, 'plan_cambiado_en_prueba', p_nombre,
            jsonb_build_object('antes', p_anterior, 'despues', p_nuevo, 'mensualidad', importe,
                               'prueba_terminada', p_nuevo = 'BASICO'));
  return true;
end;
$$;

-- ── 4. Avisos: no avisar de una prueba que el dueño ya terminó ─
-- Misma función que la 204 con una condición más: una prueba cerrada antes
-- de su vencimiento (vuelta voluntaria a Básico) no recibe recordatorios.
create or replace function public.leogin_tomar_avisos_de_prueba()
returns table (restaurante uuid, tipo text, correo text, nombre text, slug text,
               vence timestamptz, confirmado boolean, reserva timestamptz)
language sql security definer set search_path = public
as $$
  with candidatos as (
    select r.id, r.name, r.slug, u.email, b.trial_ends_at,
           b.trial_confirmed_at is not null as confirmado,
           case when b.trial_ends_at > now() then 'previo' else 'vence' end as tipo
      from restaurant_billing b
      join restaurants r on r.id = b.restaurant_id
      join auth.users u on u.id = b.trial_started_by
     where b.trial_started_at is not null
       and (b.trial_finished_at is null or b.trial_finished_at >= b.trial_ends_at)
       and b.trial_ends_at <= now() + interval '3 days'
       and b.trial_ends_at > now() - interval '24 hours'
       and u.email is not null
  ), nuevos as (
    select c.*
      from candidatos c
      left join prueba_aviso_envios e on e.restaurant_id = c.id and e.tipo = c.tipo
     where e.enviado_en is null and coalesce(e.reservado_hasta, '-infinity'::timestamptz) <= now()
     order by c.trial_ends_at
     limit 6
  ), reservados as (
    insert into prueba_aviso_envios as e (restaurant_id, tipo, reservado_hasta)
      select id, n.tipo, now() + interval '15 minutes' from nuevos n
    on conflict on constraint prueba_aviso_envios_pkey
    do update set reservado_hasta = excluded.reservado_hasta
      where e.enviado_en is null and e.reservado_hasta <= now()
    returning e.restaurant_id, e.tipo, e.reservado_hasta
  )
  select n.id, n.tipo, n.email, n.name, n.slug, n.trial_ends_at, n.confirmado, e.reservado_hasta
    from nuevos n join reservados e on e.restaurant_id = n.id and e.tipo = n.tipo;
$$;

revoke execute on function public.leogin_motivo_sin_prueba(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.leogin_validar_prueba_del_dueno() from public, anon, authenticated;
revoke execute on function public.leogin_cambiar_plan_en_prueba(uuid,uuid,text,text,text,jsonb,jsonb,jsonb,jsonb,numeric)
  from public, anon, authenticated;
revoke execute on function public.leogin_tomar_avisos_de_prueba() from public, anon, authenticated;
grant execute on function public.leogin_motivo_sin_prueba(uuid, uuid) to service_role;
grant execute on function public.leogin_cambiar_plan_en_prueba(uuid,uuid,text,text,text,jsonb,jsonb,jsonb,jsonb,numeric)
  to service_role;
grant execute on function public.leogin_tomar_avisos_de_prueba() to service_role;
