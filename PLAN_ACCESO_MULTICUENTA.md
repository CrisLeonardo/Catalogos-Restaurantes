# Plan de acceso: una persona, varios restaurantes

> Encargo (2026-08-17): replantear qué tan práctico es el acceso al sistema.
> Tres preguntas: (1) entrar y registrarse con Google, (2) qué hacer con el
> cliente que tiene 3 restaurantes o 3 sucursales, (3) si la forma en que entran
> hoy el dueño y el personal es la correcta comparada con la competencia.
>
> Todo lo que se afirma sobre Leogin está verificado contra el código de hoy
> (`plataforma/src`, 110 migraciones), con archivo y línea. Lo que se afirma
> sobre la competencia está marcado como tal: es patrón de industria observado,
> no auditoría de sus sistemas.

---

## 0. Respuesta corta

| Pregunta | Recomendación |
|---|---|
| ¿Google en el registro y el login? | **Sí, y ya está hecho** (Fase 0, ver §10). |
| ¿3 restaurantes = 3 cuentas o 1 cuenta con selector? | **1 cuenta con selector.** No es preferencia de gusto: con Google, 3 cuentas significa 3 cuentas de Gmail reales, y eso no lo hace nadie (§2). |
| ¿Sucursales y restaurantes distintos son lo mismo? | **No**, y conviene no mezclarlos: mismo mecanismo de acceso, distinta capa de negocio (§3). |
| ¿Credenciales por sucursal para sus admins? | **Sí, con un rol que hoy no existe**: gerente de sucursal con credencial real (correo o Google), por invitación (§6 y §7). |
| ¿El PIN del personal está bien? | **Sí, es el estándar.** Tiene tres arreglos pendientes, ninguno de fondo (§8). |

---

## 1. De dónde partimos (código de hoy)

| Hecho | Dónde |
|---|---|
| `profiles.id` **es** `auth.users.id` (clave primaria) y tiene **un solo** `restaurant_id` | `supabase/migrations/001_initial_schema.sql:74` |
| Toda la seguridad de datos cuelga de `get_my_restaurant_id()`, que devuelve **un** uuid | `003_auth_admin_rls.sql:10` |
| Roles existentes: `SUPER_ADMIN`, `RESTAURANT_OWNER`, `RESTAURANT_STAFF`, `RESTAURANT_WAITER`, `GROUP_OWNER` | `024_grupos.sql`, `030_meseros.sql` |
| Los grupos **ya existen**: tabla `organizations`, panel `/central` con comparativa y finanzas consolidadas, y RLS para que el dueño de grupo entre a sus sucursales | `024_grupos.sql`, `053_group_owner_admin_access.sql`, `src/app/central/` |
| Pero el `GROUP_OWNER` es **otra cuenta más**, distinta de las de cada sucursal, y **solo Leogin la puede crear a mano** | `src/lib/actions/super-admin.ts:725` |
| El personal entra por **PIN de 4 dígitos**, con correo sintético `@staff.leogin.internal` y contraseña aleatoria que nadie conoce | `src/lib/actions/staff.ts:22`, `staff-pin-crypto.ts:6` |
| La sesión del personal vale en **todos los subdominios** (`.leogin.online`); a qué panel se entra lo decide un candado en el servidor | `src/lib/supabase/server.ts`, `src/lib/auth/tenant-guard.ts` |

**La consecuencia práctica:** hoy, un cliente con 3 restaurantes tiene 3 cuentas
sin relación entre sí. Y si Leogin quisiera además un panel consolidado, tendría
que pedirle a Leogin que le arme un grupo a mano y le cree una **cuarta** cuenta.

---

## 2. Los dos modelos, y por qué uno gana

### Modelo A — una cuenta por restaurante (el de hoy)

**A favor:** ya funciona, la RLS es trivial (`restaurant_id = get_my_restaurant_id()`),
y separa por completo los datos de un negocio y otro.

**En contra, y esto es lo que decide:**

1. **Con Google se rompe.** En Supabase, `auth.users` es único por correo: una
   cuenta de Google **solo puede ser un usuario**, y un usuario solo puede tener
   un `profiles` (es la misma clave primaria). Así que "3 restaurantes = 3
   cuentas" significa literalmente **3 cuentas de Gmail distintas**, y cambiar de
   sesión de Google en el navegador cada vez que se quiera mirar otro negocio.
   Nadie hace eso. El botón de Google que se acaba de agregar es útil para quien
   tiene un restaurante y **estorba** para quien tiene tres.
