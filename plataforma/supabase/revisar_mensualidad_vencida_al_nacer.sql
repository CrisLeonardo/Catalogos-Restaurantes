-- ============================================================
-- ¿ALGÚN LOCAL TIENE UNA MENSUALIDAD QUE NACIÓ VENCIDA? (LZ-01)
-- ------------------------------------------------------------
-- Solo lee. Se pega en el editor SQL de producción.
--
-- Antes del 23 de noviembre el alta fijaba el día de cobro en 1 (y al
-- terminar una prueba gratis no se cambiaba, hasta la migración 194). Un
-- local que empezó a pagar después del día 1 recibía la mensualidad de ese
-- mes con vencimiento ANTERIOR a su inicio: nacía vencida y, pasados los
-- días de gracia, podía quedar suspendido por impago sin deber nada.
--
-- Lista cada mensualidad pendiente cuyo vencimiento cae antes del inicio
-- del servicio, con el día de cobro que tiene y el que le correspondería.
-- Para corregir: en superadmin, ficha del local → Cobro, poner el día de
-- cobro sugerido y mover el vencimiento de esa mensualidad.
-- ============================================================

select r.name                                   as local,
       r.slug,
       r.plan_actual                            as plan,
       b.started_at                             as inicio_del_servicio,
       b.billing_day                            as dia_de_cobro,
       least(28, extract(day from b.started_at)::int) as dia_sugerido,
       i.period                                 as mes,
       i.due_date                               as vence,
       i.amount                                 as monto,
       b.suspended_for_nonpayment               as suspendido_por_impago
  from invoices i
  join restaurant_billing b on b.restaurant_id = i.restaurant_id
  join restaurants r        on r.id = i.restaurant_id
 where i.concept = 'MONTHLY'
   and i.status = 'PENDING'
   and b.started_at is not null
   and i.due_date < b.started_at
 order by i.due_date, r.name;
