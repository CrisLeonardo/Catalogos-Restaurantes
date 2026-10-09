# Acceso y monitoreo antes de lanzar — 2026-10-08

> **Encargo:** revisar si la forma de entrar (tú, tus clientes, su personal, los
> comensales) y la forma de vigilar los restaurantes son las correctas para
> lanzar a producción, e implementar todas las mejoras. Este archivo es **el
> tablero**: aquí se marca lo que se va trabajando.
>
> **Veredicto de la revisión:** el modelo es el correcto y se queda — una cuenta
> con varios restaurantes (Mi cuenta + `restaurant_members`), personal por PIN
> con aparatos de confianza y respaldo sin internet, gerente con
> `usuario@restaurante`, comensales sin cuenta y Google solo para puntos. Lo que
> falta está sobre todo en **tu** acceso (super admin) y en **tu** monitoreo.

## Cómo usar este archivo

- `- [ ]` pendiente · `- [x]` hecho (al marcarlo: fecha y commit al final).
- **P0** antes de lanzar · **P1** primeras semanas · **P2** después.
- 🙋 = solo lo puedes hacer tú (claves, paneles de proveedores, producción).

---

## Lo que solo puedes hacer tú

**En este orden** (importa: ver las notas de los pasos 1 y 4):

1. 🙋 **YA, antes que nada: correr la 136, la 139 y la 140 en producción**
   (Supabase → SQL Editor → pegar cada archivo de
   `plataforma/supabase/migrations/` → Run, en ese orden):
   `136_candados_de_escritura.sql`, `139_candados_de_pedidos_y_dinero.sql` y
   `140_permisos_por_seccion.sql`. Cierran SEC-01…06. **No dependen del código
   nuevo**: la app de hoy ya escribe todo eso con la llave de servidor, o con
   la sesión de quien SÍ tiene la sección (verificado archivo por archivo), así
   que se pueden correr aunque todavía no despliegues.
2. 🙋 **Supabase → Authentication → Multi-Factor:** confirmar que **TOTP (app
   autenticadora)** está activado para inscribir y verificar. Es gratis en
   todos los planes (el de SMS no, y no se usa).
3. 🙋 **Desplegar el código** (fusionar a `main` → Render).
4. 🙋 **Después** del despliegue, correr la **137** y luego la **138**
   (`137_super_admin_con_segundo_factor.sql`, `138_salud_de_clientes.sql`).
   ⚠️ La 137 NO antes de desplegar: le cierra la base al Super Admin sin
   código, y el panel viejo no sabe pedírselo — te quedarías fuera de `/super`.
   La 138 usa una función de la 137, por eso va después.
5. 🙋 **Entrar a `/super`**: te manda solo a configurar la app (Google
   Authenticator, Microsoft Authenticator, Authy o 1Password). Guarda la
   **clave de texto** que enseña en tu gestor de contraseñas (con ella puedes
   añadir la cuenta a una segunda app de respaldo). Si pierdes el celular, el
   rescate es por SQL (ver ACC-01).
6. 🙋 **Sentry** (gratis): crear cuenta en sentry.io → proyecto de tipo
   «Next.js» o «Node» → copiar el **DSN** → en Render poner
   `SENTRY_DSN=<ese DSN>`. No hay que instalar nada: el código habla con Sentry
   directo. Opcional: `SENTRY_ENVIRONMENT`.
7. 🙋 **Monitor externo** (gratis): en UptimeRobot o Better Stack, un monitor
   HTTP(S) cada 5 min a `https://distleogin.com/api/health/deep`, que avise si
   no responde **200**. Ponle tu correo y la app del celular.
8. 🙋 **Avisos de clientes en riesgo a tu celular** (MON-04):
   - En Render: `SALUD_CRON_SECRET=<una clave larga al azar>`
     (`openssl rand -base64 32`, o cualquier generador de contraseñas).
   - En GitHub → el repositorio → Settings → Secrets and variables → Actions:
     `SALUD_CRON_URL` = `https://distleogin.com/api/cron/salud-clientes` y
     `SALUD_CRON_SECRET` = la misma clave. El reloj ya está en
     `.github/workflows/salud-clientes.yml` (cada hora, gratis).
   - En tu celular, entra a `/super` y pulsa **«Avisarme en este celular»**
     (debajo de «Requiere tu atención»). Usa las mismas claves VAPID que ya
     tienen los avisos de los restaurantes.
   - Sentry (paso 6) y estos avisos se pueden poner el mismo día que despliegas.
