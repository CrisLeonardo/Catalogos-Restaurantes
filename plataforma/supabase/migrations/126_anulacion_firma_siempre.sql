-- ============================================================
--  126 · La anulación queda FIRMADA, siempre
--  ------------------------------------------------------------
--  Hallazgo F-06 de la auditoría del salón.
--
--  La migración 079 creó `order_voids.approved_by` para que anular un plato
--  ya cocinado necesitara la firma de alguien más. La columna existía y el
--  código mandaba `NULL` en todas las llamadas: cero filas firmadas, y
--  cualquiera con permiso de mesero podía quitar de la cuenta un plato que
--  ya salió a cocina sin que nadie se enterara.
--
--  El arreglo vive en la aplicación (`lib/void-approval.ts` +
--  `voidOrder`), no aquí: las funciones ya aceptaban el parámetro y hacían
--  lo correcto con él. Lo que cambia en la base es el CONTRATO, que estaba
--  escrito al revés de como se usa ahora, y una comprobación para que no
--  se pueda volver a colar un NULL desde otro sitio.
--
--  Convención nueva:
--    · pedido en NEW (aún no salió a cocina) → approved_by puede ser NULL;
--      corregirse al escribir la comanda no descuadra nada.
--    · cualquier otro estado → approved_by es OBLIGATORIO. Si quien anula
--      ya es encargado, firma con su propio id (antes eso era justo lo que
--      significaba el NULL, y por eso no se distinguía de "nadie firmó").
--
--  Idempotente y sin pérdida: las filas viejas se quedan como están.
-- ============================================================

-- ── Las que ya existen sin firma se marcan como lo que son ───
--    No se pueden atribuir a nadie a posteriori: quedan visibles como
--    anulaciones sin autorizar, que es exactamente el agujero que hubo.
comment on column order_voids.approved_by is
  'Encargado que autorizó la anulación. NULL solo se acepta cuando el pedido '
  'todavía estaba en NEW. Las filas NULL anteriores a la migración 126 son '
  'anulaciones que se hicieron sin que nadie las firmara (hallazgo F-06).';

comment on function void_order_item is
  'Anula N unidades de un ítem sin cerrar el pedido, dejando auditoría en '
  'order_voids. Recalcula la propina en proporción al consumo que queda '
  '(migración 124). p_approved_by es el encargado que FIRMA: obligatorio '
  'salvo que el pedido siga en NEW (migración 126).';

-- ── void_order: auditar ANTES de cancelar ────────────────────
--    Escribía la fila de order_voids DESPUÉS de poner el pedido en CANCEL.
--    Daba igual mientras nadie mirase el estado al auditar; con el
--    disparador de abajo deja de dar igual: un pedido que todavía no había
--    salido a cocina llegaba a la comprobación ya como CANCEL y se le
--    exigía una firma que no le toca. Se mueve el insert delante, que
--    además es el orden en que se cuenta lo ocurrido: primero por qué,
--    después el efecto. Misma transacción, mismo resultado.
create or replace function void_order(
  p_order_id     uuid,
  p_reason       text,
  p_requested_by uuid,
  p_approved_by  uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rid    uuid;
  v_status text;
begin
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'El motivo es obligatorio' using errcode = 'P0001';
  end if;

  select restaurant_id, status into v_rid, v_status from orders where id = p_order_id for update;
  if v_rid is null then
    raise exception 'Pedido no encontrado' using errcode = 'P0001';
  end if;
  if v_status in ('CANCEL', 'DELIVERED') then
    raise exception 'Este pedido ya está cerrado' using errcode = 'P0001';
  end if;

  insert into order_voids (restaurant_id, order_id, item_id, quantity, reason, requested_by, approved_by)
  values (v_rid, p_order_id, null, null, p_reason, p_requested_by, p_approved_by);

  -- Reposición de stock idempotente (migración 021); el status aún no es
  -- CANCEL en este punto así que sí actúa.
  perform restock_order(p_order_id);

  update orders set status = 'CANCEL', cancelled_at = now() where id = p_order_id;
end;
$$;

comment on function void_order is
  'Anula el pedido completo con motivo y firma auditados en order_voids. '
  'p_approved_by es el encargado que FIRMA: obligatorio salvo que el pedido '
  'siga en NEW (migración 126). Audita ANTES de poner CANCEL para que el '
  'disparador de la firma vea el estado real del pedido.';

-- ── El candado, en la base ───────────────────────────────────
--    La comprobación de la aplicación es la que da el mensaje bonito; esta
--    es la que impide que un script, el hub local o un `voidOrder` futuro
--    se salten la firma sin darse cuenta. Mira el estado del pedido en el
--    momento de anular, que es el mismo criterio que usa la pantalla.
create or replace function order_voids_exige_firma()
returns trigger
language plpgsql
as $$
declare
  v_status text;
begin
  if new.approved_by is not null then
    return new;
  end if;

  select status into v_status from orders where id = new.order_id;

  -- Sin pedido (borrado en carrera) no se inventa una regla: se deja pasar
  -- y la fila queda como auditoría de algo que ya no existe.
  if v_status is null or v_status = 'NEW' then
    return new;
  end if;

  raise exception
    'Anular algo que ya salió a cocina necesita la firma de un encargado (approved_by).'
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists order_voids_exige_firma_trg on order_voids;
create trigger order_voids_exige_firma_trg
  before insert on order_voids
  for each row execute function order_voids_exige_firma();

comment on function order_voids_exige_firma is
  'Impide anular fuera de NEW sin approved_by. El mensaje amable lo da la '
  'aplicación (lib/void-approval.ts); esto es la red por debajo.';