2. **No hay foto del conjunto.** Ni ventas sumadas, ni "cuál sucursal va peor
   hoy", sin pedirle a Leogin que arme un grupo a mano.
3. **Es trabajo manual para Leogin.** Cada cadena nueva es un ticket:
   crear organización, crear el `GROUP_OWNER`, enlazar sucursales. No escala.
4. **Se nota como producto pequeño.** Es la primera pantalla que ve un cliente
   con dos locales, que es exactamente el cliente que más paga.

### Modelo B — una identidad, varios restaurantes (**recomendado**)

Una persona = una identidad (su correo o su Google). Esa identidad **pertenece**
a uno o varios restaurantes, con un rol distinto en cada uno.

Cómo se ve al entrar:

- **Un solo restaurante** (el 90% de los clientes): entra directo a su panel.
  **Sin selector, sin clic extra.** Esto es innegociable: la mejora para el que
  tiene tres no puede costarle un toque al que tiene uno.
- **Dos o más:** una pantalla de "¿A cuál entras?" con el logo, el nombre y las
  ventas de hoy de cada uno. Con "recordar mi elección" para que el siguiente
  ingreso sea directo.
- **Ya dentro:** el nombre del restaurante en la cabecera es un menú para
  cambiarse, sin volver a entrar.
- **En esa misma pantalla:** "＋ Crear otro restaurante", que es exactamente
  donde se vende el siguiente plan.

### Lo que hace barato el Modelo B en este código

Tres cosas que ya están construidas y que normalmente son la parte cara:

1. **El "restaurante activo" ya vive en la URL**, no en la sesión: cada panel es
   `admin.<slug>.dominio`. Así que cambiar de restaurante es **ir a otro
   subdominio** — no hace falta ninguna columna `restaurante_activo`, que es
   justo la decisión que suele romperlo todo (dos pestañas abiertas en dos
   negocios distintos pisándose entre sí).
2. **La sesión ya es de dominio ancho** (`.leogin.online`): cambiar de
   restaurante **no** obliga a iniciar sesión otra vez. Gratis.
3. **El patrón de RLS ya está probado.** La migración 053 resolvió exactamente
   este problema para el dueño de grupo con políticas *aditivas* apoyadas en un
   único helper (`is_my_group_branch(rid)`), sin tocar ni una política previa.
   Lo mismo, con `is_member_of(rid)`, sirve para las membresías.

---

## 3. "3 sucursales" y "3 restaurantes" no son lo mismo

Es la parte de la pregunta que conviene separar antes de construir nada, porque
llevan a dos productos distintos:

| | 3 sucursales de la misma marca | 3 restaurantes distintos |
|---|---|---|
| Menú | El mismo (o uno base que se copia y se ajusta por local) | Independientes, sin relación |
| Reportes | El valor está en **compararlos y sumarlos** | El valor está en **no mezclarlos** |
| Personal | Rota entre locales | No se cruza |
| Marca | Una | Tres |
| Cobro | Por sucursal, con descuento de cadena que tiene sentido | Por restaurante, precio de lista |
| Qué existe hoy | `organizations` + `/central` | Nada que los relacione |

**La regla que recomiendo:**

- **La capa de identidad es la misma para los dos casos:** una persona es
  miembro de N restaurantes. Punto.
- **La capa de negocio (`organizations`) es solo para cadenas.** Es la que
  habilita el panel consolidado, el menú replicable y el descuento.
- En la pantalla de selección se ven los dos: las sucursales agrupadas bajo su
  marca, y los negocios sueltos aparte. Como Shopify o Slack muestran varios
  espacios de trabajo en la misma lista.

Esto también arregla algo que hoy está torcido: el `GROUP_OWNER` es un rol
aparte que **no puede** ser dueño de un restaurante suelto (el rol es uno solo,
`001_initial_schema.sql:77`). Con membresías, el dueño de la cadena es
simplemente alguien con rol `OWNER` en las tres sucursales, y `/central` aparece
porque esas tres pertenecen a la misma organización — no porque su cuenta sea de
otro tipo.

---