9. 🙋 Las migraciones de antes que sigan pendientes (ver MIG-01): primero
   corre `plataforma/supabase/verificar_migraciones.sql` y te dice cuáles.
10. 🙋 Usar una cuenta de super admin **solo para eso**, distinta de la de tus
    pruebas y de tu restaurante demo (ACC-07).

---

## P0 — Antes de lanzar

### 🚨 Seguridad de la base de datos (encontrado al implementar, lo más urgente)

> Reproducido contra la base local con una cuenta desechable y **solo la clave
> pública** (la que va en el navegador). Antes de la 136: 5 de 7 ataques
> funcionaban. Después: 0 de 7, y el dueño sigue pudiendo editar su ficha.
> Prueba: `escalada.mjs` (en el scratchpad de la sesión). **Como esto viene de
> la migración 003, casi seguro está abierto también en producción.**

- [x] **SEC-01 · Cualquiera podía hacerse SUPER_ADMIN.** `profiles_update_own` y
  `profiles_insert_own` (mig 003) no miraban columnas: un dueño, un mesero o
  hasta un **comensal que entró con Google** se ponía `role = 'SUPER_ADMIN'`
  (o `restaurant_id` de otro local) y veía todos los restaurantes. Arreglo:
  se quitan las dos reglas y un disparador impide que una sesión toque su
  rol, restaurante, permisos u organización. ✅ 2026-10-08, mig 136.
- [x] **SEC-02 · Un dueño se podía subir el plan solo.** `restaurants_update_member`
  deja escribir la fila entera a cualquier miembro (mesero incluido): `plan_actual
  = 'PREMIUM'` y el disparador le encendía los módulos. Arreglo: disparador que
  protege plan, módulos, estado, slug, organización y candados de PIN; el resto
  de la ficha se sigue guardando igual. ✅ 2026-10-08, mig 136.
- [x] **SEC-03 · Cobros, PIN, aparatos, llaves y bitácora abiertos a escritura.**
  Cualquier miembro podía marcarse cobros, leer los hashes de PIN de sus
  compañeros (4 cifras: se rompen en segundos), registrarse como aparato de
  confianza, crear llaves de API o borrar la bitácora. La app ya escribía todo
  eso con la llave de servidor: quedan en solo lectura (y `staff_pins` sin
  acceso). ✅ 2026-10-08, mig 136.
- [ ] **SEC-04 · 🙋 Correr la 136 en producción YA** (paso 1 de la lista de
  arriba). Es independiente de todo lo demás y no cambia nada que la app haga.
- [x] **SEC-05 · Las reglas viejas: pedidos y dinero.** Migración **139**,
  reproducido con la clave pública antes y después (`escalada2.mjs`, 9/9):
  - fuera las 4 **inserciones públicas** que la app no usa: pedidos y líneas
    con precios inventados, «llamar al mesero» en ráfaga (suena en cocina),
    calificaciones falsas — la app los crea desde el servidor y con límite;
  - **pedidos**: el personal ya no puede moverlos a otro restaurante ni
    cambiarles total, descuento, propina, cupón… (disparador de columnas; el
    panel sigue cambiando estado, horas, método de pago y efectivo recibido);
    y **ningún pedido se borra** con la sesión (regla restrictiva);
  - **dinero en solo lectura** para los miembros: tarjetas de regalo, puntos,
    cortes de caja, cupones, pagos, cuentas divididas y líneas del pedido (la
    app los escribe siempre desde el servidor). Antes un mesero con su token
    podía cargarle saldo a una tarjeta o crearse un cupón del 100%.
  ✅ 2026-10-09 — aislamiento 21/21, E2E 2/2, auditorías en 0.

