# Precios vigentes — Leogin

**Vigente desde: 2026-07-24.** Referencia rápida de un vistazo antes de una demo o visita. Esto **no** es la fuente de verdad de código — esa es [`plataforma/src/lib/plans.ts`](plataforma/src/lib/plans.ts). Si algún día no coinciden, gana `plans.ts` y hay que actualizar este archivo.

## Planes

| Plan | Precio | Alta (pago único) | Qué incluye |
|---|---|---|---|
| **Básico** | Gratis, para siempre | Q0 | Menú digital con QR, hasta 150 productos, marca propia. Sin pedidos en línea. 1 usuario. Aviso (nunca bloqueo) al pasar 3,000 visitas/mes al menú. |
| **Estándar** | Q299 /mes | Q300 | Elige 2 de los 3 canales de pedido (comer en local, para llevar, a domicilio), aviso por WhatsApp, notificaciones en tiempo real, reportes financieros + corte de caja. 2 usuarios. |
| **Premium** | Q599 /mes | Q300 | Los 3 canales de pedido, panel de mesero, personalización total del sitio, finanzas + inventario + analítica, y 7 de los 9 módulos de abajo incluidos gratis. Usuarios ilimitados. Participa del descuento "Plan a tu medida". |
| Pro *(pausado — no se ofrece a clientes)* | Q999 /mes | Q0 | Todo Premium + Proveedores + Factura Electrónica (FEL) + soporte prioritario. Construido y listo en el código; solo asignable a mano desde el panel de super admin mientras Proveedores/FEL terminan de estar listos. |

Ningún plan tiene tope de ventas (GMV). "Alta" se cobra una sola vez, manual desde la ficha del restaurante — no es automático.

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

## Descuentos

- **"Plan a tu medida"** (solo Premium y Pro): Q50 de descuento por cada canal de pedido que el restaurante **no** usa, hasta un máximo de **2 canales** desactivados — siempre se paga al menos 1 canal completo.
- **Grupos / franquicias** (a partir de la 2ª sucursal, sobre el precio del plan de cada una, no sobre módulos): 2–4 sucursales **−10%** · 5–9 sucursales **−15%** · 10+ sucursales **−20%**. La sucursal fundadora siempre paga el precio completo.
- **Panel central de grupo**: Q299 /mes (métricas consolidadas de todas las sucursales).
- **Prueba gratis**: 30 días en el registro self-serve.

## Notas

- Verificado 2026-07-24 contra `plans.ts` y contra los overrides activos en `platform_settings` (vía las migraciones ya corridas en producción, 074–090) — hoy no hay ningún override que difiera de estos montos.
- `Cotizador.xlsx` y `Leogin_Planes_y_Precios_2026.docx` se actualizaron el mismo día para coincidir con esta tabla.
- Cambios de precio recientes: Básico pasó de Q149 a gratis (22 jul); Estándar y Premium bajaron de Q399/Q749 a Q299/Q599 (14 jul); Estándar ahora incluye finanzas (24 jul); se agregó el módulo Lista de espera (22 jul).
