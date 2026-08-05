# Leogin vs. OlaClick — análisis de brechas, 2026-08-04

> Encargo: qué le falta a Leogin para competir contra OlaClick, verificado
> contra el código real (`plataforma/`, `agente-impresion/`, `leogin-desktop/`,
> 100 migraciones SQL), no contra lo que dicen los documentos previos.
> Complementa `ANALISIS_COMPETENCIA_2026-07-04.md` (más genérico, incluía
> restaurant.pe y Fudo) con foco específico en OlaClick y con inventario de
> código de hoy, un mes más avanzado.

## 0. Quién es OlaClick hoy

120,000 negocios en 27 países (creció desde los ~40,000 que tenía en julio).
Gratis en la capa base, sin comisión por pedido. Su gancho real son tres cosas
que Leogin no tiene ninguna: **chatbot de WhatsApp con IA que toma el pedido
solo 24/7**, **pagos integrados en el checkout**, y **logística de delivery
propia** (asignación de repartidor, zonas, rutas) que además consolida
pedidos de plataformas externas. Reviews públicas son mayormente positivas;
la única queja recurrente es que a veces "se congela" — no es una ventaja
explotable, es ruido normal de cualquier SaaS a esa escala.

## 1. Brechas reales (confirmadas en código, no en la landing)

| # | Brecha | Estado en Leogin | Por qué importa |
|---|--------|-------------------|------------------|
| 1 | **Pedidos por WhatsApp con IA** | No existe. Solo enlace `wa.me` que abre WhatsApp con texto prellenado (`src/lib/reminder.ts`). El cliente igual tiene que ir al menú web a armar el pedido. | Es el gancho #1 de OlaClick: el cliente nunca sale de WhatsApp. Para el segmento de restaurantes pequeños en GT que ya viven en WhatsApp, es la brecha más visible. |
| 2 | **Pagos en línea con tarjeta** | No existe. `src/lib/api-keys.ts` documenta explícitamente que Stripe/Recurrente no se gestionan; el checkout solo ofrece `CASH` o `CARD` como "tarjeta al recibir" (contra entrega). | OlaClick trae pago integrado. Es la fricción #1 del delivery propio: cobrar en la puerta es más lento, más riesgoso (cambio, fraude) y peor experiencia que pagar al pedir. |
| 3 | **Delivery propio con repartidores** | No existe. "Repartidor" solo aparece como texto de ayuda en el checkout, no hay rol, no hay app, no hay asignación ni zonas ni rutas. | OlaClick gestiona todo el ciclo: asignar, ver zona, marcar entregado. Leogin hoy termina en "el pedido está listo" — el resto (quién lo lleva, cuándo llega) queda fuera del sistema. |
| 4 | **Consolidar pedidos de apps externas** (PedidosYa, Rappi, UberEats) | No existe. Cero referencias en todo el código. | OlaClick centraliza esos pedidos en el mismo panel/KDS. Un restaurante que ya vende por esas apps hoy tiene que atenderlas en pantallas aparte si usa Leogin. |
| 5 | **App móvil nativa** | No existe (ni para el dueño ni para el cliente). Leogin es web responsive; `leogin-desktop` es solo un shell de escritorio (Tauri) que carga el panel web, no una app de teléfono. | OlaClick tiene app en Google Play. Pesa menos para el caso de uso del comensal (el QR abre navegador, está bien), pero para el **dueño/mesero** una app nativa con notificaciones push más confiables sí es una expectativa instalada en el mercado. |

## 2. Donde Leogin ya gana (confirmado en código, no en discurso)

