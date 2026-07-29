# Auditoría general de Leogin — 2026-07-29

> Alcance pedido: **todo** — visual, rendimiento, velocidad, optimización, seguridad,
> funcionalidad y practicidad, en las cuatro superficies (catálogo público + checkout,
> panel admin, landing/`/planes`, super admin). Más un encargo concreto: dejar claro
> el asunto del **descuento al desactivar módulos**.
>
> Base auditada: `plataforma/` — 389 archivos TS/TSX, ~67.400 líneas, 94 migraciones.
> Verificado contra Supabase local (Docker) y con el panel abierto en el navegador,
> no solo leyendo código.

---

## 1. Resumen ejecutivo

La plataforma está mucho mejor construida de lo que sugiere su edad: RLS bien
pensada en las tablas de datos, server actions con guardas consistentes, anti-SSRF
real en los proxies de imagen, CSS de cliente saneado contra XSS almacenado,
límites de tasa en los sitios calientes, y triggers en base de datos para lo que
no se puede dejar en manos de la app. Eso es criterio de alguien que ya se quemó
una vez y aprendió.

**Los problemas graves que encontré no son de código: son de coherencia.** Hay
varias listas de "qué incluye cada plan" escritas a mano en sitios distintos, y se
fueron separando entre sí. Tres de los cuatro hallazgos críticos son exactamente
eso, y los tres cuestan dinero — en las dos direcciones.

| # | Hallazgo | Severidad | Estado |
|---|----------|-----------|--------|
| C-1 | Premium vendido con 7 módulos, entregado con 4 | **Crítico** | ✅ Corregido |
| C-2 | Un dueño de grupo podía entrar al panel de cualquier restaurante | **Crítico** | ✅ Corregido |
| C-3 | "Lista de espera" jamás se cobró a nadie (Q49/mes) | **Alto** | ✅ Corregido |
| C-4 | Funciones del plan desaparecían del menú sin dejar rastro | **Alto** | ✅ Corregido |
| A-1 | La UI promete un descuento en una fecha que casi nunca es la real | **Alto** | ✅ Corregido |
| A-2 | Acciones públicas anónimas sin freno (reseñas, avisos, cupones) | **Medio-alto** | ✅ Corregido |
| A-3 | La sesión por PIN se podía dejar abierta para siempre | **Medio** | ✅ Corregido |
| A-4 | La tabla de precios es invisible para lectores de pantalla | **Medio** | ✅ Corregido |
| M-1 | El menú público no cachea nada: consulta la base en cada escaneo | **Medio** | ⏳ Recomendado |
| M-2 | CSP con `unsafe-inline` + `unsafe-eval` en scripts | **Medio** | ⏳ Recomendado |
| M-3 | Tarjetas de producto con botones anidados | Bajo | ✅ Corregido |

---

## 2. Hallazgos críticos

### C-1 — Premium se vende con 7 módulos y se entrega con 4

**Lo que pasa.** `/planes` anuncia Premium con *"7 módulos incluidos gratis"*, y el
armador de planes marca los siete como *"Incluido en tu plan"*. Pero el alta
self-serve creaba el restaurante con esta lista escrita a mano:

```
plataforma/src/lib/actions/signup.ts  (antes)
  reservaciones: false,
  lista_espera:  false,
  loyalty:       false,
```

Y el panel decide qué enseñar leyendo esas banderas, no el plan. Resultado: quien
contrataba **Premium por Q599 desde la web** no veía Reservaciones, Lista de espera
ni Lealtad **por ningún lado** — ni activas, ni bloqueadas, ni con un candado que
invitara a comprarlas. Simplemente no existían.

**Por qué es lo más grave del informe.** Es la ruta de adquisición principal, el
cliente ya pagó, y el fallo es silencioso en los dos sentidos: el cliente no sabe
que le falta algo y tú no sabes que se lo debes. Es la clase de cosa que se
descubre en una llamada de cancelación.

**Cómo lo dejé.** Una única fuente de verdad. `withPlanFloor()` en
[plans.ts](plataforma/src/lib/plans.ts) deriva de `PLANS` + `INCLUDED_MODULES` el
mínimo que cada plan garantiza, y se aplica en el alta y al guardar plan desde el
super admin. Además hay un trigger en base de datos
([migración 095](plataforma/supabase/migrations/095_plan_floor_y_lista_espera_cobro.sql))
que lo impone en cada `insert`/`update`, venga el cambio de donde venga — mismo
razonamiento que ya usaste con `trg_restaurant_channel_log`: un trigger no se
puede olvidar. El piso solo **añade**; nunca apaga un módulo comprado a la carta.

