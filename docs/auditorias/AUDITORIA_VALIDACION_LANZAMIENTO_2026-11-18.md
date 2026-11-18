# Validación de lanzamiento de Leogin · 18 de noviembre de 2026

La operación básica de un pedido para llevar quedó comprobada en producción con Rincón 502. La generación y el registro de una mensualidad se ensayaron en Supabase local. La apertura de la venta general queda pendiente de integrar las correcciones y de completar los ensayos que requieren acceso operativo o equipo físico.

La referencia del repositorio para producción fue `v0.24.0` (`prod-2026-11-17`, `a89d7cad`). El `main` remoto revisado, `069a6d10`, solo añadía documentación a esa revisión. La nueva portada seguía en el [PR #146](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/146).

## Evidencia en producción

| Recorrido | Resultado observado |
| --- | --- |
| Entrada comercial | Portada, planes, registro, demo, términos y privacidad cargaron. Los cuatro botones de plan abren el mismo formulario. En línea guarda una preferencia de tipo de negocio; Básico, Estándar y Premium enlazan a `/registro` sin pasar el plan elegido. |
| Cuenta y acceso | La cuenta de prueba abrió el panel de Rincón 502. Recuperar contraseña dirige a soporte por correo y promete atención en el momento. La respuesta de soporte queda por ensayar. |
| Carta, carrito y confirmación | Desde un navegador móvil independiente, el enlace estable `/m/rincon502` abrió la carta. Un producto de Q18 llegó al carrito y se envió como pedido para llevar **ORD-2026-00116**. |
| Pedidos y cocina | El pedido apareció en la pantalla de pedidos abierta antes del envío. Se aceptó, la comanda apareció en Cocina con la nota de prueba, se marcó lista y se registró la entrega. El seguimiento público cargó la orden. |
| Cobro y caja | Se abrió un turno con Q0.00. Caja mostró un cobro de Q18.00 asociado al pedido. Con Q18.00 contados, el turno cuadró. Tras recargar, el historial mostró el cierre «Prueba de lanzamiento» con Q18.00 esperados y Q18.00 contados. |
| Turno de práctica | Mesa P, dos productos a cocina, una anulación y cobro simulado. El saldo pasó de Q30.00 a Q18.00. Con Q20.00 recibidos se mostraron Q2.00 de vuelto y la confirmación de práctica completa. |
| Cobertura del panel | Se visitaron 45 rutas del panel. Respondieron todas tras repetir una navegación a Encuestas. Incluyó menú, inventario, recepción, personal, clientes, analítica, caja, ajustes, suscripción, respaldos y pantallas de integraciones. La configuración de Rincón 502 mostró «Sin PC principal». Esta pasada verifica acceso y renderizado. |
| Estado del servicio | `/api/health/deep` devolvió HTTP 200 y confirmó respuesta de Supabase Auth y de la base de datos. |

El pedido y el cierre quedaron identificados como ensayo en la demo de producción. El cobro registrado corresponde a efectivo simulado. El ensayo se limitó a Rincón 502 y tuvo cero movimientos de dinero y cero documentos FEL.

## Pruebas de la primera venta y correcciones

- Alta por correo en Supabase local. Se creó un negocio En línea a Q99 al mes, con tres productos, suscripción activa, tarifa automática y membresía de dueño. El subdominio local mostró los tres productos y el dueño abrió su suscripción. Un superadmin local con segundo factor generó la mensualidad de Q99.
- El dueño subió un PDF sintético. Vio «Pago en revisión» mientras el comprobante estaba pendiente. El operador lo aprobó y, al volver a abrir la suscripción, el dueño vio Q99 pagados y saldo pendiente en cero. El ensayo se hizo sin transferir dinero.
- Se reprodujo que registrar Q10 en una mensualidad de Q99 la marcaba como pagada. Con la corrección, Q10 dejó el cobro pendiente y el operador pudo corregirlo a Q99 desde el mismo formulario. Se verificaron el estado pagado, el recibo PDF y la ausencia del bucle de renderizado al corregir el monto. [PR #151](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/151)
- El alta ignoraba los errores de configuración del tema, facturación y cálculo de mensualidad. Ahora informa el fallo, intenta retirar el local incompleto y se detiene antes de asignar la membresía. Se añadieron pruebas de regresión. [PR #150](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/150)
- Dos corridas de `main` se detuvieron por colisiones de puertos antes de ejecutar las pruebas de Postgres y navegador. Con la reserva de puertos, el CI aplicó las migraciones y pasó 1,647 unitarias, 130 de integración y 31 de navegador. Una unitaria quedó omitida por la configuración existente. [PR #148](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/148) · [Corrida completa](https://github.com/CrisLeonardo/Catalogos-Restaurantes/actions/runs/44411127647)
- Se actualizaron Next.js y su configuración de ESLint a 16.4.6 y `node-forge` a 1.4.3. El análisis del lock de producción de esa rama quedó en dos avisos moderados, ambos de la cadena `exceljs` → `uuid`. [PR #149](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/149)
- El agente de impresión pasó 11 comprobaciones de reparto por estación. Leogin Desktop 0.3.3 pasó `cargo check --locked` y sus seis pruebas de rutas en Windows. La descarga pública entregó el instalador 0.3.2 y `Get-AuthenticodeSignature` devolvió `NotSigned`. La instalación limpia, impresión en papel y operación en red local quedan por ensayar. [Descarga pública](https://distleogin.com/descargas) · [Versión publicada](https://github.com/CrisLeonardo/leogin-agente-releases/releases/tag/desktop-v0.3.2)

## Condiciones para abrir la venta general

| Pendiente | Evidencia que lo cierra |
| --- | --- |
| Llevar a producción las correcciones | Revisar y fusionar con CI en verde. Confirmar el despliegue y repetir el pedido y la revisión comercial contra esa versión. |
| Primera mensualidad en producción | Desde una cuenta nueva dedicada, confirmar selección y precio, generar el cargo y comprobar las instrucciones, la recepción del pago y el comprobante comercial con el operador autorizado. |
| Recuperación y operación de soporte | Recuperar una cuenta de prueba de principio a fin. Verificar el acceso del operador, el tiempo de atención y la recepción de los avisos de indisponibilidad. |
| Impresión y operación sin internet, si se incluyen en la oferta | Confirmar y publicar el instalador aprobado, comprobar su firma de Windows, instalarlo en una PC de prueba, vincular la impresora, recibir una comanda con la red externa cortada y reconciliar al volver la conexión. |
| FEL e integraciones externas, si se ofrecen | Validar cada proveedor con sus credenciales de prueba y su comprobante de recepción. Separar el documento fiscal de la suscripción de Leogin del que emite un restaurante. |
| Respaldo recuperable | Restaurar una copia en un entorno separado y comprobar el acceso, los pedidos y el último cierre de caja. |

La auditoría previa de salida conserva el historial técnico y comercial. El [PR #147](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/147) cubre el examen visual de la carta y su capacidad de venta.
