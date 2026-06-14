-- Configuración global de la plataforma (Solo Super Admin puede modificar)
-- Se accede exclusivamente vía service role (bypasses RLS).
CREATE TABLE IF NOT EXISTS platform_settings (
  key   text PRIMARY KEY,
  value text NOT NULL DEFAULT ''
);

-- Valores por defecto (sin sobrescribir si ya existen)
INSERT INTO platform_settings (key, value) VALUES
  ('support_whatsapp', ''),
  ('support_email',    '')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
-- Sin políticas públicas: ningún rol de cliente puede leer ni escribir.
-- El service role bypasses RLS y es el único que accede a esta tabla.
