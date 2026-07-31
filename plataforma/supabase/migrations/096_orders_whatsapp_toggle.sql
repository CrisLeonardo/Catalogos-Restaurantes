-- ============================================================
--  Migración 096 — Apagar/encender el aviso de pedidos por WhatsApp
--  ------------------------------------------------------------
--  Hasta ahora, si el restaurante tenía un número de WhatsApp
--  configurado (whatsapp_number/orders_whatsapp), el comensal SIEMPRE
--  veía el botón "Enviar pedido por WhatsApp" al confirmar — no había
--  forma de recibir el número solo como contacto sin que también
--  dispare el mensaje de pedido. Se añade un interruptor explícito
--  que el dueño controla desde /admin/perfil.
--
--  Default true: no cambia el comportamiento de nadie hasta que el
--  dueño lo apague a propósito.
--
--  Idempotente; seguro de re-ejecutar. Ejecutar tras 001..095.
-- ============================================================

alter table restaurants
  add column if not exists orders_whatsapp_enabled boolean not null default true;

comment on column restaurants.orders_whatsapp_enabled is
  'Si es false, el checkout NO ofrece el envío de pedidos por WhatsApp aunque haya whatsapp_number/orders_whatsapp configurado. No afecta el "Contactar al restaurante" del panel de cuenta del comensal.';