## 4. Cómo lo hace la competencia

*(Patrón de industria observado en sus productos públicos, no auditoría interna.)*

| | Identidad del dueño | Varios locales | Personal en el local |
|---|---|---|---|
| **Toast** | Una cuenta | Selector de local, panel multi-local | Passcode numérico en la terminal |
| **Square** | Una cuenta | Selector de ubicación | Código de equipo / PIN por persona |
| **Shopify (POS)** | Una cuenta | Selector de tienda | PIN por empleado |
| **Lightspeed** | Una cuenta | Selector | PIN en la terminal |
| **OlaClick** | Cuenta de comercio; el multi-local no es su foco (ver `ANALISIS_COMPETENCIA_OLACLICK_2026-08-04.md`) | — | — |
| **Leogin hoy** | Una cuenta **por restaurante** | Solo con grupo creado a mano por Leogin | **PIN por persona ✅** |

Dos lecturas:

1. **El PIN del personal ya es lo que hace todo el mundo.** No hay que
   reinventarlo (§8).
2. **La identidad del dueño es donde Leogin se sale del estándar**, y es la parte
   que un cliente con dos locales nota en los primeros cinco minutos.

Lo que **nadie** de esa lista tiene y Leogin sí: modo offline real, agente de
impresión propio y personalización visual profunda. La conclusión no es "copiar
a la competencia", es: **no perder por la puerta de entrada un producto que gana
por dentro.**

---

## 5. Modelo de datos propuesto

```sql
-- Quién puede entrar a qué restaurante, y con qué rol.
create table restaurant_members (
  user_id       uuid not null references auth.users(id)  on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  role          text not null check (role in ('OWNER','MANAGER','STAFF','WAITER')),
  permissions   text[],                     -- mismas secciones de lib/permissions.ts
  status        text not null default 'active'
                  check (status in ('active','invited','suspended')),
  invited_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  primary key (user_id, restaurant_id)
);
```

Helper único de alcance, calcado del que ya funciona en la 053:

```sql
create or replace function public.is_member_of(rid uuid)
returns boolean language sql security definer stable
as $$
  select exists (
    select 1 from public.restaurant_members m
    where m.user_id = auth.uid() and m.restaurant_id = rid and m.status = 'active'
  );
$$;
```

**Cómo se migra sin romper nada** (la parte que da miedo, y no debería):

1. **Relleno:** una fila por cada `profiles` actual (`user_id`, `restaurant_id`,
   rol equivalente). Nadie nota nada.
2. **Políticas aditivas** por tabla con `is_member_of(restaurant_id)`, en OR con
   las que ya existen. Igual que la 053: no se borra ni una política previa, así
   que un dueño o un cajero de hoy **no puede** quedarse fuera por este cambio.
3. `profiles.restaurant_id` se queda un tiempo como "el restaurante de siempre"
   (lo usa `resolveStaffDestination`), y se retira cuando las membresías lleven
   meses en producción. **No se borra en la misma entrega.**
4. El candado de tenant (`tenant-guard.ts`) cambia **en un solo punto**: donde
   hoy dice `profileRestaurantId === tenant.id`, dirá "¿es miembro?". Ese archivo
   ya tiene pruebas (`tenant-guard.test.ts`), así que el cambio se prueba antes
   de tocar la base de datos.

Para las cadenas, lo mismo una capa arriba (`organization_members`), o más
simple todavía: quien es `OWNER` de todas las sucursales de una organización ve
`/central`. Empezaría por lo segundo y solo crearía la tabla si hace falta un
gerente regional con varias sucursales pero no todas.

---

## 6. Cuatro niveles de acceso (hoy hay dos y medio)

| Nivel | Quién es | Con qué entra | Qué puede |
|---|---|---|---|
| **Dueño** | El que paga | Correo o **Google** | Todo, incluido cobro, crear restaurantes e invitar gerentes |
| **Gerente de sucursal** ⟵ *no existe hoy* | El encargado del local | Correo o **Google**, por invitación | Todo su restaurante **menos** cobro, plan, borrar el restaurante y tocar al dueño |
| **Personal** (cajero, cocina) | Turnos | **PIN** en el dispositivo del local | Las secciones que le marque el dueño (22 disponibles, `lib/permissions.ts`) |
| **Mesero / repartidor** | Piso y calle | **PIN**, pantalla propia | Solo su pantalla |

