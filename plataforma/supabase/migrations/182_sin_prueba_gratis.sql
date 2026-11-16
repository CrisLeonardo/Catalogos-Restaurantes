-- 182 · Sin prueba gratis en el registro (dueño, 2026-11-15)
--
-- Leogin necesita ingresos desde el primer mes, así que los planes con
-- pedidos (En línea, Estándar, Premium) se cobran desde el día uno. El
-- gancho gratis sigue siendo el plan Básico (menú digital con QR).
--
-- Solo cambia el ajuste que lee el alta: con trial_days = 0,
-- newRestaurantBilling() crea el restaurante con active = true y sin
-- trial_ends_at, y los textos de la web dejan de prometer días gratis.
--
-- No toca a los restaurantes que ya están en prueba: terminan la que se les
-- prometió y leogin_graduate_trials() los pasa a cobro como siempre.
-- Se puede reactivar desde /super/configuracion («Días de prueba»).
--
-- Orden: se puede aplicar antes o después de desplegar el código. Si se
-- aplica antes, el código viejo ya no da prueba (lee este ajuste) pero sus
-- textos aún dicen «30 días gratis» hasta el despliegue.

insert into platform_settings (key, value)
values ('trial_days', '0')
on conflict (key) do update set value = excluded.value;
