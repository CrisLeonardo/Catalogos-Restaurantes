# Plan · Quién administra las cuentas de Leogin

**Fecha:** 8 de septiembre de 2026
**Origen:** pregunta del dueño — *"si un cliente olvida su contraseña yo no puedo ayudarle,
ni siquiera puedo ver los usuarios de Leogin"*.
**Estado:** auditoría hecha y verificada contra el código.
**Fases 1, 2, 3 y 4 CONSTRUIDAS** (8 de septiembre) — ver §8 a §11. Falta la **fase 5**.
Y faltan las migraciones **131** y **132** en el editor SQL de producción; hasta entonces las
pantallas lo dicen ellas mismas y nada revienta.

> **Nota de numeración:** la fase 1 se llevó la migración **131** (la vista de cuentas), que
> en la tabla de abajo no tenía ninguna asignada. La bitácora de la fase 3 es la **132**.

---

## 1. La pregunta, dicha con precisión

El sistema cambió de dueño de las cuentas y el Super Admin no se enteró.

**Antes** (y es lo que sigue diciendo la pantalla): tú, desde `/super`, creabas el restaurante
y creabas el login del dueño. La frase está escrita tal cual en
`src/app/super/restaurantes/[id]/accesos/page.tsx:29`:

> «Crea el usuario y contraseña con los que el dueño entrará a gestionar su menú.
> **Tú controlas estos accesos.**»

**Ahora**: la persona entra a `/registro`, crea **su cuenta de Leogin** (`signupAccount`), y
desde `/mi-cuenta/nuevo` crea **sus restaurantes**, el primero y el quinto. La cuenta ya no
nace de tu mano. Y sin embargo la única pantalla del sistema que enseña personas sigue siendo
*una pestaña dentro de la ficha de un restaurante*.

De ahí sale todo lo demás. **No es que falte un botón: falta la entidad.** El Super Admin
sabe administrar restaurantes; no sabe que existen las personas.

---

## 2. Lo que hoy sí se puede hacer (para no exagerar el problema)

Esto ya funciona y conviene tenerlo claro antes de la lista de fallos:

- **Reponer una contraseña a mano** — `resetRestaurantUserPassword`
  (`src/lib/actions/super-admin.ts:539`). Y ya contempla al dueño del modelo nuevo: acepta
  tanto `profiles.restaurant_id` como una fila viva en `restaurant_members`.