El nivel que falta es exactamente el que se pidió: *"credenciales para cada
restaurante, por ejemplo para los admins de dicha sucursal"*. Hoy solo hay dos
opciones y ninguna sirve: darle al gerente la contraseña del dueño (con acceso
al cobro y a la facturación de toda la cadena) o darle un PIN de personal (sin
poder entrar desde su casa a revisar el cierre).

**Por qué el gerente sí lleva credencial real y el cajero no:** el gerente entra
desde donde sea, a cualquier hora, y responde por lo que hace — necesita una
identidad suya, con recuperación de contraseña y rastro en la bitácora. El
cajero entra en el local, en el aparato del local, quince veces por turno: ahí
una contraseña es un estorbo y el PIN es mejor herramienta.

---

## 7. Invitaciones (lo que reemplaza al "te creo la cuenta a mano")

1. El dueño abre **Personal → Invitar gerente**, escribe el correo y marca las
   secciones.
2. Le llega un correo: *"Rincón 502 te invitó a administrar su restaurante en
   Leogin"* → **Aceptar**.
3. La persona acepta **con Google** (un toque) o creando su contraseña.
4. Queda `restaurant_members(role='MANAGER', status='active')`. Si ya tenía
   cuenta en Leogin, **no se crea otra**: se le suma este restaurante a su lista.

Enlace de un solo uso, caduca a los 7 días, revocable desde el panel. Toda la
infraestructura de correo ya existe (`lib/auth/email-verification.ts`,
`lib/email.ts`), así que esto es pegar piezas, no construirlas.

---

## 8. ¿El acceso del personal de hoy es el correcto?

**Sí.** El PIN por persona con bloqueo por intentos, sesión que caduca por
inactividad a los 30 minutos y respaldo contra el hub local cuando se cae
internet es, punto por punto, lo que hacen Toast, Square y Shopify — y el
respaldo offline es **mejor** que lo que ofrecen ellos.

Tres arreglos, ninguno de fondo. **Los tres están implementados** (migración
111 — ver §12b):

**1. Un PIN de 4 dígitos es una credencial de local, no de internet.** ✅
La pantalla de PIN se abría desde cualquier parte del mundo que conociera el
subdominio. Estaba bien defendida (5 intentos y se bloquea, más límites por IP y
por persona: `staff-pin.ts:101`), pero seguía siendo un número de 4 cifras
expuesto a la red abierta.
*Hecho:* el restaurante tiene una lista de **dispositivos de confianza**
(`restaurant_devices`) y un interruptor para que el PIN valga **solo en ellos**.
El id del aparato es el mismo anónimo y estable de `lib/device-id.ts` que la
migración 110 ya usaba para la PC principal. Fuera de esos aparatos hace falta
credencial real (correo o Google).

**2. La grilla "¿Quién eres?" es pública.** ✅
Cualquiera que abriera el login del restaurante veía los nombres de todo el
personal (`listStaffForPin`, sin sesión). Cómodo dentro del local, filtración de
datos de empleados fuera de él.
*Hecho:* con el candado puesto, la grilla solo se entrega a los aparatos del
local. La comprobación vive en el servidor y se repite en `verifyStaffPin`:
esconder la pantalla sin cerrar la acción no habría protegido nada.

**3. Sobra un toque en el aparato del local.** ✅
Había que pulsar "Soy personal del restaurante" antes de ver la grilla, cada
vez, todo el día.
*Hecho:* en un aparato reconocido, el login **abre directo en la grilla de
PIN**, con "entrar con correo" como opción secundaria. Se decide en el servidor
(cookie espejo del id de aparato) para que la pantalla no parpadee entre los dos
estados.

### Las dos decisiones que evitan dejar a alguien fuera

Un candado de acceso mal desplegado deja a un local entero sin poder abrir caja
en hora pico. Por eso:

- **Nace apagado.** Ningún restaurante que ya opera cambia de comportamiento al
  aplicar la migración.
- **Mientras está apagado, cada PIN correcto registra el aparato**
  (confianza al primer uso). La lista se llena sola con las tabletas y la
  computadora que de verdad se usan, así que el día que el dueño lo encienda,
  lo que ya funcionaba sigue funcionando.
