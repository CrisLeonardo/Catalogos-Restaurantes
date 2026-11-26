-- 206 · Bajar a la tarifa vigente las mensualidades que quedaron por encima
-- Aplicar después de la 196 (y de la 205), antes o junto con el despliegue.
--
-- La 191 hace que `monthly_fee` sea el precio acordado: cambiar las tarifas
-- globales no mueve lo que ya paga un restaurante. Eso protege al cliente
-- cuando una tarifa SUBE, pero cuando BAJA lo deja pagando más que lo que
-- anuncia la web (Premium Q349 frente a Q299). Decisión del dueño, 26 nov
-- 2026: los restaurantes en precio automático pasan a la tarifa vigente si
-- es menor. Nunca se sube una mensualidad, el precio manual (acordado a
-- mano) no se toca y las facturas ya emitidas siguen como están.

create or replace function public.leogin_bajar_a_tarifa_vigente()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  r record;
  v_vigente numeric;
  v_count int := 0;
begin
  for r in
    select b.restaurant_id, b.monthly_fee, rs.plan_actual
      from restaurant_billing b
      join restaurants rs on rs.id = b.restaurant_id
     where b.auto_price = true
       and rs.plan_actual is not null
     for update of b
  loop
    v_vigente := leogin_compute_monthly_fee(r.restaurant_id);
    if v_vigente is not null and v_vigente < r.monthly_fee then
      update restaurant_billing
         set monthly_fee = v_vigente, plan_del_precio = r.plan_actual,
             precio_fijado_en = now(), updated_at = now()
       where restaurant_id = r.restaurant_id;
      insert into activity_log (restaurant_id, action, entity, meta)
        values (r.restaurant_id, 'mensualidad_bajada_a_tarifa_vigente', r.plan_actual,
                jsonb_build_object('antes', r.monthly_fee, 'despues', v_vigente));
      raise notice 'Restaurante %: Q% -> Q% (%)', r.restaurant_id, r.monthly_fee, v_vigente, r.plan_actual;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.leogin_bajar_a_tarifa_vigente() from public, anon, authenticated;
grant execute on function public.leogin_bajar_a_tarifa_vigente() to service_role;

select public.leogin_bajar_a_tarifa_vigente();