- [x] **SEC-06 · Los permisos por sección no se cumplían.** El dueño reparte
  secciones a su personal, pero eso solo ESCONDÍA ENLACES. Tres agujeros:
  - **Pantallas:** un mesero con solo «Pedidos» tecleaba `/panel/<slug>/finanzas`
    y entraba. Ahora el layout del panel pide la sección de cada ruta, sacada
    del MISMO menú (`seccionDeRuta` en `lib/admin-nav.ts`, 5 pruebas): bloquea
    justo lo que el menú esconde.
  - **Acciones:** varias solo miraban que la persona fuera del restaurante,
    no su sección — el horario, las zonas, el perfil, el diseño, las plantillas,
    los modos de pedido (`restaurant.ts`), las reservaciones y las recetas.
    Nuevo `lib/auth/seccion.ts` (`puedeEnSeccion`, mismo cálculo que el panel).
    Cupones, FEL, módulos, impresión, proveedores, lealtad, inventario y el
    salón ya lo comprobaban bien.
  - **Base de datos** (mig **140**): `leogin_puede()` = el `can()` de la app en
    SQL. Lo que el panel escribe con la sesión (platillos, categorías, zonas,
    diseño, ficha del restaurante) solo con la sección; 19 tablas que solo
    escribe el servidor (clientes, reservaciones, proveedores, compras,
    inventario, recetas, facturación, mesas, llamadas…) en solo lectura.
  ✅ 2026-10-09 — `secciones.mjs` 14/14 (mesero no toca precios, categorías,
  ficha, diseño ni zonas; quien tiene «Catálogo» edita platillos pero no
  categorías; el dueño todo) y `rutas.mjs` 7/7 con una sesión real de mesero
  contra el servidor (Pedidos abre; Finanzas, Menú, Perfil, Horarios y
  Clientes devuelven a Hoy). Aislamiento 21/21, E2E en verde, auditorías en 0.

### Tu acceso (super admin)

- [x] **ACC-01 · Segundo factor obligatorio para el super admin.** Hoy entra con
  correo/contraseña o Google y con eso tiene acceso total. Hecho así: pantalla
  `/admin/dos-pasos` (QR + clave para teclear + código; luego solo el código en
  cada entrada). El candado vive en **un solo sitio**, `getStaffUser()`: una
  sesión que debe el código cuenta como «sin sesión» para las ~80 pantallas y
  acciones que miran `SUPER_ADMIN` (layouts, `currentSuperAdmin()`, las que
  dan el cliente de servicio), así ninguna se puede olvidar. Login con
  contraseña, callback de Google y las dos pantallas de login desvían a
  `/admin/dos-pasos`. Regla pura con 19 pruebas (`segundo-factor-policy.ts`).
  ✅ 2026-10-08 — verificado en el navegador contra Supabase local: login con
  contraseña → pantalla del código; `/super` y `/panel/<slug>` sin código →
  de vuelta a la pantalla; código falso rechazado con su mensaje; inscripción
  con QR/clave → entra a `/super`; salir y volver a entrar → solo pide el
  código. Bug encontrado y arreglado al probar: tras verificar aterrizaba en el
  login (Next repinta la página al cambiar cookies y su redirección ganaba) →
  `segundo-factor-destino.ts`, mismo destino para la acción y la pantalla.

  > **Si pierdes o cambias el celular** (Supabase → SQL Editor):
  > ```sql
  > delete from auth.mfa_factors
  >  where user_id = (select id from auth.users where email = 'TU_CORREO');
  > ```
  > Al volver a entrar, la pantalla te pide configurar la app de nuevo. Guarda
  > la clave de texto que enseña al configurarla (en tu gestor de contraseñas):
  > con ella puedes añadir la misma cuenta a una segunda app de respaldo.

- [x] **ACC-02 · El candado también en la base de datos.** ~50 reglas de RLS dan
  acceso total a `role = 'SUPER_ADMIN'`. Si el segundo factor solo viviera en
  las pantallas, quien tenga tu contraseña pide un token directo a Supabase
  (la clave anon es pública) y lee todo sin pasar por el sitio. Migración
  **137**: regla **restrictiva** en las 68 tablas con RLS — el Super Admin solo
  ve datos con sesión `aal2`; todos los demás, sin ningún cambio. Y la marca
  `app_metadata.requiere_segundo_factor` (solo la escribe el servidor) para
  exigirlo también ANTES de que hayas configurado la app. ✅ 2026-10-08 —
  probado de punta a punta contra la base SIN pasar por el sitio
  (`segundo-factor.mjs`, 8/8): con solo la contraseña ve 0 restaurantes, ni su
  propio perfil, ni cobros; código falso → 422; código bueno → `aal2` y ve los
  4; sesión nueva sin código → 0 otra vez. La auditoría de `security definer`
  de la CI sigue en 0 hallazgos.

### Tus clientes y su equipo

