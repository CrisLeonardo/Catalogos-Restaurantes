-- 194 · Al terminar la prueba gratis, el cobro empieza ese día (LZ-01)
--
-- Auditoría de lanzamiento 2026-11-23, LZ-01. El alta ya fija el día de
-- cobro en el día del alta (billing-signup.ts, `diaDeCobroDelAlta`). Pero un
-- local con prueba gratis no paga desde el alta: paga desde que la prueba
-- termina, y leogin_graduate_trials() lo pasaba a cobro sin tocar ni
-- billing_day ni started_at. Ejemplo: alta el día 1 con 14 días de prueba →
-- empieza a pagar el 15, pero el corte del mes le crea la mensualidad con
-- vencimiento el 1: nace vencida y, pasados los días de gracia, se suspende.
--
-- Ahora, al graduar, el día de cobro y el inicio del servicio son los del
-- día en que termina la prueba (fecha de Guatemala, como el alta). Del 29
-- en adelante se cobra el 28, como en todo el sistema.
--
-- Hoy las pruebas están apagadas (migración 182, trial_days = 0): esto
-- importa el día que se vuelvan a encender, y para quien aún tenga una.
--
-- Orden: se puede aplicar antes o después de desplegar; no hay código que
-- dependa de ella.

create or replace function public.leogin_graduate_trials()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_count int := 0;
  v_hoy   date := (now() at time zone 'America/Guatemala')::date;
begin
  with graduated as (
    update restaurant_billing
       set active        = true,
           started_at    = v_hoy,
           billing_day   = least(28, extract(day from v_hoy)::int),
           updated_at    = now()
     where active = false
       and trial_ends_at is not null
       and trial_ends_at <= now()
    returning restaurant_id
  )
  select count(*) into v_count from graduated;
  return v_count;
end;
$function$;

revoke execute on function public.leogin_graduate_trials() from public, anon, authenticated;
grant execute on function public.leogin_graduate_trials() to service_role;
