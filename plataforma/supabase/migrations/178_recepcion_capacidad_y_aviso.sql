-- ============================================================
--  178 · Recepción: capacidad, «no asistió» y aviso honesto
--  (auditoría 1.8: R17, R18, O07, X13, PA-T19, PA-T20)
--  ------------------------------------------------------------
--  Plan: docs/planes/PLAN_RECEPCION_2026-11-09.md
--
--    1. Estado NO_SHOW («no asistió» / «no llegó») en reservas y espera:
--       lo que nunca se resolvió ya no desaparece ni se queda esperando.
--    2. Aviso honesto en la lista de espera: abrir WhatsApp sólo anota
--       `aviso_abierto_at`; «avisado» (NOTIFIED) exige que el host lo
--       confirme, y `notified_via` dice cómo.
--    3. Duración de una reserva por restaurante (90 min por defecto).
--    4. `leogin_guardar_reserva`: crea o reprograma una reserva comprobando,
--       bajo un bloqueo por restaurante, cuántas personas habría a la vez en
--       su franja. Si se pasa del aforo y no se fuerza, no escribe nada y
--       devuelve los números; forzar queda en la bitácora.
--
--  ORDEN: aplicar ANTES de desplegar el código de la 1.8, después de la 177.
--  Idempotente.
-- ============================================================
begin;

-- ── 1. Estados ─────────────────────────────────────────────────────────
alter table public.reservations drop constraint if exists reservations_status_check;
alter table public.reservations add constraint reservations_status_check
  check (status in ('PENDING','CONFIRMED','SEATED','COMPLETED','CANCELLED','NO_SHOW'));

alter table public.waitlist_entries drop constraint if exists waitlist_entries_status_check;
alter table public.waitlist_entries add constraint waitlist_entries_status_check
  check (status in ('WAITING','NOTIFIED','SEATED','CANCELLED','NO_SHOW'));

-- ── 2. Aviso honesto ───────────────────────────────────────────────────
alter table public.waitlist_entries
  add column if not exists aviso_abierto_at timestamptz,
  add column if not exists notified_via text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'waitlist_entries_notified_via_check') then
    alter table public.waitlist_entries add constraint waitlist_entries_notified_via_check
      check (notified_via is null or notified_via in ('whatsapp','en_persona'));
  end if;
end;
$$;
comment on column public.waitlist_entries.aviso_abierto_at is
  'Se abrió WhatsApp para avisar (178). No prueba que el mensaje se enviara ni que llegara.';
comment on column public.waitlist_entries.notified_via is
  'Cómo confirmó el host que avisó (178): whatsapp o en_persona. Nunca significa «entregado».';

-- ── 3. Duración de una reserva ─────────────────────────────────────────
alter table public.restaurants
  add column if not exists duracion_reserva_min integer not null default 90;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'restaurants_duracion_reserva_check') then
    alter table public.restaurants add constraint restaurants_duracion_reserva_check
      check (duracion_reserva_min between 30 and 300);
  end if;
end;
$$;

-- ── 4. Personas a la vez en una franja ─────────────────────────────────
-- Máximo de personas simultáneas entre p_hora y p_hora + duración, contando
-- las reservas vivas del día (sin la que se está reprogramando). Una
-- reserva ocupa [hora, hora + duración).
create or replace function public.leogin_ocupacion_reservas(
  p_restaurant uuid, p_fecha date, p_hora time, p_duracion integer, p_excluir uuid
) returns integer
language sql stable security invoker set search_path = '' as $$
  with vivas as (
    select r.time as inicio, r.party_size as pax
      from public.reservations r
     where r.restaurant_id = p_restaurant and r.date = p_fecha
       and r.status in ('PENDING','CONFIRMED','SEATED')
       and (p_excluir is null or r.id <> p_excluir)
       and r.time < p_hora + make_interval(mins => p_duracion)
       and p_hora < r.time + make_interval(mins => p_duracion)
  ), instantes as (
    select p_hora as x
    union
    select inicio from vivas where inicio > p_hora
  )
  select coalesce(max(t.total), 0)::integer
    from instantes i
    cross join lateral (
      select sum(v.pax) as total from vivas v
       where v.inicio <= i.x and i.x < v.inicio + make_interval(mins => p_duracion)
    ) t
