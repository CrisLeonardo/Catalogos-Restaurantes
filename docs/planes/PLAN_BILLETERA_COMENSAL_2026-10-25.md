# Plan · Cuenta Leogin y billetera del comensal (2026-10-25)

**Idea del dueño:** que el comensal tenga **una sola cuenta Leogin** con todos sus restaurantes dentro: sus puntos, sus pedidos y un acceso directo a cada menú. Con esa cuenta iniciada, cada restaurante ya lo reconoce sin registrarse otra vez. Sobre eso se montan funciones que solo Leogin puede dar, porque además del menú maneja la cocina y la caja.

**Decisión (2026-10-25):** por ahora **no hay app nativa**. Todo se hace en la web y en la PWA que ya existen. La app de Android/iOS se evalúa cuando se cumpla el criterio de la sección «Cuándo pasar a app nativa». Lo que se construya aquí lo reutiliza la app después.

**Regla que no se negocia:** cada restaurante solo ve a **sus** clientes. La billetera no le muestra al comensal otros restaurantes mientras está dentro de uno. Leogin no es un marketplace.

---

## Cómo está hoy (lo que se reutiliza y lo que estorba)

| Pieza | Dónde | Estado |
|---|---|---|
| Identidad del comensal | `auth.users` (Google), cookie `sb-leogin-diner-v2` | La **persona** ya es una sola en Supabase: el mismo Google da el mismo `auth_user_id` en todos los restaurantes. Lo que está separado es la **sesión**. |
| Sesión por restaurante | `lib/supabase/cookies.ts` | **Host-only a propósito.** La v1 tenía dominio ancho y «entrar en uno te dejaba dentro de todos»; se corrigió. La billetera no debe deshacer eso a escondidas. Lo correcto es un puente con permiso. |
| Cliente por restaurante | `customers` (mig 010) + `customers.auth_user_id` (mig 058) | Ya es el «vínculo» comensal ↔ restaurante. Índice único `(restaurant_id, auth_user_id)`. Sin políticas para el comensal: se lee desde el servidor con el cliente de servicio. |
| Puntos | `loyalty_accounts`, `getMyAccount()`, `linkMyAccountByPhone()` | Ya exigen sesión Google. La billetera solo los junta. |
| Mis pedidos | `/mis-pedidos` | **Por aparato** (se recuerdan en el teléfono), no por cuenta. |
| Link estable | `/m/<slug>/` en el dominio raíz (`proxy.ts`) | Sirve el menú desde `distleogin.com` con la cookie del comensal atada a la ruta `/m/<id>/`. Clave para que la PWA de la billetera no salte al navegador (ver memoria «PWA cruza subdominios»). |
| Alérgenos y dietas | `lib/dietary-tags.ts` (mig 085) | Las etiquetas por producto ya existen. Falta el perfil del comensal. |
| Lista de espera | `waitlist_entries` (mig 087) | Hoy **solo la escribe el personal**. |
| Notificaciones | `push_subscriptions` (mig 014/015), service worker | Funcionan en Android desde la web. En iPhone solo con la PWA instalada. |
| `/mi-cuenta` | `app/mi-cuenta` | **Es del dueño del restaurante**, no del comensal. La billetera necesita otra ruta. |

---

## Fase 0 · Decisiones del dueño (sin código)

- [ ] **BIL-00a · Ruta de la billetera.** Propuesta: `distleogin.com/billetera` (con «Mis restaurantes» como título visible). Alternativa: `/cuenta`.
- [ ] **BIL-00b · Qué comparte el comensal al unirse a un restaurante.** Propuesta: nombre, teléfono si lo dio y correo de Google. Nunca sus alergias ni sus otros restaurantes.
- [ ] **BIL-00c · Dueño que también es comensal con el mismo Google.** Propuesta: se permite. La billetera usa su propia cookie, así que no se mezcla con la sesión del panel (`account-classification.ts` sigue mandando en el panel).
- [ ] **BIL-00d · Interruptor por restaurante.** Propuesta: «Aparecer en la billetera Leogin» encendido por defecto en todos los planes, incluido BASICO (es lo que hace crecer la red).

## Fase 1 · Cuenta Leogin y entrada con un toque (migración 146)

El corazón del plan. Rama `feat/cuenta-leogin`.

- [ ] **BIL-01 · Casa de la cuenta en el dominio raíz.** Página `/billetera` con «Continuar con Google». Usa una cookie **con nombre propio** (p. ej. `sb-leogin-cuenta`), host-only en `distleogin.com`.
  - ⚠️ No puede llamarse `sb-leogin-diner-v2`: en `distleogin.com` ya viven cookies con ese nombre atadas a `/m/<id>/`. Una con `path=/` y el mismo nombre se mandaría junto con ellas en cada `/m/<id>/` y volvería la «cookie fantasma».