- Y **no se deja encender con la lista vacía**: es el error más caro que se
  puede cometer en esa pantalla, y el más fácil.

Y una nota sobre el dueño: mantener siempre visible **"Continuar como {nombre}"**
(ya existe, `lib/auth/resume.ts`). Ese es el camino corto real para el 90% de los
ingresos, más que cualquier proveedor de identidad.

---

## 9. Cobro cuando se agrega otro restaurante

Cada restaurante mantiene su propio `restaurant_billing` y su propio plan — eso
ya funciona y no hay que tocarlo. Lo que hay que decidir es **política
comercial**, no técnica:

- **Prueba gratis:** el primer restaurante con la prueba completa; los
  siguientes con prueba corta o sin prueba. Si no, "crear otro restaurante" se
  convierte en una máquina de pruebas gratis infinitas con la misma cuenta.
- **Descuento de cadena** (por ejemplo, −15% desde el segundo local): es el
  argumento natural para que la segunda sucursal también entre a Leogin en vez
  de quedarse en papel, y hoy no existe.
- **Una sola factura** para todos los restaurantes de una organización: es lo
  que va a pedir el primer cliente de tres locales que llegue.

Las tres son decisiones tuyas; el código las soporta sin cambios de fondo.

---

## 10. Fases

| Fase | Qué | Riesgo | Estado |
|---|---|---|---|
| **0** | Google en login y registro; el registro reutiliza la cuenta de Google si ya existe | Bajo — nada existente cambia de comportamiento | ✅ **hecho hoy** |
| **1** | `restaurant_members` + relleno + `is_member_of()` con políticas aditivas + **Mi cuenta** + crear otro restaurante | Medio — es RLS; se prueba tabla por tabla, como la 053 | ✅ **hecho** |
| **2** | Gerente de sucursal con credencial propia + **invitaciones por correo** | Bajo | ✅ **hecho** |
| **3** | "Crear otro restaurante" desde el panel, con su plan y su cobro | Bajo (técnico) / decisión comercial | ✅ **hecho** |
| **4** | PIN atado a dispositivos vinculados + grilla directa en el aparato del local | Bajo — nace apagado, nadie se queda fuera | ✅ **hecho** |
| **5a** | Unir las dos vistas: Mi cuenta enseña el panel del grupo y el panel del grupo enseña Mi cuenta | Bajo — solo se añaden enlaces | ✅ **hecho** |
| **5b** | Retirar el rol `GROUP_OWNER` y dejar solo membresías | Medio — un rol con clientes vivos encima | pendiente, **en entrega aparte** |

Las fases 1 y 2 juntas son las que contestan de verdad la pregunta del cliente
con tres locales. La 3 es la que convierte esa respuesta en ingresos.

---

## 11. Lo que **no** recomiendo

- **Una cuenta de Google por restaurante.** Obliga a tener varios Gmail y a
  cambiar de sesión de Google; es la peor experiencia de las dos y encima es más
  trabajo de mantener.
- **Guardar el "restaurante activo" en `profiles`.** Estado global compartido
  entre pestañas: dos pestañas en dos negocios distintos y los datos se cruzan.
  El subdominio ya resuelve esto bien.
- **Dar correo y contraseña a cajeros y meseros.** El PIN en el aparato del
  local es más rápido y más seguro para ese caso de uso.
- **Fusionar el menú de las sucursales por defecto.** Que sea una acción
  explícita ("copiar el menú de otra sucursal"), nunca automática: dos locales
  de la misma marca casi nunca tienen exactamente la misma carta ni los mismos
  precios.
- **Hacer las fases 1 y 5 en la misma entrega.** Migrar la identidad y retirar
  un rol con clientes vivos encima son dos riesgos que no conviene sumar.

---

## 12. Qué quedó implementado hoy (Fase 0)

- **Entrar con Google** en `/login`, `/admin/login` y `/central/login`, arriba
  del formulario de correo.
- **Registrarse con Google** en el paso "Tu cuenta" de `/registro`, sin
  contraseña. El wizard guarda su borrador antes de irse a Google, así que la
  vuelta no manda a nadie a empezar de nuevo.
- **Callback propio del personal** (`/admin/auth/google/callback`), separado del
  de los comensales: usa la cookie del personal, deja el ingreso en la bitácora
  (`panel_access_log`, método `google`) y resuelve el destino igual que el login
  con contraseña.