- [x] **ACC-03 · «Cambiar contraseña» estando dentro.** Hoy solo existe por
  enlace de correo, y con Resend apagado no sale: todo cambio pasa por tu
  WhatsApp. Hecho: **Mi cuenta → Seguridad** (`/mi-cuenta/seguridad`), con la
  actual + la nueva dos veces; se llega desde el correo en la cabecera de Mi
  cuenta, desde «Mi contraseña» en la tarjeta de sesión del panel y desde el
  menú «⋯» del teléfono (así llega también el gerente). Cuentas solo-Google y
  de PIN ven por qué no aplica. Al cambiarla se cierran las sesiones de los
  demás aparatos y la tuya sigue. ✅ 2026-10-08 — verificado en el navegador
  (actual equivocada → error; buena → cambia; la vieja deja de entrar; la
  sesión sigue viva). Hallazgo medido: `admin.updateUserById` cierra TODAS las
  sesiones (también la propia); por eso se cambia con la sesión
  (`updateUser`), que solo cierra las otras. Ojo para el rescate del Super:
  reponer una contraseña desde `/super` saca a esa persona de todos lados (es
  lo correcto en un rescate).
- [x] **ACC-04 · Rescate por WhatsApp sin suplantación.** Hoy cualquiera puede
  escribirte «soy el dueño de X». En la ficha de rescate del super admin, antes
  de reponer la contraseña: enseñar el WhatsApp registrado del restaurante y
  pedir confirmar que la petición vino de ese número. Regla escrita aquí abajo.
  ✅ 2026-10-09 — en
  la ficha de la cuenta Y en la pestaña Accesos del restaurante (las dos
  puertas de reponer contraseña): se enseñan los WhatsApp registrados de sus
  locales y hay que marcar «Confirmé que la petición vino del número o correo
  registrado»; la acción lo exige también (no basta saltarse la pantalla) y
  queda en la bitácora (`identidad_confirmada`).

> **Regla de rescate (ACC-04):** solo repones una contraseña si la petición
> llega del WhatsApp registrado en la ficha del restaurante. Si llega de otro
> número, devuelves la llamada al registrado. Nunca por un número nuevo, aunque
> la historia sea convincente. La bitácora registra cada reposición.

### Monitoreo

- [x] **MON-01 · Enterarte de los errores (Sentry).** Hoy los errores quedan en
  los registros de Render y nadie los lee. Hecho **sin SDK**: `instrumentation.ts`
  (`onRequestError` de Next: páginas, acciones, rutas y proxy) y `/api/errores`
  (lo que revienta en el navegador, desde las 3 pantallas `error.tsx`) mandan
  el error a la API HTTP de Sentry (`lib/observability/`, 9 pruebas). Cero bytes
  más en el navegador. Apagado sin `SENTRY_DSN`. Va la ruta PLANTILLA, nunca la
  real ni cookies ni cabeceras. ✅ 2026-10-08 — verificado con un receptor
  local haciéndose pasar por Sentry: llegan los dos tipos de error con el
  formato correcto, y un `?token=` en la dirección NO viaja. 🙋 Falta poner
  `SENTRY_DSN` en Render (paso 6).
- [x] **MON-02 · Saber si el sitio está arriba.** `/api/health` no toca la base
  (y no debe: lo usa el modo sin internet). Ruta nueva `/api/health/deep` que
  consulta base de datos y Auth y responde 503 si alguna falla o tarda más de
  5 s. ✅ 2026-10-08 — verificado apagando la base local: 503 con
  `baseDeDatos:false`, y `/api/health` sigue en 200. 🙋 Falta crear el monitor
  (paso 7).

### Producción

- [ ] **MIG-01 · Migraciones de acceso aplicadas en prod.** Confirmar 109
  (bitácora de accesos), 131 (lista de cuentas), 132 (bitácora del super
  admin), 134 (alias de slug), 135 (anulaciones), y las nuevas **136**,
  **139** y **140** (YA), **137** y **138** (después de desplegar).
  Sin ellas no se rompe nada, pero esas pantallas callan.
  **Cómo saberlo en 10 segundos:** pegar
  `plataforma/supabase/verificar_migraciones.sql` en el SQL Editor de
  producción → Run. Solo lee; lista 091→140 con «sí»/«NO» y las que faltan
  salen arriba (probado contra la base local: todas en «sí»).

---

## P1 — Primeras semanas