**Verificado en local**: el restaurante Premium de prueba pasó de 4 módulos
visibles a 8, con Analítica, Finanzas e Inventario reapareciendo en el menú
lateral, y **la mensualidad no se movió** (Q599 antes y después) — que es
justo lo que debe pasar, porque el piso solo enciende lo que el plan ya incluye.

---

### C-2 — Un dueño de grupo podía abrir el panel de cualquier restaurante

**Lo que pasa.** El layout del admin confiaba en esta suposición:

```ts
// plataforma/src/app/admin/(protected)/layout.tsx  (antes)
// getRestaurantBySlug usa el cliente RLS: la migración 053 solo
// devuelve la sucursal si pertenece a su grupo (candado de seguridad).
if (!tenantData) redirect('/central');
```

El comentario es incorrecto. Las políticas de RLS **se combinan con OR**, y existe
`restaurants_select_active` con `USING (status = 'active')` para PUBLIC — la
necesita el menú público. Así que esa consulta devuelve **cualquier** restaurante
activo, y el `redirect` nunca se dispara.

**Lo comprobé contra la base**, no por lectura. Creé un grupo con una sucursal y
consulté como ese dueño de grupo:

```
 slug                 | es_de_mi_grupo
----------------------+----------------
 azucar-negra         | f              ← NO es suya
 tacos-del-norte-test | t

--- y aun así, la consulta real de getRestaurantBySlug devolvió: ---
     slug     |     name     | plan_actual
--------------+--------------+-------------
 azucar-negra | Azúcar Negra | PREMIUM
```

**El alcance.** `getAdminContext()` fijaba `profile.restaurant_id` a ese
restaurante ajeno, y **casi todas las páginas del panel leen con el cliente de
servicio, que salta RLS por completo** (`db/orders.ts`, `db/customers.ts`,
`db/reports.ts`…). Es decir: pedidos, clientes y finanzas de otra empresa.

Explotable solo por una cuenta con rol `GROUP_OWNER`. Hoy no hay ninguna en la
base local; **conviene que verifiques cuántas hay en producción** para dimensionar
si hubo exposición real.

**Cómo lo dejé.** Comparación explícita de `organization_id` en los dos sitios que
resuelven la sucursal ([layout](plataforma/src/app/admin/(protected)/layout.tsx) y
[getAdminContext](plataforma/src/lib/db/admin.ts)), con el porqué escrito al lado
para que nadie lo vuelva a "simplificar". Las server actions ya estaban bien: usan
`resolveGroupBranchId()`, que sí compara la organización.

---

### C-3 — "Lista de espera" nunca se le cobró a nadie

Se añadió en la migración 087, después de que la 078 dejara las listas de módulos
escritas a mano. Quedó fuera de **las tres**:

- del bucle de `leogin_billed_addon_modules` → nunca entra al cálculo;
- del trigger `leogin_log_module_change` → sin historial;
- de `leogin_module_included_in_plan` → Premium no lo daba por incluido;
- y nunca se insertó `module_price_lista_espera` en `platform_settings`.

Consecuencia: se ofrece a **Q49/mes** en `/planes`, la interfaz muestra Q49
(porque `plans.ts` cae al valor por defecto) y **la base factura Q0**. A todos, en
todos los planes, desde julio.

La migración 095 lo corrige y, para que no vuelva a pasar, sustituye los tres
arrays copiados a mano por una función única `leogin_addon_module_keys()`.

> **Revisa esto antes del próximo corte.** La migración deja preparada al final la
> consulta que lista a quién empieza a facturársele. Es el único importe que cambia.

---

### C-4 — Una función incluida en el plan podía desaparecer del menú

```ts
// plataforma/src/components/admin/shell.tsx
function lockableNavItem(preview, enabled, planHasFeature, item) {
  if (preview || enabled) return [item];
  if (!planHasFeature) return [{ ...item, locked: true }];
  return [];                                    // ← el agujero
}
```

Esa última rama es el peor de los tres estados posibles: **el plan sí incluye la
función, pero la bandera está apagada, así que el elemento no se dibuja**. Ni
accesible ni bloqueado: invisible. Es lo que hacía que C-1 fuera indetectable.

Corregido derivando las banderas del plan antes de pasarlas al menú, además del
trigger de base de datos.

---

## 3. El encargo: el descuento por desactivar módulos

