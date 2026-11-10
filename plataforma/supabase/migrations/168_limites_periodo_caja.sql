-- 168 · Inicio del día inclusivo y último corte exclusivo, sin perder microsegundos.
-- DESPUÉS de 167 y ANTES del código de 0.19. Sin escrituras de datos.
-- Conserva el RPC de cuatro argumentos para el código anterior durante el despliegue.
begin;
create or replace function public.leogin_leer_periodo_caja_limites(p_restaurant uuid,p_desde timestamptz,p_gestion_desde timestamptz,p_hasta timestamptz,p_incluir_desde boolean)
returns jsonb language sql security invoker set search_path='' as $$
  select jsonb_build_object(
    'pagos',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from public.order_payments p
      where p.restaurant_id=p_restaurant and (
        (p.caja_registrado_en is null and (p.created_at>p_desde or (p_incluir_desde and p.created_at=p_desde)) and p.created_at<=p_hasta)
        or ((p.caja_registrado_en>coalesce(p_gestion_desde,'-infinity') or (p_incluir_desde and p.caja_registrado_en=p_gestion_desde)) and p.caja_registrado_en<=p_hasta))),
    'entregados',(select coalesce(jsonb_agg(o.id order by o.id),'[]') from public.orders o
      where o.restaurant_id=p_restaurant and o.status='DELIVERED' and (
        (o.caja_registrado_en is null and (o.delivered_at>p_desde or (p_incluir_desde and o.delivered_at=p_desde)) and o.delivered_at<=p_hasta)
        or ((o.caja_registrado_en>coalesce(p_gestion_desde,'-infinity') or (p_incluir_desde and o.caja_registrado_en=p_gestion_desde)) and o.caja_registrado_en<=p_hasta))),
    'gastos',(select coalesce(jsonb_agg(to_jsonb(g) order by g.id),'[]') from public.cash_expenses g
      where g.restaurant_id=p_restaurant and g.cash_count_id is null and (
        (g.caja_registrado_en is null and (g.created_at>p_desde or (p_incluir_desde and g.created_at=p_desde)) and g.created_at<=p_hasta)
        or ((g.caja_registrado_en>coalesce(p_gestion_desde,'-infinity') or (p_incluir_desde and g.caja_registrado_en=p_gestion_desde)) and g.caja_registrado_en<=p_hasta))))
$$;

revoke all on function public.leogin_leer_periodo_caja_limites(uuid,timestamptz,timestamptz,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.leogin_leer_periodo_caja_limites(uuid,timestamptz,timestamptz,timestamptz,boolean) to service_role;

notify pgrst,'reload schema';
commit;
