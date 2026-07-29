-- ============================================================
--  Migración 094 — "PC principal del local": interruptor y nombre del equipo
--
--  Hasta ahora la PC servidora del restaurante solo podía ENCENDERSE (instalar
--  el agente). No había forma de apagarla sin desinstalar a mano, ni de saber
--  QUÉ computadora era la principal: el panel decía "Conectado" sin decir
--  dónde. Para un dueño con dos o tres PCs eso era adivinanza pura.
--
--    is_active   → el interruptor. En false el agente deja de autenticar
--                  (ver authenticateAgent en src/lib/print-agent.ts), así que
--                  apagar funciona desde cualquier dispositivo, no solo desde
--                  la PC en cuestión. Los destinos de impresora se CONSERVAN
--                  para que volver a encender no obligue a reconfigurar.
--    device_name → nombre de la computadora que reporta el agente
--                  (deviceName en POST /api/agent/poll). Agentes viejos no lo
--                  mandan: queda NULL y el panel cae a hub_hostname.
--    disabled_at → cuándo se apagó (para el aviso "sin PC principal desde…").
--
--  Ejecutar DESPUÉS de 001..093.
-- ============================================================

alter table print_agents
  add column if not exists is_active   boolean not null default true,
  add column if not exists device_name text,
  add column if not exists disabled_at timestamptz;

comment on column print_agents.is_active is
  'Interruptor de "esta PC es la principal". En false el token deja de autenticar: el agente se detiene solo, se apague desde donde se apague.';
comment on column print_agents.device_name is
  'Nombre de la PC que corre el agente (os.hostname()). NULL en agentes anteriores a 0.7.1.';
comment on column print_agents.disabled_at is
  'Momento en que se apagó la PC principal. NULL mientras is_active = true.';

-- El heartbeat filtra por token; añadir is_active al índice evita que un
-- agente apagado siga pegándole a la fila en cada poll.
create index if not exists print_agents_active_idx
  on print_agents(token_hash) where is_active;
