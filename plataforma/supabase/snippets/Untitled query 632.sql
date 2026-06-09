-- 1. Verifica que el usuario existe en auth
select id, email, email_confirmed_at from auth.users;

-- 2. Verifica que el perfil existe
select * from public.profiles;