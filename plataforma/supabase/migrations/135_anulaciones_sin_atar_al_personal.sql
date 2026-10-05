-- ============================================================
--  135 · Borrar a alguien del equipo aunque haya anulado pedidos
--  ------------------------------------------------------------
--  `order_voids.requested_by` (NOT NULL) y `order_voids.approved_by`
--  apuntaban a `profiles` SIN `on delete` (migración 079). Como el perfil
--  cae en cascada al borrar la cuenta, borrar a quien alguna vez anuló o
--  firmó una anulación FALLABA: «Quitar del equipo» (Personal) y «Borrar la
--  cuenta» (Super) no hacían nada, y no lo decían (encontrado el
--  2026-10-04 al arreglar la prueba E2E, que anula un pedido y luego no
--  podía borrar al dueño).
--
--  Lo que no se puede perder es el rastro antifraude: QUIÉN anuló y QUIÉN
--  firmó. Así que, antes de soltar la referencia, se guarda el nombre:
--    · `requested_by_name` / `approved_by_name`: el nombre tal como era al
--      anular (lo rellena el disparador de abajo en cada anulación nueva;
--      las de antes se rellenan aquí mismo).
--    · Las dos referencias pasan a `on delete set null`: si la cuenta se
--      borra, la fila sigue diciendo quién fue.
--    · Ojo con la convención de la 126: `approved_by` NULL quería decir
--      «nadie firmó». Ahora NULL con `approved_by_name` lleno quiere decir
--      «firmó alguien cuya cuenta ya no existe». Nadie lo lee así hoy en la
--      app (solo se cuentan unidades anuladas), pero queda en el comentario
--      de la columna.
--    · Toda anulación sigue teniendo autor: el NOT NULL de `requested_by`
--      se cambia por «o el id o el nombre».
--
--  Idempotente. Ejecutar DESPUÉS de 001..134.
-- ============================================================

alter table public.order_voids add column if not exists requested_by_name text;
alter table public.order_voids add column if not exists approved_by_name  text;

-- ── El nombre de una persona del equipo, para dejarlo escrito ──
--    El nombre de su perfil; si no tiene, su correo; si tampoco, su id (las
--    cuentas de PIN pueden no tener ni nombre ni correo visible).
create or replace function public.nombre_para_bitacora(p_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(p.full_name), ''), u.email, p.id::text)
    from public.profiles p
    left join auth.users u on u.id = p.id
   where p.id = p_id;
$$;

-- ── Las anulaciones que ya existen ───────────────────────────
update public.order_voids
   set requested_by_name = public.nombre_para_bitacora(requested_by)
 where requested_by is not null
   and requested_by_name is null;

update public.order_voids
   set approved_by_name = public.nombre_para_bitacora(approved_by)
 where approved_by is not null
   and approved_by_name is null;

-- ── Las nuevas: el nombre se escribe al anular ───────────────
create or replace function public.order_voids_guarda_nombres()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.requested_by is not null and new.requested_by_name is null then
    new.requested_by_name := public.nombre_para_bitacora(new.requested_by);
  end if;
  if new.approved_by is not null and new.approved_by_name is null then
    new.approved_by_name := public.nombre_para_bitacora(new.approved_by);
  end if;
  return new;
end;
$$;

drop trigger if exists order_voids_guarda_nombres_trg on public.order_voids;
create trigger order_voids_guarda_nombres_trg
  before insert on public.order_voids
  for each row execute function public.order_voids_guarda_nombres();

-- ── Soltar la referencia al borrar la cuenta ─────────────────
alter table public.order_voids alter column requested_by drop not null;

alter table public.order_voids drop constraint if exists order_voids_requested_by_fkey;
alter table public.order_voids
  add constraint order_voids_requested_by_fkey
  foreign key (requested_by) references public.profiles(id) on delete set null;

alter table public.order_voids drop constraint if exists order_voids_approved_by_fkey;
alter table public.order_voids
  add constraint order_voids_approved_by_fkey
  foreign key (approved_by) references public.profiles(id) on delete set null;

-- Toda anulación tiene autor: su id mientras la cuenta exista, su nombre
-- después. (El disparador lo rellena antes de que esto se compruebe.)
alter table public.order_voids drop constraint if exists order_voids_autor_check;
alter table public.order_voids
  add constraint order_voids_autor_check
  check (requested_by is not null or requested_by_name is not null);

comment on column public.order_voids.requested_by_name is
  'Nombre de quien anuló, guardado al anular (migración 135): sigue diciendo '
  'quién fue aunque su cuenta se borre y requested_by quede en NULL.';
comment on column public.order_voids.approved_by_name is
  'Nombre de quien firmó, guardado al anular (migración 135). approved_by NULL '
  'con este campo lleno = lo firmó alguien cuya cuenta ya no existe; NULL en '
  'los dos = nadie firmó (ver la 126).';

-- ── Nadie las llama desde fuera (patrón de la migración 084) ──
revoke execute on function public.nombre_para_bitacora(uuid) from public, anon, authenticated;
grant execute on function public.nombre_para_bitacora(uuid) to service_role;
revoke execute on function public.order_voids_guarda_nombres() from public, anon, authenticated;
grant execute on function public.order_voids_guarda_nombres() to service_role;
