-- ============================================================
-- 195 · PLAZOS DE LOS DATOS PERSONALES Y ÚLTIMA EXPORTACIÓN (LZ-10)
-- ------------------------------------------------------------
-- Decisión del 24 de noviembre de 2026 (el dueño la delegó: «toma la
-- mejor decisión»). Hasta ahora casi todo se guardaba mientras existiera
-- el local. Desde aquí, una purga diaria quita lo que ya no sirve:
--
--   · Pedidos cerrados con más de 24 meses: nombre «Cliente eliminado»,
--     sin teléfono, notas, dirección ni coordenadas (igual que la 192).
--     Totales, platillos y cobros se quedan: son la contabilidad del local.
--   · Reseñas con más de 24 meses: sin nombre ni comentario; queda la nota.
--   · Fichas de cliente sin pedidos en 24 meses y sin puntos por canjear.
--   · Reservas y lista de espera con más de 12 meses: sin nombre,
--     teléfono ni notas.
--   · Mensajes de WhatsApp con más de 12 meses, y las conversaciones que
--     se queden sin mensajes.
--   · Visitas y embudo de la carta con más de 13 meses (13 y no 12 para
--     poder comparar un mes con el mismo mes del año anterior).
--
-- Se conservan sin plazo, mientras exista el local: facturas FEL (ley
-- fiscal), caja, anulaciones y propinas (registro contable y antifraude).
-- La bitácora del superadmin tampoco se purga: es de solo escritura (132)
-- y guarda lo que Leogin cobró a cada local. La de accesos al panel ya
-- tiene su purga de 180 días (109).
--
-- Además: `restaurants.datos_exportados_at`, la última vez que el local
-- usó «Exportar tus datos». El superadmin la ve antes de borrar un local.
--
-- Orden: cuando sea respecto al despliegue. El código nuevo escribe la
-- columna y no falla si todavía no existe (se anota en el log).
-- ============================================================

alter table public.restaurants
  add column if not exists datos_exportados_at timestamptz;

comment on column public.restaurants.datos_exportados_at is
  'Última vez que el local descargó «Exportar tus datos» (LZ-10). Se muestra antes de borrar el local.';

create or replace function public.leogin_purgar_datos_vencidos()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_24m timestamptz := now() - interval '24 months';
  v_12m timestamptz := now() - interval '12 months';
  v_13m timestamptz := now() - interval '13 months';
  v_pedidos int; v_resenas int; v_clientes int; v_reservas int;
  v_espera int; v_mensajes int; v_conversaciones int; v_visitas int; v_embudo int;
begin
  update public.orders
     set customer_name = 'Cliente eliminado',
         customer_phone = '',
         notes = null,
         address = case when order_type = 'DINE_IN' then address else null end,
         delivery_lat = case when order_type = 'DINE_IN' then delivery_lat else null end,
         delivery_lng = case when order_type = 'DINE_IN' then delivery_lng else null end
   where status in ('DELIVERED', 'CANCEL')
     and created_at < v_24m
     and (customer_name is distinct from 'Cliente eliminado' or customer_phone <> ''
          or notes is not null or (order_type <> 'DINE_IN' and address is not null));
  get diagnostics v_pedidos = row_count;

  update public.order_ratings
     set customer_name = null, comment = null
   where created_at < v_24m
     and (customer_name is not null or comment is not null);
  get diagnostics v_resenas = row_count;

  delete from public.customers c
   where coalesce(c.last_order_at, c.created_at) < v_24m
     and c.created_at < v_24m
     and not exists (select 1 from public.loyalty_accounts l
                      where l.customer_id = c.id and l.points_balance > 0)
     and not exists (select 1 from public.orders o
                      where o.customer_id = c.id and o.created_at >= v_24m);
  get diagnostics v_clientes = row_count;

  update public.reservations
     set customer_name = 'Cliente eliminado', customer_phone = null, notes = null
   where coalesce(date::timestamptz, created_at) < v_12m
     and (customer_name is distinct from 'Cliente eliminado' or customer_phone is not null or notes is not null);
  get diagnostics v_reservas = row_count;

  update public.waitlist_entries
     set customer_name = 'Cliente eliminado', phone = null, notes = null
   where created_at < v_12m
     and (customer_name is distinct from 'Cliente eliminado' or phone is not null or notes is not null);
  get diagnostics v_espera = row_count;

  delete from public.whatsapp_messages where created_at < v_12m;
  get diagnostics v_mensajes = row_count;

  delete from public.whatsapp_conversations w
   where greatest(w.updated_at, w.created_at, coalesce(w.last_inbound_at, w.created_at)) < v_12m
     and not exists (select 1 from public.whatsapp_messages m where m.conversation_id = w.id);
  get diagnostics v_conversaciones = row_count;

  delete from public.page_visits where created_at < v_13m;
  get diagnostics v_visitas = row_count;

  delete from public.menu_embudo where created_at < v_13m;
  get diagnostics v_embudo = row_count;

  return jsonb_build_object(
    'pedidos_anonimizados', v_pedidos,
    'resenas_sin_nombre', v_resenas,
    'fichas_de_cliente_borradas', v_clientes,
    'reservas_anonimizadas', v_reservas,
    'lista_de_espera_anonimizada', v_espera,
    'mensajes_whatsapp_borrados', v_mensajes,
    'conversaciones_whatsapp_borradas', v_conversaciones,
    'visitas_borradas', v_visitas,
    'embudo_borrado', v_embudo
  );
end;
$$;

revoke all on function public.leogin_purgar_datos_vencidos() from public, anon, authenticated;
grant execute on function public.leogin_purgar_datos_vencidos() to service_role;

comment on function public.leogin_purgar_datos_vencidos() is
  'Purga diaria de datos personales vencidos (LZ-10, 195): 24 meses pedidos, reseñas y fichas; 12 meses reservas, espera y WhatsApp; 13 meses visitas y embudo.';

-- Todos los días a las 4:45 (UTC). Mismo patrón que la 109: sin pg_cron la
-- migración no falla; la función se puede correr a mano.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'leogin_purga_datos_vencidos') then
      perform cron.unschedule('leogin_purga_datos_vencidos');
    end if;
    perform cron.schedule(
      'leogin_purga_datos_vencidos',
      '45 4 * * *',
      $cmd$select public.leogin_purgar_datos_vencidos()$cmd$
    );
  end if;
exception when others then
  null;
end $$;
