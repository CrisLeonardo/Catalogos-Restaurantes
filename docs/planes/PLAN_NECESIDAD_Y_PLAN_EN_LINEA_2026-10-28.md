# Plan: funciones que crean una necesidad, plan «En línea» y «Paga tu plan» · 2026-10-28

**De dónde sale:** el 2026-10-28 el dueño preguntó dos cosas. Primero, si se puede agregar algo al sistema que haga **necesario** adquirirlo, que sea atractivo por lo útil, lo visual y lo cómodo, tanto para el restaurante como para sus clientes. Segundo, si conviene tocar los planes para cubrir mejor los distintos tipos de cliente, incluidos los que **solo venden en línea**. Este archivo junta la primera versión del plan (PR #58) con la propuesta que se le dio en el chat ese mismo día.

**Estado:** aprobado por el dueño el 2026-10-28, menos «Leo contesta tu WhatsApp», que queda **pendiente** (§1, N8). Cada fase lleva su propia rama y su PR.

**Decisiones del dueño (2026-10-28):**

- El plan para quien solo vende en línea cuesta **Q99**, no Q249. Casi siempre son negocios que van empezando, así que el plan baja «bastante» de precio y a cambio se limita (§2).
- Por ahora el cobro de Leogin sigue siendo por **transferencia**, pero se tiene que ver profesional. Hoy un dueño no sabe cómo pagar su plan, qué hacer ni dónde hacer clic (§3).
- Lo de WhatsApp espera.

**Tesis:** Leogin ya vende «control» y «se ve bonito». Falta lo que se nota en la cartera: que el dueño vea que **recupera o ahorra dinero**. Algo se vende solo cuando junta tres cosas: te trae dinero que se ve, te quita un trabajo que odias y tus clientes lo piden. Mientras no haya clientes, el cuello de botella sigue siendo vender (ver [`ANALISIS_NEGOCIO_2026-08-17.md`](../negocio/ANALISIS_NEGOCIO_2026-08-17.md)). Por eso va primero lo que **se puede enseñar en una visita de 90 segundos**.

**Reglas que no se rompen:**

- Superficies sólidas, nada translúcido.
- Solo se anima `transform` y `opacity`.
- Nada de datos inventados: los números salen de pedidos reales y, si hay poca historia, no se muestran.
- Leo nunca va dentro del menú de un restaurante.
- Pocas decisiones para el dueño (la auditoría de experiencia dijo que sobran).

---

## 1. Funciones que crean la necesidad

| # | Función | Necesidad que crea | Para el comensal | Esfuerzo |
|---|---|---|---|---|
| N1 | **«Lo que Leogin te dejó este mes»**: una pantalla y un aviso al mes con «Pagaste Q199. Leogin movió Q4,850». Suma, sin inventar: los pedidos que entraron solos por QR o en línea; lo que en una app al 25–30 % habrías pagado de comisión (porcentaje editable); los clientes que volvieron por un cupón o por sus puntos; las anulaciones frenadas con PIN; el stock que se avisó antes de acabarse. Encima va la **garantía**: «si en 90 días Leogin no te deja al menos 10 veces lo que pagas, el mes siguiente va por nuestra cuenta». Hace falta la calculadora en `/vende-en-linea` | Justifica la mensualidad cada mes y hace que cancelar se sienta como perder dinero. La garantía se puede comprobar porque el mismo contador lo demuestra | — | Medio. Se apoya en «Tu año» y en el resumen del día |
| N2 | **«Hazlo por mí»**: foto de la carta → menú listo (EV-07 de la auditoría de experiencia) | El menú ya está subido antes de que digan «no tengo tiempo». En la visita se arma en vivo | Menú completo desde el día 1 | Medio (visión con IA, centavos por uso) |
| N3 | **«Tus clientes que se fueron»**: el filtro de inactivos de 30 días ya existe en Clientes. Falta un toque que mande un WhatsApp listo (con cupón en Premium) y contar quién volvió. Lo que vuelve alimenta N1 | Recuperar dinero que hoy se pierde sin saberlo | Recibe un cupón en el momento justo | Medio |
| N4 | **Pago por transferencia con comprobante**: al pedir, el cliente sube la foto de su depósito y el dueño la ve junto al pedido, la confirma con un toque y la caja cuadra sola. Hoy la transferencia solo existe como forma de pago en caja | Es el hueco mayor de quien solo vende en línea: hoy persigue capturas en el chat | Pide y paga sin coordinar por chat | Medio. Reutiliza el bucket privado de «Paga tu plan» (§3) |
| N5 | **Resumen nocturno del dueño**: ventas, anulaciones, diferencia de caja y stock bajo, por push o correo | Es la promesa «bajo control» llevada al bolsillo, sobre todo para quien no está en el local | — | Medio (hoy el resumen solo sale al cerrar caja; no hay cron) |
| N6 | **Pedidos por encargo y preventa con cupo**: tamales del sábado, pasteles, almuerzos de la semana, la cena de Navidad. Hora de corte, cupo real («quedan 12 de 40») y anticipo por transferencia (N4) | Hoy se lleva en cuaderno y chat. Mensaje de temporada: **«Tu temporada de tamales sin cuaderno»**; hay que tenerlo a mediados de noviembre | Sabe que su pedido está apartado y cuándo pasar | Medio-alto |
| N7 | **Botón «Pedir en línea» en Google**: guía paso a paso para poner el enlace de Leogin en el perfil de Google del negocio | Visibilidad gratis donde la gente busca comida | Pide desde el buscador o el mapa | Bajo (guía y una pantalla en Ayuda) |
| N8 | **Leo contesta tu WhatsApp** — ⏸ **PENDIENTE** (decisión del 2026-10-28). Usa la conexión de WhatsApp Cloud API que ya existe y su ventana de 24 h. Responde «hola» o «¿qué tienen?» con el menú, el horario y el enlace para pedir, y «¿ya viene?» con el estado real del pedido. Al principio con botones y reglas, sin IA | «Tu WhatsApp contesta solo mientras cocinas» | Respuesta al instante | Alto. Necesita la verificación de Meta y confirmar sus tarifas |

Comodidades baratas para el comensal, que pueden ir sueltas:

- «Repetir mi último pedido» en un toque, apoyado en la billetera.
- Pedir reseña de Google cuando la encuesta sale de 5 estrellas.
- Tiempo estimado en el seguimiento del pedido.

**Fuera de esta tanda, pero anotada:** FEL (factura electrónica). Es la única necesidad **obligatoria por ley** y es donde Vendty gana hoy. Está apagada a propósito hasta elegir certificador. Es un trabajo grande y merece su propio plan.

**A confirmar antes de prometer N3:** si ya se guardan los teléfonos de los clientes de «para llevar» y «a domicilio». De eso depende cuánto cuesta.

## 2. Plan «En línea» a Q99

### Por qué

- Quien solo vende en línea cae hoy en **Estándar** (Q199 más Q300 de alta), que es mucho para alguien que va empezando. La otra opción es **Premium** (Q349), donde paga panel de mesero y salón que no usa.
- Pasar de gratis a Q99 es un paso chico. Cuando el negocio crece (más gente, local propio), el escalón siguiente es natural.

### Propuesta

| | Básico | **En línea (nuevo)** | Estándar | Premium |
|---|---|---|---|---|
| Precio | Gratis | **Q99/mes** | Q199/mes | Q349/mes |
| Alta | Q0 | **Q0** (a confirmar, §4) | Q300 | Q300 |
| Canales | Solo menú | **Para llevar + a domicilio** | 2 de 3 a elegir | Los 3 |
| Comer en local (QR de mesa con pedido) | No | **No** | Sí | Sí |
| Encargos y preventa (N6) | No | **Sí** | Sí | Sí |
| Transferencia con comprobante (N4) | No | **Sí** | Sí | Sí |
| Aviso por WhatsApp y pedidos en tiempo real | No | **Sí** | Sí | Sí |
| Repartidores | No | **Sí** | Sí | Sí |
| «Tus clientes que se fueron» (N3) | No | **Lista y mensaje** | Lista y mensaje | Con cupón |
| Finanzas y corte de caja | No | **No** (solo ventas del día) | Sí | Sí |
| Cupones y lealtad | No | **No** | No | Sí |
| Impresión de comandas | No | **No** | No | Sí |
| Personalización completa | No | **No** | No | Sí |
| Productos | 150 | **150** | Ilimitados | Ilimitados |
| Usuarios | 1 | **1** | 2 | Ilimitados |

**Mensaje:** «Vende en línea desde Q99. Sin comisión por pedido.»

**Por qué no le quita clientes a Estándar:** En línea no permite comer en local, así que un restaurante con mesas sigue necesitando Estándar o Premium. Y el emprendedor que crece encuentra en Estándar lo que le empieza a faltar: un segundo usuario, finanzas y productos sin tope.

**Escalera:** Básico (gratis) → En línea (Q99) → Estándar (Q199) → Premium (Q349).

### Lo que NO se hace

- No se vuelve a los módulos a la carta (decisión del 2026-08-21: planes fijos).
- No se pone tope de ventas ni de pedidos: Leogin no cobra por lo que vendes.
- La página `/vende-en-linea` deja de recomendar Estándar y pasa a En línea **en la misma fase** en que el plan existe en el código, ni antes ni después.

## 3. «Paga tu plan»: el cobro de Leogin, profesional y por transferencia

### Cómo está hoy

En «Mi suscripción», cuando hay algo pendiente, se ve el monto, un texto libre con las instrucciones (que se escribe en Super › Configuración › Soporte) y un botón que abre WhatsApp. No hay una cuenta que se pueda copiar, ni una referencia, ni dónde subir el comprobante, ni un estado «lo estamos revisando». Hoy no avisa nada que haya un pago pendiente. Para Leogin, cada pago es buscar la captura en el chat y marcar la factura a mano.

### Qué se construye

1. **Datos bancarios con forma**, en Super › Configuración › Soporte: banco, tipo de cuenta, número y a nombre de quién. El texto libre se queda para notas.
2. **«Paga tu mensualidad» en tres pasos**, en Mi suscripción:
   1. Transfiere el monto exacto a la cuenta, con botón de copiar para el número.
   2. Escribe tu **código de pago** (`LG-XXXXXX`, fijo por restaurante) en la descripción de la transferencia.
   3. Sube la foto o el PDF del comprobante, con el número de boleta si quieres.

   Después queda el estado **«Comprobante enviado · lo revisamos en menos de 24 horas»**. Si se rechaza, se ve el motivo y se puede volver a enviar. El WhatsApp queda como segunda opción.
3. **Aviso en Hoy** cuando hay un cobro pendiente («Tienes Q199 por pagar» → Pagar). Si está vencido, sale como urgente.
4. **Revisión en Super › Finanzas › Comprobantes:** foto, monto, código y boleta. «Aprobar» marca como pagadas las facturas que cubre (método Transferencia) y reactiva al restaurante si estaba suspendido. «Rechazar» pide un motivo.
5. Los comprobantes van en un **bucket privado** (`payment-proofs`): traen datos bancarios del cliente. Solo se leen con enlaces firmados de corta vida desde el super admin.

### Cómo quedó (2026-10-28, rama `feat/paga-tu-plan`)

- Migración `148_comprobantes_de_pago.sql`: tabla `payment_proofs` y bucket privado `payment-proofs`. Se aplica **antes** de desplegar. Sin ella, Mi suscripción sigue enseñando cómo pagar y avisa que el comprobante va por WhatsApp.
- El dueño sube el archivo directo al bucket con una URL firmada, así que no pasa por el límite de 1 MB de las server actions. Las fotos se comprimen en el navegador antes de subir.
- Código de pago: `LG-` + los seis primeros caracteres del id del restaurante (`lib/pago-plan.ts`).
- Al subir un comprobante se manda un correo a soporte (si Resend está configurado). Aprobar y rechazar quedan en la bitácora del super admin (`cobro.aprobar` y `cobro.rechazar`).
- **Probado en local** del lado del dueño: los tres pasos, la subida real al bucket, «en revisión», «rechazado» con su motivo, el aviso en Hoy y «al día».
- **Sin probar en pantalla:** la bandeja Super › Finanzas › Comprobantes y el formulario de la cuenta. El super admin local pide verificación en dos pasos. Hay que revisarlos en producción después de desplegar.
- Trampa del entorno local: el Storage local fallaba en **toda** subida (`42P10`, le faltaba un índice con `COLLATE "C"` en `storage.objects`). Se arregló creando el índice a mano en la base local; en la nube no pasa.

### Lo que queda para después

- **Cambiar de plan desde el panel** (hoy «Actualizar a…» abre WhatsApp): elegir el plan, ver el prorrateo y que la factura nazca sola. Va junto con la fase del plan En línea.
- Pasarela de pago con tarjeta: cuando haya clientes que la pidan.

## 4. Fases

| Fase | Contenido | Rama | Casilla |
|---|---|---|---|
| 1 | **Paga tu plan** (§3). Migración 148 | `feat/paga-tu-plan` | [x] 2026-10-28 (falta probar en producción la bandeja del super, ver §3) |
| 2 | N4 transferencia con comprobante del comensal + N6 encargos y preventa (para la temporada de diciembre). Migración 149 | `feat/encargos-y-transferencia` | [x] 2026-10-28 (ver §4 bis) |
| 3 | Plan «En línea» Q99: `plans.ts` + migración que reconcilia `platform_settings` y las funciones de cobro (`leogin_compute_monthly_fee`, `leogin_fee_breakdown`) + `/planes`, registro, `/vende-en-linea` y cambio de plan desde el panel | `feat/plan-en-linea` | [ ] |
| 4 | Dejar al día `PRECIOS_VIGENTES.md`, `Cotizador.xlsx` y el `.docx` de planes. Siguen hablando de módulos a la carta y del «Plan a tu medida», que el código quitó el 2026-08-21; además hay que sumar En línea. Decidir el Panel de grupo (Q299) | `docs/precios-al-dia` | [ ] |
| 5 | N1 «Lo que Leogin te dejó» + garantía + calculadora en `/vende-en-linea` | `feat/lo-que-te-dejo` | [ ] |
| 6 | N3 «Tus clientes que se fueron» (primero confirmar los datos de teléfono) | `feat/clientes-que-se-fueron` | [ ] |
| 7 | N2 «Hazlo por mí» | `feat/hazlo-por-mi-menu` | [ ] |
| 8 | N5 resumen nocturno | `feat/resumen-nocturno` | [ ] |
| 9 | N7 guía «Pedir en línea» en Google | `docs/guia-google-pedir` | [ ] |
| — | N8 Leo contesta tu WhatsApp | — | ⏸ pendiente |

Cada fase con migración dice en su PR en qué orden se aplica respecto al despliegue.

### §4 bis · Cómo quedó la fase 2 (2026-10-28, rama `feat/encargos-y-transferencia`)

- **Migración 149** (después de la 148, antes del código):
  - tabla `encargo_fechas`;
  - en `orders`, las columnas `encargo_id`, `transfer_status` y `transfer_proof_path`;
  - la función `leogin_archive_abandoned_delivery_orders` redefinida. **Trampa:** la de la 099 cancelaba a las 6 horas todo pedido para llevar o a domicilio, encargos incluidos. Ahora un encargo se archiva solo un día después de su fecha de entrega. Probado en local en los dos sentidos.
- **Encargos.** Se crean en **Pedidos › Encargos** con nombre, día de entrega, horario, hasta cuándo se reciben, cupo de pedidos y, si se quiere, pago por adelantado.
  - En el menú, una franja arriba enseña «Quedan N», la hora de cierre y el botón «Encargar para este día». Los números se piden al abrir el menú, porque la página está en caché.
  - El carrito manda `?encargo=` al checkout, que abre aunque el local esté cerrado y quita «comer aquí».
  - El encargo va en las notas del pedido, así que sale en la tarjeta del panel y en la comanda impresa.
  - El cupo se cuenta con pedidos reales no anulados. Si dos personas piden el último lugar a la vez, se resuelve **después** de crear el pedido (`entroEnElCupo`): el que queda fuera se anula y se le repone el stock.
- **Transferencia del comensal.** Se activa en **Ajustes › Pedidos y cobro** con la cuenta del restaurante, que se guarda en el tema porque el comensal la necesita para transferir.
  - El comensal elige «Transferencia» y en el seguimiento ve la cuenta y sube su comprobante al bucket privado (`pedidos/{restaurant_id}/`).
  - En el panel, la tarjeta del pedido tiene «Ver comprobante», «Confirmar pago» y «No llegó».
  - Con el pago enviado o confirmado, el comensal ya no puede cancelar desde el seguimiento.
- **Probado en local, en pantalla:** activar la transferencia, crear la tanda, la franja en el teléfono, el carrito, el checkout con pago adelantado, la confirmación con «Entrega», la subida del comprobante, confirmarlo en el panel, la tanda llena («Agotado») y el archivado automático.
- **Para después:**
  - cupo por unidades (hoy es por pedidos);
  - anticipo parcial (hoy es todo o nada);
  - limitar una tanda a ciertos platillos;
  - que el pedido de encargo no entre a «Por enviar a cocina» hasta el día de la entrega.

## 5. Decisiones que le tocan al dueño

- [x] Precio de «En línea»: **Q99** (2026-10-28).
- [ ] ¿Se cobra alta en «En línea»? La propuesta es **Q0**, porque son negocios que van empezando.
- [ ] Texto final de la garantía de N1 y desde cuándo corre.
- [ ] ¿Qué se hace con el Panel de grupo a Q299, que cuesta más que Estándar completo?
- [ ] ¿FEL entra en el siguiente plan grande?

## 6. Cierre

Al terminar cada fase: casilla marcada y commit de cierre anotado en este mismo archivo. Al completar todo, mover con `git mv` a `docs/archivo/planes-cerrados/` y pasar lo pendiente a `docs/registros/CHECKLIST_CORRECCIONES.md`.