- [ ] **BIL-02 · Puente de sesión.** Cuando el comensal toca un restaurante en la billetera, o «Entrar con Leogin» dentro de un menú:
  1. El restaurante manda a `distleogin.com/billetera/puente?r=<restaurantId>&vuelta=<ruta>`.
  2. Si hay cuenta y es la **primera vez** con ese restaurante, se pide permiso: «¿Unirte a *El Rincón*? Verá tu nombre y teléfono». Si ya se había unido, pasa directo.
  3. El servidor crea un código de un solo uso (tabla `cuenta_puentes`: hash del código, `auth_user_id`, `restaurant_id`, vence a los 60 s, `usado_at`) y redirige al host del restaurante: `/auth/puente?codigo=…`.
  4. Ese host canjea el código **en el servidor** y le crea su propia sesión host-only del comensal (vía `auth.admin.generateLink` + `verifyOtp`, el mismo patrón con el que el PIN del personal ya acuña sesiones reales). Luego enlaza o crea el `customers` con `auth_user_id`.
  - `vuelta` solo acepta rutas relativas del mismo restaurante: nada de redirecciones abiertas.
  - Trampas conocidas: no armar `Location:` con `request.url` ni `nextUrl.origin` (en Render da `localhost:10000`), y cuidado con `redirect()` de server action al mismo host (memoria 2026-08-26).
- [ ] **BIL-03 · Desde la PWA, abrir el restaurante por `/m/<slug>/`.** Así se queda en el mismo origen y la app instalada no muestra la barra del navegador. El puente para `/m/<slug>/` es el mismo, pero la cookie queda con `path=/m/<id>/`.
- [ ] **BIL-04 · «Automático» de verdad, sin frenar el QR.** El menú **no** consulta la billetera en cada visita: un salto de redirección en cada escaneo haría más lento lo que hoy abre al instante. La primera vez en cada aparato y restaurante es un toque. Después, la sesión del restaurante se renueva sola. Entrando desde la billetera, el puente ya va incluido en el enlace.
- [ ] **BIL-05 · Migración 146 `cuenta_puentes`.** RLS encendida sin políticas (solo servidor), la regla de la 137 para el Super Admin y limpieza de códigos vencidos (pg_cron diario).
- [ ] **BIL-06 · Pruebas.** Unitarias del canje (vencido, usado, de otro restaurante, `vuelta` hostil) y una prueba real en local: dos restaurantes `*.localhost` + raíz, mismo Google, y entrar a los dos desde la billetera.

## Fase 2 · La billetera (sin migración)

- [ ] **BIL-07 · «Mis restaurantes».** Tarjetas con logo, nombre, puntos (solo si la lealtad está activa ahí), última visita y botón «Ver menú» (que usa el puente). Datos: `customers` donde `auth_user_id = yo`, más `restaurants` y `loyalty_accounts`. Se lee en el servidor con el cliente de servicio, siempre filtrado por el usuario de la sesión.
- [ ] **BIL-08 · Pedidos recientes de todos.** Los pedidos de los `customers` enlazados, con su estado. `/mis-pedidos` (por aparato) se queda igual para el invitado sin cuenta.
- [ ] **BIL-09 · Salirse de un restaurante.** Quita el `auth_user_id` de ese `customers`. Hay que avisar qué pasa con los puntos: quedan en el cliente y vuelven si se enlaza otra vez.
- [ ] **BIL-10 · Instalable.** Manifiesto propio de `/billetera` («Leogin»), con el ícono de la marca y `start_url` en la billetera.
- [ ] **BIL-11 · Interruptor del restaurante** (si BIL-00d se aprueba). Si está apagado, el restaurante no sale en la billetera, aunque su menú sigue funcionando igual.

## Fase 3 · Alergias y dietas una sola vez (migración 147)

- [ ] **BIL-12 · Perfil del comensal.** Tabla `perfil_comensal` (`auth_user_id` pk, `alergias text[]`, `dietas text[]`, `updated_at`). RLS: cada quien lee y edita solo la suya, más la regla de la 137. Se edita en la billetera con las mismas claves de `dietary-tags.ts`.
- [ ] **BIL-13 · El menú lo respeta.** Con sesión en el restaurante, los productos con un alérgeno del perfil llevan aviso («Contiene lácteos · está en tus alergias»), más un filtro «Ocultar lo que no puedo comer».
  - Siempre con la nota «Depende de cómo etiquete el restaurante; confirma con el personal». Un producto sin etiquetar no es un producto seguro.
