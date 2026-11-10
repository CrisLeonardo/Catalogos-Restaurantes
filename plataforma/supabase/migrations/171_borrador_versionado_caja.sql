-- 171 · Borrador versionado de Caja. Aplicar después de la 170, antes del código.
begin;

create table public.caja_borradores (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  period_start timestamptz not null,
  revision uuid not null default gen_random_uuid(),
  shift_id uuid,
  saved_at timestamptz not null default clock_timestamp(),
  actor_id uuid not null,
  actor_name text,
  payload jsonb not null,
  primary key (restaurant_id,period_start)
);
alter table public.caja_borradores enable row level security;
revoke all on public.caja_borradores from public,anon,authenticated,service_role;
grant select,insert,update on public.caja_borradores to service_role;
create policy super_admin_segundo_factor on public.caja_borradores
  as restrictive for all to authenticated
  using ((select public.leogin_sesion_con_segundo_factor()))
  with check ((select public.leogin_sesion_con_segundo_factor()));

create function public.leogin_guardar_borrador_caja(
  p_restaurant uuid,p_periodo timestamptz,p_turno uuid,p_revision uuid,p_corte uuid,
  p_actor uuid,p_nombre text,p_payload jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_ctx jsonb; v_turno uuid; v_previo public.caja_borradores%rowtype; v_nuevo public.caja_borradores%rowtype;
begin
  if p_restaurant is null or p_actor is null or p_periodo is null
      or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Borrador de caja inválido.' using errcode='22023';
  end if;
  v_ctx := public.leogin_contexto_caja(p_restaurant,false);
  select id into v_turno from public.cash_counts where restaurant_id=p_restaurant and status in ('OPEN','DRAFT');
  if p_turno is distinct from v_turno or p_corte is distinct from (v_ctx->>'ultimoCierreId')::uuid then
    raise exception 'El turno cambió. Abre Caja de nuevo para revisar el conteo.' using errcode='LGD04';
  end if;
  select * into v_previo from public.caja_borradores where restaurant_id=p_restaurant and period_start=p_periodo;
  if p_revision is distinct from v_previo.revision then
    if v_previo.actor_id=p_actor and v_previo.shift_id is not distinct from p_turno and v_previo.payload=p_payload then
      return jsonb_build_object('revision',v_previo.revision,'savedAt',v_previo.saved_at);
    end if;
    raise exception 'Otro aparato guardó un borrador más reciente.' using errcode='LGD05';
  end if;
  insert into public.caja_borradores as b(restaurant_id,period_start,shift_id,actor_id,actor_name,payload)
    values(p_restaurant,p_periodo,p_turno,p_actor,p_nombre,p_payload)
    on conflict (restaurant_id,period_start) do update set revision=excluded.revision,shift_id=excluded.shift_id,
      saved_at=excluded.saved_at,actor_id=excluded.actor_id,actor_name=excluded.actor_name,payload=excluded.payload
    returning b.* into v_nuevo;
  -- Invalida los cierres que se leyeron antes de este guardado.
  perform public.leogin_contexto_caja(p_restaurant,true);
  return jsonb_build_object('revision',v_nuevo.revision,'savedAt',v_nuevo.saved_at);
end $$;

revoke all on function public.leogin_guardar_borrador_caja(uuid,timestamptz,uuid,uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.leogin_guardar_borrador_caja(uuid,timestamptz,uuid,uuid,uuid,uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
