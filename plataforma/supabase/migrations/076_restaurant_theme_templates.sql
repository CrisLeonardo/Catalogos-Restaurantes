-- ============================================================
--  Migración 076 — Plantillas propias del restaurante
--  · restaurant_theme_templates: el dueño guarda su propio diseño
--    (paleta/tipografía/fondo/portada/catálogo — igual que las 16
--    plantillas builtin de src/lib/theme/templates.ts, solo claves
--    visuales, nunca identidad ni operación) como plantilla reutilizable.
--    Máximo 5 por restaurante, aplicado en el server action (no aquí).
-- ============================================================

create table if not exists restaurant_theme_templates (
  id            uuid        primary key default gen_random_uuid(),
  restaurant_id uuid        not null references restaurants(id) on delete cascade,
  name          text        not null,
  config        jsonb       not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists restaurant_theme_templates_restaurant
  on restaurant_theme_templates(restaurant_id, created_at desc);

comment on table restaurant_theme_templates is
  'Plantillas de tema guardadas por el propio restaurante (dueño/staff). '
  'config = subconjunto visual de ThemeConfig (mismas claves que BuiltinTemplate), '
  'nunca identidad ni operación. Límite de 5 por restaurante aplicado en el server action.';

alter table restaurant_theme_templates enable row level security;

-- Dueño/staff del restaurante (o Super Admin) puede ver, crear y borrar SUS
-- propias plantillas. Los server actions usan service role + su propio check
-- de autorización (mismo patrón que restaurant_themes/waiter_calls); esta
-- política es la segunda capa si algo llegara a consultar con el cliente RLS.
create policy "staff can manage own restaurant_theme_templates"
  on restaurant_theme_templates for all
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and (p.role = 'SUPER_ADMIN'
          or p.restaurant_id = restaurant_theme_templates.restaurant_id)
    )
  );
