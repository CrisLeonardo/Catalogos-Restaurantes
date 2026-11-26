# Reestructuración de planes de Leogin

25 de noviembre de 2026

## Base de integración

El PR #194 corrige el aviso de 300 pedidos, reconoce la personalización completa en los cuatro planes y aclara qué hace Escritorio en Mac. Esta rama parte de su último commit. El PR #129 propone una tarifa histórica de Q49 en documentación y la especificación del 25 de noviembre la sustituye por Q75. La maqueta de cupo por pieza del #194 sigue siendo una propuesta.

## Estado para revisión

| Tarea | Estado |
|---|---|
| LG-01 · Auditoría | Tarifas efectivas en `platform_settings`, contrato de planes en `src/lib/plans.ts`, precio acordado en migración 191. El plan y sus excepciones se reflejan en `restaurants.modules`; cada acción comprueba los roles correspondientes. |
| LG-02 · Tarifas | Q0, Q75, Q149 y Q299 mensuales para nuevas contrataciones y cambios confirmados. Se conservan acuerdos existentes, configuración asistida y facturas emitidas. |
| LG-03 · Contrato | Catálogo compartido con el panel y la web. Los pisos que materializa PostgreSQL se comprueban en la regresión SQL. Queda por revisar toda la matriz de accesos directos de órdenes, salón, Escritorio y procesos en segundo plano. |
| LG-04 · Vitrina y ventas | Hoy muestra el resumen de En línea con total, pedidos y platillos más vendidos por unidades. Usa el día de negocio y los períodos Hoy, Semana y Mes. Vitrina conserva las publicaciones y el archivo del editor. Falta verificar su cupo por pieza con un establecimiento del piloto. |
| LG-05 · Cupones | En línea y Estándar tienen monto fijo o porcentaje, vigencia y activación. Compra mínima y límite de usos se configuran en Premium. Las reglas avanzadas guardadas antes pueden seguir aplicándose en planes con cupones. La aplicación y los cambios de reglas se verifican en PostgreSQL. |
| LG-06 · Modalidades | Estándar puede activar los tres modos. Comer en local puede pedirse desde el mostrador sin QR de mesa, también en Premium, y no llega elegido a quien pide desde su casa. Se conservó la lectura de QR de mesas ya configuradas mientras se revisa ese uso con el dueño. |
| LG-07 · Cupos | Básico y En línea permiten 150 platillos activos y guardan el resto como borradores. Estándar admite tres personas, incluido el dueño. La base serializa la activación de platillos. Queda pendiente la reserva transaccional de invitaciones y personal, así como la selección de quién queda activo tras una reducción. |
| LG-08 · Cocina, caja e impresión | Estándar usa los flujos existentes de cocina y caja. Puede configurar una estación de cocina nueva. Si ya hay varias, conserva sus destinos y puede editarlos. Falta una prueba con hardware y una revisión de las capacidades de los otros planes. |
| LG-09 · Inventario | Estándar permite existencias de productos y recibe el piso de inventario. Recetas e ingredientes se autorizan como módulo distinto; se respetan excepciones registradas. |
| LG-10 · Volumen | Sigue el aviso vigente de 300 pedidos. Rechazar la sugerencia conserva el precio de En línea y permite seguir vendiendo. Para retirar el aviso y anunciar la nueva política faltan datos de costo por pedido, notificaciones y soporte. |
| LG-11 · Cambios | El dueño confirma importe y moneda. Se guardan el plan, las modalidades, el cobro y la auditoría en una transacción. Se rechaza una reducción si hay pedidos abiertos que perderían su modalidad o su mesa. Se conserva la política de cambio inmediato con nueva tarifa al siguiente corte. Queda pendiente programar reducciones al final del período y la regresión de todos los caminos de cobro. |
| LG-12 · Oferta | Tarifas, modalidades y herramientas actualizadas en los componentes compartidos. Se reutilizan la comparativa y el alta aprobadas. Queda pendiente auditar todo el material promocional y verificar visualmente los flujos autenticados. |
| LG-13 · Regresión | La prueba SQL cubre precios, acuerdo anterior, factura, cupo de platillos activos, cupones pausados y avanzados, una estación y reintento de cambio. El CI ejecuta la prueba SQL y el caso de mostrador de Estándar. La prueba de mostrador pasó con Edge y Supabase local. Falta la aceptación con un establecimiento de cada plan. |
| LG-14 · Prueba | 14 días por establecimiento en los tres planes de pago. El dueño puede confirmar o retirar la contratación hasta el vencimiento. Al vencer, solo se genera la primera mensualidad si hay confirmación. Si vence sin confirmación, vuelve a Básico y se conservan los datos y los pedidos. El reloj de salud envía los avisos por correo. Desde la 205, un dueño tiene una sola prueba en curso y sus locales nuevos no llevan prueba si una anterior terminó sin contratar; quien contrató sí puede probar en su siguiente local. |
| LG-15 · Métricas | Alta, primer platillo y embudo de carta ya tienen eventos. Queda pendiente medir conversión de la prueba, cambios, cancelaciones y costo de soporte. |
| LG-16 · Multisucursal | La política actual anuncia un cargo fijo. Falta confirmar el criterio de sucursal activa y la integración de los tramos con renovación y cobro del grupo. |

