-- Prueba de la 205: una prueba por dueño a la vez, ninguna tras una prueba
-- sin contratar, y cambio de plan durante la prueba. Revierte sus datos.
begin;

do $$
declare
  ana uuid := gen_random_uuid();   -- prueba, cambia de plan y vuelve a Básico
  beto uuid := gen_random_uuid();  -- contrata y abre una sucursal
  r1 uuid; r2 uuid; r3 uuid; r4 uuid; r5 uuid;
  vence timestamptz;
  modos jsonb;
begin
  insert into auth.users (id, email) values (ana, ana::text || '@test.local'), (beto, beto::text || '@test.local');
  insert into profiles (id, role, full_name) values (ana, 'RESTAURANT_OWNER', 'Ana'), (beto, 'RESTAURANT_OWNER', 'Beto')
    on conflict (id) do nothing;
  insert into restaurants (name, slug, status, plan_actual) values ('QA Ana 1', 'qa-205-ana-1', 'active', 'BASICO') returning id into r1;
  insert into restaurants (name, slug, status, plan_actual) values ('QA Ana 2', 'qa-205-ana-2', 'active', 'BASICO') returning id into r2;
  insert into restaurants (name, slug, status, plan_actual) values ('QA Ana 3', 'qa-205-ana-3', 'active', 'BASICO') returning id into r3;
  insert into restaurants (name, slug, status, plan_actual) values ('QA Beto 1', 'qa-205-beto-1', 'active', 'BASICO') returning id into r4;
  insert into restaurants (name, slug, status, plan_actual) values ('QA Beto 2', 'qa-205-beto-2', 'active', 'BASICO') returning id into r5;

  -- 1. Ana empieza su prueba en el primer local.
  perform leogin_iniciar_prueba_de_plan(r1, ana, 'EN_LINEA', 'En línea',
    (select modules from restaurants where id = r1), leogin_plan_module_floor('EN_LINEA'),
    null, '["pickup","delivery"]', 75);
  select trial_ends_at into vence from restaurant_billing where restaurant_id = r1;

  -- 2. No puede abrir otra prueba mientras esa sigue.
  if leogin_motivo_sin_prueba(ana, r2) is distinct from 'en_curso' then
    raise exception 'No detectó la prueba en curso del dueño';
  end if;
  begin
    perform leogin_iniciar_prueba_de_plan(r2, ana, 'EN_LINEA', 'En línea',
      (select modules from restaurants where id = r2), leogin_plan_module_floor('EN_LINEA'),
      null, '["pickup","delivery"]', 75);
    raise exception 'Abrió dos pruebas a la vez para el mismo dueño';
  exception when sqlstate 'LGP01' then null;
  end;
  if (select plan_actual from restaurants where id = r2) <> 'BASICO' then
    raise exception 'El rechazo dejó cambiado el plan del segundo local';
  end if;

  -- 3. Durante la prueba cambia a Premium: misma fecha, nuevo precio, sin confirmación.
  perform leogin_confirmar_prueba_de_plan(r1, ana, 'EN_LINEA', 75, vence, true);
  select config->'orderTypes' into modos from restaurant_themes where restaurant_id = r1;
  begin
    perform leogin_cambiar_plan_en_prueba(r1, ana, 'EN_LINEA', 'PREMIUM', 'Premium',
      (select modules from restaurants where id = r1), leogin_plan_module_floor('PREMIUM'),
      modos, '["dine_in","delivery","pickup"]', 349);
    raise exception 'Aceptó un importe distinto del vigente';
  exception when sqlstate 'LGP01' then null;
  end;
  if not leogin_cambiar_plan_en_prueba(r1, ana, 'EN_LINEA', 'PREMIUM', 'Premium',
      (select modules from restaurants where id = r1), leogin_plan_module_floor('PREMIUM'),
      modos, '["dine_in","delivery","pickup"]', 299) then
    raise exception 'No cambió el plan de la prueba';
  end if;
  if leogin_cambiar_plan_en_prueba(r1, ana, 'EN_LINEA', 'PREMIUM', 'Premium', null, null, null, null, 299) then
    raise exception 'Repitió un cambio ya aplicado';
  end if;
  if not exists (
    select 1 from restaurant_billing b join restaurants r on r.id = b.restaurant_id
     where b.restaurant_id = r1 and r.plan_actual = 'PREMIUM' and b.trial_plan = 'PREMIUM'
       and b.monthly_fee = 299 and b.trial_ends_at = vence and b.active = false
       and b.trial_confirmed_at is null and b.trial_finished_at is null
  ) then raise exception 'El cambio en prueba movió el vencimiento, el precio o dejó la confirmación anterior'; end if;
  if (select config->'orderTypes' from restaurant_themes where restaurant_id = r1) <> '["dine_in","delivery","pickup"]'::jsonb then
    raise exception 'No guardó las modalidades del plan nuevo';
  end if;

  -- 4. Vuelve a Básico antes del vencimiento: la prueba termina sin cobro ni avisos.
  update restaurant_billing set trial_ends_at = now() + interval '70 hours' where restaurant_id = r1;
  select config->'orderTypes' into modos from restaurant_themes where restaurant_id = r1;
  perform leogin_cambiar_plan_en_prueba(r1, ana, 'PREMIUM', 'BASICO', 'Básico',
    (select modules from restaurants where id = r1), leogin_plan_module_floor('BASICO'),
    modos, '["pickup"]', 0);
  if not exists (
    select 1 from restaurant_billing b join restaurants r on r.id = b.restaurant_id
     where b.restaurant_id = r1 and r.plan_actual = 'BASICO' and b.active and b.monthly_fee = 0
       and b.trial_finished_at is not null and b.trial_confirmed_at is null
  ) then raise exception 'La vuelta a Básico no cerró la prueba'; end if;
  perform leogin_cerrar_pruebas_voluntarias();
  perform leogin_generate_monthly_invoices();
  if exists (select 1 from invoices where restaurant_id = r1) then
    raise exception 'Cobró una prueba que terminó en Básico';
  end if;
  if exists (select 1 from leogin_tomar_avisos_de_prueba() where restaurante = r1) then
    raise exception 'Avisó de una prueba que el dueño ya terminó';
  end if;

  -- 5. Su prueba terminó sin contratar: sus locales nuevos ya no llevan prueba.
  if leogin_motivo_sin_prueba(ana, r3) is distinct from 'usada' then
    raise exception 'No detectó la prueba usada del dueño';
  end if;
  begin
    insert into restaurant_billing (restaurant_id, monthly_fee, currency, billing_day, started_at, active,
                                    trial_started_at, trial_started_by, trial_plan, trial_ends_at)
      values (r3, 75, 'GTQ', 1, current_date, false, now(), ana, 'EN_LINEA', now() + interval '14 days');
    raise exception 'El alta abrió otra prueba al mismo dueño';
  exception when sqlstate 'LGP01' then null;
  end;
  begin
    insert into restaurant_billing (restaurant_id, monthly_fee, currency, billing_day, started_at, active,
                                    trial_started_at, trial_plan, trial_ends_at)
      values (r3, 75, 'GTQ', 1, current_date, false, now(), 'EN_LINEA', now() + interval '14 days');
    raise exception 'Abrió una prueba sin dueño';
  exception when sqlstate 'LGP01' then null;
  end;

  -- 6. Quien contrató sí puede probar en su siguiente local.
  perform leogin_iniciar_prueba_de_plan(r4, beto, 'ESTANDAR', 'Estándar',
    (select modules from restaurants where id = r4), leogin_plan_module_floor('ESTANDAR'),
    null, '["pickup","dine_in"]', 149);
  select trial_ends_at into vence from restaurant_billing where restaurant_id = r4;
  perform leogin_confirmar_prueba_de_plan(r4, beto, 'ESTANDAR', 149, vence, true);
  update restaurant_billing set trial_ends_at = now() - interval '1 minute' where restaurant_id = r4;
  perform leogin_cerrar_pruebas_voluntarias();
  if (select plan_actual from restaurants where id = r4) <> 'ESTANDAR' then
    raise exception 'La prueba contratada no conservó su plan';
  end if;
  if leogin_motivo_sin_prueba(beto, r5) is not null then
    raise exception 'Negó la prueba a quien sí contrató';
  end if;
  perform leogin_iniciar_prueba_de_plan(r5, beto, 'EN_LINEA', 'En línea',
    (select modules from restaurants where id = r5), leogin_plan_module_floor('EN_LINEA'),
    null, '["pickup","delivery"]', 75);
end;
$$;

rollback;
