-- 170 · Identidad del cierre y recibo durable (primera entrega de 1.2).
-- Aplicar después de la 169 y antes del código. Los cortes anteriores se conservan.
begin;

create table public.caja_recibos (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  intento_id uuid not null,
  corte_id uuid not null unique references public.cash_counts(id) on delete cascade,
  actor_id uuid not null,
  solicitud jsonb not null,
  recibo jsonb not null,
  primary key (restaurant_id, intento_id)
);
alter table public.caja_recibos enable row level security;
revoke all on public.caja_recibos from public,anon,authenticated,service_role;
grant select,insert on public.caja_recibos to service_role;
create policy super_admin_segundo_factor on public.caja_recibos
  as restrictive for all to authenticated
  using ((select public.leogin_sesion_con_segundo_factor()))
  with check ((select public.leogin_sesion_con_segundo_factor()));

create function public.leogin_recuperar_cierre_caja(
  p_restaurant uuid,p_intento uuid,p_actor uuid,p_solicitud jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_previo public.caja_recibos%rowtype;
begin
  if p_restaurant is null or p_intento is null or p_actor is null
      or jsonb_typeof(p_solicitud) is distinct from 'object' then
    raise exception 'Identidad de cierre inválida.' using errcode='22023';
  end if;
  select * into v_previo from public.caja_recibos where restaurant_id=p_restaurant and intento_id=p_intento;
  if not found then return null; end if;
  if v_previo.actor_id<>p_actor or v_previo.solicitud<>p_solicitud then
    raise exception 'Este intento ya corresponde a otro cierre de caja.' using errcode='LGD03';
  end if;
  return v_previo.recibo;
end $$;

create function public.leogin_confirmar_cierre_caja_con_recibo(
  p_restaurant uuid,p_revision bigint,p_ultimo uuid,p_hasta timestamptz,p_abierto uuid,
  p_fila jsonb,p_gastos uuid[],p_actor uuid,p_intento uuid,p_solicitud jsonb,p_recibo jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_recibo jsonb; v_id uuid;
begin
  -- La identidad se toma antes de los bloqueos existentes de turno, gastos y caja.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('intento-caja/'||p_restaurant::text||'/'||p_intento::text,0));
  v_recibo := public.leogin_recuperar_cierre_caja(p_restaurant,p_intento,p_actor,p_solicitud);
  if v_recibo is not null then
    return jsonb_build_object('recibo',v_recibo,'repetido',true);
  end if;
  if jsonb_typeof(p_recibo) is distinct from 'object' then
    raise exception 'Recibo de caja inválido.' using errcode='22023';
  end if;
  v_id := public.leogin_confirmar_cierre_caja(
    p_restaurant,p_revision,p_ultimo,p_hasta,p_abierto,p_fila,p_gastos,p_actor);
  v_recibo := p_recibo || jsonb_build_object('id',v_id);
  insert into public.caja_recibos(restaurant_id,intento_id,corte_id,actor_id,solicitud,recibo)
    values(p_restaurant,p_intento,v_id,p_actor,p_solicitud,v_recibo);
  return jsonb_build_object('recibo',v_recibo,'repetido',false);
end $$;

revoke all on function public.leogin_recuperar_cierre_caja(uuid,uuid,uuid,jsonb),
  public.leogin_confirmar_cierre_caja_con_recibo(uuid,bigint,uuid,timestamptz,uuid,jsonb,uuid[],uuid,uuid,jsonb,jsonb)
  from public,anon,authenticated;
grant execute on function public.leogin_recuperar_cierre_caja(uuid,uuid,uuid,jsonb),
  public.leogin_confirmar_cierre_caja_con_recibo(uuid,bigint,uuid,timestamptz,uuid,jsonb,uuid[],uuid,uuid,jsonb,jsonb)
  to service_role;
notify pgrst,'reload schema';
commit;
