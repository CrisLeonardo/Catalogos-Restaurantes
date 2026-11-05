-- 162 · Completa el candado de RLS exigido por la 137 en la tabla de la 161.
-- DESPUÉS de la 161 y ANTES del código de 0.15. No modifica datos ni permisos.
-- La 161 ya se aplicó localmente: se conserva intacta.
begin;
create policy super_admin_segundo_factor on public.cobro_intentos
  as restrictive for all to authenticated
  using ((select public.leogin_sesion_con_segundo_factor()))
  with check ((select public.leogin_sesion_con_segundo_factor()));
commit;