| Área | Leogin | OlaClick (por lo público) |
|------|--------|---------------------------|
| Personalización visual | Theming completo por restaurante — 10 roles de texto, plantillas, "liquid glass" — vía `src/lib/theme/` | Menús QR genéricos, personalización básica |
| Modo offline real | Outbox + hub LAN + agente de impresión propio (`agente-impresion/`, `src/lib/order-queue.ts`, `hub-fallback.ts`) — sigue vendiendo con internet caído | Sin evidencia pública de modo offline |
| Multi-sucursal con panel de grupo | `central/` completo: comparativa entre sucursales, finanzas consolidadas, roles `GROUP_OWNER` | No es su foco (apunta más a negocio único) |
| Profundidad operativa | Recetas con costo automático, kardex de costo promedio ponderado, reparto de propinas, tarjetas de regalo, encuestas, alérgenos/dietas, excepciones de horario — todo con migración SQL dedicada | No aparece con este nivel de detalle en su material público |
| Seguridad auditada | RLS probada tabla por tabla, anti-SSRF, rate limiting atómico en Postgres, guardrail de CI contra funciones `security definer` expuestas — ver `AUDITORIA_2026-07-29.md` | Sin visibilidad (caja negra) |
| RBAC granular + PIN de personal | 22 secciones asignables por rol, sesión de mesero por PIN con expiración | No documentado a este nivel |

## 3. Zona gris — no es que falte, es que no está terminado

Estas no son brechas frente a OlaClick per se, pero sí restan credibilidad si
se muestran a un prospecto que las compara de cerca:

- **Facturación electrónica GT (FEL).** El cálculo del DTE está completo
  (`src/lib/fel.ts`), pero la transmisión real a un certificador (INFILE/G4S/
  DIGIFACT) devuelve el error "aún no está conectada" — hoy solo el modo
  manual funciona, sin validez fiscal ante SAT. Esto no es sobre competir con
  OlaClick, es sobre poder facturar de verdad; conviene cerrarlo antes de la
  siguiente demo a un cliente que pida factura.
- **Compras/kardex pausado comercialmente.** El código está listo (incluye
  costo promedio ponderado), pero `plans.ts` lo marca fuera de venta desde el
  12 de julio por decisión propia, no por falla técnica. Es una brecha que se
  cierra con una decisión, no con desarrollo.
- **Menú público sin caché** y **CSP con `unsafe-inline`/`unsafe-eval`** —
  hallazgos M-1/M-2 de la auditoría del 29 de julio, marcados "recomendado"
  y sin corregir aún. Afectan velocidad y seguridad, no funcionalidad.

## 4. Prioridad sugerida para cerrar la brecha real

1. **Bot de WhatsApp con IA.** Es el diferenciador más citado de OlaClick y
   el que más rápido se nota en una demo. Vía WhatsApp Business Cloud API +
   un agente que lea el menú del tenant. Ya estaba en el roadmap del análisis
   de julio; sigue siendo el #1.
2. **Pagos en línea con tarjeta.** Un agregador local (Recurrente en GT) en
   el checkout quita la fricción de cobrar en la puerta y empareja lo que
   ya se anuncia en el propio código (`api-keys.ts` ya tiene el lugar
   reservado para estas llaves — falta conectarlas).
3. **Módulo de repartidores.** Rol nuevo + tabla `drivers` + `orders.driver_id`
   + vista móvil simple del repartidor. Cierra el ciclo delivery de punta a
   punta sin depender de apps externas.
4. **FEL conectado de verdad.** No es sobre OlaClick, es sobre poder vender
   con factura válida — probablemente más urgente que el punto 3 según qué
   tan seguido pide factura el cliente objetivo.
5. **Consolidar pedidos de PedidosYa/Rappi/UberEats.** Requiere acuerdos
   comerciales con cada plataforma antes que código — es la más lenta de
   arrancar, conviene iniciarla en paralelo aunque se entregue al final.
6. **Reactivar Compras/Kardex comercialmente** — ya está construido, es la
   ganancia más barata de las seis.

## 5. Una nota sobre el modelo de negocio, no solo el producto

OlaClick compite con "gratis, sin comisión, sin contrato". Leogin no le va a
ganar esa guerra de precio con el mismo movimiento — la ventaja de Leogin es
otra: personalización real por restaurante, modo offline que de verdad
funciona sin internet, y una profundidad operativa (kardex, propinas,
multi-sucursal) que un producto masivo y genérico como OlaClick no puede
igualar sin dejar de ser genérico. El mensaje de venta que sostiene esto es
"no somos el más barato, somos el que se ve y funciona como si fuera tuyo" —
y ahí es donde ya hay ventaja real, verificada en código, hoy.
