-- 166 · Registro durable y cierre de caja contra una revisión consistente (0.18).
-- Aplicar DESPUÉS de 165 y ANTES del código. Sin backfill de dinero/cortes.
begin;
create table public.caja_control (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  revision bigint not null default 0,
  marca timestamptz not null default clock_timestamp(),
  ultima_escritura timestamptz not null default '-infinity'
);
alter table public.caja_control enable row level security;
create policy super_admin_segundo_factor on public.caja_control as restrictive for all to authenticated
  using ((select public.leogin_sesion_con_segundo_factor()))
  with check ((select public.leogin_sesion_con_segundo_factor()));
revoke all on public.caja_control from public,anon,authenticated,service_role;
grant select,insert,update on public.caja_control to service_role;

alter table public.order_payments add column caja_registrado_en timestamptz,
  add column caja_corte_previo uuid references public.cash_counts(id);
alter table public.orders add column caja_registrado_en timestamptz,
  add column caja_corte_previo uuid references public.cash_counts(id);
alter table public.cash_expenses add column caja_registrado_en timestamptz;
alter table public.cash_counts add column caja_revision bigint,
  add column caja_corte_previo uuid references public.cash_counts(id);
create index order_payments_registro_caja_idx on public.order_payments(restaurant_id,caja_registrado_en) where caja_registrado_en is not null;
create index orders_registro_caja_idx on public.orders(restaurant_id,caja_registrado_en) where caja_registrado_en is not null;
comment on column public.order_payments.caja_registrado_en is
  'Registro bajo bloqueo de caja; conserva created_at original. NULL en historia e inserciones explícitamente fechadas, que conservan la ventana legada.';

create function public.leogin_contexto_caja(p_restaurant uuid,p_cambio boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_control public.caja_control%rowtype; v_cierre record; v_marca timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('caja/'||p_restaurant::text,0));
  insert into public.caja_control(restaurant_id) values(p_restaurant) on conflict do nothing;
  select * into v_control from public.caja_control where restaurant_id=p_restaurant for update;
  select id,closed_at into v_cierre from public.cash_counts where restaurant_id=p_restaurant and status='CLOSED'
    order by closed_at desc nulls last,id limit 1;
  v_marca := greatest(clock_timestamp(),v_control.marca+interval '1 microsecond',v_cierre.closed_at+interval '1 microsecond');
  update public.caja_control set marca=v_marca,revision=revision+case when p_cambio then 1 else 0 end,
    ultima_escritura=case when p_cambio then v_marca else ultima_escritura end
    where restaurant_id=p_restaurant returning * into v_control;
  return jsonb_build_object('revision',v_control.revision,'hasta',v_marca,'ultimaEscritura',v_control.ultima_escritura,
    'ultimoCierreId',v_cierre.id,'ultimoCierreEn',v_cierre.closed_at);
end $$;

