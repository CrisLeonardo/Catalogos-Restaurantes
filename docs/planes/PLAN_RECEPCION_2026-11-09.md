# Plan · Recepción: reservas, espera y salón (ficha 1.8) · 2026-11-09

Ficha **1.8** del [plan de la auditoría integral](PLAN_AUDITORIA_INTEGRAL_2026-11-04.md). Hallazgos: **R17, R18, O07, X13** (filtro real), **PA-T19** y **PA-T20**. Rama `feat/recepcion`, apilada sobre la 1.7 (`feat/permisos-por-trabajo`, PR #102).

> **Estado:** diagnóstico hecho; propuesta, decisiones y [maqueta](../diseno/MAQUETA_RECEPCION_2026-11-09.html) **aprobadas por el dueño (2026-11-09)**. **Implementada** en `feat/recepcion` (§6); pendientes en §7.

## 0. Base: la ficha 0.9 ya está incorporada

La ficha «depende de 0.9» (sentar desde espera o reserva sin estados partidos, PR #79), que no estaba en la cadena. Se fusionó en esta rama (`6b00f8e`). Sus conflictos se resolvieron con la versión de la cadena: la ficha **1.3** ya sienta al grupo y actualiza la reserva o la espera **en una sola transacción** (`leogin_sentar_desde_recepcion`, migración 173), más sólida que el orden desde la app que proponía 0.9. Las etiquetas de los formularios y el refresco tras cada acción de 0.9 se reaplican en este rediseño.

## 1. Diagnóstico (comprobado en código, datos locales y pantalla)

| # | Problema | Dónde | Hallazgo |
|---|---|---|---|
| 1 | **«Hoy» se calcula en UTC.** Después de las 18:00 en Guatemala, «hoy» ya es mañana: el resumen, la fecha por defecto de una reserva nueva y la «espera promedio hoy» cuentan el día equivocado. No usan la zona ni la hora de corte del local. | `reservaciones/page.tsx`, `db/reservaciones.ts`, `db/waitlist.ts`, `reservaciones-panel.tsx` | X13, PA-T19 |
| 2 | **«Hoy más temprano» no filtra por día**: muestra los últimos 30 grupos de cualquier fecha (hoy aparece uno del 25 de octubre). | `getRecentWaitlist`, `waitlist-panel.tsx` | X13, PA-T19 |
| 3 | **La cola mezcla días.** Un grupo que nunca se sentó ni se canceló sigue «esperando» para siempre: en local hay dos con **323 horas** de espera. | `getActiveWaitlist` | R18.5 |
| 4 | **Abrir WhatsApp cuenta como avisado.** Tocar «Avisar» abre `wa.me` y en el mismo clic marca al grupo «Avisado» en verde, aunque se cierre sin enviar. | `waitlist-panel.tsx` | R18.2, PA-T20 |
| 5 | **Reservas pasadas sin resolver desaparecen.** La página sólo pide desde «hoy»: una reserva confirmada de ayer que nunca llegó no queda como «no asistió», simplemente deja de verse (en local hay tres). No existe el estado «No asistió». | `reservaciones/page.tsx`, restricción de `reservations.status` | R17.3 |
| 6 | **Sin capacidad al reservar.** Se pueden agendar diez grupos de ocho a la misma hora; sólo se valida una mesa prevista contra otra reserva a la **misma hora exacta**, sin duración. | `createReservation`, `leogin_prever_mesa_de_reserva` | R17.1–2, R17.5, aceptación de R17 |
| 7 | **No hay agenda del turno**: una lista por día, sin ocupación prevista ni próximas llegadas. | `reservaciones-panel.tsx` | R17.1, O07 |
| 8 | **La espera no se estima** y la mesa no se sugiere: el host elige entre todas las mesas libres sin saber cuál conviene. | `waitlist-panel.tsx` | R18.3, R18.6 |
| 9 | **No se puede cambiar la hora** de una reserva: hay que cancelarla y crear otra. | — | R17.5 |
| 10 | Errores de lectura se muestran como lista vacía (`data ?? []`). | `db/reservaciones.ts`, `db/waitlist.ts` | (0.3, fuera de la cadena) |

## 2. Propuesta

**Un solo día de negocio** (zona y hora de corte del local, `lib/caja/dia.ts`) para todo lo que diga «hoy».

### Lista de espera

- **Aviso honesto (PA-T20).** «Abrir WhatsApp» sólo abre el chat y anota que se abrió; la fila dice «WhatsApp abierto · ¿se envió?» con **«Sí, le avisé»**. Sólo esa confirmación cuenta como avisado, y se dice «avisado por ti», nunca «entregado». Sin teléfono: «Avisé en persona».
- **Mesa sugerida.** La primera mesa libre con capacidad suficiente y el menor sobrante, con el porqué («la más justa para 4»). El host puede elegir otra.
- **Espera estimada como rango**, con evidencia: «15–25 min · según 6 grupos de hoy». Sin datos suficientes, no se inventa.
- **Cola sólo de hoy.** Los grupos de días anteriores pasan a «Por revisar» con «No llegó» o «Quitar»; no se borran solos.
- **Historial de hoy (PA-T19).** «Hoy» filtra de verdad; cada fila con su hora. Se añade **«No llegó»**.

### Reservas

- **Agenda del día** por franjas de una hora: personas previstas frente al aforo, llegadas próximas arriba y la ocupación en una barra.
- **Capacidad al reservar.** Duración por reserva (configurable; 90 min por defecto). Si en esa franja las personas superan el aforo del salón, el servidor lo rechaza con los números («quedan 6 lugares a las 20:00») y ofrece **«Reservar de todas formas»**, que queda en la bitácora.
- **Reservas sin resolver de días anteriores** en «Por revisar», con «Llegó», «No asistió» o «Cancelar». Nuevo estado **«No asistió»**.
- **Cambiar fecha u hora** con la misma comprobación de capacidad.
- Cada estado dice su efecto («Confirmar: aparta la mesa prevista», «No asistió: libera la mesa y queda en el historial del cliente»).

### Fuera de esta ficha

Recordatorios automáticos (requieren un canal de WhatsApp conectado, R17.4) · depósitos y políticas de tolerancia (R17.6) · mesas unidas y bloqueo manual de mesa (O07, ficha de salón) · seguimiento de la precisión de la estimación (R18.6, cuando haya datos).

## 3. Migración prevista (178)

- Estado `NO_SHOW` en `reservations` y en `waitlist_entries`.
- `waitlist_entries.aviso_abierto_at` (se abrió WhatsApp) y `notified_via` (`whatsapp_confirmado`, `en_persona`).
- `reservations.duracion_min` (por reserva) y `restaurants.duracion_reserva_min` (90 por defecto).
- Función de capacidad por franja con bloqueo por restaurante, para que dos reservas simultáneas no superen el aforo sin la autorización explícita.

## 4. Decisiones del dueño (2026-11-09)

1. **Duración por defecto: 90 minutos**, configurable por restaurante.
2. **Exceder el aforo se avisa y se permite** con «Reservar de todas formas», que queda en la bitácora con quién lo hizo.
3. **Maqueta aprobada.** Recepción mantiene sus dos rutas (Reservaciones y Lista de espera, bajo Clientes) y ambas se presentan como una sola pantalla con el selector de la maqueta.

**Aforo.** La capacidad de cada mesa vive en el plano del salón y muchas mesas no la tienen. El aforo es la suma de las plazas conocidas; las mesas sin plazas se cuentan de 4 y la pantalla lo dice. Sin mesas configuradas no se comprueba capacidad y se explica por qué.

## 5. Pruebas previstas

- Día de negocio: 23:59 y 00:30 (antes del corte de las 05:00) en Guatemala; historial de ayer con su fecha (PA-T19).
- Abrir WhatsApp sin confirmar no cambia el estado (PA-T20).
- Dos reservas simultáneas en Postgres no superan el aforo sin autorización.
- Reservas y grupos de días anteriores aparecen en «Por revisar»; «No asistió» libera la mesa prevista.
- Visual: 390, 768 y 1280 px, claro y oscuro, tras aprobar la maqueta.

## 6. Implementación

**Orden de despliegue: migración 178 ANTES del código, después de la 177.** Idempotente; huella en `verificar_migraciones.sql`.

| Pieza | Archivos |
|---|---|
| Migración | `178_recepcion_capacidad_y_aviso.sql`: estado `NO_SHOW` en reservas y espera; `aviso_abierto_at` y `notified_via`; `restaurants.duracion_reserva_min` (90); `leogin_ocupacion_reservas` y `leogin_guardar_reserva` (capacidad bajo bloqueo por restaurante, sobrecupo forzado en bitácora) |
| Día de negocio | `lib/recepcion/dia.ts` (zona, corte, minutos desde el inicio del día); también en los avisos de Hoy (`lib/db/hoy.ts`) |
| Cálculos | `lib/recepcion/agenda.ts`: aforo (mesas sin plazas se cuentan de 4), ocupación igual a la SQL, franjas, horas con lugar, mesa sugerida, rango de espera y estado del aviso |
| Consultas | `getReservasDeRecepcion` (día, próximas, por revisar) y `getEsperaDeRecepcion` (cola de hoy, por revisar, historial de hoy); un error de lectura ya no se pinta como vacío |
| Acciones | `lib/actions/reservaciones.ts` (crear y reprogramar con capacidad, transiciones permitidas, «no asistió», duración) y `lib/actions/waitlist.ts` (aviso abierto, confirmado o retirado, «no llegó»); ambas con la regla única de 1.7 (`lista_espera` o `mesas`) |
| Pantallas | `reservaciones-panel.tsx` y `waitlist-panel.tsx` con `recepcion.module.css`, según la maqueta |

**Diferencia con la maqueta:** el panel ya tiene las pestañas «Reservaciones» y «Lista de espera» en la fila de Clientes; no se repitió el selector interno para no mostrar dos navegaciones iguales.

**Verificación (local, 2026-11-09):** tipos y lint sin errores (tres avisos anteriores); 1,438 unitarias (12 nuevas de Recepción); 110 de Postgres (9 nuevas de la 178, incluida la de dos reservas simultáneas); auditorías de `security definer` y RLS con cero hallazgos. En el navegador, a las 00:38 con corte a las 5:00:
- «Hoy» es el domingo 8; la reserva de las 13:00 aparece en «Pasó su hora» y las de días anteriores en «Por revisar» (PA-T19).
- Abrir WhatsApp deja al grupo en `WAITING` y pregunta «¿Se envió?»; sólo «Sí, les avisé» lo marca avisado por WhatsApp (PA-T20).
- Sentar en la mesa sugerida abre su turno en la misma transacción y el grupo pasa al historial de hoy con su espera.
- Un grupo de 50 a las 20:00 muestra «Quedan 44 lugares», sugiere 21:00 y 19:00; forzarlo guarda y deja la bitácora; «No asistió» confirma y registra; cambiar hora lo mueve a «Próximos días».

## 7. Pendientes y límites

- **Validación de campo** con un host real: lectura de la agenda en tablet y uso del aviso por WhatsApp.
- **Reservas después de medianoche** (por ejemplo 00:30 con corte a las 5:00) se guardan con su fecha de calendario y no aparecen en la agenda del día de negocio anterior.
- Recordatorios automáticos, depósitos, mesas unidas y bloqueo manual de mesa siguen fuera (ver §2).
- La integración del resto de la ola 0 (0.1–0.13 salvo 0.9 y 0.12) sigue pendiente; 0.1 vuelve a tocar el historial de espera y chocará con este panel.