- [x] **ACC-05 · El gerente cambia su contraseña en el primer ingreso.** Hoy la
  elige el dueño, la manda por WhatsApp y nunca cambia: el dueño la conoce para
  siempre y la bitácora no distingue quién entró. ✅ 2026-10-09 — marca
  `app_metadata.debe_cambiar_contrasena` (solo la escribe el servidor) al dar
  de alta con usuario o reponer la contraseña (dueño, y los 3 caminos del
  Super). Panel, mesero, cocina y Mi cuenta mandan a «Seguridad» hasta que la
  cambie; al cambiarla se quita sola. Verificado en el navegador con un
  gerente de prueba creado desde Personal: entra → cambio obligatorio →
  escribir la dirección del panel no lo deja pasar → la cambia → «Continuar»
  → su panel. Medido: quitar la marca NO cierra la sesión y no toca las demás
  claves de `app_metadata`.
- [x] **ACC-06 · Recordatorio para activar el candado de aparatos.** Nace
  apagado (correcto), pero mientras tanto la lista de nombres del personal se
  ve desde cualquier sitio y el PIN se prueba desde internet. Aviso en Hoy a
  los ~7 días: «Reconocimos N aparatos; activa el candado». ✅ 2026-10-09 —
  regla pura con 6 pruebas (`lib/device-lock-reminder.ts`); solo al dueño y
  fuera del arranque (como los demás avisos suaves). Verificado en pantalla:
  sale arriba en «Necesita tu atención» con «Encender» → Personal.
- [x] **ACC-08 · Sesión según el aparato.** Hoy toda sesión de correo/Google
  cierra a los 30 min sin uso, también en el celular personal del dueño.
  Queda: 30 min en los aparatos de confianza del local y para el super admin;
  sesión larga en el celular/compu personal. Va junto con ACC-09. ✅
  2026-10-09 — **7 días** en el aparato personal; 30 min en los del local (de
  confianza o PC principal) y SIEMPRE para el Super Admin
  (`lib/auth/session-window.ts`, 6 pruebas). La ventana viaja FIRMADA en la
  cookie de actividad (el vencimiento del pase es el plazo): editarla a mano
  para alargarla la invalida; las marcas viejas se respetan (desplegar no saca
  a nadie). 9 pruebas en `session-activity.test.ts`.
- [x] **ACC-09 · Volver a pedir la contraseña para lo delicado.** Lo que hace
  segura la sesión larga: cambiar plan, borrar restaurante, traspasar dueño,
  cambiar el PIN de entrada, exportar clientes. Vale 10 min. ✅ 2026-10-09 —
  7 acciones: PIN de entrada (poner/quitar), respaldo completo, lista de
  clientes (Excel y PDF), APAGAR el candado de aparatos, reponer la contraseña
  del gerente y sacar a alguien del equipo. Diálogo «Confirma que eres tú»
  (contraseña, o Google para cuentas solo-Google, que vuelve a la misma
  pantalla). Se pregunta ANTES de enviar (en React 19 un formulario enviado se
  vacía) y la acción lo exige igual. Cuenta como reciente: sesión nacida hace
  <10 min (el `amr` del token) o el pase firmado del diálogo. Verificado en el
  navegador: contraseña mala → error; buena → descarga el respaldo; PIN de
  entrada se guarda con su valor intacto; «Quitar» encadena «¿Seguro?» +
  identidad en una sola pasada.
- [x] **MON-03 · Clientes en riesgo en «Requiere tu atención».** Hoy solo avisa
  de cobro. Nuevas: restaurante sin pedidos en 7 días, PC de impresión sin
  contacto en horario de servicio, impresiones fallidas, cuenta sin
  restaurante a las 48 h, restaurante sin platillos a los 3 días. ✅
  2026-10-09 — mig **138** (`leogin_salud_restaurantes()` y
  `leogin_cuentas_sin_restaurante()`, una consulta para toda la plataforma,
  solo service_role) + reglas puras con 15 pruebas (`lib/client-health.ts`).
  Visto en pantalla y corregido: una PC apagada desde julio salía como «hace
  2160 h» y habría sonado en tu celular cada 6 h para siempre → ahora «se cayó
  hoy en horario» es urgente y «lleva N días sin conectarse» es un aviso
  tranquilo. Más de 6 avisos → «Ver N más».
