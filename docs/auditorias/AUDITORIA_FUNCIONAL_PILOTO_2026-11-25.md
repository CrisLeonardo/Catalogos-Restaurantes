# Auditoría funcional para el piloto · 2026-11-25

**Origen.** Recorrido funcional externo del 25 de noviembre de 2026 sobre [distleogin.com](https://distleogin.com/): web pública, demo, comensal de Rincón 502, panel Premium, restaurante nuevo en Básico y altas de pago hasta el paso final.
**Objetivo.** Corregir lo que afecta la confianza operativa, preparar un piloto con un negocio de mostrador y mostrar por qué conviene cada plan.
**Rama.** `fix/auditoria-funcional-piloto` (base `main`, sin migraciones).

Cada hallazgo se buscó en el código antes de tocarlo y quedó clasificado como **reproducido** (se vio el defecto en código o en local), **ya resuelto** (el código actual ya lo cumple) o **pendiente de evidencia** (no se pudo reproducir sin producción).

## Resumen

| ID | Clasificación | Qué cambió | Cómo se verificó |
|---|---|---|---|
| CAJA-01 | Reproducido | Caja escucha cobros en vivo y al volver a la pestaña; el servidor rechaza el cierre si el esperado cambió y devuelve el importe nuevo; una mesa pagada y ocupada ya no figura en «Sin cobrar todavía»; un para llevar o domicilio ya pagado tampoco | 2 pruebas nuevas de dinero contra Postgres (94/94 en verde); en pantalla, un cobro ficticio de Q70 en la base local movió el esperado a Q70 sin recargar |
| SALON-01 | Reproducido | «Modo aprendiz» pasa a «Mostrar ayuda», con aviso de que se opera el restaurante real y acceso al turno de práctica aislado que ya existía (`/admin/mesero/practica`) | En pantalla |
| PEDIDOS-01 | Reproducido | El Q69.78 no era un descuento: era la animación del total congelada a medio camino cuando el navegador deja de dar cuadros. El total se fija con un temporizador y cambia de golpe si la página está oculta | En pantalla: con los cuadros detenidos, la animación quedó en Q25.34 y se fijó en Q50.00 exactos |
| PEDIDOS-02 | Reproducido | La etapa del pedido de prueba (Nuevo, En cocina, Listo) viaja por la sala y no retrocede; «Le avisamos al cliente» pasa a «Listo para entregar», que es lo que ocurre en la demo | 2 pruebas unitarias; en pantalla, aceptar y marcar listo en la portada dejó la otra pestaña en «LISTO» sin «Aceptar» |
| CARTA-01 | No se reproduce fuera de un despliegue | Sin cambio de código; script de medición | Medido en producción: las dos rutas cambiaron en la misma lectura (ver la sección propia) |
| CAJA-02 | Reproducido | El recibo y el texto para compartir dicen «turno de 10:27 a 10:28» o «sin apertura · cuenta desde las 05:00», y marcan el cierre «del día siguiente» si cruza medianoche | 3 pruebas unitarias |
| ENTREGA-01 | Reproducido, **más grave de lo reportado** | El pin sin ubicación guardada ya no se da por confirmado. Antes, sin moverlo, el checkout aceptaba enviar un domicilio a la puerta del propio restaurante (0.0 km) | Lectura del código; falta probar en teléfono |
| ALTA-01 | Reproducido | Las ventajas del registro salen del plan del enlace: Básico ya no promete pedidos con alerta. La personalización completa pasó a figurar en todos los planes (ver la tercera ronda) | En pantalla con `?plan=BASICO` |
| ALTA-02 | Reproducido | La vista previa del alta sigue al plan: en Básico no se arma pedido; en planes con pedidos, el carrito termina en el pedido de prueba identificado de la demo | Typecheck; falta recorrerlo en pantalla |
| ALTA-03 | Reproducido | «Escribe tres o más» pasa a «Con uno basta para ver tu carta», que es el mínimo real | Lectura de `leerPlatosDelAlta` |
| ALTA-04 | Reproducido | Sin pedidos, la guía se llama «Publica y comparte tu carta» y su último paso, «Comparte tu carta». La descarga del QR se reconoce aparte de las visitas. El acceso a QR por mesa solo aparece si el plan tiene salón | Typecheck |
| PLAN-01 | Reproducido | El selector del alta dice «2 de 3 modos», cuáles quedan puestos, que se cambian en Funciones y que «comer en local» en Estándar es sin meseros | Typecheck |
| PLAN-02 | Reproducido | En código el tope es blando y **no hay cambio automático de plan**. El texto ya dice que nada se corta, que se pide pasar a Estándar, su precio y que el cambio lo confirma el dueño, también junto al precio de la página de ventas | En pantalla |
| PLAN-03 | Parcialmente resuelto | El importe y la fecha del primer cobro ya se veían antes de crear. Se agrega «Ver cómo funciona {plan} en la demo» del mismo caso | Typecheck |
| COCINA-01 | Mitad resuelto | «Sale el papel» pasa a «le aparece en su pantalla (y en papel, si hay impresora configurada)». El aviso de sonido bloqueado en Cocina ya era persistente | Lectura del código |
| METRICAS-01 | Reproducido | El porcentaje contra un día típico solo aparece con 5 visitas o más; con menos, se dice que falta historial. La hora fuerte lleva su número de pedidos y con menos de 5 dice «Más pedidos:» en vez de «Se llena» | 5 pruebas unitarias |
| COPY-01 | Reproducido | La portada dice «cuánto vendiste y si la caja cuadra» y que la ganancia requiere cargar costos. La página de ventas dice cómo paga el cliente y que el dinero no pasa por Leogin | Lectura |

## CARTA-01 · Por qué no se tocó

Lo que se comprobó:

- Cloudflare no guarda la carta: ambas rutas responden `cf-cache-status: DYNAMIC` con `no-store`.
- El subdominio y el enlace del QR (`/m/<slug>`) pintan la misma página y leen la misma caché de datos (`getMenuDataCached`, clave por restaurante, etiqueta `menu:<id>`).
- Toda acción que cambia un precio invalida esa etiqueta con `updateTag`.
- El service worker sirve la navegación con red primero.

La hipótesis más fuerte es un **despliegue solapado**: `render.yaml` tiene `autoDeploy: true` y el 25 de noviembre se fusionaron #188 y #189. Durante un despliegue sin corte, Render mantiene dos instancias, cada una con su caché en memoria; la que no atendió el guardado sirve el precio anterior hasta 60 s (`revalidate: 60`). Coincide con lo observado (un acceso al día y el otro no, y ambos al día en la recarga siguiente).

Para confirmarlo: cambiar un precio en producción fuera de un despliegue mientras corre `node plataforma/scripts/medir-publicacion-carta.mjs <slug> "<platillo>" <precio-nuevo>`, que lee las dos rutas cada 2 s y anota cuándo cada una muestra el precio nuevo. El 2026-11-25, ya desplegada la v0.37.0, las dos rutas de Café Cedro QA 2511 mostraban Q16 (`DYNAMIC`). Si se reproduce fuera de un despliegue, la causa es otra y hay que investigar más. Si solo ocurre durante despliegues, basta con decirlo al dueño en el guardado («puede tardar hasta un minuto en verse en todos lados») o mover la caché a un almacén compartido.

**Medición del 2026-11-25, fuera de un despliegue.** Con `main` ya desplegado (#191) y sin otra fusión en curso, el dueño cambió Café americano de Café Cedro QA 2511 de Q16 a Q17. El script leyó las dos rutas cada 2.4 s aproximadamente: en la lectura de los 708.8 s las dos decían Q16 y en la de los 711.2 s las dos decían Q17, con `cf-cache-status: DYNAMIC` y sin errores. No hubo diferencia entre accesos.

**Conclusión.** Fuera de un despliegue el cambio aparece a la vez en los dos accesos, así que la diferencia que vio la auditoría se explica por el despliegue automático de ese día. No hace falta tocar la caché. Si molesta durante los despliegues, la medida barata es avisar al guardar («puede tardar hasta un minuto en verse en todos lados» mientras se publica una versión). Café Cedro QA 2511 quedó con el café a **Q17**.

## Aportes que no estaban en la auditoría

1. **ENTREGA-01 era un riesgo de pedido, no de texto.** El mapa notificaba la posición inicial (el restaurante) como si fuera la del cliente: un domicilio podía salir con la dirección del local.
2. **Mostrador cobrado antes de preparar.** «Sin cobrar todavía» solo descontaba lo pagado de las mesas: en mostrador, que es el caso del piloto, un pedido para llevar ya cobrado que esperaba en cocina aparecía como pendiente y el cierre preguntaba por él.
3. **«Personalización completa» se anunciaba solo en Premium, pero el código no la restringe**: todos los planes tienen el editor de diseño completo. Corregido en la tercera ronda.
4. **La base local de pruebas iba en la migración 181** y con `leogin_cobrar_parte_mesa` en una versión vieja de la 164. Se puso al día con `supabase migration up` y reaplicando la 164 y la 165. Conviene correr `node scripts/huellas-funciones.mjs` antes de las pruebas de dinero.
5. **Precios en la auditoría.** El documento externo cita Estándar a Q150 y Premium a Q299; los textos los toman de Super › Configuración, así que no hay cifras escritas a mano que corregir. La base local tiene otros precios (Estándar a Q199).
6. **Básico es el piso del sistema**, no solo una oferta. Ver el mapa de abajo.

## Mapa de dependencias de Básico

La decisión comercial está en evaluación. Este mapa separa **quitarlo de la captación pública** (cambio de textos y enlaces) de **retirarlo del sistema** (cambio de datos y reglas).

### Superficies públicas que lo ofrecen

| Superficie | Archivo |
|---|---|
| Portada: «la carta con QR es gratis», cierre y enlaces de registro | `plataforma/src/components/landing.tsx`, `src/app/page.tsx` |
| Recomendador de plan de la portada y de Planes | `src/components/landing-planes.tsx`, `src/app/planes/page.tsx` (`planesDeLaWeb`, FAQ de prueba gratis) |
| Página de ventas en línea: FAQ «el Básico es gratis para siempre» | `src/app/vende-en-linea/page.tsx` |
| Registro: ventajas y asistente | `src/app/registro/page.tsx`, `src/app/registro/signup-wizard.tsx` |
| Selector del alta y plan sugerido por caso («Solo ven la carta» → Básico) | `src/app/mi-cuenta/nuevo/nuevo-restaurante.tsx`, `src/lib/alta.ts` (`planSugerido`) |
| Facturación del alta: Básico sin cobro ni tarjeta | `src/lib/billing-signup.ts` |

### Dependencias del sistema

| Dependencia | Dónde | Por qué importa |
|---|---|---|
| **Suspensión por impago se muestra como Básico** | `src/lib/db/restaurants.ts` (`soloCartaPorImpago`) | Decisión LZ-08: el QR impreso no muere si el local se atrasa. Sin Básico, hace falta otro «modo solo carta» |
| Plan por omisión cuando `plan_actual` es nulo | `cambiar-plan.ts`, `salon-data.ts`, `qr/page.tsx`, `suscripcion/page.tsx` y otros | Hay que decidir a qué plan cae un restaurante sin plan |
| Bajas de un plan de pago | `src/lib/actions/cambiar-plan.ts`, `modulosAlCambiarDePlan` | Hoy bajar a Básico apaga módulos y conserva la carta |
| Navegación y candados del panel | `src/lib/admin-nav.ts`, `src/components/admin/shell.tsx`, `locked-feature-card.tsx`, `modules-panel.tsx` | Ocultan Mesas, Pedidos y canales en Básico |
| Tope de 150 productos y textos de mejora | `src/lib/plans.ts`, `catalog-panel.tsx` | |
| Precios y configuración | `src/components/super/pricing-settings-form.tsx`, 16 migraciones que lo nombran (089 lo volvió gratis) | Una migración aplicada no se edita: retirar el plan sería una migración nueva |
| Cuentas existentes | Restaurantes con `plan_actual = 'BASICO'` en producción | Contarlos y decidir antes de tocar nada |

**Recomendación.** Si se decide, empezar solo por la captación: el recomendador deja de proponer Básico, los enlaces dicen «Probar la demo» en vez de «Crear mi restaurante gratis», y Básico queda como destino de bajas y suspensiones. Así se mantiene una forma de probar Leogin antes del primer cobro sin migrar a nadie.

## Segunda ronda · 2026-11-25, después del despliegue

v0.37.0 desplegada (`prod-2026-11-25` sobre `8e5bc522`); producción ya muestra los textos nuevos de Vende en línea y la portada.

| Qué se probó | Resultado |
|---|---|
| Alta en Básico, en local | La carta de muestra no ofrece agregar ni carrito; no aparece el enlace a la demo |
| Alta en Estándar, en local | Se agrega a la carta de muestra y el carrito termina en «Enviar mi pedido de prueba», sin «Ir a pagar» ni «Quiero esto». **Dos detalles corregidos**: el enlace abría la demo en el caso «carta» (ahora, el del plan: mostrador) y la cocina de prueba se llamaba «Rincón 502» (ahora, el negocio que se crea) |
| ENTREGA-01 a 375 px, permiso denegado | «Falta confirmar tu ubicación»; «Confirmar pedido» marca «Coloca tu ubicación en el mapa» y no envía |
| ENTREGA-01, toque en el mapa y cambio a llevar y de vuelta | «Dentro del rango — a 0.2 km» y se conserva |
| ENTREGA-01, ubicación a 78 km | «Fuera del rango — estás a 78.3 km (máx. 6 km)» y no envía |
| ENTREGA-01, ubicación compartida cerca | «Dentro del rango — a 0.3 km» sin tocar el mapa |
| Mapa de entrega | **Error previo corregido**: montar y desmontar el mapa rápido lo inicializaba dos veces («Map container is already initialized») y la primera carga ya no pedía la ubicación |

La geolocalización se simuló en el navegador de escritorio con vista de teléfono; sigue faltando un teléfono físico con el diálogo de permiso real.

## Tercera ronda · 2026-11-25, revisión de la oferta

Cuatro hallazgos de una revisión externa de la web en producción. Decisiones del dueño del mismo día.

| Hallazgo | Qué dice el código | Decisión y cambio |
|---|---|---|
| El aviso de 300 pedidos no dice qué pasa si el dueño no acepta el cambio | Nada automático: sigue en En línea, al mismo precio, recibiendo pedidos, y solo ve el aviso | **Se queda en En línea.** Planes, Vende en línea, Hoy y Mi suscripción lo dicen: ningún pedido se corta, el cambio lo decide el dueño y el aviso vuelve cada mes que pase el tope |
| Vende en línea ofrece la Vitrina en Q99 sin decir qué entra | Cuenta regresiva, «Avísame cuando abra» y archivo de ediciones están en todos los planes. «Quedan 4 de 30» sale del conteo de existencias, que hoy solo se edita desde Inventario (Premium) | **Cupo por pieza en todos los planes**, reutilizando el conteo de Inventario. Maqueta: [MAQUETA_DEMO_POR_CASO_Y_CUPO_2026-11-25](../diseno/MAQUETA_DEMO_POR_CASO_Y_CUPO_2026-11-25.html) §2, **pendiente de aprobación** |
| «Personalización completa» solo en Premium (hallazgo propio) | `hasFullTheme` no restringe nada: el editor de diseño es igual en todos los planes | **Todos los planes la tienen.** `hasFullTheme` en verdadero para todos; la comparativa y el registro lo dicen |
| Escritorio promete que una Mac no pierde «ninguna función» | La impresión automática (Premium) y el respaldo sin internet dependen de una PC principal con Windows | La respuesta dice qué hace una Mac sola (el panel completo con internet) y qué gana si el local tiene una PC principal con Windows |
| Las demos de mostrador y de mesas muestran la misma carta | `?caso=` solo cambia la cinta de arriba | Propuesta: mostrador en cuatro pasos (pedido, cobro con cambio, cocina, cierre de caja) y mesas con el turno de práctica, ambos en memoria. Misma maqueta §1, **pendiente de aprobación** |

## Pendiente antes del piloto

- **Teléfono físico**: el diálogo de permiso de ubicación real y el pin justo en el límite del radio; uso táctil de Salón, Caja y checkout.
- **Caja Estándar activa**: el circuito completo de mostrador con un restaurante Estándar real, no el panel Premium.
- **Lo que la auditoría ya listaba**: alta desde cero con verificación de correo, cobro mixto, cancelación de línea y devolución, impresión con PC principal, operación sin internet, instalador de Escritorio firmado y permisos por rol.

## Datos ficticios que quedaron

- **Base local**: pedido `AUD-CAJA01-…` de Rincón 502 en la Mesa 9 con un cobro en efectivo de Q70, usado para comprobar Caja en vivo.
- **Producción**: el pedido #117, el corte de prueba de Rincón 502 y Café Cedro QA 2511 son de la auditoría externa. El único cambio posterior lo hizo el dueño para medir CARTA-01: el café de Café Cedro QA 2511 pasó de Q16 a Q17.