$$;

-- ── 5. Guardar o reprogramar con la capacidad comprobada ───────────────
create or replace function public.leogin_guardar_reserva(
  p_restaurant uuid, p_reserva uuid, p_nombre text, p_telefono text, p_personas integer,
  p_fecha date, p_hora time, p_notas text, p_aforo integer, p_forzar boolean, p_actor uuid
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_duracion integer;
  v_ocupadas integer;
  v_estado text;
  v_id uuid;
  v_nombre text := left(btrim(coalesce(p_nombre, '')), 120);
begin
  if p_restaurant is null or p_actor is null or p_fecha is null or p_hora is null
     or p_personas is null or p_personas not between 1 and 100 then
    raise exception 'Datos de la reserva incompletos.' using errcode = '22023';
  end if;

  -- Dos aparatos reservando a la vez en el mismo local se ordenan aquí:
  -- el segundo ve la ocupación que dejó el primero.
  perform pg_advisory_xact_lock(hashtextextended('leogin_reservas:' || p_restaurant::text, 0));

  if p_reserva is not null then
    select status into v_estado from public.reservations
     where id = p_reserva and restaurant_id = p_restaurant for update;
    if v_estado is null then
      raise exception 'Esa reserva ya no existe.' using errcode = 'LGD01';
    end if;
    if v_estado not in ('PENDING','CONFIRMED') then
      raise exception 'Sólo se cambia la hora de una reserva pendiente o confirmada.' using errcode = 'LGD01';
    end if;
  elsif v_nombre = '' then
    raise exception 'Falta el nombre de la reserva.' using errcode = '22023';
  end if;

  select duracion_reserva_min into v_duracion from public.restaurants where id = p_restaurant;
  v_duracion := coalesce(v_duracion, 90);
  v_ocupadas := public.leogin_ocupacion_reservas(p_restaurant, p_fecha, p_hora, v_duracion, p_reserva);

  if p_aforo is not null and v_ocupadas + p_personas > p_aforo and not coalesce(p_forzar, false) then
    return jsonb_build_object('ok', false, 'sobrecupo', true, 'aforo', p_aforo,
      'ocupadas', v_ocupadas, 'libres', greatest(p_aforo - v_ocupadas, 0), 'duracion', v_duracion);
  end if;

  if p_reserva is null then
    insert into public.reservations (restaurant_id, customer_name, customer_phone, party_size, date, time, notes, status)
    values (p_restaurant, v_nombre, nullif(btrim(coalesce(p_telefono, '')), ''), p_personas, p_fecha, p_hora,
            nullif(btrim(coalesce(p_notas, '')), ''), 'PENDING')
    returning id into v_id;
  else
    update public.reservations
       set date = p_fecha, time = p_hora, party_size = p_personas, updated_at = clock_timestamp()
     where id = p_reserva and restaurant_id = p_restaurant;
    v_id := p_reserva;
  end if;

  if p_aforo is not null and v_ocupadas + p_personas > p_aforo then
    insert into public.activity_log (restaurant_id, actor_id, action, entity, meta)
    values (p_restaurant, p_actor, 'reserva_sobrecupo', coalesce(nullif(v_nombre, ''), 'Reserva'),
      jsonb_build_object('reserva', v_id, 'fecha', p_fecha, 'hora', p_hora, 'personas', p_personas,
                         'ocupadas', v_ocupadas, 'aforo', p_aforo));
  end if;

  return jsonb_build_object('ok', true, 'id', v_id,
    'sobrecupo', p_aforo is not null and v_ocupadas + p_personas > p_aforo,
    'ocupadas', v_ocupadas + p_personas, 'aforo', p_aforo, 'duracion', v_duracion);
end;
$$;

revoke all on function public.leogin_ocupacion_reservas(uuid,date,time,integer,uuid),
  public.leogin_guardar_reserva(uuid,uuid,text,text,integer,date,time,text,integer,boolean,uuid)
  from public, anon, authenticated;
grant execute on function public.leogin_ocupacion_reservas(uuid,date,time,integer,uuid),
  public.leogin_guardar_reserva(uuid,uuid,text,text,integer,date,time,text,integer,boolean,uuid)
  to service_role;

commit;
