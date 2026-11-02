-- ============================================================
--  151 · Alergias de la mesa
--  ------------------------------------------------------------
--  En los POS de servicio a mesa (Toast, TouchBistro) la alergia se
--  anota UNA vez en la mesa y sale en cada comanda de esa mesa, en vez
--  de depender de que el mesero la repita plato por plato.
--
--  Vive en el turno de la mesa (`table_sessions`, migración 128), igual
--  que su nombre: dura lo que dura la visita y se va al liberar la mesa.
--  El código la manda a cocina dentro de la nota del pedido
--  («ALERGIA: maní»), que ya se imprime y se ve en la pantalla de cocina:
--  no hace falta tocar el agente de impresión.
--
--  Idempotente. Se puede aplicar antes o después de desplegar: sin la
--  columna, el código no ofrece el campo y lee las mesas como siempre.
-- ============================================================

alter table public.table_sessions add column if not exists allergies text;

alter table public.table_sessions drop constraint if exists table_sessions_allergies_len;
alter table public.table_sessions add constraint table_sessions_allergies_len
  check (allergies is null or char_length(allergies) <= 120);

comment on column public.table_sessions.allergies is
  'Alergias o restricciones de la mesa («maní, mariscos»). Sale en cada comanda como «ALERGIA: …». Migración 151.';
