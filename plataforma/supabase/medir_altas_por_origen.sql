-- ============================================================
-- ALTAS POR ORIGEN (auditoría de lanzamiento 2026-11-23, LZ-11)
-- ------------------------------------------------------------
-- Solo lee. Se pega en el editor SQL de producción.
--
-- Desde LZ-11, el plan y el caso que la persona eligió en la web
-- (Planes, la portada o Vende en línea → /registro?plan=…&caso=…) quedan
-- en su cuenta (`alta_plan`, `alta_caso`). Esta consulta cuenta, por cada
-- combinación, cuántas cuentas se crearon y cuántas llegaron a cada paso:
--   cuentas → con restaurante → con plan de pago → con un cobro pagado.
-- «sin elegir» = llegó a /registro sin plan ni caso (enlace directo,
-- búsqueda, o cuentas de antes del 23 de noviembre).
--
-- Cambia el intervalo de abajo para mirar otro periodo.
-- ============================================================

with cuentas as (
  select u.id,
         coalesce(u.raw_user_meta_data->>'alta_caso', 'sin elegir') as caso,
         coalesce(u.raw_user_meta_data->>'alta_plan', 'sin elegir') as plan_elegido
    from auth.users u
   where u.created_at >= now() - interval '90 days'
     -- Fuera el personal por PIN y el superadmin: no llegan por la web.
     and u.email not like '%@staff.leogin.internal'
     and not exists (select 1 from profiles p where p.id = u.id and p.role = 'SUPER_ADMIN')
),
pasos as (
  select c.*,
         exists (select 1 from restaurant_members m
                  where m.user_id = c.id and m.role = 'OWNER') as con_restaurante,
         exists (select 1 from restaurant_members m join restaurants r on r.id = m.restaurant_id
                  where m.user_id = c.id and m.role = 'OWNER' and r.plan_actual <> 'BASICO') as con_plan_de_pago,
         exists (select 1 from restaurant_members m join invoices i on i.restaurant_id = m.restaurant_id
                  where m.user_id = c.id and m.role = 'OWNER' and i.status = 'PAID' and i.amount > 0) as pagando
    from cuentas c
)
select caso,
       plan_elegido,
       count(*)                                  as cuentas,
       count(*) filter (where con_restaurante)   as con_restaurante,
       count(*) filter (where con_plan_de_pago)  as con_plan_de_pago,
       count(*) filter (where pagando)           as pagando
  from pasos
 group by caso, plan_elegido
 order by cuentas desc, caso, plan_elegido;
