-- ============================================================
--  Migración 110 — Quién activó la PC principal
--
--  La 094 dejó el interruptor y el nombre del equipo, pero el panel seguía
--  contando una verdad a medias: `is_active` es del RESTAURANTE, así que el
--  interruptor salía ENCENDIDO en todas partes. Quien abría el panel desde su
--  celular, o desde la computadora de la casa, veía "PC principal encendida"
--  con el interruptor puesto y entendía —con razón— que ESE aparato era la PC
--  principal del local. No lo era: solo estaba mirando el estado de otra.
--
--    activated_device_id    → id anónimo y estable del dispositivo desde el que
--                             se encendió (localStorage, lib/device-id.ts). El
--                             panel lo compara con el suyo para decir "esta
--                             computadora" o "la de la caja, no esta".
--    activated_device_label → cómo se llama ese aparato en cristiano
--                             ("Windows · Leogin Desktop"), para nombrarlo
--                             antes de que el agente reporte su hostname.
--    activated_at           → cuándo se encendió (la 094 solo guardó el apagado).
--
--  No es un permiso ni un candado: el corte real lo sigue dando el token
--  (revocarlo detiene al agente esté donde esté). Esto es identidad para la
--  pantalla — y por eso NULL es un estado válido: las instalaciones anteriores
--  a esta migración no saben desde dónde se encendieron y el panel lo dice así,
--  en vez de inventarse un "esta computadora".
--
--  Ejecutar DESPUÉS de 001..109.
-- ============================================================

alter table print_agents
  add column if not exists activated_device_id    text,
  add column if not exists activated_device_label text,
  add column if not exists activated_at           timestamptz;

comment on column print_agents.activated_device_id is
  'Id anónimo (localStorage) del dispositivo que encendió la PC principal. NULL = se encendió antes de la migración 110: el panel no afirma cuál es.';
comment on column print_agents.activated_device_label is
  'Nombre legible del dispositivo que la encendió ("Windows · Leogin Desktop"). Se usa hasta que el agente reporta device_name.';
comment on column print_agents.activated_at is
  'Momento en que se encendió la PC principal (complementa disabled_at de la 094).';
