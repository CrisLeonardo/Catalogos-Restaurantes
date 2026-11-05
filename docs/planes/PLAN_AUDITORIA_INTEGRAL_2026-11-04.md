# Plan de trabajo: auditoría integral de Leogin

**Creado el 2026-11-04 · base `876dd50` (v0.17.0) · rama del plan `docs/plan-auditoria-integral`.**

> **Avance y traspaso:** el estado de cada ficha, los PR abiertos y lo que falta están en [`registros/ESTADO_AUDITORIA_INTEGRAL_2026-11-04.md`](../registros/ESTADO_AUDITORIA_INTEGRAL_2026-11-04.md).

Este plan convierte la auditoría del 2–3 de noviembre en trabajo ejecutable. **No repite el detalle de la auditoría**: cada ficha dice qué hallazgos cubre y dónde leer su especificación. Su aporte está en cuatro cosas:

1. **Une los duplicados.** La entrega trae unos 196 identificadores (F, N, X, E, D, W, A, C, O, M, S, T, R) y muchos describen el mismo trabajo. Las **66 fichas originales** los reúnen; la prueba 0.13 agregó **seis correcciones reproducidas (0.14–0.19)**, para 72 fichas. El [índice inverso](#8-índice-inverso-cada-id-de-la-auditoría-tiene-dueño) prueba que ninguno se perdió.
2. **Lo comprobé contra el código de hoy.** Los hallazgos críticos se revisaron en el repositorio el 2026-11-04 (§2). Uno resultó más grave de lo que dice la auditoría (X05).
3. **Aplica tus decisiones** del 2026-11-04 (§3).
4. **Sigue las reglas del repo**: una ficha es una rama y un PR, con reproducción del fallo antes del arreglo, maqueta antes de cualquier cambio visual y las migraciones numeradas desde la 154.

## Fuentes

| Documento | Qué contiene | Autoridad |
|---|---|---|
| [AUDITORIA_POR_APARTADO_2026-11-03](../auditorias/AUDITORIA_POR_APARTADO_2026-11-03.md) | 40 apartados del restaurante (R01–R40), hallazgos X01–X23 y pruebas PA-T01–T30 | **Prevalece** cuando refina a las otras |
| [AUDITORIA_INTEGRAL_2026-11-03](../auditorias/AUDITORIA_INTEGRAL_2026-11-03.md) | Informe maestro: N01–N25, E01–E20, dirección visual, matriz de dinero (§8) y backlog base D/W/A/C/O/M/S/T (Anexo A) | Segunda |
| [AUDITORIA_INICIAL_2026-11-02](../auditorias/AUDITORIA_INICIAL_2026-11-02.md) | Primera entrega: hallazgos F01–F22 | Solo por trazabilidad de los F |
| [DIRECCION_VISUAL_2026-11-03.html](../diseno/DIRECCION_VISUAL_2026-11-03.html) | Cinco bocetos con datos ficticios (web, Hoy, cobro, carta, superadmin) | Propuesta, no decisión |

En este plan, «PA-T07» es la prueba T07 de la auditoría por apartado, y «M§8» es la sección 8 del informe maestro. **0.5**, **1.3**, etc. son fichas de este plan (ola.número).

---

## 1. Cómo se trabaja cada ficha

Esto se aplica a todas las fichas, además de lo que dice [CLAUDE.md](../../CLAUDE.md):

1. **Rama y PR propios.** `fix/…` para la ola 0 y `feat/…` para lo nuevo. Si una ficha es grande, se parte en varios PR y no se junta todo en uno.
2. **Reproducir antes de arreglar.** Primero va una prueba que falla (vitest para la lógica; para SQL de dinero, Postgres local de verdad, no simulaciones). La prueba entra en el mismo PR que el arreglo.
3. **Maqueta antes de construir cualquier cambio visual.** Ya se rechazaron dos rediseños de Tomar pedidos por construir sin enseñar antes. Primero va la maqueta, después tu aprobación y al final el código.
4. **Revisar la pantalla antes de decir «hecho».** Se mira renderizada a 390, 768 y 1280 px, en tema claro y oscuro. Las pruebas en verde no garantizan cómo se ve.
5. **Migraciones desde la 154.** Cada PR que incluya una migración debe decir si se aplica antes o después de desplegar.
6. **Cerrar con evidencia.** Cada PR dice qué hallazgo resuelve, muestra la prueba que antes fallaba y ahora pasa, y trae una captura si hay cambio visual. Su ficha se marca en el [tablero](#7-tablero) dentro del mismo commit.
7. **Al terminar una ola** se actualiza `CHANGELOG.md` y se te propone una etiqueta `vX.Y.0`.

**Definición de terminado** (M§4, reducida a lo que se puede comprobar): el resultado es correcto; los estados de vacío, cargando y error son honestos; los permisos se validan en el servidor; repetir la acción no la duplica; la pantalla sirve en móvil y escritorio; el foco y el teclado funcionan en los diálogos; y queda rastro de quién hizo qué.

### Antes de empezar la ola 0

- **v0.17.0 no está desplegada.** En producción faltan las migraciones 148, 150, 151 y 152 **antes** de desplegar, y la 153 **después**. Conviene desplegarla y ponerle la etiqueta `prod-…` antes de la ola 0, para no apilar correcciones sobre código que nunca llegó a producción.
- `CLAUDE.md` dice que la última migración es la 141, pero ya es la 153. Hay que corregirlo cuando se toque ese archivo.

---

## 2. Lo que se comprobó en el código el 2026-11-04

Rutas relativas a `plataforma/src/`. «Confirmado» significa que el código hace lo que describe la auditoría, sin haberlo ejecutado. Las pruebas de cada ficha lo demostrarán.

| Hallazgo | Estado | Dónde |
|---|---|---|
| X01 · «Pedidos en pausa» aparece antes de guardar | Confirmado: es estado local que se envía con el formulario del horario | `components/admin/hours-editor.tsx:105,165,176` |
| X04 · Cupón programado: se ignora el inicio y se borra al editar | Confirmado: el estado no lee `valid_from`, el formulario no lo carga y el guardado lo deja en `null` | `components/admin/cupones-panel.tsx:28-34,65`; `lib/actions/cupones.ts:167` |
| **X05 · Vencimiento del cupón** | **Más grave de lo que dice la auditoría.** `valid_until` es `timestamptz` y recibe `AAAA-MM-DD`. Con la base en UTC (lo normal en Supabase) el cupón vence a las **18:00 del día anterior** en Guatemala, y la lista probablemente muestra la fecha con un día menos. Falta confirmarlo con una prueba | `supabase/migrations/045_cupones.sql:18`; `cupones-panel.tsx:180,227`; `lib/db/cupones.ts:55` |
| X06 · El checkout solo revisa 20 cupones | Confirmado: `.limit(20)` y la vigencia se filtra después | `lib/db/cupones.ts:80-95` |
| X08 · La receta se borra antes de insertar | Confirmado: el `delete` no revisa errores y no hay transacción | `lib/actions/recipes.ts:166-176` |
| X09 · Se promete que cada venta descuenta insumos | Confirmado: nada descuenta por receta y la migración 088 dice que solo costea | `components/landing.tsx:36`; `lib/modules.ts:160`; `migrations/088…sql:42` |
| X10 · Compras: cabecera y líneas por separado, estado sin condición | Confirmado: si fallan las líneas queda la cabecera huérfana, y se puede pasar de RECIBIDA a BORRADOR | `lib/actions/suppliers.ts:108-127,134-160` |
| X11 · IDs de otro restaurante | Confirmado en tres lugares: el ingrediente de la receta, el proveedor o producto o insumo de la compra, y `profile_id`/`driverId` del repartidor. Todo usa el cliente de servicio, que se salta RLS. No se intentó explotarlo | `recipes.ts:169`; `suppliers.ts:96,125`; `drivers.ts:109,143-160` |
| X12 · Reordenar categorías con dos escrituras | Confirmado | `lib/actions/categories.ts:106-121` |
| X13 · «Hoy más temprano» sin filtrar por día | Confirmado (el rótulo) | `components/admin/waitlist-panel.tsx:246` |
| X14 / N22 · Marca «sentada» antes de ocupar la mesa | Confirmado. **Es una decisión deliberada** que está comentada en el código («la gente YA está sentada»). La ficha 0.9 la revisa con una política explícita en lugar de cambiarla en silencio | `lib/actions/waitlist.ts:116-150`; `lib/actions/reservaciones.ts:97-119` |
| X17 · Dos umbrales para «PC conectada» | Confirmado: 10 min en Hoy y Ajustes, 90 s en Mi PC | `app/admin/(protected)/page.tsx:265`; `ajustes/page.tsx:92`; `components/admin/print-agent-settings.tsx:423` |
| X19 · Límites de analítica | Confirmado: 20.000 pedidos y 2.000 productos | `lib/db/analytics.ts:94-95` |
| X02 · Encuesta «anónima» que muestra nombres | Confirmado | `components/admin/encuestas-panel.tsx:87,118` |
| N01 · Superadmin promete un descuento de Q50 por canal | Confirmado: ese descuento se retiró y `plans.ts` lo explica | `components/super/order-types-editor.tsx:48` vs `lib/plans.ts:16` |
| F03 · La FAQ dice «No hay tope de pedidos» | Confirmado: contradice el tope blando de 300 pedidos de En línea (v0.17.0) | `app/planes/page.tsx:49` |
| N12 · Un error en la salud de clientes se ve como «todo en orden» | Confirmado | `lib/db/client-health.ts:29,58` |
| N13 · Un error en comprobantes se ve como «no hay comprobantes» | Confirmado | `lib/db/comprobantes.ts:60,82` |
| F21 · El cupón y los puntos se guardan fuera del pedido | Confirmado: `Promise.all` sin revisar errores tras `place_order`, y el canje va después | `lib/actions/orders.ts:619-645` |
| N05 / C08 · Cerrar caja sin turno | Confirmado: hace `insert` sin clave de idempotencia y el vínculo de gastos no revisa errores. Con turno abierto sí hay una guarda condicional | `lib/actions/finanzas.ts:888-916` |
| T02 · La cola offline traga los fallos | Confirmado: `catch {}` | `lib/order-queue.ts:46-54` |
| F14 · `permissions = null` da acceso total | Confirmado y documentado como intencional («aún sin restringir») | `lib/permissions.ts:6,65` |
| F17 · Un agotado vuelve solo a las 12 h | Confirmado; el tutorial lo explica | `lib/product-availability.ts:35` |
| N14 · `/panel/<slug>` manda a Mi cuenta a quien entra con membresía | **Sin reproducir.** Se observó en local; es el mismo tipo de error que el `createWaiterOrder` corregido en el PR #66 | `proxy.ts` (reescrituras) |

---

## 3. Decisiones

### Tomadas el 2026-11-04

| Tema | Decisión | Efecto en el plan |
|---|---|---|
| Recetas e inventario (X09) | **Corregir el texto ya y construir después** | En 0.1 los textos pasan a decir «calcula el costo de cada platillo». El consumo automático se construye en **4.1** |
| Encuestas (X02) | **Encuesta identificada, y se avisa** | En 0.1 el comensal ve, antes de responder, que su nombre llega al restaurante. Se quita la palabra «anónima» |
| Cierre de caja sin apertura (N05) | **Se permite, pero queda marcado** | En 0.10 ese cierre queda como «Turno sin apertura · fondo desconocido» y exige contar el efectivo. La ✓ solo aparece con el conteo hecho |
| Dirección visual (§5 de la auditoría) | **Explorar la paleta nueva** antes de decidir | La ficha **1.0** compara en maquetas la identidad actual con «hospitalidad precisa» en tres pantallas, y eliges tú. Ninguna ficha visual de la ola 1 empieza antes |

### Pendientes (dónde bloquean)

| Decisión | Bloquea | Opciones |
|---|---|---|
| **Número de WhatsApp de ventas** (F02/W02) | 0.1 | Me das el número, o el botón pasa a decir «Escríbenos por correo» |
| Paleta: actual o nueva | Las fichas visuales de la ola 1 | Se decide al ver las maquetas de 1.0 |
| «Partes iguales»: comportamiento final | 1.1 | La auditoría propone partes que se cobran de verdad (C01). Mientras tanto, 0.1 la renombra «Calcular partes» |
| Agotado manual: opciones (F17/O04) | 1.10 | Propuesta: «hasta mañana», «hasta reponer» y «hasta que lo active», con «hasta mañana» por omisión |
| Política de suspensión por falta de pago (N24) | 4.10 | Gradual: aviso, luego solo lectura y al final pausa del menú. Hay que definir los plazos |
| Personas para las pruebas de uso | Q.3 (desde la ola 1) | La auditoría pide de 3 a 5 personas por rol (mesero, cajero, cocina, dueño). Las consigues tú |
| Restaurantes piloto | V.5 | Segmento sugerido: restaurante independiente con salón, cocina y cobro presencial |

---

## 4. Las olas

| Ola | Objetivo | Fichas | Sale cuando |
|---|---|---|---|
| **0 · Verdad, dinero y acceso** | Que ninguna pantalla mienta y que el dinero y los datos no queden a medias | 13 | Las pruebas de reproducción de cada hallazgo pasan; v0.18.0 |
| **1 · Recorridos de trabajo** | Cobro, caja, servicio, cocina, recepción, catálogo, inventario y comensal excelentes; decidir la paleta | 13 | Cada recorrido aprobado en maqueta, construido y probado por una persona nueva |
| **2 · Arranque y autonomía** | Un restaurante nuevo llega a su primer pedido de prueba sin ti | 12 | Alta → carta → pedido de prueba → cocina → cobro sin ayuda |
| **3 · Números confiables y retención** | Métricas que cuadran con el detalle; lealtad, cupones y encuestas con resultado visible | 7 | Cada cifra abre su detalle y cuadra con él |
| **4 · Operación avanzada y escala** | Inventario por receta, compras, reparto, respaldo, FEL y un superadmin que no crezca contigo | 12 | Se activan con los pilotos |
| **V · Línea comercial** | Web, demo, planes, medición y pilotos | 6 | Va en paralelo desde la ola 1 (la demo debe mostrar recorridos ya corregidos) |
| **Q · Calidad transversal** | Definición de terminado, pasada de precisión visual y pruebas con personas | 3 | Continua |
| **5 · Ventajas propias** | Una o dos apuestas de M§9 | — | Solo con uso real y la base firme |

La ola 0 se puede empezar ya. Las olas 1 a 4 avanzan **una línea de experiencia y una de confiabilidad a la vez** (recomendación de M§7 para un equipo pequeño).

---

## 5. Ola 0: verdad, dinero y acceso

Orden recomendado: primero lo de más riesgo y menor tamaño, y lo que destraba a otras fichas:
**0.1 → 0.5 → 0.4 → 0.3 → 0.7 → 0.6 → 0.10 → 0.9 → 0.8 → 0.11 → 0.12 → 0.2 → 0.13**

### 0.1 · Textos y enlaces que prometen otra cosa — S · sin migración

**Cubre:** N01, F01, F03, W01 (solo el texto), F02/W02, X09 (texto), X02, X13 (rótulo), X15, X16/F18 (nombre), X19 (`CARD`), F22, N02 (renombre provisional), R37.1.
**Hacer:**
- Superadmin: quitar «cada método apagado descuenta Q50» (`order-types-editor.tsx:48`).
- FAQ de planes: explicar el tope blando de 300 pedidos de En línea; quitar «no hay tope en ningún plan». Revisar que portada, planes, alta y suscripción digan lo mismo (F01: el CTA de menú gratis debe decir qué incluye).
- Recetas: en `landing.tsx:36` y `modules.ts:160`, cambiar a «calcula el costo de cada platillo» (decisión X09).
- Encuestas: quitar «anónima»; en la encuesta del comensal, «Tu nombre se comparte con el restaurante» (decisión X02).
- Copia de datos: «Exportación de datos» con su alcance (cuatro hojas, hasta 5.000 pedidos), en lugar de «copia completa».
- Lista de espera: «Historial reciente», con la fecha, en vez de «Hoy más temprano».
- Funciones: Domicilio → Entrega, Local → Salón, Recoger → Reglas de pedidos (X15).
- Analítica: `CARD` → «Tarjeta», con un diccionario de métodos compartido.
- Acceso: título de la pestaña con la marca, no «Menú en línea».
- Cobro: «Partes iguales» → «Calcular partes», con la aclaración de que cobra la cuenta completa (hasta que llegue 1.1).
- Contacto de ventas: WhatsApp real o un botón honesto de correo (pendiente de decisión).

**Aceptación:** una búsqueda en el repo no encuentra ninguna de las frases retiradas; capturas antes/después de cada texto.

### 0.2 · Una sola fuente para plan, precio y alcance — M

**Cubre:** E01, N15, N23, R36.1–2, R37.2, W01 (en las superficies).
**Hacer:** que web, comparación, Hoy, suscripción y superadmin lean su texto de `lib/plans.ts`. Hoy cada uno arma su propio texto. Separar «incluido», «habilitado», «configurado» y «activo». Calcular el contador de funciones a partir de la misma lista que se muestra (evita el «7 funciones» con ocho en la lista). Hoy en Estándar: el texto sale de los permisos efectivos, no del nombre del plan.
**Aceptación:** pruebas para el mismo restaurante en cinco superficies (Estándar con 2 de 3 canales, Premium a precio fijo, En línea con el tope blando y un precio de excepción); el mismo importe y el mismo alcance en todas. No recalcula contratos históricos.

### 0.3 · Error no es vacío ni cero — M

**Cubre:** E02, N12, N13, X20, X07, X21, D06 (la parte de errores), PA-T09, PA-T16, PA-T17.
**Hacer:** un tipo de lectura común (`ok`, `vacío`, `error`, `parcial` y `falta migración`, con fecha del último dato). Aplicarlo a la salud de clientes, comprobantes, cupones, encuestas, lista de espera y analítica. Recompensas: mostrar el error al eliminar o pausar y no aparentar éxito (X07). Mi cuenta y Finanzas: «Margen no disponible: faltan costos», con el porcentaje de ventas que sí tienen costo, en vez de utilidad Q0 (X21). Reutilizar `lib/db/migracion-ausente.ts`.
**Aceptación:** una prueba por módulo que fuerza el error y comprueba que no aparecen «Todo en orden», «No hay comprobantes» ni un cero. Al reintentar se conserva el filtro.

### 0.4 · Pausa de pedidos real — S/M · requiere maqueta

**Cubre:** X01, R26.1–2, PA-T01.
**Hacer:** sacar la pausa del formulario de horario y convertirla en una acción inmediata con confirmación del servidor: «Pausar 15 / 30 / 60 min · hasta reactivar», con la hora de reapertura a la vista. Mientras se guarda, el panel dice «Pausando…». Si falla, sigue diciendo «Recibiendo pedidos».
**Aceptación:** video o capturas del caso bueno, del fallo de red y de la red lenta. Una pausa temporal se reabre sola a la hora prometida (necesita una columna para la hora de fin, en una migración nueva).

### 0.5 · Cupones: vigencia, programación y límites — M · migración probable

**Cubre:** X04, X05, X06, R15.4, PA-T04, PA-T05, PA-T06.
**Hacer:**
- `couponStatus` y el servidor comparten una sola función de estado (programado, vigente, pausado, agotado, vencido).
- Al editar se conservan `valid_from` y `valid_until` si no se tocan.
- **X05:** la fecha elegida vale hasta el final de ese día *en la zona del restaurante*. Se guarda como el límite exclusivo de las 00:00 del día siguiente, ya convertido a UTC. Primero una prueba que confirme el desfase actual; después revisar los cupones existentes antes de migrarlos.
- `hasActiveCoupons` filtra en la base, sin `limit(20)`.

**Aceptación:** PA-T04, T05 (23:59 y 00:00 en Guatemala) y T06 (21 cupones con el último vigente) pasan; la fecha mostrada es la misma que se eligió.

### 0.6 · Pedido, cupón y puntos en una sola operación — L · migración

**Cubre:** F21, T01 (la parte de pedido y promoción), E03 (la parte de pedido), PA-T07, PA-T08, M§8 «Cupón última unidad» y «Canje y cancelación».
**Hacer:** el cupón (con su uso condicionado al tope: `uses < max_uses`) y el canje de puntos se aplican dentro de `place_order` o en una función que lo envuelva en una sola transacción. La cancelación revierte el uso y los puntos según una regla escrita. Idempotencia por `client_id` (ya existe para el pedido; se extiende a sus efectos).
**Aceptación:** pruebas en Postgres real: dos pedidos compiten por el último uso del cupón y solo uno lo obtiene; si un paso falla, no queda un pedido con descuento sin cupón registrado; dos canjes contra un saldo que no alcanza solo aceptan lo que cubre el saldo.

### 0.7 · Receta atómica y referencias entre restaurantes — M · migración

**Cubre:** X08, X11, X12, R08.5, R10 (la parte de integridad), R30.2, PA-T10, PA-T11.
**Hacer:** una función `reemplazar_receta` transaccional que valida que cada ingrediente sea del mismo restaurante. En compras, validar proveedor, producto e insumo; en repartidores, `profile_id` y `driverId`. Usar restricciones compuestas `(id, restaurant_id)` donde aplique. Reordenar categorías con una función atómica (X12).
**Aceptación:** si falla la inserción, la receta y el costo anteriores quedan intactos; con dos restaurantes de prueba, un ID ajeno se rechaza sin leer ni modificar nada; reordenar no duplica posiciones.

### 0.8 · Compras: creación atómica y estados válidos — M · migración

**Cubre:** X10, R12.1–2, PA-T12.
**Hacer:** crear la cabecera y las líneas en una sola función. Máquina de estados: BORRADOR → ENVIADA → RECIBIDA/CANCELADA. Una compra RECIBIDA no vuelve a BORRADOR; las correcciones se hacen con un documento de devolución (ficha 4.2). Conservar `leogin_receive_purchase_order`, que ya es atómica.
**Aceptación:** la secuencia recibida → borrador → recibida se rechaza y el stock no se suma dos veces; si fallan las líneas, no queda una cabecera huérfana.

### 0.9 · Sentar desde espera o reserva sin estados partidos — M

**Cubre:** X14, N22, E14, PA-T18, M§8 «Sentar reserva falla».
**Hacer:** decidir la política (el comentario de `waitlist.ts` defiende marcar «sentado» aunque la mesa falle). Propuesta: primero ocupar la mesa y después marcar al grupo; si la mesa está ocupada, el grupo queda «pendiente de mesa» con la causa y no desaparece de la cola. Reservaciones igual. Dar etiqueta accesible a los campos del formulario de reserva (N22).
**Aceptación:** con la mesa ocupada, el grupo sigue a la vista con un aviso; repetir la acción no abre otra sesión.

### 0.10 · Caja honesta — M · requiere maqueta

**Cubre:** N05 (con la decisión tomada), N06, N07, C08 (la parte de cierre), R22.1–2 y R22.5.
**Hacer:**
- La ✓ solo aparece cuando el efectivo se contó. «Contado: Q0» es distinto de «sin contar».
- Cerrar sin apertura se permite, pero el corte queda marcado «Turno sin apertura · fondo desconocido» y exige el conteo.
- El `insert` de cierre lleva una clave de idempotencia, y el vínculo de gastos revisa errores.
- «Cortes recientes» se actualiza al confirmar el cierre, sin recargar.
- El resumen muestra a la vez el período de los movimientos (05:00–10:48) y la hora de apertura física.

**Aceptación:** dos cierres simultáneos dan un solo corte; el historial aparece al instante; el cierre normal de Q70 sigue funcionando.

### 0.11 · Cola offline que no promete de más — S/M

**Cubre:** T02 (contrato de guardado), M06 (la parte offline), M§8 «Cola offline, espacio lleno».
**Hacer:** `saveQueuedOrder` devuelve un resultado; si el almacenamiento falla, el comensal y el mesero ven «No se guardó en este aparato» con una acción para resolverlo. Un pedido en cola nunca se presenta como «recibido por el restaurante». La migración a IndexedDB y la matriz completa sin internet, LAN o PC quedan en 4.6.
**Aceptación:** con `localStorage` lleno o bloqueado no aparece «guardado».

### 0.12 · Acceso por sucursal con membresías — M

**Cubre:** N14, E04, T06, F20, PA-T29, M§8 «Dueño sin restaurant_id» y «Empleado sin permiso».
**Hacer:** reproducir primero el caso del dueño con membresía y sin `profiles.restaurant_id`, y el de varios locales. Rastrear la reescritura de `proxy.ts`, las cabeceras y `resolveRestaurantId`. Ampliar el E2E con esos usuarios, un empleado restringido y el superadmin con MFA. **No** se corrige copiando `restaurant_id` a todos.
**Aceptación:** cada `/panel/<slug>` abre el local elegido o explica por qué se niega; pasar del local A al B no mezcla datos; una acción invocada directamente sin permiso se rechaza en el servidor.

### 0.13 · Probar el circuito del dinero en Postgres real — L

**Cubre:** C08, E03 (cobros y cierres), T01 (cobro, devolución y cierre), filas de M§8.
**Hacer:** una suite de integración contra la base local que corre M§8: Q100 entre 3 (33,34 + 33,33 + 33,33), Q200 con tres pagos mixtos, dos empleados que cobran el mismo saldo, doble clic con la respuesta perdida, pago parcial y luego un platillo nuevo, devolución de otro turno, descuento y propina repartidos, cierre mientras entra un cobro, y el corte de las 05:00 con zona horaria. Cada fallo que encuentre se vuelve una ficha propia (bug) antes de la ola 1.
**Aceptación:** la suite corre en CI o tiene un comando documentado; hay una tabla de resultados por caso.

**Estado (2026-11-05):** suite implementada en `fix/pruebas-dinero-postgres`, sin cambiar las acciones monetarias ni agregar migraciones. `npm run test:dinero -- --reporter=verbose`, desde `plataforma/`, ejecuta las nueve invariantes contra PostgREST/Postgres local y limpia sus fixtures incluso cuando fallan. **Tres casos pasan y seis reproducen defectos**; el comando devuelve 1, sin omitir ni invertir esos fallos. La 0.13 entrega las pruebas, no certifica el dinero. Datos, pasos, importes esperados/reales, alcance de los dobles de sesión y tabla de resultados en [PRUEBAS_DINERO_POSTGRES](../../plataforma/docs/PRUEBAS_DINERO_POSTGRES.md). Las seis fichas siguientes bloquean la ola 1.

### 0.14 · Cobro parcial concurrente sin sobrecobro — L · bug de D03

**Cubre:** E03, T01, M§8 «Dos empleados cobran el mismo saldo». **Reproducido:** dos empleados leen el mismo consumo Q10 y ambas llamadas a `cobrarParteDeMesa` insertan Q10; el libro termina en Q20. **Hacer:** confirmar de forma atómica el saldo disponible, las líneas asignadas y el movimiento; el segundo intento no puede volver a consumir ese saldo. Conservar la identidad del empleado y la trazabilidad. **Aceptación:** D03 pasa en Postgres con dos identidades y lecturas intercaladas; también debe reconciliar el cobro de cierre, sin restaurar datos de prueba sobre cobros existentes.

**Estado (2026-11-05):** implementada en `fix/cobro-parcial-concurrente`, con migración **160 antes de desplegar**. El cobro parcial guarda el movimiento y la asignación por plato en una transacción; el cierre usa el mismo bloqueo y valida otra vez el saldo antes de entregar pedidos. D03 pasa junto con once garantías adicionales, que entran al CI. El navegador valida Q52 cobrados una vez desde dos sesiones y cierre posterior del saldo Q18. Los importes históricos no se reconstruyen: el legado debe conservar una asignación verificable. Quedan 0.15–0.19; los casos de reparto entre pedidos y del centavo ahora se rechazan sin escribir dinero ni cerrar la mesa. Evidencia en §11 del [registro](../registros/ESTADO_AUDITORIA_INTEGRAL_2026-11-04.md).

### 0.15 · Identidad durable del intento de cobro — L · bug de D04

**Cubre:** E03, T01, M§8 «Doble clic y respuesta perdida». **Reproducido:** se pierde el acuse después de confirmar el INSERT Q10; repetir el intento deja Q20. **Hacer:** identidad estable de la operación desde el cliente hasta la base, unicidad durable y recuperación del resultado/recibo original. Coordinar con 0.14; un intento nuevo no equivale a repetir el anterior. **Aceptación:** D04 pasa con respuesta perdida después del commit y reintento; un segundo pago legítimo con otra identidad sigue permitido hasta el saldo disponible.

**Estado (2026-11-05):** implementada en `fix/identidad-intento-cobro`, desde #85; PR propio contra esa rama para revisar solo esta ficha. **Migraciones 161 y 162 después de la 160 y antes del código.** La 162 completa el candado restrictivo de segundo factor exigido por CI, sin editar la 161 ya aplicada. El aparato guarda identidad y solicitud antes de enviar; Postgres confirma el resultado original junto con dinero/reparto/cierre y lo devuelve al reintentar, incluso después de cerrar, devolver o reutilizar la mesa. Otra identidad permite un pago legítimo idéntico hasta el saldo disponible. D04 y nueve garantías nuevas pasan; las doce de 0.14 se conservan. Matriz completa: **29 ejecutadas, 25 pasan y 4 fallan** por 0.16–0.19, sin ocultarlos. Evidencia y traspaso en §12 del [registro](../registros/ESTADO_AUDITORIA_INTEGRAL_2026-11-04.md).

### 0.16 · Cerrar cobrando solo el saldo de cada pedido — M · bug de D05

**Cubre:** E03, C08, M§8 «Pago parcial y nuevo platillo». **Reproducido:** pedido Q100 con Q40 ya cobrados; ronda nueva Q20; se cierra con Q80. El libro suma Q120, pero todo queda en el primer pedido y el nuevo se entrega con Q0. **Hacer:** descontar el neto ya cobrado por pedido antes de asignar el nuevo pago y cerrar; no basta con cuadrar el total de la mesa. **Aceptación:** D05 pasa: Q100/Q20 por pedido, Q120 de libro, pagos anteriores intactos y ninguna ronda entregada sin su cobro. Probar correcciones/devoluciones posteriores sobre cada pedido.

**Estado (2026-11-05):** implementada en `fix/cierre-saldo-por-pedido`, desde #86 y con PR propio contra esa rama. **Migración 163 después de la 162 y antes del código.** SQL calcula el saldo neto por pedido dentro del bloqueo de 0.14 y conserva el resultado durable de 0.15. D05 confirma Q60/Q20 nuevos, con Q40 previos intactos; también pasan ocho garantías de métodos/efectivo, pedido ya saldado, pago sin importe, rechazo de importe incorrecto, ronda fuera del snapshot, más de mil movimientos previos, privilegios y correcciones/devoluciones posteriores. Matriz: **37 ejecutadas, 34 pasan y 3 fallan** por 0.17–0.19. Traspaso en §13 del [registro](../registros/ESTADO_AUDITORIA_INTEGRAL_2026-11-04.md).

### 0.17 · Centavos del reparto persistido — M · bug de D07

**Cubre:** C08, E03, M§8 «Descuento y propina fraccionados». **Reproducido:** tres platos Q30, descuento Q10 y propina Q20 suman Q100; el reparto calcula Q33.34/Q33.33/Q33.33, pero la acción recorta cada línea a Q33.33 y guarda Q99.99. **Hacer:** distribuir el residuo de centavos con una política única entre cálculo y persistencia, sin alterar pagos previos ni marcar como saldado lo que no lo está. **Aceptación:** D07 pasa; libro, saldo y asignaciones conservan exactamente Q100, con reparto también por cantidad y extras negativos.

### 0.18 · Cobros en tránsito al cerrar un turno — L · bug de D08

**Cubre:** C08, E03, T01, M§8 «Cierre simultáneo y venta al límite». **Reproducido:** un INSERT real de pago queda esperando el bloqueo de su pedido; caja cierra sin verlo; al confirmar, el pago conserva una fecha anterior al corte. Ni ese cierre ni el siguiente periodo incluyen Q10. **Hacer:** coordinar cobros y cierre en la base con una regla durable de pertenencia a turno que contemple transacciones iniciadas pero no confirmadas; conservar los cortes firmados. No resolverlo con una pausa fija ni reconstruyendo un recibo histórico desde datos actuales. **Aceptación:** D08 pasa con bloqueo observado por `pg_blocking_pids`, tanto si confirma primero el cobro como el cierre: cada movimiento confirmado pertenece a un periodo y el total se reconcilia.

### 0.19 · Incluir el instante exacto del inicio del día — M · bug de D09

**Cubre:** C08, M§8 «Cambio de día a 05:00 y zona horaria». **Reproducido:** Guatemala 04:59:59.999 Q1, 05:00:00.000 Q2, 05:00:00.001 Q3: SQL informa Q5 para el día nuevo; caja informa Q3 y omite Q2. **Hacer:** acordar límites inclusivos/exclusivos entre el inicio del día y el último cierre; cambiar todo a `gte` duplicaría los movimientos del límite entre cierres. **Aceptación:** D09 pasa y la unión de periodos no pierde ni duplica el instante exacto; mantener la misma zona y corte en caja e informes.

---

## 6. Olas 1 a 4, línea comercial y calidad

Las fichas indican **qué cubren y dónde está la especificación**. El detalle de qué hacer y cuándo se da por aceptada está en la auditoría y no se copia aquí. Al empezar cada ficha se escribe su mini-plan en el PR.

### Ola 1 · Recorridos de trabajo (P1)

| Ficha | Tamaño | Cubre | Especificación | Notas |
|---|---|---|---|---|
| **1.0 Exploración de paleta y sistema visual** | L | D01, D02, D03, N09, M§5, apartado §9–10 | M§5 «Especificación inicial» y «Pasada de precisión» | **Primero.** Maquetas de Hoy, Cobro y Carta del comensal: identidad actual (con las reglas aplicadas) frente a «hospitalidad precisa». Eliges tú; después se definen los tokens y los componentes con todos sus estados |
| 1.1 Cobro completo | L | E06, N02, N03, N04, C01, C02, C03, F11, F12, R05.5–6, filas de dinero de M§8 | M§4.5, C01–C03 | Partes que se cobran de verdad, pago mixto, importe libre y efectivo recibido libre. Se quitan los postres de la hoja de cobro. En móvil: «Consumo · pagado · por cobrar». Depende de 0.13 y de corregir 0.14–0.19 |
| 1.2 Caja: borrador, cuadre y recibo | L | E05, C04, C06, F13, R22.3–4 | M§4.6, C04, C06 | Autoguardado del conteo, cuadre explicable hasta el movimiento, recibo estable. Depende de 0.10 |
| 1.3 Mesa: pagada, por limpiar y libre | M | C07, R04, M§4.4 (modelo de estados) | R04, C07 | Pagar no libera la mesa por sí solo |
| 1.4 Servicio estable por turno | M | E07, N08, N10, O03, R05.1–4 | M§4.4, E07 | Favoritos y atajos fijos durante el turno; modo servicio con el armazón reducido |
| 1.5 Cocina por etapa y estación | L | O02, F15, R03, D09, M§4.7 | R03, O02 | Un reloj por etapa, vista de pase, «mi parte lista» frente a «pedido listo», prueba de sonido |
| 1.6 Pedidos en vivo | M | R02 | R02 | Excepciones a la vista, historial por pedido y deduplicación |
| 1.7 Permisos por trabajo | L · migración | E12, N18, N19, F14, C05, R35 | R35, E12, C05 | Plantillas de mesero, cocina, caja, encargado y recepción; separar caja de finanzas; migrar `null` sin dejar a nadie fuera a mitad de turno. Alta con el rol menos privilegiado |
| 1.8 Recepción: reservas, espera y salón | L | R17, R18, O07, X13 (filtro real), PA-T19, PA-T20 | R17, R18 | Agenda con capacidad; «abrí WhatsApp» no es lo mismo que «mensaje entregado». Depende de 0.9 |
| 1.9 Catálogo y alta de platillo | L | E10, N17, R06, R07, R08, R09, M03 (lado del panel), O10, PA-T24 | R06–R09, E10 | Formulario progresivo, un solo título, inglés solo si está activo, etiquetas separadas de dietas, categoría en línea, cambios en lote con vista previa |
| 1.10 Inventario con cobertura y agotados con intención | M | E11, N20, R11, O04, F17 | R11, O04 | «0 de 38 controlados», buscador, activar por categoría; agotado «hasta mañana / reponer / reactivar» |
| 1.11 Comensal: ficha, carrito, temas y accesibilidad | L | E08, N11, F09, F10, D04, D08, M02, M03, M04, M08, PA-T25, PA-T26 | M§4.10, M02–M04 | Pie fijo con total, contraste del modal de lealtad, foco en los diálogos, carrito editable |
| 1.12 Comensal: entrada, checkout y seguimiento | M | M01, M05, M06, X23 | M§4.10, M05–M06 | Recibido, aceptado, preparando y listo; tiempos como estimación; sin promesas fijas configurables |

### Ola 2 · Arranque y autonomía

| Ficha | Tamaño | Cubre | Especificación |
|---|---|---|---|
| 2.1 Hoy por etapa (nuevo, operando, cerrado) | M | O01, R01, M§4.3 | R01, O01 |
| 2.2 Primeros pasos por resultado y eventos de activación | M | E09, N16, A02, F08, eventos de M§10 | E09, A02 |
| 2.3 Alta hasta el primer valor | L | A01, F07, M§4.2 | A01 |
| 2.4 Importar una carta con revisión | L | A03, M§4.2 (importación), M§9.D | A03 |
| 2.5 Turno de práctica | M | A05 | A05 |
| 2.6 Aparato por rol y Mi PC con estado único | L | A06, R34, X17, PA-T21, PA-T22 | R34, A06 |
| 2.7 Personalización guiada | L | R32, X22, A04 | R32 |
| 2.8 Ajustes, perfil, horarios, salón, entrega y reglas | M | R24, R25, R26.3–5, R27, R28, R29, R37.3–5, PA-T02, PA-T03 | R24–R29, R37 |
| 2.9 Ayuda por intención | M | R39, X18, S07 (lado del restaurante) | R39 |
| 2.10 Código QR | S/M | R33 | R33 |
| 2.11 Navegación móvil por rol | M | D05 | D05, apartado §9 |
| 2.12 Lenguaje de una sola marca (glosario) | S | D07, apartado §9 «Mensajes» | D07 |

### Ola 3 · Números confiables y retención

| Ficha | Tamaño | Cubre | Especificación |
|---|---|---|---|
| 3.1 Diccionario de métricas y semántica de cliente | M | E13, N21, R13, R19 | E13, R13, R19 |
| 3.2 Analítica, finanzas y Mi cuenta con cobertura | L | R20, R21, X19 (agregación completa), O06, F16, PA-T14, PA-T15, PA-T17, apartado §8 Mi cuenta | R20, R21, O06 |
| 3.3 Lealtad con su economía a la vista | L | R14, O08, M07 | R14 |
| 3.4 Cupones como herramienta | M | R15 (el resto), X03 | R15 |
| 3.5 Encuestas con bandeja de comentarios | M | R16 | R16 |
| 3.6 Tu año y resumen semanal | M | R40, E20, M§9.E | R40, E20 |
| 3.7 Seguridad de la cuenta | M | apartado §8 «Seguridad de cuenta» | apartado §8 |

### Ola 4 · Operación avanzada y escala del SaaS

| Ficha | Tamaño | Cubre | Especificación |
|---|---|---|---|
| **4.1 Consumo de inventario por receta** (decisión X09) | L · migración | X09 (construir), O05, R10 | R10, O05, M§4.8 |
| 4.2 Compras y proveedores completos | XL | R12 (el resto), PA-T13 | R12 |
| 4.3 Repartidores y despacho | L | R30, O09 | R30, O09 |
| 4.4 WhatsApp | L | R31 | R31 |
| 4.5 Exportación completa y restauración probada | L | T05, R38, X16/F18 (construir), PA-T27 | R38, T05 |
| 4.6 Continuidad offline demostrada | L | E19, T02 (el resto), PA-T23 | E19, T02 |
| 4.7 Facturación FEL (P0 antes de habilitarla) | XL | R23, PA-T30 | R23 |
| 4.8 Datos completos a escala | L | E17, N25, F19, T03, PA-T15 | E17, T03 |
| 4.9 Superadmin: cola de trabajo, ficha y rescate | L | E15, S01, S05, S07, N19 (lado del superadmin), N09 (si no quedó en 1.0) | M§4.11, E15 |
| 4.10 Cobranza y cambios de contrato | L | E16, S04, N24, R36.3–5, PA-T28 | E16, S04 |
| 4.11 Métricas SaaS, cohortes y embudo comercial | L | S02, S03, S08 | S02, S03, S08 |
| 4.12 Despliegues, observabilidad y rendimiento | L | S06, T04, T07 | S06, T04, T07 |

### V · Línea comercial (en paralelo desde la ola 1)

| Ficha | Tamaño | Cubre | Especificación |
|---|---|---|---|
| V.1 Portada centrada en una demostración | M | W03, F05, E18, M§4.1 | M§4.1, W03, E18 |
| V.2 Vender por situaciones | M | W04 | W04 |
| V.3 Planes fáciles de elegir | M | W05, F04 | W05 |
| V.4 Medir el embudo de adquisición | M | W07, F06, M§10 | W07 |
| V.5 Pilotos y prueba social verificable | L | W06, M§1 (pilotos), M§10 | W06 |
| V.6 Material comercial consistente | M | W08 | W08 |

### Q · Calidad transversal

| Ficha | Cubre | Qué es |
|---|---|---|
| Q.1 Registro de capacidades | T08 | Cada capacidad con su estado: diseñada, construida, probada, desplegada, activada o validada con clientes. Se lleva en este tablero y en `registros/IMPLEMENTACIONES.md` |
| Q.2 Pasada de precisión visual | D10, D06 (estados vacíos), M§5 «Pasada de precisión», apartado §9 | Se aplica a cada ficha visual: captura antes/después por ancho y estado |
| Q.3 Pruebas con personas nuevas | M§7 (días 5 y 9), apartado §13 | De 3 a 5 personas por rol, con tareas reales y sin guiarlas. Desde la ola 1 |

### Ola 5 · Ventajas propias (después)

Elegir una o dos de M§9: turno guiado (A), capacidad de cocina (B), menú rentable (C). Las otras dos ya tienen ficha: migración fácil (D) es 2.4 y el resumen del dueño (E) es 3.6. **No se hacen**: red social, más plantillas, contabilidad completa, IA generalista, integraciones que nadie pidió ni volver a poner encargos o transferencia del comensal (M§9, decisión del 2026-11-02).

**Se conservan** (M§11): la validación de precios en el servidor, la identidad de los pedidos, los pagos parciales, los borradores de servicio, el MFA, la protección del último dueño, la auditoría de rescate y las pruebas existentes. Mejorar no es reescribir.

---

## 7. Tablero

Marca con `[x]` y el commit o PR de cierre en el mismo commit del cambio.

**Ola 0**
- [ ] 0.1 Textos y enlaces que prometen otra cosa
- [ ] 0.2 Una sola fuente para plan, precio y alcance
- [ ] 0.3 Error no es vacío ni cero
- [ ] 0.4 Pausa de pedidos real
- [ ] 0.5 Cupones: vigencia, programación y límites
- [ ] 0.6 Pedido, cupón y puntos en una sola operación
- [ ] 0.7 Receta atómica y referencias entre restaurantes
- [ ] 0.8 Compras: creación atómica y estados válidos
- [ ] 0.9 Sentar desde espera o reserva sin estados partidos
- [ ] 0.10 Caja honesta
- [ ] 0.11 Cola offline que no promete de más
- [ ] 0.12 Acceso por sucursal con membresías
- [ ] 0.13 Probar el circuito del dinero en Postgres real — entregada en su rama #84; conserva su marca al fusionar
- [x] 0.14 Cobro parcial concurrente sin sobrecobro (D03) — migración 160 y garantías en CI
- [x] 0.15 Identidad durable del intento de cobro (D04) — migraciones 161/162 y recuperación del resultado original
- [x] 0.16 Cerrar cobrando solo el saldo de cada pedido (D05) — migración 163 y saldo neto bajo bloqueo
- [ ] 0.17 Centavos del reparto persistido (D07)
- [ ] 0.18 Cobros en tránsito al cerrar un turno (D08)
- [ ] 0.19 Incluir el instante exacto del inicio del día (D09)

**Ola 1**: [ ] 1.0 · [ ] 1.1 · [ ] 1.2 · [ ] 1.3 · [ ] 1.4 · [ ] 1.5 · [ ] 1.6 · [ ] 1.7 · [ ] 1.8 · [ ] 1.9 · [ ] 1.10 · [ ] 1.11 · [ ] 1.12
**Ola 2**: [ ] 2.1 · [ ] 2.2 · [ ] 2.3 · [ ] 2.4 · [ ] 2.5 · [ ] 2.6 · [ ] 2.7 · [ ] 2.8 · [ ] 2.9 · [ ] 2.10 · [ ] 2.11 · [ ] 2.12
**Ola 3**: [ ] 3.1 · [ ] 3.2 · [ ] 3.3 · [ ] 3.4 · [ ] 3.5 · [ ] 3.6 · [ ] 3.7
**Ola 4**: [ ] 4.1 · [ ] 4.2 · [ ] 4.3 · [ ] 4.4 · [ ] 4.5 · [ ] 4.6 · [ ] 4.7 · [ ] 4.8 · [ ] 4.9 · [ ] 4.10 · [ ] 4.11 · [ ] 4.12
**Comercial**: [ ] V.1 · [ ] V.2 · [ ] V.3 · [ ] V.4 · [ ] V.5 · [ ] V.6
**Calidad**: Q.1, Q.2 y Q.3 son continuas.

---

## 8. Índice inverso: cada ID de la auditoría tiene dueño

Si un ID aparece en dos fichas, la primera corrige la verdad (texto o integridad) y la segunda construye la versión completa.

**F (inicial):** F01→0.1 · F02→0.1 · F03→0.1 · F04→V.3 · F05→V.1 · F06→V.4 · F07→2.3 · F08→2.2 · F09→1.11 · F10→1.11 · F11→0.1, 1.1 · F12→1.1 · F13→1.2 · F14→1.7 · F15→1.5 · F16→3.2 · F17→1.10 · F18→0.1, 4.5 · F19→4.8 · F20→0.12 · F21→0.6 · F22→0.1

**N (maestra):** N01→0.1, 0.2 · N02→0.1, 1.1 · N03→1.1 · N04→1.1 · N05→0.10 · N06→0.10 · N07→0.10 · N08→1.4 · N09→1.0, 4.9 · N10→1.4 · N11→1.11 · N12→0.3 · N13→0.3 · N14→0.12 · N15→0.2 · N16→2.2 · N17→1.9 · N18→1.7 · N19→1.7, 4.9 · N20→1.10 · N21→3.1 · N22→0.9 · N23→0.2 · N24→4.10 · N25→4.8

**X (por apartado):** X01→0.4 · X02→0.1 · X03→3.4 · X04→0.5 · X05→0.5 · X06→0.5 · X07→0.3 · X08→0.7 · X09→0.1, 4.1 · X10→0.8 · X11→0.7 · X12→0.7 · X13→0.1, 1.8 · X14→0.9 · X15→0.1 · X16→0.1, 4.5 · X17→2.6 · X18→2.9 · X19→0.1, 3.2 · X20→0.3 · X21→0.3 · X22→2.7 · X23→1.12

**E (especificaciones):** E01→0.2 · E02→0.3 · E03→0.6, 0.13 · E04→0.12 · E05→0.10, 1.2 · E06→1.1 · E07→1.4 · E08→1.11 · E09→2.2 · E10→1.9 · E11→1.10 · E12→1.7 · E13→3.1 · E14→0.9 · E15→4.9 · E16→4.10 · E17→4.8 · E18→V.1 · E19→4.6 · E20→3.6

**D (diseño):** D01→1.0 · D02→1.0 · D03→1.0 · D04→1.11 · D05→2.11 · D06→0.3, Q.2 · D07→2.12 · D08→1.11 · D09→1.5 · D10→Q.2

**W (web):** W01→0.1, 0.2 · W02→0.1 · W03→V.1 · W04→V.2 · W05→V.3 · W06→V.5 · W07→V.4 · W08→V.6

**A (activación):** A01→2.3 · A02→2.2 · A03→2.4 · A04→2.7 · A05→2.5 · A06→2.6

**C (caja y cobro):** C01→1.1 · C02→1.1 · C03→1.1 · C04→1.2 · C05→1.7 · C06→1.2 · C07→1.3 · C08→0.10, 0.13

**O (operación):** O01→2.1 · O02→1.5 · O03→1.4 · O04→1.10 · O05→4.1 · O06→3.2 · O07→1.8 · O08→3.3 · O09→4.3 · O10→1.9

**M (comensal):** M01→1.12 · M02→1.11 · M03→1.9, 1.11 · M04→1.11 · M05→1.12 · M06→0.11, 1.12 · M07→3.3 · M08→1.11

**S (superadmin):** S01→4.9 · S02→4.11 · S03→4.11 · S04→4.10 · S05→4.9 · S06→4.12 · S07→2.9, 4.9 · S08→4.11

**T (arquitectura):** T01→0.6, 0.13 · T02→0.11, 4.6 · T03→4.8 · T04→4.12 · T05→4.5 · T06→0.12 · T07→4.12 · T08→Q.1

**R (apartados):** R01→2.1 · R02→1.6 · R03→1.5 · R04→1.3 · R05→1.1, 1.4 · R06→1.9 · R07→1.9 · R08→0.7, 1.9 · R09→0.7, 1.9 · R10→0.7, 4.1 · R11→1.10 · R12→0.8, 4.2 · R13→3.1 · R14→3.3 · R15→0.5, 3.4 · R16→0.1, 3.5 · R17→1.8 · R18→0.9, 1.8 · R19→3.1 · R20→3.2 · R21→3.2 · R22→0.10, 1.2 · R23→4.7 · R24→2.8 · R25→2.8 · R26→0.4, 2.8 · R27→2.8 · R28→2.8 · R29→2.8 · R30→0.7, 4.3 · R31→4.4 · R32→2.7 · R33→2.10 · R34→2.6 · R35→1.7 · R36→0.2, 4.10 · R37→0.1, 0.2, 2.8 · R38→0.1, 4.5 · R39→2.9 · R40→3.6 · Mi cuenta→3.2 · Seguridad→3.7

**PA-T (pruebas por apartado):** T01→0.4 · T02→2.8 · T03→2.8 · T04→0.5 · T05→0.5 · T06→0.5 · T07→0.6 · T08→0.6 · T09→0.3 · T10→0.7 · T11→0.7 · T12→0.8 · T13→4.2 · T14→3.2 · T15→3.2, 4.8 · T16→0.3 · T17→0.3, 3.2 · T18→0.9 · T19→1.8 · T20→1.8 · T21→2.6 · T22→2.6 · T23→4.6 · T24→1.9 · T25→1.11 · T26→1.11 · T27→4.5 · T28→4.10 · T29→0.12 · T30→4.7

**Matriz de dinero (M§8):** las filas de cobro, caja, promociones y concurrencia → 0.13 (prueba); sus seis defectos reproducidos → 0.14–0.19, antes de la ola 1. También 0.6, 0.10, 1.1 y 1.2 (arreglos y ampliaciones). Sentar una reserva → 0.9. Cola offline → 0.11. Dueño sin `restaurant_id` y empleado sin permiso → 0.12. Salud y comprobantes con error → 0.3. Más filas que el límite → 4.8. Tema oscuro, zoom y lector de pantalla → 1.11. Restauración → 4.5. Impresora → 2.6. Último producto en dos aparatos → 1.10. Reconexión con precio cambiado → 4.6.
