# Circuito del dinero en Postgres — fichas 0.13–0.16

La suite ejecuta las acciones de producción `cobrarParteDeMesa`, `freeTable`, `devolverCobro`, `abrirTurno` y `closeCaja`, la lectura `leerTurno` y el RPC SQL `leogin_sales_report` contra Supabase local. No reemplaza consultas, respuestas, aritmética ni restricciones de Postgres por simulaciones.

Se sustituyen los límites que necesitan una petición Next (sesión autorizada y caché), la firma de prueba y los efectos externos (notificaciones, impresión, FEL y tareas posteriores). Dos identidades de caja distintas se propagan con `AsyncLocalStorage`. Esto comprueba dinero y persistencia **después de autorizar**, no certifica RLS, MFA, aprobaciones, interfaz de cobro ni integraciones externas. El reparto igualitario se invoca directamente en servidor: su flujo de interfaz sigue pendiente en 1.1.

## Ejecutar

Desde `plataforma/`, con dependencias instaladas y Supabase local arrancado:

```powershell
npm run test:dinero -- --reporter=verbose
```

Lee `.env.local`/`.env.test` sin sobrescribir variables ya exportadas. Requiere `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` de **la base local**. Para los bloqueos usa `DINERO_DATABASE_URL`; por omisión, la conexión de desarrollo del `supabase/config.toml` de este repo: `postgresql://postgres:postgres@127.0.0.1:54601/postgres`. Son las credenciales estándar del stack local. Si usas otro puerto, exporta esa variable antes de ejecutar.

Ambas direcciones deben ser loopback; la suite rechaza destinos externos y comprueba que SQL y PostgREST ven el mismo restaurante temporal. No necesita servidor Next ni navegador. La versión original de 0.13 usaba el esquema 001–153; **esta rama necesita además la 160, la 161, la 162 y la 163, en ese orden y antes del código**, con los cambios anteriores de la ola 0 cuando correspondan. No aplica migraciones, no hace reset y no cambia restaurantes existentes. No borres tu base para ejecutar esta prueba.

Cada caso crea su propio restaurante `aud-dinero-<uuid>`, pedidos y movimientos. La suite crea dos usuarios temporales `aud-dinero-…@test.local`. `afterEach` elimina exclusivamente el restaurante creado, con sus filas en cascada, aun cuando una aserción falla; `afterAll` elimina los usuarios. Un fallo de limpieza también hace fallar el comando. Si se mata el proceso, revisa exclusivamente los identificadores AUD de esa corrida antes de limpiar manualmente.

`npm test` mantiene las unitarias sin depender de una base. La integración tiene configuración separada (`vitest.dinero.config.mts`), no usa `skip` ni invierte los fallos con `test.fails`. **Su código de salida es 1 mientras existan los defectos pendientes.** Al corregir cada ficha debe pasar su caso y al cerrar la ola debe pasar la suite completa. Desde 0.14, CI ejecuta el subconjunto corregido descrito al final; ese verde no certifica toda la matriz.

## Resultado original de 0.13 · 2026-11-05

Código ejecutado: base `2348339` del PR #71 más esta suite; acciones monetarias sin modificar respecto a esa base. Verifica el hash de la base con `git merge-base HEAD origin/docs/plan-auditoria-integral`. Base local con cambios SQL de 154–159, algunos aplicados manualmente (el historial del CLI llega a 154); se comprobaron las funciones de recetas/pedidos/compras, las columnas de pausa y el índice de cortes. Zona `America/Guatemala`, corte 300 minutos. Esos cambios adicionales no sustituyen las acciones bajo prueba ni el RPC de reportes de la 145.

**9 casos ejecutados: 3 pasan y 6 reproducen defectos. No es una certificación aprobada del circuito monetario.**

