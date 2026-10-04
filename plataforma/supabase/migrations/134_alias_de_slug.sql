-- ============================================================
--  134 · QR de mesa con dirección corta (D-5, auditoría 2026-10-02 AJU-06)
--  ------------------------------------------------------------
--  Los QR de mesa llevaban el UUID del restaurante
--  (`/m/aaaaaaaa-aaaa-…/7`): el código salía más denso —peor lectura
--  impreso en pequeño— y la dirección era ilegible. Pasan a
--  `/m/<slug>/7`, y los ya impresos con UUID siguen funcionando igual.
--
--  El UUID se había elegido porque NUNCA cambia: si el Super Admin le
--  cambiaba el slug a un restaurante, un QR impreso con el slug viejo
--  dejaría de abrir su menú. Esta tabla cierra ese hueco: cada slug que
--  un restaurante deja de usar se queda apuntando a él, y el proxy
--  (`resolveStableLinkTenant`) lo resuelve cuando el slug actual no
--  coincide. Un QR impreso con `/m/<slug-viejo>/7` sigue abriendo el
--  mismo restaurante para siempre.
--
--  La otra mitad: un slug que ya usó un restaurante NO puede quedárselo
--  otro — sus QR impresos abrirían el menú equivocado. La app lo avisa
--  antes (lib/slug.ts) y el disparador de abajo lo impide en la base.
--
--  Idempotente. Ejecutar DESPUÉS de 001..133.
-- ============================================================

create table if not exists public.restaurant_slug_aliases (
  slug          text primary key,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  created_at    timestamptz not null default now()
);

create index if not exists restaurant_slug_aliases_restaurant_idx
  on public.restaurant_slug_aliases (restaurant_id);

-- Lectura pública, igual que el slug de `restaurants`: el proxy la consulta
-- con la llave anónima para resolver el QR. Nadie escribe desde fuera: solo
-- el disparador (security definer).
alter table public.restaurant_slug_aliases enable row level security;

drop policy if exists "Alias de slug: lectura pública" on public.restaurant_slug_aliases;
create policy "Alias de slug: lectura pública"
  on public.restaurant_slug_aliases
  for select
  using (true);

grant select on public.restaurant_slug_aliases to anon, authenticated;

-- ── Guarda el slug viejo al cambiarlo ────────────────────────
create or replace function public.guardar_slug_anterior()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.slug is distinct from old.slug then
    insert into public.restaurant_slug_aliases (slug, restaurant_id)
    values (old.slug, old.id)
    on conflict (slug) do update
      set restaurant_id = excluded.restaurant_id,
          created_at    = now();
    -- Si el restaurante vuelve a un slug suyo de antes, deja de ser alias.
    delete from public.restaurant_slug_aliases
     where slug = new.slug and restaurant_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists restaurants_guardar_slug_anterior on public.restaurants;
create trigger restaurants_guardar_slug_anterior
  after update of slug on public.restaurants
  for each row execute function public.guardar_slug_anterior();

-- ── Un slug de otro restaurante no se reutiliza ──────────────
create or replace function public.impedir_slug_de_otro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.restaurant_slug_aliases a
     where a.slug = new.slug and a.restaurant_id <> new.id
  ) then
    raise exception 'La dirección "%" la usó otro restaurante y sus QR impresos siguen apuntando ahí.', new.slug
      using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists restaurants_impedir_slug_de_otro on public.restaurants;
create trigger restaurants_impedir_slug_de_otro
  before insert or update of slug on public.restaurants
  for each row execute function public.impedir_slug_de_otro();

-- ── Nadie las llama desde fuera (patrón de la migración 084) ──
-- Son funciones de disparador `security definer`: solo las ejecuta la base
-- al cambiar un slug. Postgres concede EXECUTE a PUBLIC por defecto, y
-- scripts/audit-security-definer.mjs (en la CI) exige cerrarlas.
revoke execute on function public.guardar_slug_anterior() from public, anon, authenticated;
grant execute on function public.guardar_slug_anterior() to service_role;
revoke execute on function public.impedir_slug_de_otro() from public, anon, authenticated;
grant execute on function public.impedir_slug_de_otro() to service_role;
