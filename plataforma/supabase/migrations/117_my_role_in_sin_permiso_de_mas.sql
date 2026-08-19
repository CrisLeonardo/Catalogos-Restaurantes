/* ============================================================
   117 — `my_role_in` deja de ser ejecutable por authenticated
   ------------------------------------------------------------
   La migración 113 creó dos ayudantes SECURITY DEFINER y concedió los dos
   a `authenticated`:

     · is_member_of(rid)  — la usan 36 políticas RLS. Las políticas corren
       con el rol de quien llama, así que ESE permiso es imprescindible: sin
       él nadie entraría a nada. Se queda como está.

     · my_role_in(rid)    — no la usa ninguna política, ni la app, ni otra
       función. La añadí "por si acaba haciendo falta", y lo que quedó fue
       una función que escala privilegios (SECURITY DEFINER salta RLS)
       abierta a cualquier sesión autenticada, sin que nada la necesite.

   Lo detectó `scripts/audit-security-definer.mjs`, que corre en cada push
   y que yo no estaba mirando. Se aplica su misma receta, la de la
   migración 084.

   Si algún día se usa dentro de una política RLS, habrá que devolverle el
   permiso a `authenticated` a propósito y anotarla en la lista blanca de
   ese script — no antes.
   ============================================================ */

revoke execute on function public.my_role_in(uuid) from public, anon, authenticated;
grant  execute on function public.my_role_in(uuid) to service_role;
