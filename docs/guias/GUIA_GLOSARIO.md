# Glosario de Leogin: una sola forma de decir cada cosa

**Ficha 2.12 de la auditoría (D07 y el apartado §9 «Mensajes») · 2026-11-17 · propuesta para aprobar.**

Este glosario guía los textos que leen el restaurante y sus comensales: el panel, Tomar pedidos, Cocina, Caja, la carta, las exportaciones y la web pública. **No** cambia nombres internos del código ni de la base (`product`, `order`, `NEW`…). El superadmin lo usa el equipo de Leogin y queda fuera.

Una prueba automática (`src/lib/glosario.test.ts`) busca las palabras prohibidas en los textos visibles y falla si vuelven a aparecer.

## Las palabras

| Di | No digas | Dónde se aplica y por qué |
|---|---|---|
| **platillo**, **platillos** | producto, plato, artículo, ítem | Todo lo que se vende en la carta, incluidas las bebidas. Así lo dice la pestaña «Platillos» y así lo dice el dueño. |
| **plato** | | Solo para el plato físico: «plato principal» de un combo. |
| **pantalla de cocina** | KDS | La palabra técnica no la usa nadie en la cocina. |
| **función**, **funciones** | módulo, módulos | La pantalla se llama «Funciones». |
| **pantalla completa** | modo kiosco | Es como lo dice el botón del panel. |
| **Comer en local · Para llevar · A domicilio** | En local, Comer aquí, Domicilio | Los tres modos se llaman igual en todas partes, como en Funciones. |
| **pedido** | orden | |
| **comanda** | ticket (de cocina) | Lo que sale en la impresora de cocina. «Ticket promedio» sí se queda: es lo que gasta en promedio cada pedido. |
| **la cuenta** | factura, cuenta por pagar | Lo que paga una mesa. «Factura» es solo la de FEL. |
| **Mi cuenta** | | El acceso de cada persona (correo y contraseña). |
| **cobrar**, **cobrado** | pagado (para la mesa) | Lo que hace el restaurante al recibir el dinero. **Pagar** es lo que hace el comensal, o el dueño con su plan. |

## Estados

Una sola lista por cosa, la misma en la pantalla, las alertas y las exportaciones.

- **Pedido:** Sin enviar a cocina · En cocina · Listo · En camino · Servido · Entregado · Anulado. Es la lista de `lib/order-status.ts`.
- **Mesa:** Libre · Sentada · Sin pedir · En cocina · Servida · Por cobrar. Es la lista de `lib/table-state.ts`.

## Lo que cambia (propuesta)

| Dónde | Hoy | Queda |
|---|---|---|
| Tomar pedidos, la mesa y el cobro | «3 platos», «Agregar platos», «Toca un plato y aparece aquí», «Por platos» | «3 platillos», «Agregar platillos», «Toca un platillo y aparece aquí», «Por platillos» |
| Exportaciones (Excel y PDF) | columna «Producto», «Catálogo de productos», estados «Nuevo», «En preparación» y «Cancelado» | «Platillo», «Tu carta», y los estados de la pantalla |
| Finanzas | «Costo de productos vendidos», «Ingreso de productos» | «Costo de lo vendido», «Ingreso por platillos» |
| Planes y límites | «Hasta 150 productos», «Productos ilimitados» | «Hasta 150 platillos», «Platillos ilimitados» |
| Importar carta | columna «Producto» | «Platillo». La hoja vieja con «Producto» se sigue leyendo |
| Lealtad, Inicio y avisos | «productos sin puntos propios», «los otros 3 productos» | «platillos…» |
| Cocina | pestaña del navegador «Cocina (KDS)», tour «la pantalla de Cocina (KDS)» | «Cocina», «la pantalla de cocina» |
| Web pública y Descargas | «El KDS ordena las comandas…», «modo kiosco» | «La pantalla de cocina ordena…», «pantalla completa» |
| Avisos de Analítica, Caja, Cupones y Finanzas | «Activa el módulo Pedidos» | «Enciende la función Pedidos» |
| Errores al activar | «Este módulo no está activo» | «Esta función no está encendida» |
| Pestaña del navegador sin título propio | «Menú en línea» | «Leogin» |
| Avisos y tarjetas de pedido | «Comer aquí», «Domicilio», «En local» | «Comer en local», «A domicilio» |

**No cambia:**
- La carta del comensal sigue usando la palabra que eligió cada restaurante para su carrito (`itemsOne`, por defecto «producto»). Un café no vende «platillos».
- El menú «Producto» de la web pública habla de Leogin, no de la carta.
- Canales, que sigue apagado.

## Decisiones

1. **«Platillo» también en Tomar pedidos**, en lugar de «plato» (recomendado). ¿O el mesero sigue diciendo «plato»?
2. **Exportaciones con las palabras y los estados de la pantalla** (recomendado). Un Excel que dice «Cancelado» cuando la pantalla dice «Anulado» parece otro pedido.
3. **«Función» en vez de «módulo»** en todo lo que ve el restaurante (recomendado).
4. **Una prueba automática que falle** si vuelve a aparecer una palabra prohibida en un texto visible (recomendado).