-- DEFINER solo para disparadores: también las escrituras permitidas por RLS
-- con sesión deben invalidar la lectura. No concede acceso a caja_control.
create function public.leogin_registrar_cambio_caja()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_rest uuid; v_ctx jsonb;
begin
  v_rest := case when tg_op='DELETE' then old.restaurant_id else new.restaurant_id end;
  -- El borrado en cascada del restaurante no crea de nuevo su control.
  if not exists(select 1 from public.restaurants where id=v_rest) then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if tg_op='UPDATE' and old.restaurant_id is distinct from new.restaurant_id then
    raise exception 'No se puede trasladar un movimiento de caja a otro restaurante.' using errcode='22023';
  end if;
  v_ctx := public.leogin_contexto_caja(v_rest,true);
  if tg_op='INSERT' and tg_table_name='order_payments' then
    -- Los flujos operativos usan el default now(). La síntesis/importación
    -- explícitamente fechada conserva su historia y no se vuelve dinero actual.
    if new.created_at=transaction_timestamp() then
      new.caja_registrado_en := (v_ctx->>'hasta')::timestamptz;
      new.caja_corte_previo := (v_ctx->>'ultimoCierreId')::uuid;
    else new.caja_registrado_en := null; new.caja_corte_previo := null; end if;
  elsif tg_table_name='orders' and tg_op<>'DELETE' then
    if new.status='DELIVERED' and (tg_op='INSERT' or old.status is distinct from 'DELIVERED') then
      new.caja_registrado_en := (v_ctx->>'hasta')::timestamptz;
      new.caja_corte_previo := (v_ctx->>'ultimoCierreId')::uuid;
    end if;
  elsif tg_table_name='cash_expenses' and tg_op='INSERT' then
    if new.created_at=transaction_timestamp() then new.caja_registrado_en := (v_ctx->>'hasta')::timestamptz; end if;
  elsif tg_table_name='cash_counts' and tg_op<>'DELETE' then
    if new.status='CLOSED' and (tg_op='INSERT' or old.status is distinct from 'CLOSED') then
      new.caja_revision := (v_ctx->>'revision')::bigint;
      new.caja_corte_previo := (v_ctx->>'ultimoCierreId')::uuid;
    end if;
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
create trigger registro_caja_pago before insert or update or delete on public.order_payments for each row execute function public.leogin_registrar_cambio_caja();
create trigger registro_caja_pedido before insert or update or delete on public.orders for each row execute function public.leogin_registrar_cambio_caja();
create trigger registro_caja_gasto before insert or update or delete on public.cash_expenses for each row execute function public.leogin_registrar_cambio_caja();
create trigger registro_caja_turno before insert or update or delete on public.cash_counts for each row execute function public.leogin_registrar_cambio_caja();

create function public.leogin_leer_periodo_caja(p_restaurant uuid,p_desde timestamptz,p_gestion_desde timestamptz,p_hasta timestamptz)
returns jsonb language sql security invoker set search_path='' as $$
  select jsonb_build_object(
    'pagos',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from public.order_payments p
      where p.restaurant_id=p_restaurant and (
        (p.caja_registrado_en is null and p.created_at>p_desde and p.created_at<=p_hasta)
        or (p.caja_registrado_en>coalesce(p_gestion_desde,'-infinity') and p.caja_registrado_en<=p_hasta))),
    'entregados',(select coalesce(jsonb_agg(o.id order by o.id),'[]') from public.orders o
      where o.restaurant_id=p_restaurant and o.status='DELIVERED' and (
        (o.caja_registrado_en is null and o.delivered_at>p_desde and o.delivered_at<=p_hasta)
        or (o.caja_registrado_en>coalesce(p_gestion_desde,'-infinity') and o.caja_registrado_en<=p_hasta))),
    'gastos',(select coalesce(jsonb_agg(to_jsonb(g) order by g.id),'[]') from public.cash_expenses g
      where g.restaurant_id=p_restaurant and g.cash_count_id is null and (
        (g.caja_registrado_en is null and g.created_at>p_desde and g.created_at<=p_hasta)
        or (g.caja_registrado_en is not null and g.caja_registrado_en<=p_hasta))))
$$;