## Correcciones de la revisión (25 de noviembre)

Revisión de Claude sobre los commits de esta rama. Cada punto se corrigió en su propio commit.

1. **Prueba sin control por persona.** La 203 quitó la regla de «una prueba por persona» y no puso ninguna otra: bastaba con crear un restaurante cada 14 días para no pagar. La migración 205 agrega `leogin_motivo_sin_prueba` y un disparador en `restaurant_billing` que vale para el alta de Mi cuenta y para la prueba desde Suscripción. El alta y Suscripción dejan de ofrecer la prueba y dicen por qué. Prueba: `supabase/pruebas/205_prueba_por_dueno.sql` (falla si se apaga el disparador).
2. **Cambio de plan durante la prueba.** La 198 respondía «Contacta a Leogin». La 205 agrega `leogin_cambiar_plan_en_prueba`: otro plan de pago conserva la fecha de vencimiento y retira la contratación confirmada; Básico termina la prueba sin cobro ni recordatorios. `cambiarMiPlan` ya lo usa durante una prueba. Con la maqueta aprobada, Mi suscripción muestra «Cambiar de plan» también en prueba, con el plan probado marcado «Lo estás probando». Se comprobó en pantalla: cambio de En línea a Premium con la misma fecha, contratación confirmada y vuelta a Básico sin facturas.

3. **Premium sin mostrador.** El checkout solo daba «Comer aquí» sin mesa a Estándar, y los planes son acumulativos. `tieneMostrador` lo da a Estándar, Premium y Pro; con mesa escaneada el pedido sigue yendo a esa mesa. Además «Comer aquí» llegaba elegido por defecto a quien pedía desde su casa: ahora se elige el primer canal que no es en el local. La prueba de navegador cubre Estándar y Premium.

4. **Cobro de hoy durante la prueba.** «Estado de cuenta» mostraba «Próximo cobro: hoy» y la mensualidad, mientras la tarjeta de la prueba decía «Q0 durante la prueba» y el primer cobro al vencer. Durante la prueba voluntaria esos datos se quitan; la tarjeta de la prueba ya los dice.

5. **Aviso falso al subir desde Básico.** Al elegir En línea desde Básico, la confirmación decía «Dejarás de tener: Pedidos para comer en local», aunque Básico no recibe pedidos. Venía de antes de esta rama; `loQueSePierde` ahora exige que el plan anterior tuviera pedidos.

## Maqueta para aprobar

La [maqueta de prueba y resumen de ventas](../diseno/MAQUETA_PRUEBA_Y_RESUMEN_DE_VENTAS_2026-11-25.html) muestra cómo iniciar la prueba, cuándo se confirman los cobros y cómo cambiar el período de ventas. Se probó a 390 y 1280 px, en claro y oscuro, con teclado. El dueño aprobó la maqueta para implementar ambas pantallas en el PR #195.

La [maqueta de cambio de plan durante la prueba](../diseno/MAQUETA_CAMBIO_DE_PLAN_EN_PRUEBA_2026-11-25.html) fue aprobada por el dueño e implementada en este PR. Reutiliza la lista «Cambiar de plan» de los demás estados de Mi suscripción, marca el plan en prueba como «Lo estás probando» y muestra las dos confirmaciones: probar otro plan con la misma fecha o volver a Básico terminando la prueba. Se revisó a 375 y 1280 px, en claro y oscuro, sin desborde.

## Orden y reversión

1. Integrar primero el PR #194 y apuntar el PR de la reestructuración a `main`. Si el #194 se fusiona con squash, comprobar que el nuevo diff solo contiene la reestructuración.
2. En una base de pruebas, ejecutar las migraciones 196 a 204 en orden antes de desplegar la plataforma. La 196 cambia los precios del catálogo, por lo que durante un despliegue debe coordinarse con la web y el alta.
3. Verificar el cron de vencimiento en Supabase y el reloj de salud en GitHub con las variables `SALUD_CRON_URL`, `SALUD_CRON_SECRET` y el correo `RESEND_API_KEY` en la plataforma. Las pruebas voluntarias tienen su propio ajuste, separado del anterior, para que el código desplegado antes de la migración conserve su comportamiento.
4. Ejecutar `plataforma/supabase/verificar_migraciones.sql` y las pruebas `201_reestructura_planes.sql` y `204_prueba_y_resumen.sql`. Las pruebas revierten sus datos.
5. Si el despliegue debe revertirse, revertir el código y, si corresponde, preparar una migración que reponga los valores previos del catálogo y las reglas de acceso. Conservar los acuerdos contratados y las facturas generadas mientras estuvo vigente la oferta.