| Caso | Datos y pasos | Esperado | Resultado real | Ficha |
|---|---|---|---|---|
| D01 · Q100 entre tres | Pedido Q100; `computeSplit(equal)`; tres llamadas independientes con Q33.34, Q33.33 y Q33.33 | Tres movimientos, libro Q100 y saldo cero | Pasa; importes persistidos exactos, caja Q100 | — |
| D02 · Q200 mixtos | Cerrar cuenta con Q80 tarjeta, Q50 efectivo y Q70 tarjeta | Tres movimientos, tarjeta Q150, efectivo Q50, sin pendientes | Pasa; pedido entregado y libro reconciliado | — |
| D03 · Dos empleados | Ambos leen los mismos platos/totales antes de insertar el cobro Q10 | Un solo saldo Q10 cobrado | Dos filas, neto Q20 para consumo Q10 | 0.14 |
| D04 · Acuse perdido | PostgREST confirma el INSERT Q10; se pierde su respuesta; mismo intento repetido | Recuperar cobro original sin duplicar dinero | Dos filas, neto Q20 | 0.15 |
| D05 · Parcial y nueva ronda | Primer pedido Q100, pago previo Q40; pedido nuevo Q20; cerrar saldo Q80 tarjeta | Neto por pedido Q100 y Q20; total Q120 | Total Q120, pero Q120 quedan en el primero y Q0 en el segundo, ambos cerrados | 0.16 |
| D06 · Devolución posterior | Cobro Q50 de turno previo; corte guardado; devolver Q50 en el actual | Corte previo estable; salida trazable Q50 actual | Pasa; original conservado y REFUND −Q50 con firmante y motivo | — |
| D07 · Descuento y propina | Tres platos Q30; descuento Q10; propina Q20; cobrar cada línea con el reparto de Q100 | Q33.34 + Q33.33 + Q33.33 persistidos | Cada línea recorta a Q33.33: total Q99.99 | 0.17 |
| D08 · Cobro durante cierre | Bloquear fila del pedido; arrancar pago Q10; observar INSERT esperando en Postgres; cerrar; liberar bloqueo y confirmar pago | Q10 pertenece a uno y solo un periodo | Fila Q10 confirmada con fecha anterior al corte; cierre Q0 y siguiente periodo Q0 | 0.18 |
| D09 · Corte 05:00 | Tres pedidos/pagos: Q1 a 04:59:59.999, Q2 a 05:00:00.000, Q3 a 05:00:00.001 | Día previo Q1; nuevo día Q5, igual que el reporte | Día previo Q1; reporte nuevo Q5, caja nueva Q3 | 0.19 |

La prueba D02 compara un conjunto de movimientos: un INSERT por lote comparte `created_at` y SQL no garantiza orden entre empates. No confunde ese orden con un defecto de dinero.

## Cómo se reproducen las carreras

En D03, una barrera retiene las dos respuestas reales de lectura hasta que ambos empleados llegaron al mismo punto. No se inventa su contenido. En D04, la respuesta real exitosa del INSERT se pierde después de confirmar la transacción; no se reintenta ninguna escritura en el arnés por debajo de la acción.

En D08, una conexión SQL toma `FOR UPDATE` sobre **el pedido del fixture**. El INSERT real de PostgREST espera por la comprobación de su clave foránea. Una segunda conexión observa `pg_blocking_pids`, y solo entonces se ejecuta `closeCaja`. Se libera el bloqueo en `finally` y se espera la acción de cobro antes de limpiar. Así se reproduce una transacción empezada antes del corte pero confirmada después. No se usa una pausa fija para afirmar que hubo concurrencia.

Los puntos de control tienen límite de espera. Si una corrección cambia el camino de consulta, un error «no se alcanzó el punto previsto» exige adaptar la programación de la carrera: no significa que la invariante ya pase. Los resultados monetarios esperados se mantienen.

## Correcciones que bloquean la ola 1

El [plan](../../docs/planes/PLAN_AUDITORIA_INTEGRAL_2026-11-04.md) registra una ficha propia por fallo, 0.14–0.19. Cada arreglo requiere rama y PR, sus pruebas de fallo antes/después y migración nueva si necesita cambiar SQL; no se edita una migración aplicada. Las fichas no autorizan reconstruir ni sobrescribir cobros o cortes históricos: si hace falta reconciliar datos existentes, se debe diseñar y revisar ese paso por separado.

## Corrección 0.14 · migración 160

Aplicar `160_cobro_parcial_atomico.sql` **antes de desplegar el código**, después de las migraciones anteriores. La acción comprueba la sesión y el permiso como antes; los nuevos RPC solo se conceden a `service_role`. Si falta la 160, cobrar/cerrar devuelve una explicación y no vuelve a las escrituras separadas anteriores.