- [x] **MON-04 · Que te avise a ti.** Notificación al celular para las alertas
  graves, con la infraestructura de push que ya existe. ✅ 2026-10-09 —
  `/api/cron/salud-clientes` (Bearer `SALUD_CRON_SECRET`, 404 sin la
  variable) + `.github/workflows/salud-clientes.yml` (cada hora) + botón
  «Avisarme en este celular» en `/super`. No repite el mismo aviso antes de
  6 h (`super_alertas_enviadas`). Verificado: sin secreto 401, secreto malo
  401, 1ª corrida avisa, 2ª no repite. **Sin verificar:** la entrega real a un
  celular (el navegador de pruebas tiene las notificaciones bloqueadas) —
  pruébalo al activarlo (paso 8).

## P2 — Después

- [ ] **ACC-07 · Cuenta de super admin dedicada.** 🙋 Ver la lista de arriba.
- [ ] **ACC-10 · Resend.** 🙋 Tiene plan gratuito; el código ya está listo
  (`RESEND_API_KEY` + `EMAIL_FROM` con SPF/DKIM en Cloudflare) y al ponerlo
  vuelven solos «Olvidé mi contraseña» y la verificación de correo.
- [x] **ACC-11 · Auditoría que vigile ACC-02.** Prueba en la CI que falle si una
  tabla de `public` con RLS no lleva la política restrictiva de `aal2` (mismo
  estilo que `scripts/audit-security-definer.mjs`). ✅ 2026-10-09 —
  `scripts/audit-rls-candados.mjs`, ya en la CI: además del candado del
  segundo factor comprueba los disparadores y reglas de las migraciones 136 y
  139 (perfil, plan, pedidos, PIN, dinero en solo lectura, sin inserciones
  públicas, pedidos que no se borran). Probado metiendo regresiones a
  propósito: las caza y pone la CI en rojo.

## Evaluado y descartado por ahora

- **Passkeys:** cuando Supabase las soporte de forma estable como acceso principal.
- **Enlace mágico para dueños:** depende del correo.
- **Una cuenta por restaurante:** ya descartado (PLAN_ACCESO_MULTICUENTA §2).
- **Código por WhatsApp:** cobra por mensaje; cuando exista la API (D-6).
- **Dirección aparte para el super admin:** no aporta; el segundo factor sí.

---

## Bitácora

- **2026-10-09 (madrugada)** — SEC-06 hecho (rutas + acciones + mig 140).
  928 pruebas. E2E: tras borrar la caché de `.next` (trampa conocida: después
  de un `next build`, `next dev` daba 404 en todo el panel) corrió 8 veces:
  6 en verde; las 2 rojas fueron de la máquina cargada justo después de
  compilar en frío (tiempo total de 5 min agotado, y Supabase Auth que no
  respondió a tiempo al crear el usuario de prueba). La anulación devolvió
  `success` todas las veces que se llegó a ella. Las 3 últimas corridas,
  seguidas, en verde.
- **2026-10-09 (noche)** — Hechos todos los P1 (ACC-04/05/06/08/09, MON-03/04,
  SEC-05) y ACC-11. Migraciones nuevas 138 y 139. 920+ pruebas unitarias,
  aislamiento 21/21, E2E 2/2, ataques con la clave pública 7/7 (136) y 9/9
  (139), auditorías de `security definer` y de candados en 0. Pendiente tuyo:
  la lista de arriba (migraciones, variables de Render, secretos de GitHub,
  activar avisos en tu celular). Quedan ACC-07 y ACC-10 (tuyos).

- **2026-10-08 (tarde)** — Hechos SEC-01/02/03, ACC-01/02/03, MON-01/02. 877
  pruebas en verde (20 nuevas). Arreglada también una regresión del commit
  `522005c` («login en seco prioriza la sesión viva»): justo después de iniciar
  sesión, Next repinta el login y su redirección al login del restaurante le
  ganaba al destino → el dueño acababa en «Continuar como» en vez de en Mi
  cuenta (y en un aparato de confianza, en la grilla de PIN). Ahora esa
  redirección no se aplica cuando la página se pinta como respuesta de una
  acción (`next-action`). Verificado en el navegador.

- **2026-10-08** — Revisión y tablero creado. Hallazgo de la revisión que no
  estaba en el resumen: ACC-02 (el segundo factor solo en pantallas se salta
  hablando directo con Supabase).
