-- ============================================================
--  158 · Un solo corte de caja por periodo
--  ------------------------------------------------------------
--  Auditoría 2026-11-03, ficha 0.10 (N05, C08). La 145 impide dos turnos
--  ABIERTOS a la vez (`cash_counts_one_open_per_restaurant`), pero nada
--  impedía dos cortes CERRADOS del mismo periodo: un turno que no se abrió
--  y se cierra desde dos aparatos a la vez se escribía dos veces (el
--  segundo, con un sobrante falso).
--
--  Un periodo empieza en `period_start` (el último cierre o el inicio del
--  día de caja). Un corte vivo por periodo y restaurante. Los ANULADOS
--  (status VOID) quedan fuera: anular y volver a cerrar el mismo periodo
--  es justo lo que hace la anulación de la 145.
--
--  Si en alguna base ya hubiera dos cortes vivos del mismo periodo, el
--  índice no se crea (no se tocan cortes existentes) y queda un aviso;
--  `verificar_migraciones.sql` lo marca como no aplicada para revisarlo a
--  mano. El código también lo comprueba antes de cerrar.
--
--  Aplicar ANTES de desplegar (o a la vez): el código nuevo cuenta con el
--  índice para responder «ya se cerró desde otro aparato».
-- ============================================================

do $$
begin
  if exists (
    select 1 from cash_counts
     where status = 'CLOSED' and period_start is not null
     group by restaurant_id, period_start
    having count(*) > 1
  ) then
    raise notice '158: hay cortes vivos repetidos del mismo periodo; revísalos antes de crear el índice.';
  else
    create unique index if not exists cash_counts_un_corte_por_periodo
      on cash_counts (restaurant_id, period_start)
      where status = 'CLOSED' and period_start is not null;
  end if;
end;
$$;
