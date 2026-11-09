# Plan · Inventario con cobertura y agotados con intención (ficha 1.10) · 2026-11-09

Ficha **1.10** del [plan de la auditoría integral](PLAN_AUDITORIA_INTEGRAL_2026-11-04.md). Hallazgos: **E11, N20, R11, O04, F17** y la fila «Último producto en dos aparatos» de la matriz (M§8). Rama `feat/inventario`, apilada sobre la 1.9 (`feat/catalogo`, PR #105).

> **Estado:** diagnóstico hecho; propuesta y [maqueta](../diseno/MAQUETA_INVENTARIO_2026-11-09.html) **pendientes de aprobación**.

## 1. Diagnóstico (comprobado en código, base local y pantalla)

| # | Problema | Dónde | Hallazgo |
|---|---|---|---|
| 1 | **El cero parece cobertura.** Con 39 platillos y ninguno controlado, Inventario dice «Con control 0 · Stock bajo 0 · Agotados 0», aunque hay 3 platillos agotados a mano en ese momento. | `inventory-panel.tsx` | N20, E11 |
| 2 | **Activar el control es uno por uno**: 39 platillos son 39 formularios. No hay buscador ni filtro (sólo categorías). | `inventory-panel.tsx` | N20, E11 |
| 3 | **Lo agotado vuelve solo a las 12 h**, lo haya decidido el negocio o no. «Se acabó el pescado» y «ya no lo vamos a vender» se tratan igual. | `lib/product-availability.ts` | O04, F17 |
| 4 | **Ajustar existencias lee y luego escribe** en dos pasos: dos toques simultáneos (o una venta en medio) pierden un cambio. Fijar el número exacto tiene el mismo problema. | `lib/actions/inventory.ts` (`adjustStock`, `saveInventory`) | R11.4 |
| 5 | **Los ajustes no piden motivo**: el kardex dice «Ajuste manual» sin decir si fue merma, conteo o error, y la bitácora guarda el id del platillo en lugar de su nombre. | `adjustStock` | R11.4, E11 |
| 6 | **No hay «por revisar»**: agotados, bajo mínimo y sin control se mezclan en una lista larga sin prioridad. | `inventory-panel.tsx` | R11.1 |
| 7 | **Un ingrediente que se acaba no apaga nada.** Las recetas calculan costo, pero ninguna venta descuenta ingredientes ni hay forma de decir «se acabó el aguacate» y apagar sus platillos. Aun así, la ficha del platillo dice «descuenta inventario» y la web pública «cada venta descuenta insumos y te avisa». | `place_order`, `product-form.tsx`, `landing.tsx` | O04, promesa falsa |
| 8 | **Desactivar el control no dice qué pasa** (el número se borra y el platillo vuelve a venderse sin límite). | `saveInventory` | R11 (aceptación) |

Lo que **sí** está bien y se conserva: `place_order` bloquea la fila del platillo (`for update`) y rechaza la venta si no alcanza; la venta y la anulación ya dejan movimiento con saldo. Falta la prueba de «último producto en dos aparatos».

## 2. Propuesta

### Agotar con intención (O04, F17)

Al marcar agotado (Catálogo, ficha, Servicio o lote) se elige **hasta cuándo**:

- **Hasta mañana** (por omisión): vuelve al empezar el siguiente día de negocio, a la hora de corte del local (05:00 por omisión). Se dice la hora exacta: «Vuelve mañana a las 05:00».
- **Hasta reponer**: no vuelve por reloj. Si el platillo lleva control, vuelve al registrar existencias; si no, cuando alguien lo marca disponible.
- **Hasta que lo active**: sale del menú como agotado hasta reactivarlo a mano.

El reloj de 12 h desaparece. Las existencias en cero siguen mandando sobre todo. La misma regla se usa en el menú, Servicio, Catálogo, la acción de pedido y el agente sin conexión.

### Agotar por ingrediente

En Ingredientes, «Se acabó» sobre un ingrediente apaga en un paso **todos los platillos que lo llevan en su receta**, con la lista antes de confirmar. «Ya hay» los devuelve, salvo los que sigan sin otro ingrediente o que alguien haya agotado por su cuenta. Es la versión honesta de «un ingrediente faltante bloquea los platillos afectados» mientras la venta no descuente ingredientes (eso es la ficha 4.1).

### Inventario que declara su cobertura (E11, N20, R11.1)

- Arriba, **«Controlas 0 de 39 platillos»** con su barra, y no tres ceros.
- **Por revisar hoy**: agotados (por existencias, a mano o por ingrediente, con cuándo vuelven), bajo mínimo y sin existencias. Si no hay nada: «Nada por revisar».
- **Buscador** y filtros: Sin control, Con control, Bajo mínimo, Agotado.
- **Activar control en lote**: elegir una categoría o varios platillos, escribir existencias iniciales y mínimo (uno para todos o por fila) y ver la vista previa antes de activar. Todo o nada.
- **Desactivar control** dice el efecto: «Se deja de contar; se podrá vender sin límite».

### Ajustes con motivo y sin carreras (R11.4)

- Restar o fijar pide **motivo**: Merma, Conteo físico, Corrección, Consumo del personal u Otro (con nota). Sumar sugiere «Reposición».
- Una sola función en la base hace el ajuste bajo bloqueo, guarda el movimiento con motivo, nota y responsable, y deja la bitácora con el nombre del platillo.
- El kardex muestra el motivo y quién.

### Textos

- La ficha del platillo deja de decir «descuenta inventario» en Receta: dice que calcula el costo.
- La web pública deja de prometer que «cada venta descuenta insumos» (cambio de una frase; el resto de 0.1 sigue fuera de la cadena).

### Fuera de esta ficha

Descontar ingredientes al vender, unidades y conversiones, merma con rendimiento (4.1 · O05) · conteo ciego por sesión, existencias comprometidas y reposición sugerida (R11.2, R11.3, R11.5; 4.1/4.2) · compras y proveedores (0.8, 4.2).

## 3. Migración prevista (180)

- `products.agotado_motivo` (`manana`, `reponer`, `manual`, `ingrediente`) y `products.vuelve_at`.
- Conversión de los agotados actuales sin romper lo prometido (ver decisión 2).
- `ingredients.agotado_at`.
- `leogin_marcar_agotado(restaurante, platillos[], motivo, actor)`: calcula «mañana» con el corte y la zona del local; bitácora.
- `leogin_agotar_ingrediente(restaurante, ingrediente, agotado, actor)`: apaga o devuelve los platillos afectados en una transacción.
- `leogin_ajustar_existencias(restaurante, platillo, modo, cantidad, motivo, nota, actor)`: suma, resta o fija bajo bloqueo; movimiento y bitácora; al pasar de 0 a más, devuelve lo agotado «hasta reponer».
- `leogin_activar_control(restaurante, filas jsonb, actor)`: activa varios a la vez, todo o nada.
- `leogin_aplicar_lote_catalogo` (179) pasa a marcar «hasta mañana» al agotar en lote.
- `stock_movements.nota` y motivos nuevos.

## 4. Decisiones del dueño (pendientes)

1. **Agotado por omisión:** «Hasta mañana» (vuelve a la hora de corte del siguiente día de negocio), como propone el plan maestro.
2. **Los agotados de hoy al desplegar:** conservan lo que se les prometió (vuelven a las 12 h de marcados) o pasan a «hasta mañana».
3. **Motivo del ajuste:** obligatorio al restar o fijar (sumar sugiere «Reposición»), u obligatorio siempre.

## 5. Pruebas previstas

- Unitarias: regla de disponibilidad con las tres intenciones, el corte y la zona; vista previa de activación en lote; motivos.
- Postgres: dos `place_order` simultáneos por la última unidad (sólo uno vende); dos ajustes simultáneos no se pierden; agotar y devolver por ingrediente con otro ingrediente aún agotado; «hasta reponer» vuelve al reponer; conversión de la 180 idempotente.
- Pantalla: 390, 768 y 1280 px, claro y oscuro; catálogo de 0 y de 39 controlados.
