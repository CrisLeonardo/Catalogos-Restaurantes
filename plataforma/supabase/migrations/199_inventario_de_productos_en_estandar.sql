-- 199 · Inventario de productos terminados desde Estándar.
-- Aplicar antes del código. Recetas e ingredientes conservan su titularidad.
create or replace function public.leogin_plan_module_floor(p_plan text)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object('catalog', true)
      || case p_plan
           when 'BASICO'   then '{}'::jsonb
           when 'EN_LINEA' then '{"orders":true,"whatsapp_notify":true}'::jsonb
           when 'ESTANDAR' then '{"orders":true,"whatsapp_notify":true,"finanzas":true,"inventario":true}'::jsonb
           else '{"orders":true,"whatsapp_notify":true,"finanzas":true,
                  "analitica":true,"inventario":true,"personal":true}'::jsonb
         end
      || coalesce((
           select jsonb_object_agg(k, true)
             from unnest(leogin_addon_module_keys()) k
            where leogin_module_included_in_plan(p_plan, k)
         ), '{}'::jsonb);
$$;

update public.restaurants
   set modules = coalesce(modules, '{}'::jsonb) || '{"inventario":true}'::jsonb
 where plan_actual = 'ESTANDAR'
   and modules->'inventario' is distinct from 'true'::jsonb;