- **Ver al dueño de un restaurante** — `getRestaurantUsers`
  (`src/lib/db/super-admin.ts:78`) mira los dos sitios, perfiles y membresías. Alguien ya
  cerró ese hueco (el comentario del archivo lo cuenta: *"los restaurantes creados desde Mi
  cuenta salían sin dueño"*).
- **Recuperación por correo** — `requestPasswordReset`
  (`src/lib/actions/password-reset.ts`), con enlace de un solo uso y respuesta neutra para no
  filtrar quién es cliente.

O sea: **el rescate existe, pero solo si sabes de antemano en qué restaurante buscar a la
persona.** Todo el problema está en el camino hasta ahí.

---

## 3. Hallazgos

Ordenados por lo que dolería el día del lanzamiento. Cada uno con el archivo que lo prueba.

### C-01 · No existe ninguna lista de personas · **crítico**

No hay `/super/usuarios` ni nada equivalente. El menú lateral entero está en
`src/components/super/shell.tsx:17-22`: Inicio, Restaurantes, Grupos, Métricas, Finanzas,
Configuración. Ninguna habla de personas.

La única consulta que devuelve gente es `getRestaurantUsers(restaurantId)` — **exige el
restaurante como entrada**. No existe una sola función en el proyecto que lea `profiles` o
`auth.users` sin un restaurante de por medio.

Consecuencia práctica: te llama un cliente, te dice su nombre y su correo, y no tienes dónde
escribirlo. Tienes que acordarte de cómo se llama su restaurante, y si tiene tres, de cuál.

### C-02 · Una cuenta sin restaurante es invisible · **crítico**

`signupAccount` crea el perfil **a propósito** con `restaurant_id: null`
(`src/lib/actions/signup.ts`, paso 2). El restaurante llega después, en otra pantalla.

Entre las dos cosas hay un hueco donde la persona puede quedarse: se le fue el internet, lo
dejó para mañana, no le gustó el slug que le tocaba. Su cuenta **existe** — y ocupa su correo,
porque al volver le dirás *"Ya existe una cuenta con ese correo"* — pero:

- no sale en ninguna pantalla tuya, porque no cuelga de ningún restaurante;
- no puedes reponerle la contraseña, porque `resetRestaurantUserPassword` pide un
  `restaurantId` que no existe;
- no puedes borrarla para que lo intente de nuevo limpio.

Es la peor combinación posible: **la persona está atascada y tú ni siquiera puedes verla.**

### C-03 · El rescate automático está apagado, y el manual no llega a todos · **crítico**

`requestPasswordReset` corta con *"Todavía no podemos enviar correos. Escríbenos por
WhatsApp"* cuando no hay `RESEND_API_KEY` — `emailEnabled()`, `src/lib/email/index.ts:44`.
Hoy no la hay (viene arrastrándose como pendiente desde el 8 de agosto).

Así que **el 100 % de las recuperaciones cae en ti**, por WhatsApp, a mano. Y el camino manual
solo funciona para quien ya tiene un restaurante que puedas encontrar. C-01 + C-02 + C-03 es
la misma llamada de teléfono desde tres ángulos.

### A-04 · No se puede corregir un correo mal escrito · **alto**

En todo el proyecto hay exactamente dos llamadas a `auth.admin.updateUserById`
(`staff.ts:420` y `super-admin.ts:580`) y **las dos escriben solo `password`**. Nadie puede
cambiar el correo de nadie.

Alguien que se registre con `juan@gmial.com` tiene:
- un login que no puede recordar bien,
- un enlace de recuperación que va a un buzón inexistente,
- un slug ocupado con su marca,
- y ninguna salida que no sea abrir otra cuenta con otro correo.

Es el fallo más silencioso de la lista: no da error en ningún lado, simplemente crea una
cuenta muerta.

### A-05 · No se ve cómo entra cada persona · **alto**

`RestaurantUser` (`src/lib/db/super-admin.ts:9`) trae correo, rol, nombre y poco más. No dice:

- si la cuenta es **de Google** (no tiene contraseña: reponerle una le crea una segunda puerta
  que no pidió, y tampoco resuelve su problema si lo que perdió fue el acceso a Google);
- si el correo está **verificado** — `profiles.email_verified_at` se escribe en el registro
  (migración 109) y no se enseña en ninguna parte, siendo justo el dato que explica *"no me
  llegó el correo"*;
- **cuándo entró por última vez**, que es lo que distingue a un cliente vivo de una cuenta
  abandonada.

### A-06 · Borrar un restaurante deja cuentas huérfanas para siempre · **alto**

`deleteRestaurant` (`super-admin.ts:468`) hace un `delete` de la fila y ya. Pero
`profiles.restaurant_id` es **`on delete set null`**
(`supabase/migrations/001_initial_schema.sql:76`).

Resultado: el personal de ese local queda con rol `RESTAURANT_STAFF` y sin restaurante.
Puede seguir entrando al login, no tiene a dónde ir, y **ya no aparece bajo ninguna ficha**:
acaba de convertirse en un C-02. Nadie va a volver a verlos nunca.

### A-07 · Ves las personas de un local, nunca los locales de una persona · **alto**

La pantalla ya lo admite a medias. Cuando alguien llega por membresía, en vez de dejarte
quitarlo, dice (`src/components/super/restaurant-users.tsx:155`):

> «Su cuenta puede tener más locales»

**Puede.** No dice cuáles, ni cuántos, ni cuál de ellos paga. Es la decisión correcta —quitar
el usuario desde la ficha de un local lo dejaría fuera de los tres— pero deja la pregunta sin
contestar.

### A-08 · No hay forma de pasar un restaurante a otro dueño · **alto**

No existe ninguna escritura a `restaurant_members` desde `/super`. Cero.

El día que un dueño venda el local, se pelee con el socio, pierda la cuenta de Google con la
que se registró o simplemente fallezca, ese restaurante **se queda con un dueño que no puede
entrar** y tú no puedes nombrar otro. Lo único que tienes es borrar el restaurante entero.

### A-09 · El acceso que crea el Super Admin nace a medias · **alto**

`createRestaurantUser` (`super-admin.ts:484`) escribe `profiles.restaurant_id` — el modelo
**viejo** — y **no crea membresía**. Esa persona:

- entra a su panel bien (el camino de siempre sigue vivo), pero
- si abre **Mi cuenta**, `getMyRestaurantCards()` le devuelve cero tarjetas
  (`membership.ts:177`) y `src/app/mi-cuenta/(panel)/page.tsx:48` la manda a **`/registro`**,
  a crear un restaurante — cuando ya tiene uno.

O sea: el Super Admin puede fabricar hoy mismo una cuenta que el resto del producto no
reconoce.

### M-10 · «Grupos» mira la columna equivocada · **medio**

`getOrganizationDetail` (`src/lib/db/super-admin.ts:150`) lista los dueños del grupo con
`profiles.organization_id`. Pero el acceso real viaja por `restaurant_members`. Un socio o un
gerente invitado no sale ahí, aunque administre los cinco locales.

### M-11 · Lo que hace el Super Admin no deja rastro · **medio**

`logActivity` (`src/lib/activity.ts`) **exige** `restaurant_id` y se ve en `/admin/personal`:
es la bitácora *del local*, para que el dueño vigile a su personal. No hay bitácora tuya.

Reponer la contraseña de un cliente, borrar un restaurante, cambiar un plan: nada queda
escrito. El día que un cliente diga *"alguien entró a mi panel y cambió los precios"*, no
tienes nada que enseñarle — ni para defenderte ni para averiguarlo.

Y esto se vuelve obligatorio en el momento en que existan las funciones de la §4: si vas a
poder cambiarle el correo a alguien, tiene que quedar escrito quién lo cambió.

### M-12 · Se puede suspender un restaurante, no una persona · **medio**

`setRestaurantStatusSuper` apaga un local. Si el problema es la persona —alguien abriendo
diez restaurantes de prueba, un cobro rebotado, un fraude— hay que ir apagando local por
local, y nada le impide abrir el once.

### M-13 · La cuenta de Super Admin es un punto único de fallo · **medio**

El candado es una comparación de texto: `profile?.role !== 'SUPER_ADMIN'`
(`src/app/super/layout.tsx:37` y `verifySuperAdmin`, `super-admin.ts:17`). Correcto, pero:

- esa cuenta abre `createServiceClient()`, o sea **la base entera sin RLS**;
- si es una sola y se pierde, no hay quien reponga nada — ni siquiera a ti mismo;
- no hay segundo factor.

No es urgente el día uno, pero es la clase de cosa que solo se arregla *antes*.

---

## 4. La solución

Una sección nueva en el Super Admin: **Cuentas**. La cuarta entrada del menú, entre
Restaurantes y Grupos.

La idea de fondo, en una frase: **el Super Admin tiene que poder empezar por la persona, no
solo por el restaurante.** Hoy el índice del sistema es `restaurants`; le falta el índice por
`auth.users`.

### 4.1 · `/super/cuentas` — el listado

Buscador por correo o nombre (que es lo único que un cliente te va a dar por WhatsApp), y una
fila por persona con:

| Dato | De dónde sale | Para qué |
|---|---|---|
| Correo y nombre | `auth.users` + `profiles.full_name` | encontrarla |
| Cómo entra | `auth.users.identities` → Google / contraseña / PIN | **A-05** |
| Correo verificado | `profiles.email_verified_at` | **A-05** |
| Nº de locales | `restaurant_members` activos | **A-07** |
| Alta y último acceso | `created_at`, `last_sign_in_at` | separar vivos de abandonados |

Y tres filtros que son literalmente tres hallazgos resueltos:

- **Sin ningún local** → C-02, las cuentas atascadas a mitad del registro.
- **Huérfanas** (rol de staff, sin restaurante y sin membresía) → A-06.
- **Correo sin verificar** → los que van a llamarte cuando el correo no llegue.

### 4.2 · `/super/cuentas/[id]` — la ficha de la persona

Arriba, sus locales: nombre, su rol en cada uno, plan y estado, con enlace a la ficha del
restaurante. Eso solo ya contesta A-07.

Abajo, las acciones de rescate. Todas escriben en la bitácora (§4.4), todas se niegan si la
persona es `SUPER_ADMIN`:

1. **Reponer contraseña** — lo que ya hace `resetRestaurantUserPassword`, pero **sin exigir un
   restaurante**. Arregla C-02 y C-03 de golpe. Si la cuenta es de Google, la pantalla lo
   avisa antes: *"esta persona entra con Google; ponerle contraseña le crea una segunda forma
   de entrar"*.
2. **Corregir el correo** — `updateUserById({ email, email_confirm: true })`. Es **A-04**, y
   son cuatro líneas. Con dos guardas: que el correo nuevo no esté ocupado, y que no sea del
   dominio sintético del personal por PIN (`@staff.leogin.internal`), que no recibe nada.
3. **Mandar el enlace de recuperación** — el mismo `generateLink` que ya existe, disparado por
   ti. Sirve el día que Resend esté puesto y evita que la contraseña pase por WhatsApp.
4. **Marcar el correo como verificado** — para cuando te consta por teléfono que el buzón es
   suyo.
5. **Suspender / reactivar la cuenta** — `updateUserById({ ban_duration })`. Es **M-12**: un
   interruptor para la persona, no para cada local.
6. **Eliminar la cuenta** — con el aviso contado antes de confirmar: *"esta persona es la
   única dueña de 2 restaurantes, que se quedarán sin nadie"*. Hoy ese aviso no existe en
   ningún sitio.

### 4.3 · Dar y quitar acceso a un local, desde `/super`

La pieza que arregla **A-08** y **A-09** a la vez: un formulario que escribe en
`restaurant_members` (buscar persona → elegir local → elegir rol), y el botón simétrico de
quitar.

Y con eso, `createRestaurantUser` cambia: en vez de escribir `profiles.restaurant_id`, crea el
usuario **y su membresía**. El acceso que fabricas pasa a ser idéntico al que se fabrica la
persona sola.

Esto es también el traspaso: nombrar `OWNER` al comprador, quitar al vendedor. Sin migración,
sin tocar el restaurante.

### 4.4 · La bitácora del Super Admin (migración 131)

Tabla nueva `super_admin_log`: quién, qué acción, sobre qué persona o restaurante, cuándo,
desde qué IP. Se pinta en la ficha de cada persona y en su propia pantalla.

No es burocracia: es el requisito para que las acciones de §4.2 sean defendibles. Si vas a
poder cambiar correos y contraseñas de clientes que pagan, **tiene que quedar escrito**.

### 4.5 · Lo más barato de todo: poner Resend

`RESEND_API_KEY` + verificar el dominio en Resend. Eso enciende:

- la recuperación de contraseña sola, sin ti — **la mitad de C-03**;
- la confirmación del correo del registro, que hoy se manda al vacío;
- el correo de invitación a un equipo.

Es una tarde de trabajo y quita más llamadas que cualquier pantalla de este documento. **Va
primero.**

---

## 5. Fases

| # | Qué | Arregla | Migración |
|---|---|---|---|
| **0** | Resend configurado y verificado | mitad de C-03 | — |
| **1** | `/super/cuentas` — listado, buscador y los tres filtros | C-01, C-02, A-05, A-06, A-07 | — |
| **2** | Ficha de la persona con reponer contraseña y **corregir correo** | C-02, C-03, A-04 | — |
| **3** | Bitácora del Super Admin | M-11 | 131 |
| **4** | Membresías desde `/super` + `createRestaurantUser` al modelo nuevo | A-08, A-09, M-10 | — |
| **5** | Suspender cuenta, borrar con aviso, verificar correo a mano | M-12, resto de §4.2 | — |

Las fases 1 y 2 son las que contestan tu pregunta. Las demás son las que evitan la siguiente.

La 3 va antes que la 4 y la 5 a propósito: son las acciones que más falta hace tener
registradas, y hacerlas primero significaría estrenarlas sin rastro.

---

## 6. Trampas previstas

Cosas que van a morder si no se piensan antes:

1. **`auth.admin.listUsers` pagina de 50 en 50** y no busca por texto. El listado no puede ser
   «traer todos los usuarios y filtrar en memoria» — a los mil clientes eso son veinte
   llamadas por carga de página. El índice tiene que salir de `profiles` (que sí es una tabla
   normal, con `full_name` y ordenable) y resolver el correo con `getUserById` **solo de la
   página visible**. Es exactamente lo que ya hace `getRestaurantUsers`, pero ahí el número es
   pequeño por definición y aquí no.

2. **El correo no vive en `profiles`.** Buscar por correo obliga a `listUsers` o a duplicar el
   dato. La forma limpia: una **vista** en Postgres sobre `auth.users` + `profiles`, expuesta
   solo a `service_role`. Si eso incomoda, el plan B es guardar el correo en `profiles` al
   crear la cuenta y mantenerlo al corregirlo — pero entonces hay **dos verdades** y una se va
   a desincronizar; prefiero la vista.

3. **Los correos sintéticos del personal por PIN** (`@staff.leogin.internal`) son cuentas de
   Auth reales y van a aparecer en el listado mezcladas con los dueños. Hay que marcarlas o
   esconderlas por defecto: son credenciales de turno atadas a un aparato, no personas.
   `isSyntheticStaffEmail` ya existe (`src/lib/staff-email.ts`).

4. **Los comensales también son `auth.users`.** Quien entra al menú con Google para juntar
   puntos tiene su usuario. Si el listado no distingue, vas a ver mil comensales y tres
   dueños. El corte es tener fila en `profiles`, y **sirve**: comprobado que los comensales
   viven en `customers` (`src/lib/db/customers.ts`), que la lealtad no toca `profiles`, y que
   no hay ningún disparador `on auth.users` que cree perfiles solo. La fila de `profiles`
   solo la escriben el registro, el alta de personal y el Super Admin.

5. **Cambiar el correo cambia el login.** Si la persona entró con Google, su identidad de
   Google sigue apuntando al correo viejo y puede volver a partirse en dos cuentas. Regla:
   **cuentas de Google → no se les cambia el correo**, se les dice que entren con Google. Solo
   se corrige el de las cuentas de correo+contraseña.

6. **Borrar una cuenta borra sus membresías en cascada**
   (`restaurant_members.user_id … on delete cascade`, migración 113:39). Un restaurante puede
   quedarse sin ningún dueño y **seguir funcionando y facturando** sin que nadie pueda entrar
   a su panel. De ahí que el aviso de §4.2.6 no sea cortesía sino la parte importante.

7. **La ficha del restaurante y la ficha de la persona van a poder hacer lo mismo por dos
   caminos.** Que la pestaña «Accesos» pase a ser una **lista con enlaces** a las fichas de
   persona, y que las acciones vivan en un solo lado. Dos botones «Reponer contraseña» en dos
   pantallas distintas es cómo se acaba con dos comportamientos distintos.

---

## 7. Lo que NO propongo, y por qué

- **«Entrar como» (suplantar al cliente)** — es lo que más ayudaría en soporte y lo más
  peligroso de la lista: acceso total al panel de un negocio ajeno, indistinguible del dueño
  en sus propios registros. No antes de la bitácora (fase 3), y cuando se haga, con aviso por
  correo al dueño y sesión marcada y limitada en tiempo. Fuera de este plan.

- **Un panel de cuentas para los clientes** («gestiona quién entra a mi restaurante») — ya
  existe: es `/admin/personal` + las invitaciones. No hay hueco ahí.

- **Segundo factor para el Super Admin (M-13)** — hace falta, pero es un trabajo aparte y toca
  el login, no esta sección. Mientras tanto, lo barato y hoy mismo: **crear una segunda cuenta
  `SUPER_ADMIN`** con otro correo, guardada en un gestor de contraseñas. Si pierdes la
  primera, sin eso no hay quien te reponga a ti.

---

## 8. Lo que se construyó de la fase 1 (8 de septiembre)

**`/super/cuentas`** — la lista que faltaba. Cuarta entrada del menú, entre Restaurantes y
Grupos.

| Archivo | Qué es |
|---|---|
| `supabase/migrations/131_vista_cuentas.sql` | La vista `admin_accounts` (perfil + identidad de Auth), solo para `service_role` |
| `src/lib/account-classification.ts` | Las reglas: qué es «sin local», qué es «huérfana», qué cuenta como verificado |
| `src/lib/account-classification.test.ts` | 17 pruebas, una por persona a la que hoy no se puede rescatar |
| `src/lib/db/accounts.ts` | Las tres consultas |
| `src/components/super/accounts-directory.tsx` | Buscador, filtros y las tarjetas |
| `src/app/super/cuentas/page.tsx` | La pantalla |
| `src/components/super/shell.tsx` | La entrada del menú |

Se puede **buscar por correo, por nombre o por restaurante**, y cada fila dice el correo, si
entra con Google o con contraseña, si verificó su correo, cuándo entró por última vez y **en
qué locales está y con qué papel** —con enlace a la ficha de cada uno—, que es A-07
contestado. Los tres filtros son C-02, A-06 y los correos sin verificar.

### Lo que se decidió al construirlo, y no estaba en el plan

1. **La vista, no `listUsers`.** La trampa nº 1 avisaba de la paginación de cincuenta en
   cincuenta; la vista la elimina de raíz —esto son tres consultas, no una por persona— y de
   paso resuelve la nº 2 y la nº 4: el correo se busca en SQL, y los comensales no salen
   porque el `join` con `profiles` ya es el filtro (comprobado: viven en `customers` y no hay
   ningún disparador sobre `auth.users`).

   El precio es que la fase 1 sí lleva migración, que el plan no le había asignado. Mientras
   no esté en producción, la pantalla lo dice ella misma y no revienta (`faltaLaTabla`).

2. **`REVOKE` antes que `GRANT`, y es la mitad importante de la migración.** Supabase reparte
   por defecto los permisos de todo lo nuevo en `public` a `anon`; publicar esta vista sin
   quitarlo habría dejado el correo de todo el personal al alcance de la clave que va escrita
   en el navegador. Verificado contra la base: `anon` y `authenticated` en `f`, `service_role`
   en `t`.

3. **Los accesos por PIN vienen escondidos** (trampa nº 3), con un interruptor que dice
   cuántos hay. Y **no cuentan como «correo sin verificar»**: su correo es inventado y no hay
   buzón que confirmar, así que contarlos inflaba el número justo con las cuentas a las que
   ese problema no les puede pasar. Los contadores de los chips salen de lo mismo que se va a
   filtrar: si el chip dice 30, al pulsarlo salen 30.

4. **La fila no lleva a ninguna ficha.** La ficha de la persona es la fase 2; los únicos
   enlaces que hay son los de sus locales, que sí existen. Prometer una pantalla que no está
   es peor que no tenerla.

### Verificado

- Migración aplicada en la base local: la vista devuelve las 35 cuentas, y el candado de
  permisos da `anon=f · authenticated=f · service_role=t`.
- La pantalla, mirada: buscador, los cuatro chips, tema claro y oscuro, y el móvil.
- El caso «huérfana» se probó **de verdad**, volviendo personal a una cuenta de prueba sin
  restaurante: el contador pasó a 1, la etiqueta roja salió, «Sin ningún local» bajó a 25 —las
  dos categorías no se pisan— y después se revirtió.
- 662 pruebas verdes (17 nuevas).

### Dos cosas que salieron de mirar la pantalla, y no de leer el código

- **Los chips eran mudos para un lector de pantalla.** El `title` con la explicación se
  convertía en el nombre accesible del botón y tapaba al de verdad: se leía «Personal cuyo
  restaurante se borró…» y nunca el filtro ni el número. Ahora se dicen los dos, en ese orden.
- **El contador y la lista no coincidían** al enseñar los accesos por PIN: el chip decía 30 y
  la lista mostraba 35. Es lo que arregló la decisión nº 3.

---

## 9. Lo que se construyó de la fase 2 (8 de septiembre)

**`/super/cuentas/[id]`** — la ficha de la persona, y con ella el rescate que hasta hoy no
existía para quien no tiene restaurante.

| Archivo | Qué es |
|---|---|
| `src/app/super/cuentas/[id]/page.tsx` | La ficha: sus locales (con plan y estado) y el rescate |
| `src/components/super/account-rescue.tsx` | Los tres formularios |
| `src/lib/actions/accounts.ts` | Las tres acciones, con sus candados |
| `src/lib/account-rescue-rules.ts` | Qué se puede y qué no, en puro |
| `src/lib/account-rescue-rules.test.ts` | 19 pruebas |
| `src/lib/auth/super-admin-guard.ts` | `verifySuperAdmin`, sacado de `actions/super-admin.ts` |
| `src/lib/auth/recovery-email.ts` | El enlace y el cuerpo del correo, sacados de `password-reset.ts` |
| `src/lib/db/accounts.ts` | `getAccountById` y `findAccountIdByEmail` |

Las tres acciones: **reponer la contraseña** (sin pedir restaurante — C-02 y C-03),
**mandarle el enlace de recuperación** y **corregir el correo** (A-04).

Y la lista de la fase 1 ya lleva a la ficha.

### Las decisiones

1. **Dos extracciones, no dos copias.** `verifySuperAdmin` era privado de
   `actions/super-admin.ts` y estaba bien mientras fuera un solo archivo; con dos, copiarlo es
   cómo se llega a que una de las copias se quede sin la comprobación. Igual con el cuerpo del
   correo de recuperación. Lo que **no** se comparte es la respuesta: el formulario público
   contesta lo mismo exista o no la cuenta (o se convierte en una lista de quién es cliente);
   la ficha, si algo falla, lo dice.

2. **Tres cosas que la ficha se niega a hacer**, y ninguna es prudencia de más:
   - tocar a otro **SUPER_ADMIN** (la regla que ya traía el rescate viejo);
   - cambiarle el correo a una cuenta de **Google** — su identidad seguiría apuntando al
     correo viejo y la próxima vez que entrara se partiría en dos cuentas, con sus
     restaurantes repartidos entre las mitades (era la trampa nº 5 del plan);
   - cambiarle el correo a una credencial por **PIN** — de ahí se leen el restaurante y el
     usuario (`parseStaffUsername`), y editarlo rompe el login del local.

3. **El correo corregido queda «sin verificar».** En Auth se confirma —si no, la persona no
   podría entrar justo después de haberle arreglado el problema— pero `email_verified_at` se
   borra y se le manda la confirmación: que lo teclees tú no prueba que el buzón sea suyo, y
   la pantalla tiene que seguir diciendo la verdad.

4. **La pantalla y la acción preguntan lo mismo.** Las reglas viven en
   `account-rescue-rules.ts` y las usan las dos, así que el formulario no deja escribir nada
   que la acción vaya a rechazar. Hay pruebas que comparan las dos respuestas: prometer al
   teléfono que ya está y llevarse el error después es el fallo que esto evita.

5. **La ficha admite que no hay bitácora.** Lo dice arriba del rescate, con esas palabras.
   Quien va a pulsar esos botones merece saber que hoy no queda escrito.

### Verificado, de verdad

Contra la base local, con la migración 131 puesta:

- **Corregir el correo**: cambiado `ana.prueba@ejemplo.test` → `ana.corregida@ejemplo.test`.
  En la base: `auth.users.email` cambiado, `email_confirmed_at` puesto,
  `profiles.email_verified_at` **borrado**. Después se revirtió por la misma pantalla.
- **Reponer la contraseña**: y luego **`grant_type=password` contra GoTrue devolvió un
  `access_token`** — o sea que esa persona de verdad puede entrar con el correo nuevo y la
  contraseña nueva. Es el punto entero de la fase; no bastaba con que la acción dijera «ok».
- **Correo ocupado**: rechazado con «Ya hay otra cuenta de Leogin con …».
- **Credencial por PIN**: sus dos tarjetas salen apagadas con el motivo escrito.
- **Cuenta sin ningún local**: la ficha explica el caso y **el rescate funciona igual**, que
  es exactamente lo que antes no se podía.
- Tema claro y oscuro. 681 pruebas verdes (19 nuevas).

### Dos cosas que salieron de probarlo, no de escribirlo

- **El error de «ese correo ya existe» no se puede leer.** Supabase devuelve
  `"Error updating user"` y nada más —por dentro es un 23505 de Postgres, pero no sube hasta
  el cliente—, así que la detección por texto que tenía escrita no se disparaba nunca y en
  pantalla salía esa frase inútil. Ahora se pregunta **antes** de quién es el correo
  (`findAccountIdByEmail`), y el error se sigue mirando como red de seguridad: un **comensal**
  con ese correo no tiene perfil, no sale en la vista y ocupa el correo en Auth igual.
- **La tarjeta del enlace enseñaba dos motivos a la vez** en una credencial por PIN («falta
  Resend» y «es un PIN»). El primero hace creer que el día que se configure Resend va a
  funcionar, y no va a funcionar nunca. Ahora la pantalla usa la misma función que la acción y
  enseña **un** motivo: el que manda.

### Lo que queda pendiente y no se hizo

- **La bitácora (fase 3).** Es lo siguiente, y ahora con más razón: estas acciones son
  justamente las que hacen falta tener registradas.
- **`RESEND_API_KEY` (fase 0).** Sin ella el botón del enlace sale apagado y explicado. La
  pantalla pública de «Olvidé mi contraseña» ni siquiera enseña el formulario hoy: manda a
  escribirte. Por eso el rescate a mano de esta ficha es, de momento, el único que hay.
- Suspender, borrar con aviso y marcar verificado a mano siguen en la **fase 5**, como decía
  el plan.

---

## 10. Lo que se construyó de la fase 3 (8 de septiembre)

**La bitácora del Super Admin.** Hallazgo M-11: lo que hacías desde aquí no dejaba rastro en
ninguna parte. Se volvió obligatorio con la fase 2, que puso a tu alcance la contraseña y el
correo de clientes que pagan.

| Archivo | Qué es |
|---|---|
| `supabase/migrations/132_bitacora_super_admin.sql` | La tabla `super_admin_log` |
| `src/lib/super-admin-log.ts` | El escritor: `logSuper()` y la lista cerrada de acciones |
| `src/lib/db/super-admin-log.ts` | El lector |
| `src/components/super/log-list.tsx` | La lista, en las dos pantallas |
| `src/app/super/configuracion/bitacora/page.tsx` | Pestaña nueva en Configuración |
| `src/app/super/cuentas/[id]/page.tsx` | El historial dentro de la ficha de la persona |
| `src/lib/auth/super-admin-guard.ts` | `currentSuperAdmin()`: ahora también dice **quién** actúa |

**Diez acciones registradas**: las tres del rescate (contraseña, correo, enlace), las tres de
accesos desde la ficha de un restaurante (crear, reponer, quitar), el borrado, el plan y el
estado de un restaurante, y el borrado de un grupo. Crear y duplicar **no** se registran: no
son irreversibles ni tocan la cuenta de nadie, y una bitácora que apunta todo es una que nadie
lee.

Se ve en dos sitios: **Configuración → Bitácora** (lo último de todo) y dentro de la **ficha
de cada persona**, que es donde de verdad sirve — cuando alguien llama preguntando qué pasó
con su acceso, la respuesta está en la pantalla que ya estás mirando.

### Las decisiones

1. **Sin claves foráneas a los objetivos, y es lo importante de la tabla.** Con una FK en
   cascada, borrar un restaurante borraría el registro de que lo borraste; con `set null` se
   perdería a quién. Justo las acciones irreversibles serían las que se llevan su propia
   prueba por delante. Por lo mismo se **congela el texto**: `actor_email` y `target_label`
   guardan el correo y el nombre tal como eran, no se resuelven al leer.

2. **Solo añadir.** `service_role` tiene `select` e `insert` y **no** `update` ni `delete`. El
   `grant` no bastaba: Supabase ya reparte `ALL` sobre todo lo nuevo en `public`, y comprobado
   contra la base **podía borrar filas**. Hicieron falta `revoke update, delete, truncate`.
   Podarla algún día es SQL directo desde el editor: una decisión consciente, no un `delete`
   perdido en el código.

3. **No interrumpe, pero no calla.** Si la bitácora falla, la acción que la llamó ya pasó y se
   queda como está — un fallo al registrar no puede convertirse en un rescate a medias. Pero
   se grita por consola: callarlo es cómo se descubre meses después que no había nada escrito.

4. **La pantalla dice la verdad sobre sí misma.** Mientras la 132 no haya corrido, la ficha
   dice *«Nada de esto queda registrado en esta base: falta correr la migración 132»* en vez
   de la frase de siempre. Prometer un registro que no existe es peor que no tenerlo.

5. **Nunca una contraseña en `meta`.** Ni la nueva, ni la vieja, ni un trozo. Del cambio de
   correo sí se guarda el anterior: sin él la fila dice que alguien cambió un correo pero no
   desde cuál, que es justo la pregunta que se hace cuando alguien ya no puede entrar.

6. **Que falte una frase no compila.** El mapa de textos es `Record<AccionSuper, …>`: si
   mañana se añade una acción y nadie escribe su redacción, TypeScript lo para. Sin eso la
   fila saldría enseñando el nombre interno (`acceso.quitar`) y nadie se enteraría hasta
   verlo. Comprobado añadiendo una acción de mentira: el compilador la rechaza.

### Verificado contra la base, no solo mirado

- **Antes** de correr la 132: la pestaña avisa, la ficha dice que no se registra nada, y una
  reposición de contraseña **funciona igual** dejando una sola línea en el servidor
  (`[bitacora] la migración 132 no ha corrido aquí…`). Es el estado en que va a estar
  producción hasta que pegues el SQL.
- **Después**: contraseña, correo y plan quedan registrados con actor, IP, etiqueta congelada
  y el `antes → después`.
- **La prueba que importa**: se creó un restaurante de mentira, se le cambió el plan, y se
  borró desde «Zona peligrosa». El restaurante ya no está (`0` filas) y **sus dos entradas
  siguen ahí**, nombrándolo. Con una FK en cascada, la entrada del borrado se habría borrado a
  sí misma.
- Candado: `anon=f · authenticated=f`, RLS activo, y `service_role` en `select=t · insert=t ·
  update=f · delete=f`.
- 681 pruebas verdes. La fase 3 no añade pruebas unitarias: lo que había que comprobar era
  comportamiento contra Postgres —permisos, supervivencia al borrado, degradación sin la
  migración— y eso se hizo contra la base real.

### Dos cosas que salieron de mirarlo

- **Las frases se quedaban colgando** dentro de la ficha: ahí el objetivo se oculta —ya se
  sabe de quién es la pantalla— y «Repuso la contraseña de» aparecía sin nada detrás. Cada
  acción tiene ahora dos redacciones, con objetivo y sin él.
- **«Ver el restaurante» llevaba a un 404** en cuanto el restaurante ya no existía. Ahora se
  resuelve en dos consultas por página qué objetivos siguen vivos y solo esos se enlazan. La
  fila sigue diciendo cómo se llamaba; simplemente ya no hay a dónde ir.

### Lo que sigue

- **La migración 132 en producción**, junto con la 131.
- **Fase 4** (membresías desde `/super`: traspaso de dueño, y que `createRestaurantUser` deje
  de escribir el modelo viejo) y **fase 5** (suspender, borrar con aviso, verificar a mano).
  Las dos ya nacen registradas: solo tienen que llamar a `logSuper`.
- **`RESEND_API_KEY`** sigue siendo la fase 0 y lo más barato de todo.

---

## 11. Lo que se construyó de la fase 4 (8 de septiembre)

**Membresías desde `/super`.** Tres hallazgos de una vez: A-08 (no había forma de pasar un
restaurante a otro dueño), A-09 (el acceso que creabas nacía a medias) y M-10 (Grupos miraba
la columna equivocada). Sin migración.

| Archivo | Qué es |
|---|---|
| `src/lib/actions/memberships.ts` | Dar acceso, cambiar el papel, quitar de este local |
| `src/lib/membership-rules.ts` | La regla del último dueño, en puro |
| `src/lib/membership-rules.test.ts` | 5 pruebas |
| `src/components/super/restaurant-users.tsx` | La pestaña Accesos, rehecha |
| `src/lib/db/super-admin.ts` | `getRestaurantUsers` trae el papel; los dueños del grupo salen de las dos vías |
| `src/lib/actions/super-admin.ts` | `createRestaurantUser` crea también la membresía |
| `src/app/super/restaurantes/[id]/accesos/page.tsx` | El texto que llevaba dos meses mintiendo |

### El traspaso

Es lo que faltaba desde siempre y ahora son dos pasos en la misma pantalla: **«Dar acceso a
alguien que ya tiene cuenta»** → nombras dueño al comprador; **«Quitar de aquí»** → sacas al
anterior. En ese orden, y la pantalla lo dice.

El formulario pide un **correo que ya existe** en vez de crear una cuenta: la persona que
compra el local ya tiene la suya, y fabricarle otra la partiría en dos —el mismo problema que
la fase 2 evita con las cuentas de Google—.

### Las decisiones

1. **Un restaurante no puede quedarse sin dueño.** Ni quitando al último ni bajándole el
   papel, que son dos caminos al mismo sitio. Un local sin dueño **sigue funcionando y
   facturando** y nadie entra a su panel: no se nota hasta que hace falta. La regla vive
   aparte y con pruebas porque es la única de esta fase que puede fallar en silencio; el caso
   de un local que YA está sin dueño se deja pasar a propósito, o sería imposible arreglarlo.

2. **Quitar no es borrar.** «Quitar de aquí» retira la membresía y, si el
   `profiles.restaurant_id` apuntaba a este local, también lo limpia —dejarlo puesto le
   devolvería el acceso por la otra puerta, que es la que miran el candado de tenant y el
   destino del login—. La cuenta de Auth **no se toca**: puede ser la de un dueño con tres
   restaurantes. Borrarla entera es la ficha de la persona (fase 5).

   El botón viejo, el que sí borra la cuenta, se conserva **solo** para los accesos del camino
   viejo sin membresía: esa cuenta no administra nada más, así que ahí «Quitar» sigue
   significando lo que significaba.

3. **`createRestaurantUser` escribe las DOS cosas**, no una en vez de la otra. La membresía
   arregla A-09 —antes esa persona abría «Mi cuenta» y la pantalla la mandaba a `/registro` a
   crear un restaurante que ya tenía— y `profiles.restaurant_id` se queda porque sigue siendo
   su «restaurante de casa», como dice la propia migración 113. Si la 113 no ha corrido en esa
   base, el alta no se tira: el acceso sirve igual por el camino viejo.

4. **El papel se cambia en el sitio**, con un desplegable que envía al elegir. Y cuando la
   regla del último dueño lo impide, el motivo se lee al lado: si se callara, el desplegable
   volvería solo a su posición y nadie sabría por qué.

5. **La pantalla dejó de mentir.** *«Crea el usuario y contraseña con los que el dueño
   entrará… Tú controlas estos accesos»* era verdad antes del registro self-service y llevaba
   meses siendo falsa. Ahora dice lo que es: quién entra y con qué papel, y que la cuenta en
   sí se administra en Cuentas.

### Verificado contra la base

- **El traspaso completo**: se dio OWNER a otra cuenta, se quitó a la dueña original. Quedó
  con el dueño nuevo, la membresía de la anterior borrada **y su `restaurant_id` limpiado**, y
  su cuenta de Leogin intacta. Las dos acciones en la bitácora. Después se revirtió todo.
- **La regla del último dueño**: intentar bajar a la única dueña a Gerente devuelve *«Es la
  única persona dueña de este restaurante…»* y —comprobado en la tabla— **el papel no cambió**.
- **A-09**: un acceso creado desde `/super` sale ahora con `profiles.restaurant_id` **y**
  membresía OWNER. Antes solo lo primero.
- **M-10**: se le dio a otra persona una membresía OWNER en una sucursal del grupo y aparece
  en «Quién lo administra». Antes era invisible ahí aunque administrara los cinco locales.
- 686 pruebas verdes (5 nuevas).

### Lo que queda

- **Fase 5**: suspender una cuenta, borrarla con el aviso de cuántos locales quedan sin dueño,
  y marcar un correo como verificado a mano.
- Las migraciones **131 y 132** en producción.
- **`RESEND_API_KEY`**, que sigue siendo lo más barato de la lista.