- **El correo de Google llega verificado**, así que a quien se registra así no
  se le pide confirmar un correo que nunca escribió.
- **Guardarraíl del modelo actual:** si una cuenta de Google ya administra un
  restaurante, el registro se detiene con un mensaje claro **antes** de crear
  nada. Ese mensaje es el que desaparece con la Fase 1.

Falta solo configuración externa (Google Cloud + Supabase + la variable
`NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=1`): la lista está en
`plataforma/docs/GOOGLE_AUTH.md`, con las URLs de retorno nuevas ya agregadas.
Sin esa variable, los botones no aparecen y todo sigue exactamente como estaba.

---

## 12b. Y lo que quedó en la segunda entrega (§8 y el gerente)

**Gerente de sucursal con credencial propia** (`staff.ts`)
Al crear personal, el dueño elige **cómo entra**: con un PIN (cajeros, cocina,
meseros — como siempre) o **con su propio correo** (el encargado). La plantilla
**Gerente** marca todas las secciones activas del restaurante menos
`suscripcion`, así que administra la operación pero no toca el cobro. Y como
`personal` no es una sección delegable, tampoco puede darse permisos a sí mismo
ni crear a otro gerente. Su correo nace confirmado, así que además puede entrar
con **Continuar con Google** usando ese mismo correo. No aparece en la grilla de
PIN del local: su credencial es suya.

**Dispositivos de confianza** (migración 112, `lib/auth/trusted-device.ts`)
En **Personal → Dispositivos del local**: la lista de aparatos reconocidos, el
botón "Autorizar este dispositivo" y el interruptor del candado, con el aviso de
qué implica cada estado en palabras del dueño, no del sistema.

**Hasta dónde llega esta protección, dicho sin adornos:** el id del aparato es
un UUID que guarda el propio navegador. Alguien que ya *conozca* el id de un
aparato autorizado podría copiarlo; lo que no puede es adivinarlo (128 bits al
azar que solo se ven en el panel del dueño). Es el mismo grado de protección que
el "código de dispositivo" de un TPV de caja: sube muchísimo el listón, no es
una atestación de hardware. Por eso el PIN **conserva todas sus defensas
anteriores** — el candado se suma, no las sustituye.

*(La invitación por correo, que era lo que faltaba aquí, se cerró en la Fase 2
— ver §12d.)*

---

## 12c. Fase 1 — Mi cuenta y las membresías (migración 113)

**El modelo.** `restaurant_members(user_id, restaurant_id, role, permissions)`
separa las dos preguntas que antes estaban pegadas en una sola fila de
`profiles`: *quién eres* (tu usuario de Auth, uno para siempre) y *qué eres
aquí* (una fila por restaurante). Los roles son `OWNER`, `MANAGER`, `STAFF`,
`WAITER`.

**Mi cuenta** (`/mi-cuenta`) es una **pantalla, no un privilegio**: lista tus
membresías, y lo que puedes hacer ahí sale de tu rol en cada una. El dueño ve
sus restaurantes y el botón de crear otro; un gerente ve solo las sucursales
donde lo invitaron, sin cobro ni crear. Con **un solo** restaurante no se pasa
por aquí: el login entra directo, como siempre.

**El PIN de entrada** es opcional por restaurante (`restaurants.entry_pin_*`).
Sin PIN se entra directo; con PIN se pide al abrir desde Mi cuenta y se
recuerda 12 h por navegador, en una cookie **firmada** por el servidor — sin
firma, cualquiera se escribiría a mano la lista de restaurantes desbloqueados.

**El gerente ya da de alta a su equipo**, con cuatro reglas comprobadas en el
servidor: solo crea personal por PIN (nunca otro gerente con correo), solo
reparte permisos que él mismo tiene, no puede tocarse a sí mismo ni a otro
gerente ni al dueño, y todo queda en la bitácora del dueño.

**Lo que costó de verdad (y no era la tabla).** `profiles.restaurant_id` es
**un** id, y las ~17 acciones del panel lo usaban para saber sobre qué
restaurante escribir. Estando en el panel de B con el perfil apuntando a A,
cada acción —cambiar un precio, apagar los pedidos— habría escrito en A
mientras la pantalla decía B. No es un fallo de permisos: es escribir en el
negocio equivocado. Se resolvió con dos helpers, en el mismo sitio donde cada
acción ya resolvía lo suyo:

- `resolveOwnRestaurantId()` — sobre qué restaurante se actúa;
- `canActOnRestaurant()` — para las que ya reciben el id y solo lo comprueban.

Sin membresías los dos devuelven exactamente lo de antes, así que un
restaurante que hoy opera no cambia de comportamiento.

**Y una decisión que NO se tomó:** nunca se escribe `profiles.restaurant_id` al
cambiar de restaurante. El restaurante activo vive en el subdominio, que es
por pestaña; guardarlo en el perfil habría hecho que dos pestañas abiertas en
dos negocios distintos se pisaran los datos.

---

## 12d. Fase 2 — Invitaciones, y Fase 5a — las dos vistas unidas

### Invitaciones (migración 114)

Sumar a un gerente ya no es "créale la cuenta y pásale la contraseña". El
dueño escribe el correo y marca las secciones; le llega un enlace; **la cuenta
la crea —o la reusa— quien acepta**, con su propia contraseña o con su Google.

Los tres problemas que arregla, y que no se arreglaban con mejor interfaz:

1. **La contraseña dejaba de ser suya.** Viajaba por WhatsApp, quedaba escrita
   en un chat para siempre, y casi nadie la cambiaba después.
2. **La elegía el dueño**, no su dueño real.
3. **Crear la cuenta ocupaba ese correo en todo Leogin** aunque la persona
   nunca llegara a entrar — y si un día quería abrir su propio restaurante, se
   topaba con "ya existe una cuenta con ese correo".

Lo que la sostiene:

- El token **no se guarda**: se guarda su sha-256. Una fuga de la tabla no
  reparte accesos. Con pruebas (`invite-token.test.ts`).
- **Un solo uso**, caduca a los 7 días, y una invitación viva por correo y
  restaurante (índice único parcial): pulsar dos veces no deja dos enlaces
  válidos sueltos.
- **La invitación es PARA UN CORREO.** Quien la acepta entra con ese mismo
  correo; si no, reenviar el enlace regalaría el acceso al restaurante.
- Solo **el dueño** invita por correo. El gerente suma a su equipo con PIN,
  nunca crea pares suyos — la misma regla anti-escalación de la Fase 1.
- **El enlace se enseña siempre**, se haya mandado el correo o no. Sin
  `RESEND_API_KEY` el flujo sigue funcionando: el dueño copia y pega. Un
  producto que deja de funcionar porque cayó el proveedor de correo no sirve
  en un restaurante.

Los tres caminos de aceptación terminan igual (membresía + sesión abierta): ya
hay sesión con ese correo → un botón; ya existe cuenta → su contraseña de
siempre; no existe → elige una. Y a quien ya tiene su propio restaurante **no
se le toca su `restaurant_id` de casa**: su acceso a este otro viaja por la
membresía, que es exactamente para lo que está.

### Fase 5a — las dos vistas unidas

El dueño de una cadena tenía dos hogares sin relación: el panel del grupo
(`/central`) y, desde la Fase 1, la lista de sus restaurantes. Ahora cada uno
lleva al otro: Mi cuenta enseña el panel consolidado arriba de las sucursales,
y el panel del grupo enseña "Mis restaurantes". Además, **un restaurante creado
por un dueño de grupo nace dentro de su organización**, así que aparece solo en
el consolidado sin pedirle a nadie que lo enlace a mano.

**Lo que NO se hizo, a propósito:** retirar el rol `GROUP_OWNER`. Unir dos
vistas es añadir enlaces; retirar un rol con clientes vivos encima es otra
cosa, y el propio plan dice que no conviene sumarlo a la entrega que acaba de
migrar la identidad. Queda como 5b, con sus propias pruebas.

### Lo que sigue pendiente (y no es código)

Las tres decisiones comerciales del §9 siguen sin tomar, y una de ellas ya
tiene consecuencia real: hoy **cada restaurante nuevo nace con la prueba
gratis completa**, así que "crear otro restaurante" es, tal cual está, una vía
para encadenar pruebas con la misma cuenta. Hay un techo de 5 por hora, que
frena el abuso automático pero no el manual. Decide si el segundo restaurante
en adelante lleva prueba corta o ninguna.
