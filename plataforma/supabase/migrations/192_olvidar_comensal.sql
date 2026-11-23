-- ============================================================
-- 192 · Olvidar a un comensal en un local
-- ------------------------------------------------------------
-- Auditoría de lanzamiento 2026-11-23, LZ-10. La política de privacidad
-- dice que el comensal pide al restaurante borrar sus datos, pero no había
-- forma de hacerlo sin borrar el restaurante entero. Esta función atiende
-- esa solicitud, por local y por teléfono (el dato que el comensal conoce
-- y que el restaurante puede verificar).
--
--   select public.leogin_olvidar_comensal('<restaurant_id>', '5555 1234');
--        → ensayo: cuenta lo que encontraría, no cambia nada.
--   select public.leogin_olvidar_comensal('<restaurant_id>', '5555 1234', true);
--        → lo borra y devuelve lo mismo, con "aplicado": true.
--
-- Qué hace con cada dato (inventario completo en
-- docs/registros/INVENTARIO_DATOS_PERSONALES_2026-11-23.md):
--   · customers: borra la ficha. Su cuenta y movimientos de puntos caen en
--     cascada; pedidos y conversaciones quedan sin cliente (set null).
--   · orders cerrados (DELIVERED o CANCEL): nombre «Cliente eliminado»,
--     teléfono vacío, notas fuera y, en domicilio y para llevar, dirección
--     y coordenadas fuera. Totales, productos y pagos quedan: son la
--     contabilidad del local. En los de mesa la «dirección» es «Mesa 4»
--     y la usa el salón: no se toca.
--   · orders abiertos: NO se tocan; se informan en "pedidos_abiertos" para
--     repetir la solicitud cuando se cierren.
--   · reservations y waitlist_entries: nombre, teléfono y notas fuera.
--   · order_ratings de sus pedidos: nombre y comentario fuera, la nota queda.
--   · whatsapp_conversations con ese número: se borran con sus mensajes.
--   · fel_documents: NO se tocan. Las facturas emitidas se conservan por
--     obligación fiscal; se informan en "facturas_conservadas".
--
-- No borra la cuenta de Google del comensal (es de toda la plataforma, no
-- del local): eso lo hace el superadmin desde Cuentas si también la pide.
--
-- Coincidencia de teléfono: solo dígitos; iguales, o los últimos 8 dígitos
-- iguales cuando los dos tienen al menos 8 (así «+502 5555-1234» y
-- «55551234» son el mismo). Correrlo primero como ensayo y revisar.
--
-- Solo para el editor SQL o el servidor: sin permiso para anon ni
-- authenticated (ver scripts/audit-security-definer.mjs).
-- ============================================================

