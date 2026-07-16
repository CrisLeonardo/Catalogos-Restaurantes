-- ============================================================
--  Migración 077 — Reconcilia precios congelados por la 072
--  ------------------------------------------------------------
--  Bug real detectado (2026-07-16): la migración 072 congeló la
--  mensualidad de los restaurantes PREMIUM que estaban en modo
--  automático (auto_price = false + nota), "hasta revisión manual".
--  Esa revisión nunca ocurrió para varios de ellos. Cuando la 075
--  bajó el precio oficial de PREMIUM a Q599, solo recalculó los
--  restaurantes en automático — los congelados por la 072 se
--  quedaron con su monto viejo (p.ej. Q600), mientras el panel del
--  dueño ("Mi suscripción") les seguía mostrando "Mensualidad
--  sugerida: Q599" al lado — dos números distintos, y el que de
--  verdad se cobra es el viejo, más caro de lo que corresponde.
--
--  Esta migración reactiva auto_price = true SOLO para las filas que
--  siguen exactamente en el estado en que las dejó la 072 (se
--  detecta por la marca de texto que esa migración escribió en
--  `notes`) — no toca ninguna fila con un precio negociado
--  manualmente por otro motivo. Al reactivar auto_price, vuelven a
--  cobrar el precio oficial vigente del plan y quedan sincronizadas
--  hacia adelante (leogin_apply_auto_price_all las recalcula cada
--  vez que cambie el precio del plan).
--
--  Imprime en NOTICE cada restaurante afectado y su monto viejo vs.
--  el nuevo, para poder auditar qué se tocó. Idempotente: una vez
--  reactivado auto_price, la fila deja de matchear el filtro y no
--  se vuelve a tocar en una segunda corrida.
-- ============================================================

do $$
declare
  r record;
  v_new numeric;
begin
  for r in
    select restaurant_id, monthly_fee, notes
      from restaurant_billing
     where auto_price = false
       and notes like '%[Migración 072%'
  loop
    v_new := coalesce(leogin_compute_monthly_fee(r.restaurant_id), r.monthly_fee);
    update restaurant_billing
       set auto_price = true,
           notes = trim(both E'\n' from
             coalesce(notes, '') || E'\n' ||
             '[Migración 077 — ' || to_char(now(), 'YYYY-MM-DD') || '] ' ||
             'Reactivado precio automático (seguía congelado desde la 072 sin revisión manual). ' ||
             'Pasó de Q' || r.monthly_fee::text || ' a Q' || v_new::text || '.'
           ),
           updated_at = now()
     where restaurant_id = r.restaurant_id;

    raise notice 'Restaurante %: Q% (congelado) -> Q% (automático, plan vigente)',
      r.restaurant_id, r.monthly_fee, v_new;
  end loop;
end $$;

select leogin_apply_auto_price_all();
