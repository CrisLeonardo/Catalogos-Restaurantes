-- 172 · Entrega y recepción de un corte confirmado. Aplicar después de 171.
begin;

create table public.caja_traspasos (
  corte_id uuid primary key references public.caja_recibos(corte_id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  entrega_id uuid not null,
  entrega_nombre text not null,
  recibe_id uuid not null check (recibe_id <> entrega_id),
  recibe_nombre text not null,
  observacion text not null check (char_length(observacion) <= 500),
  solicitado_at timestamptz not null default now(),
  confirmado_at timestamptz
);
create index caja_traspasos_pendientes on public.caja_traspasos (restaurant_id, recibe_id, solicitado_at)
  where confirmado_at is null;
alter table public.caja_traspasos enable row level security;
revoke all on public.caja_traspasos from public, anon, authenticated, service_role;
grant select, insert, update on public.caja_traspasos to service_role;
create policy super_admin_segundo_factor on public.caja_traspasos
  as restrictive for all to authenticated
  using ((select public.leogin_sesion_con_segundo_factor()))
  with check ((select public.leogin_sesion_con_segundo_factor()));

-- La membresía de la sucursal prevalece sobre el perfil legado.
create function public.leogin_receptores_caja(p_restaurant uuid)
returns table (id uuid, nombre text)
language sql stable security invoker set search_path='' as $$
  select p.id, coalesce(nullif(btrim(p.full_name), ''), 'Sin nombre')
  from public.restaurant_members m join public.profiles p on p.id=m.user_id
  where m.restaurant_id=p_restaurant and m.status='active'
    and (m.role='OWNER' or (m.role in ('MANAGER','STAFF')
      and (m.permissions is null or m.permissions ? 'finanzas')))
  union all
  select p.id, coalesce(nullif(btrim(p.full_name), ''), 'Sin nombre')
  from public.profiles p
  where p.restaurant_id=p_restaurant
    and (p.role='RESTAURANT_OWNER' or (p.role='RESTAURANT_STAFF'
      and (p.permissions is null or p.permissions ? 'finanzas')))
    and not exists (select 1 from public.restaurant_members m
      where m.restaurant_id=p_restaurant and m.user_id=p.id)
$$;

create function public.leogin_solicitar_traspaso_caja(
  p_restaurant uuid, p_corte uuid, p_entrega uuid, p_recibe uuid, p_nota text
) returns public.caja_traspasos
language plpgsql security invoker set search_path='' as $$
declare
  v_recibo jsonb;
  v_estado text;
  v_recibe_nombre text;
  v_traspaso public.caja_traspasos;
  v_nota text := regexp_replace(coalesce(p_nota,''), '^\s+|\s+$', '', 'g');
begin
  if p_entrega=p_recibe or p_recibe is null then
    raise exception 'Elige a otra persona para recibir la caja.' using errcode='22023';
  end if;
  select r.recibo, c.status into v_recibo, v_estado
  from public.caja_recibos r join public.cash_counts c on c.id=r.corte_id
  where r.restaurant_id=p_restaurant and r.corte_id=p_corte and r.actor_id=p_entrega
  for update of c;
  if not found then
    raise exception 'Solo quien cerró esta caja puede solicitar la entrega.' using errcode='42501';
  end if;
  if v_estado is distinct from 'CLOSED' then
    raise exception 'El corte ya no está vigente.' using errcode='22023';
  end if;
  if char_length(v_nota)>500 or ((v_recibo->>'difference')::numeric<>0 and v_nota='') then
    raise exception 'Documenta la diferencia con una observación de hasta 500 caracteres.' using errcode='22023';
  end if;

  select * into v_traspaso from public.caja_traspasos where corte_id=p_corte;
  if found then
    if v_traspaso.recibe_id=p_recibe and v_traspaso.observacion=v_nota then return v_traspaso; end if;
    raise exception 'Este corte ya tiene un traspaso registrado.' using errcode='23505';
  end if;
  select nombre into v_recibe_nombre from public.leogin_receptores_caja(p_restaurant) where id=p_recibe;
  if not found then
    raise exception 'Esa persona ya no tiene permiso de Caja en este restaurante.' using errcode='42501';
  end if;
  insert into public.caja_traspasos
    (corte_id, restaurant_id, entrega_id, entrega_nombre, recibe_id, recibe_nombre, observacion)
    values (p_corte, p_restaurant, p_entrega, coalesce(v_recibo->>'cashierName','Caja'), p_recibe, v_recibe_nombre, v_nota)
    returning * into v_traspaso;
  return v_traspaso;
end $$;

create function public.leogin_confirmar_traspaso_caja(p_restaurant uuid, p_corte uuid, p_recibe uuid)
returns public.caja_traspasos
language plpgsql security invoker set search_path='' as $$
declare
  v_estado text;
  v_traspaso public.caja_traspasos;
begin
  select c.status into v_estado from public.cash_counts c
  join public.caja_traspasos t on t.corte_id=c.id
  where t.restaurant_id=p_restaurant and t.corte_id=p_corte and t.recibe_id=p_recibe
  for update of c;
  if not found or not exists (select 1 from public.leogin_receptores_caja(p_restaurant) where id=p_recibe) then
    raise exception 'Solo la persona designada y con acceso a Caja puede recibir este turno.' using errcode='42501';
  end if;
  if v_estado is distinct from 'CLOSED' then
    raise exception 'El corte ya no está vigente.' using errcode='22023';
  end if;
  update public.caja_traspasos set confirmado_at=coalesce(confirmado_at, clock_timestamp())
  where corte_id=p_corte returning * into v_traspaso;
  return v_traspaso;
end $$;

revoke all on function public.leogin_receptores_caja(uuid),
  public.leogin_solicitar_traspaso_caja(uuid,uuid,uuid,uuid,text),
  public.leogin_confirmar_traspaso_caja(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.leogin_receptores_caja(uuid),
  public.leogin_solicitar_traspaso_caja(uuid,uuid,uuid,uuid,text),
  public.leogin_confirmar_traspaso_caja(uuid,uuid,uuid) to service_role;

notify pgrst,'reload schema';
commit;