- [ ] **BIL-14 · Avisar a cocina (opcional, por pedido).** Casilla en el checkout: «Avisar mis alergias a cocina». Las agrega a la nota del pedido. El restaurante **no** ve el perfil fuera de eso.

## Fase 4 · «Lo de siempre» (sin migración)

- [ ] **BIL-15 · Repetir un pedido.** En el menú (con sesión) y en la billetera: «Lo de siempre» con el último pedido o el más repetido. Arma el carrito con el precio **de hoy**, valida variantes y combos, y avisa lo que ya no está disponible. Nunca cobra el precio viejo.

## Fase 5 · Fila desde el teléfono (migración 148)

- [ ] **BIL-16 · Anotarse a distancia.** RPC `unirse_a_fila(restaurant_id, personas)` con *security definer*: exige sesión de comensal y permite una sola entrada activa por persona y restaurante. Columna nueva `waitlist_entries.auth_user_id`.
- [ ] **BIL-17 · Lo decide el restaurante.** Ajuste «Aceptar fila desde el teléfono», **apagado** por defecto. En el panel, la entrada remota se distingue de la del mostrador.
- [ ] **BIL-18 · Aviso.** Cuando el personal marca «Avisado», sale una notificación push y la página de estado se actualiza en vivo (Realtime) para quien no tiene push (iPhone sin PWA instalada).
- [ ] **BIL-19 · Contra abusos.** La entrada remota se cancela sola si no llega a los N minutos de avisada (N lo pone el restaurante).

## Fase 6 · Mesa en vivo (por diseñar)

- [ ] **BIL-20 · Descubrimiento.** Ver cómo están hoy `table-sessions` y el estado por plato del KDS, y qué se le puede enseñar al comensal sin exponer de más.
- [ ] **BIL-21 · Quién ve la cuenta de la mesa.** No basta con tener el QR: cualquiera que pase vería la cuenta. Propuesta: solo quien pidió desde esa mesa en esta visita, o quien el mesero agregue.
- [ ] **BIL-22 · Vista.** Cuenta de la mesa en tiempo real, estado de cada plato («en preparación», «va saliendo»), «otra ronda» y «llamar al mesero».

---

## Fuera de este plan (para después)

- **Pagar o dividir desde cada teléfono:** necesita una pasarela local y el FEL encendido.
- **Notificaciones de marketing del restaurante** («hace 30 días que no vienes»): el CRM ya existe (mig 138, salud de clientes), pero en iPhone solo llegan con la PWA instalada. Es justo la razón principal para la app nativa.
- **Descubrir restaurantes** en la billetera: solo como sección aparte y opcional, y después de hablarlo con los restaurantes.
- **App nativa** (ver abajo).

## Cuándo pasar a app nativa

Propuesta de criterio (los números los ajusta el dueño):

- Al menos **15 restaurantes activos en una misma zona**, y
- al menos el **25% de las cuentas Leogin** unidas a **2 o más restaurantes**, y
- que los restaurantes pidan notificaciones a sus clientes de iPhone.

Cuando se cumpla: Expo/React Native (o Capacitor) sobre el mismo Supabase, el mismo puente de sesión y la misma billetera.

## Qué medir desde la Fase 2

Cuentas Leogin creadas · comensales con 2+ restaurantes · regreso a 30 días · uso de «Lo de siempre» · entradas remotas a la fila. La analítica está apagada por decisión. Se sacan con consultas en el Super Admin, sin rastreadores externos.

## Migraciones y orden de despliegue

| Nº | Qué | Orden |
|---|---|---|
| 146 | `cuenta_puentes` | Aplicar **antes** del código de la Fase 1 |
| 147 | `perfil_comensal` | Antes del código de la Fase 3 |
| 148 | fila remota (`auth_user_id` + RPC) | Antes del código de la Fase 5 |

Los números son provisionales. Se toma el siguiente libre al abrir cada fase (hoy la última en el repo es la 145, y las 142 a 145 siguen pendientes en producción).

## Riesgos

- **Cookie fantasma:** la billetera necesita un nombre de cookie propio (BIL-01). Es el error que ya nos costó la sesión del comensal una vez.
- **Redirección abierta en el puente:** `vuelta` solo con rutas relativas validadas (BIL-02).
- **Privacidad entre restaurantes:** toda lectura de la billetera, filtrada por el `auth_user_id` de la sesión en el servidor, nunca por un parámetro del cliente.
- **Alergias:** la información es tan buena como el etiquetado del restaurante. El aviso tiene que decirlo (BIL-13).
- **Que frene el lanzamiento:** este plan va **después** de la validación de campo y de aplicar las migraciones pendientes en producción.
