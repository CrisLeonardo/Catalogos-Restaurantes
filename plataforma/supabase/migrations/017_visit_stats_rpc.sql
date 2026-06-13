-- ============================================================
-- 017 · Agregación de visitas en SQL (RPC visit_stats)
-- ------------------------------------------------------------
-- Antes, getVisitStats traía hasta 50 000 filas de page_visits y
-- las agregaba en JS en CADA carga del panel. Esto lo hace en la
-- base de datos y devuelve solo el resumen (hoy/7d/30d + únicos +
-- serie de 14 días), usando la zona horaria del restaurante para
-- los cortes de día (igual que localDateKey en el código).
-- ============================================================

create or replace function visit_stats(
  p_restaurant_id uuid,
  p_tz            text default 'America/Guatemala'
) returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with v as (
    select visitor_id, (created_at at time zone p_tz)::date as d
    from page_visits
    where restaurant_id = p_restaurant_id
      and created_at >= now() - interval '31 days'
  ),
  td as ( select (now() at time zone p_tz)::date as today ),
  agg as (
    select
      count(*) filter (where d = (select today from td))                       as today_n,
      count(distinct visitor_id) filter (where d = (select today from td))      as today_u,
      count(*) filter (where d > (select today from td) - 7)                    as last7_n,
      count(distinct visitor_id) filter (where d > (select today from td) - 7)  as last7_u,
      count(*) filter (where d > (select today from td) - 30)                   as last30_n,
      count(distinct visitor_id) filter (where d > (select today from td) - 30) as last30_u
    from v
  ),
  series as (
    select g.d::date as day, count(v.visitor_id) as visits
    from generate_series(
           (select today from td) - 13,
           (select today from td),
           interval '1 day'
         ) as g(d)
    left join v on v.d = g.d::date
    group by g.d
  )
  select jsonb_build_object(
    'today',       coalesce((select today_n  from agg), 0),
    'uniqueToday', coalesce((select today_u  from agg), 0),
    'last7',       coalesce((select last7_n  from agg), 0),
    'unique7',     coalesce((select last7_u  from agg), 0),
    'last30',      coalesce((select last30_n from agg), 0),
    'unique30',    coalesce((select last30_u from agg), 0),
    'series14', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'day',      to_char(day, 'YYYY-MM-DD'),
          'visits',   visits,
          'is_today', (day = (select today from td))
        ) order by day
      ) from series
    ), '[]'::jsonb)
  );
$$;
