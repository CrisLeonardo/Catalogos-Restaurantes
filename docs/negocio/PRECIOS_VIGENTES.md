# Precios vigentes — Leogin

**Precios de lanzamiento 2026 — oficiales desde 2026-08-17.** Referencia rápida de un vistazo antes de una demo o visita. Esto **no** es la fuente de verdad de código — esa es [`plataforma/src/lib/plans.ts`](../../plataforma/src/lib/plans.ts), y a nivel de base de datos manda `platform_settings` (ver migración `111_precios_lanzamiento.sql`). Si algún día no coinciden, gana la base de datos y hay que actualizar este archivo.

## Planes

| Plan | Precio | Alta (pago único) | Qué incluye |
|---|---|---|---|
| **Básico** | Gratis, para siempre | Q0 | Menú digital con QR, hasta 150 productos, marca propia. Sin pedidos en línea. 1 usuario. Aviso (nunca bloqueo) al pasar 3,000 visitas/mes al menú. |
| **Estándar** | Q199 /mes | Q300 | Elige 2 de los 3 canales de pedido (comer en local, para llevar, a domicilio), aviso por WhatsApp, notificaciones en tiempo real, reportes financieros + corte de caja. 2 usuarios. |
| **Premium** | Q349 /mes | Q300 | Los 3 canales de pedido, panel de mesero, personalización total del sitio, finanzas + inventario + analítica, y 7 de los 9 módulos de abajo incluidos gratis. Usuarios ilimitados. Participa del descuento "Plan a tu medida". |
| Pro *(pausado — no se ofrece a clientes)* | Q599 /mes | Q0 | Todo Premium + Proveedores + Factura Electrónica (FEL) + soporte prioritario. Construido y listo en el código; solo asignable a mano desde el panel de super admin mientras Proveedores/FEL terminan de estar listos. |

Ningún plan tiene tope de ventas (GMV). "Alta" se cobra una sola vez, manual desde la ficha del restaurante — no es automático.

## Pago anual (nuevo)

Oferta comercial, no requiere nada en código: el cobro hoy es manual, así que basta con generar una sola factura por los 12 meses desde el panel de super admin.

| Plan | Mensual | Pagando el año | Total del año | Ahorro |
|---|---|---|---|---|
| **Estándar** | Q199 /mes | **Q169 /mes** | Q2,028 | Q360 (15%) |
| **Premium** | Q349 /mes | **Q299 /mes** | Q3,588 | Q600 (14%) |

El costo de alta (Q300) se cobra igual, aparte, la primera vez.

## Módulos a la carta (9)

Se compran sueltos sobre cualquier plan que los soporte. Si el plan actual ya los incluye gratis, no se cobran de nuevo.

| Módulo | Precio | Plan mínimo | Incluido gratis en |
|---|---|---|---|
| Reservaciones | Q99 /mes | Básico | Premium y Pro |
| Lista de espera | Q49 /mes | Básico | Premium y Pro |
| Llamar al mesero | Q49 /mes | Estándar | Premium y Pro |
| Encuestas | Q49 /mes | Estándar | Premium y Pro |
| Cupones | Q79 /mes | Estándar | Premium y Pro |
| Lealtad / puntos | Q99 /mes | Estándar | Premium y Pro |
| Recetas | Q79 /mes | Básico | Premium y Pro |
| Proveedores *(pausado)* | Q99 /mes | — | No disponible aún |
| Factura Electrónica — FEL *(pausado)* | Q249 /mes + Q500 alta | — | No disponible aún |

Proveedores y FEL no se ofrecen a nadie todavía, sueltos ni en Pro — se reactivan cuando esas dos funciones estén listas.

**Argumento de venta que salió gratis con los precios nuevos:** los 7 módulos que Premium incluye suman **Q503 al mes** comprados sueltos (99+49+49+49+79+99+79). Premium cuesta Q349. Está sobre la mesa decirlo tal cual: *"solo los módulos ya valen más que el plan completo."*

## Descuentos

- **"Plan a tu medida"** (solo Premium y Pro): Q50 de descuento por cada canal de pedido que el restaurante **no** usa, hasta un máximo de **2 canales** desactivados — siempre se paga al menos 1 canal completo. Premium con 2 canales apagados queda en **Q249**.
- **Grupos / franquicias** (a partir de la 2ª sucursal, sobre el precio del plan de cada una, no sobre módulos): 2–4 sucursales **−10%** · 5–9 sucursales **−15%** · 10+ sucursales **−20%**. La sucursal fundadora siempre paga el precio completo.
- **Panel central de grupo**: Q299 /mes (métricas consolidadas de todas las sucursales).
- **Prueba gratis**: 30 días en el registro self-serve.

## Dónde queda Leogin en el mercado guatemalteco

Referencia verificada el 2026-08-17, para responder en la puerta sin dudar:

| Competidor | Mensual | Alta | FEL |
|---|---|---|---|
| OlaClick | Q0 (base) | Q0 | — |
| PosFile (GT) | Q200 / Q300 / Q475 | Q700 – Q2,150 | Sí (Q45 aparte + Q0.28 por factura) |
| Vendty (GT) | Q315 entrada | n/d | Sí (Digifact) |
| Sabor Suite (GT) | ~Q343 (USD 45), plan único | n/d | Sí |
| Fudo | ~Q297 / Q602 / Q991 por sucursal | USD 100–300 | Según país |
| **Leogin Estándar** | **Q199** | Q300 | Parcial (no transmite) |
| **Leogin Premium** | **Q349** | Q300 | Parcial (no transmite) |

Estándar queda claramente debajo de toda la banda del mercado. Premium queda dentro de la banda y en línea con Sabor Suite. **El costo de alta de Q300 sigue siendo el más barato del mercado** — PosFile cobra entre Q700 y Q2,150 por lo mismo.

## Notas

- Aplicado el 2026-08-17 en `plans.ts` y en la migración `111_precios_lanzamiento.sql` (que reconcilia `platform_settings`, la fuente real que leen `leogin_compute_monthly_fee` y `leogin_fee_breakdown`). **Falta correr la migración 111 en producción** para que el cambio tenga efecto real.
- Los restaurantes con `auto_price = false` conservan su precio congelado a propósito; la migración no los toca.
- `Cotizador.xlsx`, `Leogin_Planes_y_Precios_2026.docx` y `GUION_DEMO_90S.md` se actualizaron el mismo día para coincidir con esta tabla.
- Historial de precios: Estándar y Premium bajaron de Q299/Q599 a **Q199/Q349** y Pro de Q999 a Q599 (**17 ago 2026, precios de lanzamiento**); Básico pasó de Q149 a gratis (22 jul); Estándar y Premium habían bajado de Q399/Q749 a Q299/Q599 (14 jul); Estándar incluye finanzas desde el 24 jul; módulo Lista de espera agregado el 22 jul.
- **Pendiente de decisión:** el Panel central de grupo (Q299) quedó más caro que el plan Estándar completo y casi al nivel de Premium. No se tocó porque es otro producto, pero conviene revisarlo antes de vender el primer grupo.