Aquí está el grueso del trabajo, porque tenías razón: **era confuso, y además
algunas cosas que decía la pantalla eran falsas.**

### 3.1 Por qué no se entendía

En una sola pantalla convivían **tres reglas distintas** sin decirlo:

| Regla | A quién aplica | Efecto de apagar |
|-------|----------------|------------------|
| Descuento por método de pedido | **solo Premium/Pro** | −Q50, hasta 2 de 3 |
| Tope de métodos | **solo Estándar** | ninguno (es un límite, no un ahorro) |
| Módulos a la carta | **solo Básico/Estándar** | deja de cobrarse |

Y como Premium incluye todos los módulos gratis, para un cliente Premium apagar un
módulo **no ahorra nada**, mientras que apagar un método sí. La pantalla no
distinguía. El dueño aprendía "apagar = ahorrar" y lo aplicaba donde no valía.

El texto que lo explicaba eran **62 palabras con un paréntesis dentro de otro**:

> *"…cada método de pedido que desactives baja tu mensualidad Q50 (hasta 2 de los 3
> — siempre se paga al menos uno). El descuento entra hasta tu próximo cobro, y se
> calcula sobre todo el mes: necesitas dejarlo apagado al menos el 75% de los días
> de este mes para que aplique (un 25% de margen para probarlo sin perder el
> descuento — entre más tarde en el mes lo apagues, menos margen te queda)."*

Eso explica **la regla**. El dueño no quiere la regla; quiere saber **cuánto va a
pagar y desde cuándo**.

### 3.2 Y además prometía una fecha equivocada

Esto es lo importante. *"El descuento entra hasta tu próximo cobro"* es **falso la
mayor parte del mes**.

El cobro de un mes mira el mes **anterior** y exige estar apagado el 75% de esa
ventana. En un mes de 30 días eso significa apagarlo **antes del día 8**. Quien
apague delivery el día 20:

- **agosto** → cobro completo (en julio solo estuvo apagado el 35% del mes);
- **septiembre** → ahora sí llega el descuento.

Dos meses después de lo prometido, sin ningún aviso. Eso es un ticket de soporte y
una discusión sobre la factura.

### 3.3 Lo que hice en su lugar

**El principio: no expliques la regla, enseña el resultado.** Nadie necesita
entender el 75% si le dices la cifra y el mes.

La pantalla de Módulos ahora abre con esto:

```
TU MENSUALIDAD DE ESTE MES
Q599 / mes

  Tu próximo cobro será   Q698

CÓMO SE ARMA
  Plan Premium                Q599
  Proveedores y compras      + Q99

  Lo que enciendas o apagues hoy se refleja en tu cobro de
  septiembre 2026; el cobro de este mes ya no cambia.
```

Tres cifras que antes estaban mezcladas en una, ahora separadas:

1. **Lo que se cobra este mes** — ya está decidido, no se toca.
2. **Lo que se cobrará el mes que viene** — y esto **no es una estimación**: se lo
   pregunto al propio motor de cobro (`leogin_compute_monthly_fee` con el periodo
   siguiente), así que ya lleva dentro la regla del 75% y los cambios hechos días
   atrás. Cualquier cálculo paralelo en la app acabaría desviándose de la factura
   real; este no puede.
3. **Lo que daría lo que acabas de tocar** — se mueve con el dedo, en el momento.

Y **cada interruptor dice su propio efecto antes de tocarlo**:

- Método encendido → `Apagarlo: −Q50 al mes`
- Con el tope alcanzado → `Apagarlo no baja tu precio: el descuento ya llegó a su tope de Q100.`
- Último método activo → `Es tu único modo activo: no se puede apagar.`
- Módulo incluido → **`Apagarlo solo lo esconde del panel — tu mensualidad no cambia.`**
- Módulo de pago → `Q99 al mes · Si lo apagas, deja de cobrarse en tu cobro de septiembre 2026.`

Esa penúltima línea es, para mí, la corrección más valiosa de toda la pantalla:
**dice explícitamente que apagar NO ahorra**, que era justo la creencia falsa que
generaba el modelo anterior.

**Estándar** se replanteó como lo que realmente es — un tope, no un descuento:

> *"Tu plan Estándar incluye **2 de los 3 modos** — tú eliges cuáles, y cambiarlos
> no altera tu precio de Q299."*

**Probado de punta a punta en el navegador**: al apagar "A domicilio" el total pasó
a Q648 (599 − 50 + 99) y al apagar también "Comer en el local" a Q598
(599 − 50 − 50 + 99), con el tercer método avisando que no se puede apagar.