Pago parcial y cierre comparten un bloqueo transaccional por restaurante/mesa, seguido del bloqueo ordenado de sus pedidos. Se comprueban otra vez estado, mesa, importe y saldo. `order_payments.item_amounts` conserva la asignación monetaria nueva por plato. El movimiento y el reparto se guardan en la misma transacción; una línea parcialmente pagada se marca saldada al completar su cuota. Los pagos antiguos permanecen intactos: se acepta su asignación si el reparto guardado permite verificarla, y se rechaza inventarla si falta.

El cierre confirma únicamente los pedidos leídos y rechaza una propuesta que no coincide con el saldo por pedido, sin entregar pedidos ni escribir pagos. Una nueva ronda que no estaba en ese snapshot permanece abierta con su sesión.

Comando que también corre en CI contra el Supabase efímero:

```powershell
npm run test:dinero -- -t '0.14|D03'
```

Son **12 comprobaciones**: el D03 original y once garantías de líneas distintas, saldo restante, asignaciones concurrentes, rollback si falla el reparto, métodos/efectivo entre pedidos, legado verificable/desconocido, rechazo de otra mesa, cruce parcial/cierre con bloqueo observado en Postgres, rechazo sin efectos de un cierre desactualizado y privilegios de los tres RPC. El filtro selecciona estos casos; no se agrega ningún `skip` a la suite completa.

La barrera de D03 ahora libera juntas las dos peticiones reales al RPC. D08 sigue observando el bloqueo en Postgres y reconoce el nuevo nombre de RPC: cambiar el transporte no elimina ni oculta la carrera con el corte de caja.

| Caso original | Estado después de 0.14 |
|---|---|
| D01, D02, D06 | Siguen pasando |
| D03 | Pasa; un empleado cobra, el otro recibe rechazo por saldo/plato ya pagado |
| D04 → 0.15 | No duplica el saldo ya completo, pero rechaza el reintento en vez de recuperar su resultado original; sigue pendiente la identidad durable |
| D05 → 0.16 | Rechaza la asignación incorrecta antes de cerrar o escribir más dinero; sigue pendiente distribuir correctamente el saldo entre pedidos |
| D07 → 0.17 | Rechaza Q33.34 cuando el prorrateo de esa línea todavía da Q33.33; sigue pendiente distribuir el centavo del total |
| D08 → 0.18 | Sigue reproduciendo dinero fuera de ambos periodos al cerrar caja |
| D09 → 0.19 | Sigue reproduciendo la omisión del instante exacto de las 05:00 |

Los nueve casos originales siguen ejecutándose con el comando completo: **20 ejecutadas, 15 pasan y 5 fallan** al sumar las once garantías adicionales. Los cinco pendientes mantienen el código de salida 1. No se da por terminada ninguna de las fichas 0.15–0.19.


## Corrección 0.15 · migración 161

Aplicar `161_identidad_intento_cobro.sql` y después `162_cobro_intentos_segundo_factor.sql`, **después de la 160 y antes de desplegar**. La 162 incorpora a la tabla nueva el candado restrictivo de segundo factor de la 137, cuya ausencia hizo fallar el primer CI de #86. La 161 ya aplicada permanece intacta. No se edita ni sustituye la 160: los nuevos RPC envuelven su cobro/cierre transaccional. La tabla `cobro_intentos` confirma solicitud y resultado junto con el dinero. El bloqueo por restaurante/intento se toma antes del bloqueo de cuenta. Sin migración no hay fallback sin identidad.

La identidad viaja desde el aparato y persiste antes de la petición, sin TTL. Se conservan el UUID y toda la solicitud tras un error de transporte, una sesión no autorizada o una recarga. Solo el éxito o un rechazo transaccional definitivo permiten retirar el pendiente. Un intento nuevo recibe otro UUID, aunque coincidan los platos, métodos e importes; una identidad ya confirmada con contenido distinto se rechaza. No se reconstruye el resultado desde el saldo actual.

D04 captura el JSON real del RPC confirmado, pierde su respuesta y reenvía **el mismo UUID**. Exige igualdad exacta con aquel JSON, incluidos `paymentIds`, importe e identidad, y compara todas las filas originales del libro. También se prueba el cierre perdido y recuperación después de reutilizar la mesa, sin cerrar la ronda nueva.

Comando de regresión que corre en CI:

