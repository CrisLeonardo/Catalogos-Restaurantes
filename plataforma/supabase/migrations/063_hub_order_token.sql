-- ============================================================
-- 063 · Token de seguridad para POST /orders del hub local
-- ------------------------------------------------------------
-- La migración 062 dejó el endpoint LAN del hub (agente-impresion/)
-- sin autenticación, como riesgo aceptado explícito para la v1 (ver
-- plataforma/docs/ARQUITECTURA_OFFLINE.md, sección 7). Esto lo cierra:
-- el agente genera un token propio (persistido en su store local) y lo
-- reporta en el heartbeat igual que hub_url; el navegador del comensal
-- o del mesero lo recibe junto con hubUrl y lo manda de vuelta en cada
-- POST /orders al hub, que lo valida contra el que él mismo generó.
--
-- No es un secreto de altísimo valor (cualquiera que cargue la página
-- de checkout/mesero lo puede ver, igual que hub_url) pero sí evita que
-- cualquier dispositivo en el WiFi del restaurante, sin haber visitado
-- el sitio, pueda crear pedidos falsos contra el hub a ciegas.
-- ============================================================

alter table print_agents add column if not exists hub_order_token text;