### 3.4 Lo que NO cambié, y la decisión que te dejo

**No toqué la mecánica de cobro.** La regla del 75% sigue igual: cambia importes de
clientes reales y esa decisión es tuya, no mía.

Dicho eso, mi recomendación es que la **simplifiques**, y la razón es que ya no
hace falta para explicar bien:

> **Propuesta: "los cambios entran en tu próximo cobro completo".**
> Apagas delivery cualquier día de agosto → el cobro del 1 de septiembre ya viene
> con el descuento, siempre que siga apagado ese día.

- **Se explica en una frase** y coincide con lo que la gente ya espera.
- **Elimina la sorpresa de los dos meses**, que es el origen del enfado.
- **El abuso que abre es pequeño**: apagar el 31 de agosto, ahorrar Q50 en
  septiembre y volver a encender el 2. Exposición máxima Q50 por cliente y mes, y
  detectable en la bitácora, que ya existe.

Comparado con lo que cuesta hoy — un párrafo que nadie lee y una fecha que
incumples — me parece un buen cambio. Pero es tu llamada; dime y preparo la
migración.

---

## 4. Otros hallazgos corregidos

### A-2 · Acciones públicas anónimas sin freno

Tres acciones invocables por cualquiera en internet, sin sesión, con solo el
`restaurantId` (que está a la vista en el menú):

- **`callWaiter`** — cada llamada dispara una **notificación push** a los
  dispositivos del personal. Sin límite, se podía inundar de alertas a un
  restaurante en bucle. Ahora: límite por IP, techo por restaurante (para que
  tampoco funcione con muchas IPs), y comprobación de que el módulo está activo.
- **`submitRating`** — sin validar **nada** salvo el rango de la estrella. Se podía
  hundir o inflar el promedio de cualquier restaurante, con comentarios de longitud
  ilimitada. Ahora la calificación debe ir atada a un pedido real de ese
  restaurante, cada pedido se califica una sola vez, y hay límites y recorte de
  texto. De paso: el checkout **ignoraba el resultado** y decía "¡Gracias!" aunque
  no se hubiera guardado nada — ahora muestra el error.
- **`validateCoupon`** — es un oráculo de "existe / no existe" abierto: se podían
  adivinar códigos por fuerza bruta. Limitado por IP y restaurante.

### A-3 · La sesión por PIN se podía dejar abierta para siempre

`touchOperatorSession(profileId)` era una server action **sin ninguna comprobación
de sesión** que escribía la cookie con el id que le mandaran. Como la caducidad
solo se evalúa cuando el id de la cookie **coincide** con el del perfil, bastaba
llamarla con un uuid cualquiera para anular el cierre por inactividad de 30 minutos
en la tablet compartida. Ahora el id sale siempre de `auth.getUser()`; el login por
PIN usa un helper aparte, tras validar el PIN.

### A-4 · La tabla de precios era ilegible para lectores de pantalla

Todas las celdas de sí/no de la comparativa de `/planes` son iconos con
`aria-hidden="true"` y **ningún texto alternativo**: una persona ciega no podía
saber qué incluye cada plan en la página que decide la compra. Añadido texto oculto
(*"Incluido" / "No incluido" / "Ilimitados"*) sin tocar nada de lo visible — ahora
son 27 celdas legibles.

De paso, el denominador *"7 de 8 módulos"* contaba también los módulos que aún no
vendes (`comingSoon`), y hacía parecer que a Premium le faltaba uno. Ahora se
calcula sobre los que realmente están a la venta.

### M-3 · Tarjetas de producto con controles anidados

`Glass` renderiza `<div role="button" tabIndex={0}>` y dentro va el botón
"Agregar": **controles anidados**, HTML inválido y navegación por teclado confusa.
Además el nombre accesible salía de concatenar todo el texto de dentro:

> *"Favorito Mocha Negra Espresso doble, cacao 70% y leche al vapor. El sabor de la
> casa. 26.00 Agregar Mocha Negra"*

Añadido `ariaLabel` a `Glass` y aplicado a las tres variantes de tarjeta. Ahora se
anuncia *"Ver Mocha Negra"*.

---

## 5. Recomendado, no implementado

Estos dos los dejo documentados porque tienen riesgo de regresión y quiero que
decidas tú el momento.

### M-1 · El menú público no cachea absolutamente nada

