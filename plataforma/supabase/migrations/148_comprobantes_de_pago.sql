-- ============================================================
--  148 · Paga tu plan: comprobantes de transferencia
--  ------------------------------------------------------------
--  docs/planes/PLAN_NECESIDAD_Y_PLAN_EN_LINEA_2026-10-28.md (§3).
--
--  El restaurante paga su mensualidad por transferencia y sube aquí la
--  foto del comprobante; Leogin lo revisa en Super › Finanzas y, al
--  aprobarlo, marca pagadas las facturas que cubre. Antes esto era una
--  captura perdida en el chat de WhatsApp.
--
--  1. payment_proofs — un comprobante por envío. `invoice_ids` son las
--     facturas PENDIENTES que cubría al subirlo (el dueño paga todo lo
--     pendiente de una vez). Estados: SUBMITTED → APPROVED | REJECTED.
--     Solo se accede vía service role (RLS encendido y sin políticas),
--     igual que `invoices`.
--
--  2. Bucket privado `payment-proofs`: el comprobante trae datos
--     bancarios del cliente, así que NO es público; el super admin lo ve
--     con un enlace firmado de corta vida. Ruta: {restaurant_id}/{uuid}.ext
--
--  Idempotente. Aplicar ANTES de desplegar el código: sin la tabla,
--  «Mi suscripción» sigue enseñando cómo pagar, pero no deja subir el
--  comprobante (lo avisa en vez de fallar).
-- ============================================================

create table if not exists public.payment_proofs (
  id             uuid          primary key default gen_random_uuid(),
  restaurant_id  uuid          not null references public.restaurants(id) on delete cascade,
  invoice_ids    uuid[]        not null default '{}',
  amount         numeric(10,2) not null default 0,
  currency       text          not null default 'GTQ',
  file_path      text          not null,
  bank_reference text,
  status         text          not null default 'SUBMITTED'
                 check (status in ('SUBMITTED', 'APPROVED', 'REJECTED')),
  review_note    text,
  submitted_by   uuid          references auth.users(id) on delete set null,
  reviewed_at    timestamptz,
  created_at     timestamptz   not null default now()
);

comment on table public.payment_proofs is
  'Comprobantes de transferencia que suben los restaurantes para pagar su '
  'mensualidad (mig. 148). Acceso solo vía service role.';

create index if not exists payment_proofs_restaurant_idx
  on public.payment_proofs(restaurant_id, created_at desc);

-- La bandeja del super admin solo lista los que esperan revisión.
create index if not exists payment_proofs_submitted_idx
  on public.payment_proofs(created_at)
  where status = 'SUBMITTED';

alter table public.payment_proofs enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  false,
  5242880,   -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
) on conflict (id) do nothing;
