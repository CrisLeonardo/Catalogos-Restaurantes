-- 203 · Prueba voluntaria de 14 días por establecimiento.
-- Aplicar antes del código. Las pruebas ya creadas conservan su flujo.
alter table public.restaurant_billing
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_started_by uuid references auth.users(id) on delete set null,
  add column if not exists trial_plan text,
  add column if not exists trial_confirmed_at timestamptz,
  add column if not exists trial_confirmed_fee numeric(10,2),
  add column if not exists trial_finished_at timestamptz;

create index if not exists restaurant_billing_pruebas_por_vencer
  on public.restaurant_billing (trial_ends_at)
  where trial_started_at is not null and trial_finished_at is null;

insert into public.platform_settings(key, value) values ('prueba_voluntaria_activa','1')
on conflict (key) do nothing;

create or replace function public.leogin_iniciar_prueba_de_plan(
  p_restaurante uuid, p_actor uuid, p_nuevo text, p_nombre text,
  p_modulos_anteriores jsonb, p_modulos_nuevos jsonb,
  p_modos_anteriores jsonb, p_modos_nuevos jsonb, p_importe numeric
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  cobro restaurant_billing%rowtype;
  inicio timestamptz := clock_timestamp();
begin
  perform 1 from restaurants where id = p_restaurante for update;
  select * into cobro from restaurant_billing where restaurant_id = p_restaurante for update;
  if cobro.trial_started_at is not null or cobro.trial_ends_at is not null then
    raise exception 'Este restaurante ya usó su prueba.' using errcode = 'LGP01';
  end if;
  if p_nuevo is null or p_nuevo not in ('EN_LINEA','ESTANDAR','PREMIUM')
     or leogin_setting_num('prueba_voluntaria_activa', 0) <> 1 then
    raise exception 'La prueba no está disponible.' using errcode = 'LGP01';
  end if;
  if not leogin_confirmar_cambio_de_plan(p_restaurante, p_actor, 'BASICO', p_nuevo, p_nombre,
      p_modulos_anteriores, p_modulos_nuevos, p_modos_anteriores, p_modos_nuevos, p_importe, 'GTQ') then
    raise exception 'El plan de este restaurante cambió. Actualiza la página.' using errcode = 'LGP01';
  end if;
  update restaurant_billing
     set active = false, trial_started_at = inicio, trial_started_by = p_actor,
         trial_ends_at = inicio + interval '336 hours', trial_plan = p_nuevo, updated_at = inicio
   where restaurant_id = p_restaurante;
  return true;
end;
$$;

create or replace function public.leogin_confirmar_prueba_de_plan(
  p_restaurante uuid, p_actor uuid, p_plan text, p_importe numeric, p_vencimiento timestamptz, p_acepta boolean
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  cobro restaurant_billing%rowtype;
  plan text;
begin
  select plan_actual into plan from restaurants where id = p_restaurante for update;
  select * into cobro from restaurant_billing where restaurant_id = p_restaurante for update;
  if cobro.trial_plan is distinct from p_plan or plan is distinct from p_plan
      or cobro.trial_ends_at is distinct from p_vencimiento then
    raise exception 'Tu prueba cambió. Actualiza la página y revisa la mensualidad.' using errcode = 'LGP01';
  end if;
  if p_acepta and cobro.trial_confirmed_at is not null and cobro.trial_confirmed_fee = p_importe then
    return false;
  end if;
  if cobro.trial_started_at is null or cobro.trial_finished_at is not null
     or cobro.active or cobro.trial_ends_at <= clock_timestamp() then
    raise exception 'La prueba ya terminó.' using errcode = 'LGP01';
  end if;
  if p_acepta is false then
    if cobro.trial_confirmed_at is null then return false; end if;
    update restaurant_billing
       set trial_confirmed_at = null, trial_confirmed_fee = null, updated_at = now()
     where restaurant_id = p_restaurante;
    insert into activity_log (restaurant_id, actor_id, action, entity)
      values (p_restaurante, p_actor, 'contratacion_retirada_en_prueba', p_plan);
    return true;
  end if;
  if p_acepta is distinct from true or p_importe is distinct from cobro.monthly_fee or cobro.currency <> 'GTQ' then
    raise exception 'La mensualidad cambió. Actualiza la página antes de confirmar.' using errcode = 'LGP01';
  end if;
  update restaurant_billing
     set trial_confirmed_at = now(), trial_confirmed_fee = p_importe, updated_at = now()
   where restaurant_id = p_restaurante;
  insert into activity_log (restaurant_id, actor_id, action, entity, meta)
    values (p_restaurante, p_actor, 'contratacion_tras_prueba', p_plan,
      jsonb_build_object('mensualidad', p_importe, 'moneda', 'GTQ', 'desde', p_vencimiento));
  return true;
end;
$$;

create or replace function public.leogin_cerrar_pruebas_voluntarias()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  pendiente record;
  local restaurants%rowtype;
  cobro restaurant_billing%rowtype;
  fecha date;
  resueltas int := 0;
begin
  for pendiente in
    select restaurant_id from restaurant_billing
    where trial_started_at is not null and trial_finished_at is null and trial_ends_at <= now()
    order by trial_ends_at limit 100
  loop
    select * into local from restaurants where id = pendiente.restaurant_id for update skip locked;
    if not found then continue; end if;
    select * into cobro from restaurant_billing where restaurant_id = local.id for update;
    if cobro.trial_finished_at is not null then continue; end if;
    fecha := (cobro.trial_ends_at at time zone 'America/Guatemala')::date;

    if cobro.trial_confirmed_at is not null and cobro.trial_confirmed_fee is not null
       and local.plan_actual = cobro.trial_plan then
      -- La primera factura vence el día acordado, incluso el 29, 30 o 31.
      -- Las siguientes usan el día recurrente que admite el motor actual.
      if cobro.trial_confirmed_fee > 0 then
        insert into invoices (restaurant_id, concept, description, period, amount, currency, status, due_date)
        values (local.id, 'MONTHLY', 'Primera mensualidad después de la prueba',
                date_trunc('month', fecha)::date, cobro.trial_confirmed_fee, 'GTQ', 'PENDING', fecha)
        on conflict do nothing;
      end if;
      update restaurant_billing
         set active = true, monthly_fee = cobro.trial_confirmed_fee, plan_del_precio = cobro.trial_plan,
             precio_fijado_en = cobro.trial_confirmed_at, started_at = fecha,
             billing_day = least(28, extract(day from fecha)::int), trial_finished_at = now(), updated_at = now()
       where restaurant_id = local.id;
    else
      update restaurants
         set plan_actual = 'BASICO',
             modules = (coalesce(modules, '{}'::jsonb) - array[
               'orders','whatsapp_notify','finanzas','analitica','inventario','personal','cupones',
               'llamada_mesero','encuestas','loyalty','recetas','reservaciones','lista_espera'
             ]) || leogin_plan_module_floor('BASICO')
       where id = local.id;
      update restaurant_billing
         set active = true, monthly_fee = 0, auto_price = true, plan_del_precio = 'BASICO',
             precio_fijado_en = now(), trial_finished_at = now(), updated_at = now()
       where restaurant_id = local.id;
    end if;
    insert into activity_log (restaurant_id, action, entity, meta)
      values (local.id, 'prueba_terminada', cobro.trial_plan,
              jsonb_build_object('contratada', cobro.trial_confirmed_at is not null and local.plan_actual = cobro.trial_plan));
    resueltas := resueltas + 1;
  end loop;
  return resueltas;
end;
$$;

create or replace function public.leogin_graduate_trials()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  nuevos int := leogin_cerrar_pruebas_voluntarias();
  anteriores int;
  hoy date := (now() at time zone 'America/Guatemala')::date;
begin
  update restaurant_billing
     set active = true, started_at = hoy, billing_day = least(28, extract(day from hoy)::int), updated_at = now()
   where active = false and trial_ends_at <= now() and trial_started_at is null;
  get diagnostics anteriores = row_count;
  return nuevos + anteriores;
end;
$$;

-- Cierra nuevas ventas aunque el reloj aún no haya actualizado el plan.
-- Las actualizaciones de pedidos ya aceptados conservan su vía normal.
create or replace function public.leogin_pedido_durante_prueba()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if exists (
    select 1 from restaurant_billing b
    join restaurants r on r.id = b.restaurant_id
    where r.id = new.restaurant_id and b.trial_started_at is not null
      and b.trial_ends_at <= clock_timestamp()
      and ((b.trial_finished_at is null and b.trial_confirmed_at is null) or r.plan_actual = 'BASICO')
  ) then
    raise exception 'La prueba del restaurante terminó. Su carta sigue disponible.' using errcode = 'LGP03';
  end if;
  return new;
end;
$$;

drop trigger if exists leogin_pedido_durante_prueba on public.orders;
create trigger leogin_pedido_durante_prueba
before insert on public.orders for each row execute function public.leogin_pedido_durante_prueba();

revoke execute on function public.leogin_iniciar_prueba_de_plan(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,numeric) from public, anon, authenticated;
revoke execute on function public.leogin_confirmar_prueba_de_plan(uuid,uuid,text,numeric,timestamptz,boolean) from public, anon, authenticated;
revoke execute on function public.leogin_cerrar_pruebas_voluntarias() from public, anon, authenticated;
revoke execute on function public.leogin_pedido_durante_prueba() from public, anon, authenticated;
grant execute on function public.leogin_iniciar_prueba_de_plan(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,numeric) to service_role;
grant execute on function public.leogin_confirmar_prueba_de_plan(uuid,uuid,text,numeric,timestamptz,boolean) to service_role;
grant execute on function public.leogin_cerrar_pruebas_voluntarias() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('leogin-cerrar-pruebas-voluntarias', '* * * * *', 'select public.leogin_cerrar_pruebas_voluntarias();');
  end if;
end;
$$;
