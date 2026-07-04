# Análisis competitivo — 2026-07-04

> Punto de partida pedido: **restaurant.pe** (Perú, +4,600 clientes, presencia
> en 10+ países). Se agregan **OlaClick** (~40,000 negocios, base gratis) y
> **Fudo** (~30,000 negocios, POS integral) como referentes LatAm.
> Objetivo: qué tienen ellos que Leogin no, qué implementar y cómo superarlos.

## 1. Mapa de módulos: restaurant.pe vs Leogin

| Módulo restaurant.pe | ¿Leogin lo tiene? | Notas |
|---|---|---|
| Carta digital / menú QR | ✅ Sí (superior) | Personalización total por restaurante (tipografía por rol, glass, portada) que ellos no ofrecen. |
| POS / toma de pedidos | ✅ Sí | Panel de mesero táctil + mesas con plano del salón. |
| Facturación electrónica | ✅ Sí (FEL GT, manual) | Ellos: SUNAT Perú integrada. Nosotros: falta cerrar certificador para emisión automática. |
| Pantalla de cocina (KDS) | ✅ Sí | Semáforo configurable, realtime, full-screen táctil. |
| CRM / fidelización | ✅ Sí (superior) | Puntos por producto + catálogo de canje estilo McDonald's + login Google. |
| Logística: insumos, recetas | ✅ Sí | Módulo de recetas con costo automático + ingredientes. |
| Costos y gastos / rentabilidad | ✅ Sí | Finanzas ya trae utilidad, margen y "más rentables". |
| Reservas | ✅ Sí | Módulo reservaciones. |
| Multi-sucursal | ✅ Sí | Panel central del grupo con comparativa y CRM financiero. |
| **Kiosco de autoservicio** | ✅ **Implementado esta noche** | Ver §3. Antes: ✗. |
| **WhatsApp IA para pedidos** | ✗ No | Bot que toma pedidos por WhatsApp. Roadmap §4.1. |
| **Integración apps delivery** (PedidosYa/Rappi/UberEats) | ✗ No | Consolidar pedidos de terceros en el panel. Roadmap §4.2. |
| **App repartidores** | ✗ No | Asignación de pedidos a repartidores + estado de entrega. Roadmap §4.3. |
| Compras / almacenes múltiples (Kardex) | ◐ Parcial | Tenemos inventario + proveedores + recetas; falta órdenes de compra y kardex formal. Roadmap §4.5. |
| Workplace (RRHH/turnos) | ✗ No | Baja prioridad para el mercado GT actual. |
| Plaza Puntos (red de puntos entre locales) | ✗ No | Interesante a futuro como red Leogin. |

## 2. Referentes adicionales

- **OlaClick**: su gancho es "gratis sin comisiones" + pedidos que llegan por
  WhatsApp + chatbot IA. Su menú QR es mucho más básico que el nuestro; su
  fuerza es la adquisición (freemium). Lección: nuestro plan Variable (1%)
  compite bien; comunicar "sin comisiones por pedido" en la landing.
- **Fudo**: fuerte en integraciones (PedidosYa, Uber Eats, Rappi) y app propia
  de meseros/clientes. Cobra USD 35–45/mes por función — Leogin es más
  competitivo en precio con más módulos incluidos.
- **Ventajas Leogin que ninguno iguala**: personalización visual profunda del
  menú, modo offline (outbox + hub LAN del agente), agente de impresión propio,
  sesiones separadas staff/comensal, RLS probado por tenant.

## 3. Implementado esta noche: Modo Kiosko (autoservicio)

Cierra la brecha del "Kiosco de Autoservicio" de restaurant.pe **sin hardware
dedicado**: cualquier tablet en el mostrador sirve de tótem.

- `slug.leogin.online/kiosko` activa el modo en ese dispositivo
  (`/kiosko?salir=1` lo desactiva). Bandera en sessionStorage.
- En kiosko el menú oculta cuenta/fidelidad/mis pedidos y avisos de Google
  (datos personales no deben verse en un aparato compartido); aparece el
  distintivo "Autoservicio".
- El checkout se fuerza a "para recoger": sin autocompletar el perfil del
  cliente anterior, sin guardar el perfil del actual, sin canje de puntos
  (la sesión del aparato no es del cliente).
- Al confirmar: número de pedido en grande, "te llamaremos al mostrador",
  botón "Hacer otro pedido" y regreso automático al menú a los 45 s.
- Mejor que restaurant.pe: cero licencias extra, cero hardware propietario,
  hereda TODA la personalización visual del restaurante.

Archivos: `src/lib/kiosk.ts`, `src/app/kiosko/page.tsx`,
`src/components/menu-client.tsx`, `src/components/checkout-form.tsx`.

## 4. Roadmap priorizado (para ser mejores en todo)

1. **Pedidos por WhatsApp con IA** (diferenciador #1 de restaurant.pe y
   OlaClick). Vía WhatsApp Business Cloud API (Meta) + un agente que lee el
   menú del tenant y arma el carrito. Requiere: número verificado por
   restaurante o número compartido de Leogin, webhook en la plataforma,
   costo por conversación de Meta. Estimación: 1-2 semanas. Primero un paso
   barato: plantilla "pedir por WhatsApp" ya existe en el checkout.
2. **Integraciones de delivery** (PedidosYa/UberEats GT): consolidar pedidos
   externos en el panel + KDS. Requiere cuentas partner (proceso comercial).
   Mientras: entrada manual rápida de pedidos externos en el panel de mesero.
3. **Módulo repartidores**: asignar pedido→repartidor, vista móvil del
   repartidor (PWA) con direcciones y "entregado". Migración: tabla drivers +
   orders.driver_id. Estimación: 3-5 días. Habilita liquidación de rutas.
4. **Pagos en línea integrados** (tarjeta en el checkout): con un agregador
   local (p.ej. Recurrente en GT) — hoy el pago con tarjeta es "al entregar".
   Elimina la fricción #1 del delivery propio.
5. **Compras + Kardex**: órdenes de compra a proveedores (módulo ya existe)
   que alimentan inventario/ingredientes con costo promedio. Cierra el ciclo
   logístico completo que presume restaurant.pe.
6. **Kiosko v2**: pago con tarjeta en el kiosko (depende de #4) + impresión
   automática de ticket de turno vía Agente Leogin.

## Fuentes

- https://www.restaurant.pe/ y https://restaurant.pe/web/menu-online-carta-qr/
- https://www.comparasoftware.pe/restaurant-pe
- https://olaclick.com/es/software-para-restaurantes/
- https://www.getapp.com/retail-consumer-services-software/a/fudo/
- https://www.getapp.com/retail-consumer-services-software/a/olaclick/
- https://www.comparasoftware.pe/software-para-restaurantes