Es la superficie de más tráfico y la única que ve el comensal, y **cada escaneo de
QR hace la ronda completa a la base**: `getRestaurantBySlug` (2 consultas), luego
`getMenuData` (2 más), luego lealtad (2 más) — en tres tandas secuenciales, más el
refresco de sesión del proxy. Todo dinámico, sin `revalidate` ni `use cache` en
ninguna parte de la ruta pública.

Para un menú que cambia unas pocas veces al día, es el mayor margen de mejora de
velocidad que tiene el producto, y encima el más barato.

**Cómo lo haría**: `use cache` + `cacheTag(`menu:${restaurantId}`)` sobre
`getMenuData` y `getRestaurantBySlug`, invalidando con `revalidateTag` desde las
acciones de productos, categorías y tema. Requiere activar `cacheComponents` en
`next.config.ts`, que es un cambio de arquitectura (todo lo dinámico pasa a
declararse explícitamente) — por eso no lo metí junto con lo demás.

### M-2 · La CSP no protege de XSS

```
script-src 'self' 'unsafe-inline' 'unsafe-eval'
```

Con `unsafe-inline` en `script-src`, la CSP no frena un XSS: es el permiso que
justamente hay que quitar. `connect-src https:` y `img-src https:` además dejan
abierta la exfiltración a cualquier dominio.

El comentario dice que `unsafe-eval` hace falta para los PDF/Excel; puede ser, pero
`unsafe-inline` en scripts es otra cosa y Next 16 soporta nonces. Merece una sesión
dedicada, porque una CSP mal apretada rompe la app de formas sutiles.

### Menores

- `promotions` sigue en la base con 3 índices pese a la migración 093 que la eliminó del producto.
- `redeemGiftCard` y `findOrdersForRedeem` pasan entrada del usuario a `.ilike()` sin escapar `%`: un `%` actúa de comodín. Impacto bajo (solo personal autorizado, sobre sus propios vales), pero es una fuga de patrón.
- `/api/qr` genera un QR de **cualquier** URL sin autenticación: se puede usar tu dominio para envolver enlaces de phishing. Conviene restringirlo a URLs del propio dominio.
- 316 `<input>` en el proyecto frente a 53 `aria-label`: merece un repaso de etiquetado en formularios del admin.

---

## 6. Qué se tocó

```
plataforma/supabase/migrations/095_plan_floor_y_lista_espera_cobro.sql   (nuevo)
plataforma/src/lib/billing-timing.ts                                     (nuevo)
plataforma/src/lib/plans.ts                       withPlanFloor, hasPlanFeature, hasModuleEntitlement
plataforma/src/lib/db/admin.ts                    candado de organización
plataforma/src/lib/db/billing.ts                  computeNextPeriodFee
plataforma/src/app/admin/(protected)/layout.tsx   candado de organización + piso del plan
plataforma/src/app/admin/(protected)/modulos/page.tsx
plataforma/src/app/admin/(protected)/suscripcion/page.tsx
plataforma/src/app/admin/login/page.tsx           título correcto
plataforma/src/app/planes/page.tsx                accesibilidad + denominador
plataforma/src/components/admin/modules-panel.tsx  rediseño de la mensualidad
plataforma/src/components/checkout-form.tsx        error de calificación visible
plataforma/src/components/glass.tsx                ariaLabel
plataforma/src/components/menu/catalog.tsx         nombres accesibles
plataforma/src/lib/actions/{signup,super-admin,operator,staff-pin,encuestas,waiter-call,cupones}.ts
plataforma/src/lib/auth/operator-session.ts        writeOperatorCookie
plataforma/src/components/admin/operator-heartbeat.tsx
```

**Comprobaciones ejecutadas**: `tsc --noEmit` limpio; `eslint` limpio sobre lo
tocado; migración 095 aplicada en local sin error; mensualidad del Premium de
prueba **sin cambios** tras el piso (Q599 → Q599); simulador probado en navegador
(Q648 y Q598 según lo esperado); `/planes` sirviendo 27 celdas accesibles; datos de
prueba del ensayo de IDOR eliminados (0 organizaciones, 0 dueños de grupo).

## 7. Antes de subir a producción

1. **Corre la migración 095** y después la consulta que deja al final: te dice a
   quién empieza a facturársele Lista de espera. Es el único importe que se mueve.
2. **Cuenta los `GROUP_OWNER` en producción** para saber si C-2 tuvo exposición real.
3. Decide sobre la simplificación de la regla del 75% (sección 3.4).
