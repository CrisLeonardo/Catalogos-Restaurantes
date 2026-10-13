# Plan · Turnos de caja y cobros corregibles — 2026-10-09

> **Origen:** [`AUDITORIA_SALIDA_PRODUCCION_2026-10-09.md`](../auditorias/AUDITORIA_SALIDA_PRODUCCION_2026-10-09.md),
> hallazgos FUN-01, PROD-02, PROD-03, PROD-04, PROD-05 y PROD-06.
> **Rama:** `feat/caja-turnos` · **Migración:** 145 (la 143 y la 144 las tomó `main` en v0.12.0).
> **Estado:** hecho y verificado en el navegador (2026-10-13), PR pendiente de fusionar.
> Al fusionar: anotar el commit de cierre y mover a `docs/archivo/planes-cerrados/`.

## El problema en una frase

El cuadre de hoy espera en el cajón el efectivo de **todo lo vendido el día
de calendario**, cobrado o no, y sin restar lo que ya entregó otro turno. Y
cuando el cajero se equivoca al cobrar no hay forma de arreglarlo.

## Decisiones

### 1. Lo que cuenta es el dinero que entró, no lo vendido (PROD-02)

El cuadre lee un **libro de cobros**:

- cada fila de `order_payments` (cobro de mesa, cobro por partes, para
  llevar) en la hora en que entró;
- los pedidos de domicilio y para recoger que se **entregaron** sin filas en
  `order_payments` (los del menú en línea), con su `payment_method`, en la
  hora de entrega;
- desde la 145, también las filas **negativas**: devoluciones, correcciones
  de método y reaperturas de mesa.

Una mesa abierta, un pedido en cocina o un domicilio en camino **no** cuentan
hasta que se cobran. Una mesa «liberada sin cobrar» tampoco: se enseña aparte,
como aviso para el dueño.

La aritmética vive en `lib/caja/` como funciones puras con pruebas.

### 2. Turnos (FUN-01, PROD-03)

- Un turno es una fila de `cash_counts` con `status = 'OPEN'` (quién abrió,
  a qué hora, con cuánto fondo). Uno abierto por restaurante a la vez.
- **El cuadre cubre lo cobrado desde el cierre anterior**, nunca antes del
  inicio del día de negocio en que se abrió el turno (para que un local que
  pasó un mes sin cerrar no arrastre el mes entero).
- Cerrar = contar, gastos y propinas (los tres pasos de siempre) y pasa a
  `CLOSED` con `closed_at`. Varios turnos por día; el historial agrupa por
  día y suma los turnos.
- Se puede cerrar sin haber abierto (como hoy): el fondo se escribe al cerrar.
- El «guardar y seguir después» (borrador) se guarda en el mismo turno
  abierto. Los borradores viejos (`DRAFT`) se convierten en turnos abiertos.
- Los gastos y las propinas del cierre son los del periodo del turno.

### 3. Hora de corte del día (PROD-04)

`restaurants.day_cutoff_minutes` (por omisión **05:00**): lo
cobrado antes de esa hora pertenece al día anterior. La usan Caja, gastos,
propinas, Hoy, Pedidos, Mesas, reportes, métricas y analítica — todos dicen
el mismo «hoy». Se cambia en Ajustes, junto al horario.

### 4. Antes de cerrar (PROD-02)

Si quedan mesas abiertas, domicilios o pedidos para recoger sin cobrar, el
cierre lo dice con cuánto suman y deja ir a cobrarlas o cerrar igual: no
entran en este cuadre y se cuentan en el turno en que se cobren.

### 5. Corregir un cobro (PROD-05)

Tres acciones desde «Cobros de este turno» en Caja, todas con **motivo,
firma de encargado (el mismo PIN que las anulaciones) y `logActivity`**:

1. **Cambiar el método** de un pedido cobrado en el turno abierto: dos filas
   (−X en el método viejo, +X en el nuevo). La venta no se toca.
2. **Reabrir una mesa** cobrada por error mientras su turno siga abierto: los
   pedidos vuelven a «servido», el cobro de cierre se compensa con filas
   negativas y la mesa vuelve al salón. No se puede si esa mesa ya tiene otra
   cuenta abierta o si el pedido ya tiene factura.
3. **Devolver** todo o una línea de un pedido cobrado (hasta 3 días): fila negativa por el
   método con que sale el dinero. Se ve en la caja y en el reporte de ventas
   como «Devoluciones»; la venta original no se borra.

### 6. Un corte no se borra (PROD-06)

`deleteCashCount` desaparece. En su lugar **anular el último corte**, con
motivo y firma, si no hay otro turno después: el corte queda en el historial
tachado y el turno vuelve a abrirse con el mismo fondo para contarlo de
nuevo. Así un «cierro con faltante, lo borro y cierro cuadrado» deja los dos
a la vista.

## Fases

| # | Qué | Hecho cuando |
|---|---|---|
| 1 ✅ | Migración 145 + libro de cobros y hora de corte en `lib/caja/` con pruebas | vitest verde con los casos de la auditoría |
| 2 ✅ | Turnos: abrir, cuadre por periodo, cerrar, borrador en el turno, historial por día | dos turnos en un día cuadran en el navegador |
| 3 ✅ | Aviso de pendientes antes de cerrar | cierre con una mesa abierta la avisa y cuadra |
| 4 ✅ | Hora de corte en Hoy, Pedidos, Mesas, reportes, métricas, analítica y Ajustes | cierre a la 1:00 cae en el día anterior |
| 5 ✅ | Correcciones: método, reabrir mesa, devolución; anular corte | Efectivo→Tarjeta deja el cuadre bien |
| 6 ✅ | E2E, typecheck, lint, auditoría marcada, PR con orden de despliegue | CI verde, sin fusionar |

## Despliegue

Aplicar la **145 antes** de desplegar el código. El código nuevo exige la 145
en Caja (avisa si falta); el código viejo sigue funcionando con la 145
aplicada salvo «guardar a medias», hasta que se despliegue.

## Decisiones del dueño (2026-10-09)

- **Hora de corte por omisión: 05:00.** Cada local la cambia en Ajustes.
- **Quién corrige:** cualquiera con acceso a Caja lo inicia; si no es dueño
  o encargado, firma un encargado con su PIN (igual que las anulaciones).
  Vale también para anular un corte.
- **Reabrir una mesa:** mientras el turno en que se cobró siga abierto (no
  hay ventana en minutos).
- **Devolución:** sobre pedidos cobrados en los últimos **3 días**. El dinero
  sale del turno en que se devuelve.