```powershell
npm run test:dinero -- -t '0.14|0.15|D03|D04'
```

**22 comprobaciones pasan:** las doce de 0.14, D04 y nueve garantías de 0.15: aislamiento de identidad por restaurante, concurrencia del mismo parcial, pagos idénticos legítimos con otra identidad hasta el saldo, rechazo de colisiones de solicitud/actor/mesa/operación, rollback sin identidad tras fallo de reparto, cierre perdido con ronda nueva, cierre simultáneo con igual identidad, recuperación después de cerrar/devolver y privilegios de RPC/tabla. El filtro deja fuera los otros siete casos; la matriz completa no contiene omisiones.

Un desfase observado de 8 ms entre Windows y el contenedor podía dejar un movimiento reciente fuera de una lectura del arnés por parecer futuro. Para las lecturas sin fecha explícita se consulta el reloj real de Postgres. No se modifica el reloj de producción, no se introducen esperas y se conservan los tiempos explícitos de D09 y la carrera observada de D08.

**Resultado completo después de 0.15: 29 ejecutadas, 25 pasan, 4 fallan; código de salida 1.** D04 pasa. D05/0.16, D07/0.17, D08/0.18 y D09/0.19 siguen fallando con sus aserciones monetarias originales. No se declara certificada la matriz completa.

El E2E de 0.15 ejecuta la acción Next real y espera su respuesta antes de abortar la entrega al navegador; verifica que Q52 ya están confirmados, recarga Servicio y comprueba el mismo intento/recibo, sin cambios en los movimientos. Se limpia el fixture al terminar. La recuperación vuelve a autorizar al empleado antes de acceder al registro; ni clientes anónimos ni autenticados pueden leerlo directamente. FEL e impresión continúan fuera del alcance certificado por esta suite.


El comando `node scripts/audit-rls-candados.mjs` reproduce el fallo previo (un hallazgo por la política ausente) y después de la 162 devuelve cero hallazgos. La prueba de privilegios de 0.15 exige además la política restrictiva `super_admin_segundo_factor`, sin políticas permisivas, con filtro y condición de escritura de segundo factor. Se mantiene el acceso exclusivo del servicio y el resultado de la matriz monetaria.


## Corrección 0.16 · migración 163

Aplicar `163_cierre_saldo_por_pedido.sql` **después de la 162 y antes del código**. Conserva intactas las migraciones anteriores. El cierre recupera primero su identidad durable; después calcula en Postgres, bajo el bloqueo de cuenta, el saldo neto de cada pedido del snapshot y reparte únicamente ese saldo. La confirmación de dinero, cierre y resultado sigue usando la transacción de 160–161.

**Antes:** D05 rechazó el cierre Q80 de un pedido Q100 con Q40 previos y una ronda nueva Q20. **Después:** confirma Q60 nuevos en el primero y Q20 en el segundo, conservando exactamente las filas anteriores y entregando ambos pedidos. Las correcciones de método y devoluciones posteriores conservan la asignación y no sacan dinero de otra ronda.

```powershell
npm run test:dinero -- -t '0.14|0.15|0.16|D03|D04|D05'
```

**31 comprobaciones seleccionadas pasan:** las 22 anteriores, D05 y ocho garantías nuevas. Se prueban correcciones/devoluciones por pedido, rondas saldadas, métodos mixtos y efectivo sin repetir, un método sin importe que cubre solo saldo, rechazo del importe incorrecto sin escrituras, ronda ajena al snapshot sin cerrar, 1.200 pagos previos sumados completos y privilegios del RPC. Los puntos de pérdida de respuesta y bloqueo observado reconocen el transporte nuevo del cierre, sin modificar las invariantes.

**Matriz actual completa: 37 ejecutadas, 34 pasan, 3 fallan; salida 1.** Permanecen D07/0.17, D08/0.18 y D09/0.19 con sus valores esperados originales. El cierre sigue sin certificar el centavo por línea, los periodos simultáneos de caja ni el límite exacto del día.

El nuevo E2E cobra Q40, agrega una ronda Q20 y cierra el saldo Q80 desde la pantalla real. Verifica Q100/Q20 por pedido y el movimiento previo idéntico. No se reconstruyen movimientos históricos, no se hace reset y los fixtures se limpian al terminar.
