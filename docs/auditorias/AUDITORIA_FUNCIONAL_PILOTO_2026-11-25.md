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
| CARTA-01 | Pendiente de evidencia | Sin cambio de código | Ver la sección propia |
| CAJA-02 | Reproducido | El recibo y el texto para compartir dicen «turno de 10:27 a 10:28» o «sin apertura · cuenta desde las 05:00», y marcan el cierre «del día siguiente» si cruza medianoche | 3 pruebas unitarias |
| ENTREGA-01 | Reproducido, **más grave de lo reportado** | El pin sin ubicación guardada ya no se da por confirmado. Antes, sin moverlo, el checkout aceptaba enviar un domicilio a la puerta del propio restaurante (0.0 km) | Lectura del código; falta probar en teléfono |
| ALTA-01 | Reproducido | Las ventajas del registro salen del plan del enlace: Básico ya no promete pedidos con alerta y la «personalización completa» solo se anuncia en Premium, el único que la trae | En pantalla con `?plan=BASICO` |
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

Para confirmarlo: cambiar un precio en producción fuera de un despliegue y abrir los dos accesos a los 5 s y a los 70 s. Si se reproduce fuera de un despliegue, la causa es otra y hay que investigar más. Si solo ocurre durante despliegues, basta con decirlo al dueño en el guardado («puede tardar hasta un minuto en verse en todos lados») o mover la caché a un almacén compartido.

## Aportes que no estaban en la auditoría

1. **ENTREGA-01 era un riesgo de pedido, no de texto.** El mapa notificaba la posición inicial (el restaurante) como si fuera la del cliente: un domicilio podía salir con la dirección del local.
2. **Mostrador cobrado antes de preparar.** «Sin cobrar todavía» solo descontaba lo pagado de las mesas: en mostrador, que es el caso del piloto, un pedido para llevar ya cobrado que esperaba en cocina aparecía como pendiente y el cierre preguntaba por él.
3. **La «personalización total» del registro es de Premium.** No solo estaba mal en Básico: En línea y Estándar tampoco la traen (`hasFullTheme`).
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

## Pendiente antes del piloto

- **CARTA-01**: la prueba fuera de despliegue descrita arriba.
- **Teléfono físico**: ENTREGA-01 con permiso de ubicación aceptado y denegado, pin en el límite del radio y cambio entre recogida y domicilio; uso táctil de Salón, Caja y checkout.
- **Alta**: recorrer en pantalla la vista previa de Básico (sin carrito) y de Estándar (pedido de prueba) y el enlace a la demo del caso.
- **Caja Estándar activa**: el circuito completo de mostrador con un restaurante Estándar real, no el panel Premium.
- **Lo que la auditoría ya listaba**: alta desde cero con verificación de correo, cobro mixto, cancelación de línea y devolución, impresión con PC principal, operación sin internet, instalador de Escritorio firmado y permisos por rol.

## Datos ficticios que quedaron

- **Base local**: pedido `AUD-CAJA01-…` de Rincón 502 en la Mesa 9 con un cobro en efectivo de Q70, usado para comprobar Caja en vivo.
- **Producción**: sin cambios. El pedido #117, el corte de prueba de Rincón 502 y Café Cedro QA 2511 son de la auditoría externa.
