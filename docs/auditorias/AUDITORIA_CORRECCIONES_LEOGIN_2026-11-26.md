# Correcciones de la auditoría funcional del 26 de noviembre de 2026

Auditoría externa hecha con ChatGPT sobre Café Jacaranda QA 2611 y Rincón 502 (tres rondas, datos ficticios). El dueño pidió tomarla como indicio de qué corregir, no como receta. Este registro dice qué se cambió, cómo se resolvió cada hallazgo y qué queda abierto.

Rama `fix/auditoria-correcciones-leogin` · migración **207** (`207_entrega_y_cobro_separados.sql`).

## Orden de despliegue

1. Aplicar la **migración 207** en producción. Escribe datos una sola vez (puntos 1 y 5 de la migración) y se puede volver a correr sin duplicar nada.
2. Desplegar el código.

Si el código llega antes que la migración, el cobro de pedidos en línea responde «Falta aplicar la migración 207» y el reparto sigue como antes. Nada se rompe, pero la corrección crítica no queda activa.

## Clasificación

| # | Hallazgo | Estado | Cómo se resolvió |
|---|---|---|---|
| 1 | Entregar cambia el efectivo sin cobro | Corregido | Un solo registro de cobro (`order_payments`). Entregar ya no cobra. La 207 concilia el histórico sin mover ningún saldo. |
| 2 | Una edición vieja revierte la disponibilidad | Corregido | La ficha manda cómo estaba al abrirse; el servidor escribe solo lo cambiado y avisa si otra persona cambió lo mismo. |
| 3 | El pedido de prueba contamina las cifras | Corregido | Modo prueba visible en carta y seguimiento; la prueba no se puede entregar ni avisa a nadie; ventas y consolidado la excluyen. |
| 4 | La carta deja llenar el carrito en pausa | Corregido | La carta lee la pausa: «Pedidos en pausa» en la portada, aviso con la hora de regreso y carta de consulta. |
| 5 | El alta reparte a cualquier dirección y hora | Corregido | `reparto_confirmado_en`: un local nuevo no recibe domicilios hasta confirmar cobertura, tarifa y horario. |
| 6 | La configuración del PIN expone nombres | Corregido | La lista solo se ve en los aparatos del local. Fuera de ellos, si el dueño lo permite, se escribe el nombre. |
| 7 | El historial del corte muestra «Esp. Q0» | Corregido | «Efectivo esperado» = contado − diferencia en historial, Excel y PDF; las ventas en efectivo van aparte. |
| 8 | Prueba y cobros con reglas distintas | Corregido en textos | Términos alineado con la regla real; el alta avisa en el primer paso si no hay prueba; Mi suscripción explica cancelar y falta de pago. |
| 9 | Comparativa contra lo que se habilita | Parcial | Hoy ya no enlaza a Caja si el plan no la incluye. El resto depende de decisiones comerciales (abajo). |
| 10 | Teléfono `00000000` y «Ir a pagar» | Corregido | Validación de Guatemala (2–7 al inicio, con o sin +502, sin dígito repetido). «Continuar con el pedido», «Efectivo al recibir», «Tarjeta al recibir con POS». |
| 11 | Contacto, Google y Escritorio | Parcial | El pie usa el mismo canal que los botones. Falta configurar el WhatsApp y lo de Google y la firma. |

## Decisiones de diseño que conviene conocer

### 1 · Entregar no es cobrar

- **Pedidos.** Un domicilio o «para recoger» con saldo muestra **Entregar y cobrar**. La hoja propone el método que eligió el cliente y ofrece **Entregar sin cobrar** (el repartidor todavía trae el dinero). Un pedido entregado sin cobro muestra **Cobrar Q…** en su tarjeta.
- **Caja.** Los entregados sin cobro de la última semana salen primero en «Sin cobrar todavía», con su botón **Cobrar**. No cuentan en el efectivo esperado hasta que se cobran.
- **Un solo cobro.** `leogin_cobrar_pedido` bloquea la fila y cobra solo el saldo. Un reintento, o la otra pantalla, encuentra el saldo en cero y no escribe nada.
- **Histórico.** Cada pedido en línea entregado sin filas recibió la fila que la caja ya le suponía, con el mismo método, importe, hora y marca de registro. Ningún corte ni reporte cambió (verificado en local: Q30,349.90 antes y después). Esas filas llevan el motivo «Supuesto al entregar…» y se pueden corregir desde Caja como cualquier cobro.
- **Resumen de ventas.** «Por método» ahora es lo cobrado de verdad. Lo vendido sin cobro aparece como «Sin cobro registrado». En la base de ejemplo eso incluye las mesas sembradas sin cobro; en producción incluirá las mesas anteriores a la migración 129, si las hay.

### 3 · Pedido de prueba

El sistema ya tenía `es_prueba` (183), pero nada impedía hacer un pedido normal desde «Ábrelo como cliente» y creer que era de prueba. Ahora la carta dice **Modo prueba** mientras el pase vale, Cocina y el seguimiento lo marcan, WhatsApp no avisa, la base impide entregarlo (se termina con «Terminar la prueba») y el resumen de ventas lo excluye aunque siga en curso.

### 5 · Reparto confirmado

Los locales que ya repartían quedan confirmados al aplicar la 207: los que tienen zonas, radio o algún domicilio. Los demás ven en Hoy «Tu carta todavía no recibe domicilios» y en Ajustes › Entrega las tres reglas con el botón **Empezar a recibir domicilios**. Si la regla es «a cualquier dirección», «envío gratis» o «a toda hora», se dice como una elección antes de confirmar.

### 6 · PIN

Los aparatos se siguen apuntando solos al entrar con PIN desde la grilla. Entrar escribiendo el nombre no apunta el aparato: si lo hiciera, el teléfono de casa empezaría a ver la lista. Con ningún aparato registrado, Personal pide registrarlos.

## Decisiones abiertas (del dueño)

1. **Cocina en En línea.** Hoy la pantalla de Cocina está en el menú de En línea, pero Planes la vende como novedad de Estándar. Hay que elegir entre quitarla de En línea o decir en Planes que la incluye.
2. **Impresión, Vitrina, cupones y sucursales (hallazgo 9).** Son textos comerciales que hay que reescribir con criterio de venta: qué impresión trae cada plan, separar el diseño Vitrina de las funciones de lanzamiento, unificar los nombres de cupón básico y avanzado, y poner un ejemplo de dos sucursales con el panel de grupo.
3. **WhatsApp comercial.** El sitio ya lo usa en todos los botones si existe `NEXT_PUBLIC_CONTACT_WHATSAPP` (solo dígitos, con 502). Falta ponerlo en Render.
4. **Google y Escritorio.** Para que Google muestre «Leogin» hay que configurar un dominio propio de autenticación en Supabase (o la marca de la pantalla de consentimiento). La firma del instalador de Escritorio sigue pendiente.

## Verificaciones pendientes

Las de la auditoría siguen abiertas: Windows con impresora y red local, WhatsApp con número de prueba, Excel general, vencimiento real de la prueba, turno persistido de Estándar/Premium y aislamiento entre cuentas. Además, el cobro de un pedido en línea debe probarse en un teléfono físico con la hoja de cobro.
