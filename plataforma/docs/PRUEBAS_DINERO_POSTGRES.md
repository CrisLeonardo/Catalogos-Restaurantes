# Circuito del dinero en Postgres — ficha 0.13

La suite ejecuta las acciones de producción `cobrarParteDeMesa`, `freeTable`, `devolverCobro`, `abrirTurno` y `closeCaja`, la lectura `leerTurno` y el RPC SQL `leogin_sales_report` contra Supabase local. No reemplaza consultas, respuestas, aritmética ni restricciones de Postgres por simulaciones.

Se sustituyen los límites que necesitan una petición Next (sesión autorizada y caché), la firma de prueba y los efectos externos (notificaciones, impresión, FEL y tareas posteriores). Dos identidades de caja distintas se propagan con `AsyncLocalStorage`. Esto comprueba dinero y persistencia **después de autorizar**, no certifica RLS, MFA, aprobaciones, interfaz de cobro ni integraciones externas. El reparto igualitario se invoca directamente en servidor: su flujo de interfaz sigue pendiente en 1.1.

## Ejecutar

Desde `plataforma/`, con dependencias instaladas y Supabase local arrancado:

```powershell
npm run test:dinero -- --reporter=verbose
```

Lee `.env.local`/`.env.test` sin sobrescribir variables ya exportadas. Requiere `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` de **la base local**. Para los bloqueos usa `DINERO_DATABASE_URL`; por omisión, la conexión de desarrollo del `supabase/config.toml` de este repo: `postgresql://postgres:postgres@127.0.0.1:54601/postgres`. Son las credenciales estándar del stack local. Si usas otro puerto, exporta esa variable antes de ejecutar.

Ambas direcciones deben ser loopback; la suite rechaza destinos externos y comprueba que SQL y PostgREST ven el mismo restaurante temporal. No necesita servidor Next ni navegador. Necesita el esquema de migraciones 001–153; admite también el esquema local con las 154–159 aplicadas. No aplica migraciones, no hace reset y no cambia restaurantes existentes. No borres tu base para ejecutar esta prueba.

Cada caso crea su propio restaurante `aud-dinero-<uuid>`, pedidos y movimientos. La suite crea dos usuarios temporales `aud-dinero-…@test.local`. `afterEach` elimina exclusivamente el restaurante creado, con sus filas en cascada, aun cuando una aserción falla; `afterAll` elimina los usuarios. Un fallo de limpieza también hace fallar el comando. Si se mata el proceso, revisa exclusivamente los identificadores AUD de esa corrida antes de limpiar manualmente.

`npm test` mantiene las unitarias sin depender de una base. La integración tiene configuración separada (`vitest.dinero.config.mts`), no usa `skip` ni invierte los fallos con `test.fails`. **Su código de salida es 1 mientras existan los defectos de la tabla.** El CI normal en verde no certifica esta matriz: este PR entrega el comando documentado que exige 0.13. Al corregir cada ficha debe pasar su caso y al cerrar la ola debe pasar la suite completa.

## Resultado del 2026-11-05

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

El [plan](../../docs/planes/PLAN_AUDITORIA_INTEGRAL_2026-11-04.md) registra una ficha propia por fallo, 0.14–0.19. Cada arreglo requiere rama y PR, sus pruebas de fallo antes/después y migración nueva si necesita cambiar SQL; no se edita una migración aplicada. La siguiente libre sigue siendo la 160. Las fichas no autorizan reconstruir ni sobrescribir cobros o cortes históricos: si hace falta reconciliar datos existentes, se debe diseñar y revisar ese paso por separado.
