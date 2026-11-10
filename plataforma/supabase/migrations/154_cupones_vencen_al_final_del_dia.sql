-- ============================================================
--  154 · Los cupones vencen al final del día elegido, en la zona del local
--  ------------------------------------------------------------
--  Auditoría 2026-11-03, ficha 0.5 (X05). El formulario de cupones
--  mandaba «válido hasta» como una fecha suelta ('2026-11-10') a una
--  columna timestamptz, y Postgres (en UTC) la guardaba como
--  '2026-11-10 00:00:00+00': en Guatemala el cupón dejaba de valer a las
--  18:00 del día ANTERIOR, y la lista mostraba ese día anterior.
--
--  Desde esta versión el código guarda el límite EXCLUSIVO: las 00:00 del
--  día siguiente en la zona del restaurante (lib/cupones/vigencia.ts).
--  Esta migración lleva los cupones ya guardados al mismo contrato: el
--  día que el dueño eligió vuelve a valer completo.
--
--  Qué filas toca: solo las que tienen el rastro exacto del formulario
--  viejo, `valid_until` a las 00:00:00 UTC en punto. Las semillas, el SQL
--  a mano y lo que guarde el código nuevo (00:00 LOCAL, que en Guatemala
--  son las 06:00 UTC) no cumplen eso y no se tocan.
--
--  Idempotente: una fila corregida queda en la medianoche local, que ya no
--  es medianoche UTC. Un restaurante cuya zona esté en UTC+0 se salta a
--  propósito: ahí no se puede distinguir lo viejo de lo nuevo.
--
--  `valid_from` no se toca: el formulario viejo nunca lo enviaba.
--
--  Aplicar DESPUÉS de desplegar. Con el código viejo, una fila corregida
--  vale el día completo (bien), pero el panel la mostraría un día
--  después. Con el código nuevo y la fila sin corregir, el cupón se
--  comporta igual que hoy, sin empeorar nada.
-- ============================================================

update coupons c
   set valid_until = (((c.valid_until at time zone 'UTC')::date + 1)::timestamp)
                       at time zone coalesce(r.timezone, 'America/Guatemala')
  from restaurants r
 where r.id = c.restaurant_id
   and c.valid_until is not null
   and (c.valid_until at time zone 'UTC')::time = time '00:00:00'
   -- La medianoche UTC no es medianoche local: es una fila del formulario viejo.
   and (((c.valid_until at time zone 'UTC')::date)::timestamp
          at time zone coalesce(r.timezone, 'America/Guatemala')) <> c.valid_until;
