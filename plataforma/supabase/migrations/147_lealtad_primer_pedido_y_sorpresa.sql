-- ============================================================
--  147 · Lealtad: premio al primer pedido y sorpresa de la casa
--  ------------------------------------------------------------
--  docs/planes/PLAN_MOMENTOS_PICO_2026-10-26.md (M3 y M4).
--
--  1. loyalty_settings.primer_pedido_doble — el primer pedido que un
--     comensal hace desde su celular, con su cuenta, suma el DOBLE de
--     puntos (estrategia C8: «premio por pedir por el QR»). Encendido por
--     defecto (estrategia §2.15: lo bueno viene puesto); el restaurante
--     lo apaga en Lealtad.
--
--  2. loyalty_settings.sorpresa_texto / sorpresa_cada — la sorpresa de
--     la casa (recompensa variable, §2.10): «Hoy el postre va por la
--     casa». Sale en uno de cada `sorpresa_cada` pedidos, al azar.
--     Apagada mientras no haya texto.
--
--  3. orders.sorpresa — qué sorpresa le tocó a ESE pedido, para que el
--     personal la vea en la tarjeta del pedido. NULL = todavía no se
--     sorteó; '' = se sorteó y no tocó (no se vuelve a sortear).
--
--  Idempotente. Aplicar ANTES de desplegar el código: si falta, el
--  código sigue funcionando (el premio usa su valor por omisión y la
--  sorpresa no sale), pero el panel no puede guardar los ajustes nuevos.
-- ============================================================

alter table public.loyalty_settings
  add column if not exists primer_pedido_doble boolean not null default true,
  add column if not exists sorpresa_texto text,
  add column if not exists sorpresa_cada integer;

alter table public.loyalty_settings
  drop constraint if exists loyalty_settings_sorpresa_cada_rango;
alter table public.loyalty_settings
  add constraint loyalty_settings_sorpresa_cada_rango
  check (sorpresa_cada is null or sorpresa_cada between 2 and 500);

alter table public.loyalty_settings
  drop constraint if exists loyalty_settings_sorpresa_texto_largo;
alter table public.loyalty_settings
  add constraint loyalty_settings_sorpresa_texto_largo
  check (sorpresa_texto is null or char_length(sorpresa_texto) between 1 and 80);

comment on column public.loyalty_settings.primer_pedido_doble is
  'El primer pedido con cuenta, hecho desde el celular del comensal, suma el doble de puntos (mig. 147).';
comment on column public.loyalty_settings.sorpresa_texto is
  'Sorpresa de la casa, p. ej. «Hoy el postre va por la casa». NULL = apagada (mig. 147).';
comment on column public.loyalty_settings.sorpresa_cada is
  'La sorpresa sale en uno de cada N pedidos, al azar (mig. 147).';

alter table public.orders
  add column if not exists sorpresa text;

comment on column public.orders.sorpresa is
  'Sorpresa de la casa que le tocó a este pedido. NULL = sin sortear; '''' = no tocó (mig. 147).';