create or replace function public.leogin_tel_coincide(p_a text, p_b text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_a is null or p_b is null then false
    else (
      with d as (
        select pg_catalog.regexp_replace(p_a, '\D', '', 'g') as a,
               pg_catalog.regexp_replace(p_b, '\D', '', 'g') as b
      )
      select (a <> '' and a = b)
          or (pg_catalog.length(a) >= 8 and pg_catalog.length(b) >= 8
              and pg_catalog.right(a, 8) = pg_catalog.right(b, 8))
      from d
    )
  end
$$;

create or replace function public.leogin_olvidar_comensal(
  p_restaurant_id uuid,
  p_telefono text,
  p_confirmar boolean default false
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_digitos text := pg_catalog.regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_clientes uuid[];
  v_pedidos uuid[];
  v_abiertos int;
  v_reservas int;
  v_espera int;
  v_resenas int;
  v_whatsapp int;
  v_facturas int;
  v_puntos int;
begin
  if p_restaurant_id is null or pg_catalog.length(v_digitos) < 8 then
    raise exception 'Hace falta el local y un teléfono de al menos 8 dígitos.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.restaurants where id = p_restaurant_id) then
    raise exception 'No existe ese local.' using errcode = '22023';
  end if;

  select coalesce(array_agg(c.id), '{}') into v_clientes
    from public.customers c
   where c.restaurant_id = p_restaurant_id
     and public.leogin_tel_coincide(c.phone, v_digitos);

  select coalesce(array_agg(o.id) filter (where o.status in ('DELIVERED', 'CANCEL')), '{}'),
         count(*) filter (where o.status not in ('DELIVERED', 'CANCEL'))
    into v_pedidos, v_abiertos
    from public.orders o
   where o.restaurant_id = p_restaurant_id
     and (o.customer_id = any (v_clientes) or public.leogin_tel_coincide(o.customer_phone, v_digitos));

  select count(*) into v_reservas from public.reservations r
   where r.restaurant_id = p_restaurant_id and public.leogin_tel_coincide(r.customer_phone, v_digitos);
  select count(*) into v_espera from public.waitlist_entries w
   where w.restaurant_id = p_restaurant_id and public.leogin_tel_coincide(w.phone, v_digitos);
  select count(*) into v_resenas from public.order_ratings x
   where x.restaurant_id = p_restaurant_id and x.order_id = any (v_pedidos);
  select count(*) into v_whatsapp from public.whatsapp_conversations w
   where w.restaurant_id = p_restaurant_id and public.leogin_tel_coincide(w.wa_id, v_digitos);
  select count(*) into v_facturas from public.fel_documents f
   where f.restaurant_id = p_restaurant_id and f.order_id = any (v_pedidos);
  select count(*) into v_puntos from public.loyalty_accounts l
   where l.restaurant_id = p_restaurant_id and l.customer_id = any (v_clientes);

  if p_confirmar then
    update public.order_ratings
       set customer_name = null, comment = null
     where restaurant_id = p_restaurant_id and order_id = any (v_pedidos);

    update public.orders
       set customer_name = 'Cliente eliminado',
           customer_phone = '',
           notes = null,
           address = case when order_type = 'DINE_IN' then address else null end,
           delivery_lat = case when order_type = 'DINE_IN' then delivery_lat else null end,
           delivery_lng = case when order_type = 'DINE_IN' then delivery_lng else null end
     where restaurant_id = p_restaurant_id and id = any (v_pedidos);

    update public.reservations
       set customer_name = 'Cliente eliminado', customer_phone = null, notes = null
     where restaurant_id = p_restaurant_id and public.leogin_tel_coincide(customer_phone, v_digitos);

    update public.waitlist_entries
       set customer_name = 'Cliente eliminado', phone = null, notes = null
     where restaurant_id = p_restaurant_id and public.leogin_tel_coincide(phone, v_digitos);

    delete from public.whatsapp_conversations
     where restaurant_id = p_restaurant_id and public.leogin_tel_coincide(wa_id, v_digitos);

    delete from public.customers
     where restaurant_id = p_restaurant_id and id = any (v_clientes);
  end if;

  return jsonb_build_object(
    'aplicado', p_confirmar,
    'fichas_de_cliente', pg_catalog.cardinality(v_clientes),
    'cuentas_de_puntos', v_puntos,
    'pedidos_cerrados', pg_catalog.cardinality(v_pedidos),
    'pedidos_abiertos', v_abiertos,
    'reservas', v_reservas,
    'lista_de_espera', v_espera,
    'resenas', v_resenas,
    'conversaciones_whatsapp', v_whatsapp,
    'facturas_conservadas', v_facturas
  );
end;
$$;

revoke all on function public.leogin_tel_coincide(text, text) from public, anon, authenticated;
revoke all on function public.leogin_olvidar_comensal(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.leogin_tel_coincide(text, text) to service_role;
grant execute on function public.leogin_olvidar_comensal(uuid, text, boolean) to service_role;

comment on function public.leogin_olvidar_comensal(uuid, text, boolean) is
  'Solicitud de borrado de un comensal en un local (LZ-10). Sin p_confirmar solo cuenta. Conserva totales y facturas FEL.';