create function public.leogin_confirmar_cierre_caja(p_restaurant uuid,p_revision bigint,p_ultimo uuid,p_hasta timestamptz,
  p_abierto uuid,p_fila jsonb,p_gastos uuid[],p_actor uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_ctx jsonb; v_fila public.cash_counts%rowtype; v_id uuid;
begin
  -- Mismo orden que un editor de borrador/gasto: fila antes del bloqueo de caja.
  perform id from public.cash_counts where restaurant_id=p_restaurant and id=p_abierto for update;
  perform id from public.cash_expenses where restaurant_id=p_restaurant and id=any(p_gastos) order by id for update;
  v_ctx := public.leogin_contexto_caja(p_restaurant,false);
  if p_hasta is null or p_revision is distinct from (v_ctx->>'revision')::bigint
      or p_ultimo is distinct from (v_ctx->>'ultimoCierreId')::uuid
      or p_hasta<(v_ctx->>'ultimaEscritura')::timestamptz or p_hasta>(v_ctx->>'hasta')::timestamptz then
    raise exception 'La caja cambió desde la lectura. Revisa el cuadre y vuelve a cerrar; no se guardó ningún corte.' using errcode='LGD04';
  end if;
  select * into v_fila from jsonb_populate_record(null::public.cash_counts,p_fila);
  if p_actor is null or v_fila.status is distinct from 'CLOSED' or v_fila.closed_at is distinct from p_hasta
      or v_fila.period_start is null or v_fila.period_start>p_hasta then
    raise exception 'Cierre de caja inválido.' using errcode='22023';
  end if;
  if p_abierto is null then
    if exists(select 1 from public.cash_counts where restaurant_id=p_restaurant and status in('OPEN','DRAFT')) then
      raise exception 'El turno cambió desde otro aparato.' using errcode='LGD04';
    end if;
    insert into public.cash_counts(restaurant_id,business_date,opening_float,expected_cash,counted_cash,difference,by_method,
      denomination_breakdown,shift_label,cashier_name,notes,status,expenses_total,tips_total,tips_distribution,
      period_start,closed_at,created_by)
    values(p_restaurant,v_fila.business_date,v_fila.opening_float,v_fila.expected_cash,v_fila.counted_cash,v_fila.difference,v_fila.by_method,
      v_fila.denomination_breakdown,v_fila.shift_label,v_fila.cashier_name,v_fila.notes,'CLOSED',v_fila.expenses_total,
      v_fila.tips_total,v_fila.tips_distribution,v_fila.period_start,p_hasta,p_actor) returning id into v_id;
  else
    update public.cash_counts set business_date=v_fila.business_date,opening_float=v_fila.opening_float,
      expected_cash=v_fila.expected_cash,counted_cash=v_fila.counted_cash,difference=v_fila.difference,by_method=v_fila.by_method,
      denomination_breakdown=v_fila.denomination_breakdown,shift_label=v_fila.shift_label,cashier_name=v_fila.cashier_name,
      notes=v_fila.notes,status='CLOSED',expenses_total=v_fila.expenses_total,tips_total=v_fila.tips_total,
      tips_distribution=v_fila.tips_distribution,period_start=v_fila.period_start,closed_at=p_hasta,draft_saved_at=null
      where restaurant_id=p_restaurant and id=p_abierto and status in('OPEN','DRAFT') returning id into v_id;
    if v_id is null then raise exception 'Este turno ya se cerró desde otro aparato.' using errcode='LGD04'; end if;
  end if;
  if (select count(*) from public.cash_expenses where restaurant_id=p_restaurant and id=any(p_gastos) and cash_count_id is null)
      <>coalesce(cardinality(p_gastos),0) then raise exception 'Los gastos cambiaron. Revisa el cuadre.' using errcode='LGD04'; end if;
  update public.cash_expenses set cash_count_id=v_id where restaurant_id=p_restaurant and id=any(p_gastos) and cash_count_id is null;
  return v_id;
end $$;

revoke all on function public.leogin_contexto_caja(uuid,boolean) from public,anon,authenticated;
revoke all on function public.leogin_registrar_cambio_caja() from public,anon,authenticated;
revoke all on function public.leogin_leer_periodo_caja(uuid,timestamptz,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.leogin_confirmar_cierre_caja(uuid,bigint,uuid,timestamptz,uuid,jsonb,uuid[],uuid) from public,anon,authenticated;
grant execute on function public.leogin_contexto_caja(uuid,boolean) to service_role;
grant execute on function public.leogin_registrar_cambio_caja() to service_role;
grant execute on function public.leogin_leer_periodo_caja(uuid,timestamptz,timestamptz,timestamptz) to service_role;
grant execute on function public.leogin_confirmar_cierre_caja(uuid,bigint,uuid,timestamptz,uuid,jsonb,uuid[],uuid) to service_role;
notify pgrst,'reload schema';
commit;
