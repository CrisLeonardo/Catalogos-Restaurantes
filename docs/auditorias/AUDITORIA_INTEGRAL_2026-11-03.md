# Leogin: auditoría integral y plan de excelencia

> **Copia archivada en el repositorio el 2026-11-04.** Texto sin cambios salvo los enlaces entre documentos. Las capturas `evidencias-v2/` (88 imágenes, 7,8 MB) no se suben al repo: quedan en la carpeta original de la entrega (`.codex/visualizations/2026/11/02/01a19d6f-…/evidencias-v2/`), por eso sus enlaces no abren desde aquí. El trabajo derivado se organiza en [PLAN_AUDITORIA_INTEGRAL_2026-11-04](../planes/PLAN_AUDITORIA_INTEGRAL_2026-11-04.md).

**Informe maestro · inspección del 2–3 de noviembre de 2026 · consolidación del 4 de noviembre · revisión del código 876dd50 · v0.17.0 documentada.**

**Empieza por la ampliación [Auditoría por apartado del restaurante](AUDITORIA_POR_APARTADO_2026-11-03.md).** Contiene el inventario de 40 apartados, 23 hallazgos adicionales X01–X23, criterios de aceptación por módulo y 30 escenarios adicionales de validación. Corrige la profundidad desigual de esta primera ampliación, que dedicaba más espacio a caja y cobro. Ambos documentos forman la entrega; el complemento prevalece cuando refina una afirmación anterior.

La cobertura ahora incluye categorías, ficha y opciones, tres vistas de lealtad, cupones, encuestas, lista de espera, horarios, salón, entrega, reglas, cinco pestañas de personalización, QR, PC, módulos, respaldo, ayuda, analítica, resumen anual, repartidores y Mi cuenta. Proveedores y FEL se distinguen expresamente como revisión de código y acceso condicionado, sin afirmar prueba de operación activa.

Este informe amplía y sustituye las conclusiones de alcance de la primera entrega. Ahora incluye inspección autenticada de restaurante y superadmin, escritorio y móvil, además de un recorrido completo de pedido, cocina, dos pagos y cierre en una copia aislada. No es una certificación de todas las combinaciones posibles ni una prueba de producción bajo carga.

**No se cambió el producto original.** Para resolver la falta de autenticador local, y con tu autorización de crear una demo, se copiaron en frío los datos locales a contenedores y volúmenes independientes. Se crearon dos identidades sintéticas propias y se conservó la protección MFA del superadmin. Las operaciones de prueba solo afectaron esa copia. No hubo pagos, mensajes ni pedidos a restaurantes reales.

## 1. Opinión sincera: dónde está el producto

**Leogin tiene más capacidad funcional que madurez de experiencia.** No lo veo como una idea con unas cuantas pantallas. Hay un producto considerable: venta, servicio, cocina, cobros parciales, caja, costos, personal, clientes y operación del SaaS. El recorrido de Q70 que probé terminó correctamente, con pagos de Q52 y Q18 y caja cuadrada. Eso importa y debe conservarse.

Pero tampoco veo todavía una experiencia que comunique excelencia de forma consistente. La sensación de calidad se rompe en detalles pequeños y en contratos importantes: un paso sin contar aparece con un visto bueno; una división de cuenta no hace lo que su nombre sugiere; distintos textos explican de manera incompatible el mismo plan; el dueño puede ver formularios y ceros antes de entender qué hacer; una alerta de plataforma puede confundirse con ausencia de información.

**El diseño actual es reconocible y tiene trabajo, pero no es todavía una razón suficiente para elegir Leogin.** Naranja, tarjetas redondeadas, sombras y tipografía distintiva dan identidad; repetidos en casi todas las situaciones, no crean por sí mismos una herramienta extraordinaria. Una pantalla de cocina, una carta y un cierre necesitan ritmos distintos. Hoy las convenciones visuales a veces pesan más que la tarea.

Mi recomendación comercial es **pilotos acompañados y un segmento inicial concreto**, mientras se cierran las brechas críticas. No recomendaría prometer operación autónoma masiva basándome en esta auditoría. No medí retención, soporte real, incidentes, conversión ni disposición a pagar. Una puntuación como “8/10” sería una precisión inventada; prefiero el diagnóstico por capacidad:

| Dimensión | Juicio actual | Qué falta demostrar |
|---|---|---|
| Amplitud funcional | Alta para un producto en esta etapa | Que las piezas mantengan reglas y datos coherentes entre sí |
| Identidad | Reconocible, con margen grande de refinamiento | Personalidad propia que sobreviva sin efectos decorativos |
| Operación de un caso normal | El caso probado funcionó de punta a punta | Concurrencia, interrupciones, correcciones y carga real |
| Claridad comercial | Inconsistente en planes, alcance y contacto | Una explicación única que coincida con lo que se entrega |
| Aprendizaje | Hay ayuda, atajos y modo aprendiz | Que personas nuevas completen tareas sin explicación tuya |
| Superadmin | Muchas capacidades y resguardos existentes | Prioridad, trazabilidad, métricas completas y trabajo gestionable |
| Capacidad de venderse con poca asistencia | Posible, todavía no demostrada | Demo persuasiva, arranque fácil, valor recurrente y prueba social real |

La ambición correcta es que el restaurante **quiera quedarse por el beneficio**, no que dependa porque sacar sus datos sea difícil. Portabilidad clara, historial confiable y salida sencilla también venden confianza.

## 2. Qué se revisó, con qué evidencia y qué no se puede afirmar

### Etiquetas y prioridades

- **V:** comportamiento observado en navegador. **C:** código leído. **P:** propuesta de mejora. **H:** hipótesis o riesgo que requiere prueba adicional.
- **P0:** resolver o validar antes de ampliar comercialización; incluye dinero, verdad de datos y acceso. No significa automáticamente incidente de seguridad.
- **P1:** primera ola de excelencia y pilotos. **P2:** crecimiento y diferenciación después de una base confiable.
- Tamaños **S/M/L/XL** son comparativos, no fechas comprometidas. Equipo, integraciones y migraciones determinan duración.

### Cobertura efectiva

| Superficie | Inspección realizada | Límite |
|---|---|---|
| Web comercial pública | Portada, planes, FAQ, acceso, contacto, demo y presentación móvil | No se midió conversión ni tráfico real |
| Comensal | Carta, ficha con extra, carrito, demo de envío/seguimiento y modal de lealtad local | La demo pública simula eventos; no prueba backend de producción ni pago externo |
| Restaurante vacío | Hoy, menú, alta de platillo, pedidos, cocina, métricas, caja, ajustes y personal | Los ceros eran datos de prueba, no un fallo en sí |
| Restaurante con datos | Mesas, servicio, pago parcial, cocina, clientes, reserva nueva, inventario, ingredientes, suscripción y caja | No todos los formularios fueron guardados ni todas las variantes recorridas |
| Superadmin autenticado | Directorio, inicio, ficha, plan, cobro, accesos, avanzado, cuentas, rescate, finanzas y cobranza | No se ejecutaron suspensiones, borrados, cambios de precios ni rescates de usuarios originales |
| Móvil | Comensal a 375/390 px; servicio y cobro a 390 × 844 | No equivale a probar Safari/iPhone real, lector de pantalla o teclado virtual |
| Técnica | Lógica crítica, permisos, consultas, migraciones y pruebas existentes; compilación y tipos | No es pentest, prueba de carga, restauración completa ni auditoría fiscal |

Se reunieron **88 capturas numeradas** entre ambas pasadas. Las 14 y 31 no sustentan hallazgos: contienen, respectivamente, una transición de viewport y una pantalla de acceso al expirar sesión. La 83 contiene una transición de cifras animadas y no se usa como evidencia de un defecto tipográfico. El nombre de algunas capturas tempranas describe la intención de navegación, no exactamente el contenido; los índices de este informe y del complemento son la referencia.

Validación técnica ya realizada: TypeScript sin emitir archivos y compilación de producción satisfactorios. Cuatro suites enfocadas, **74 pruebas**, pasaron: libro de caja, guardia de tenant, salud de clientes y clasificación de cuentas. Son pruebas unitarias; no demuestran el circuito completo bajo concurrencia.

### La prueba funcional que sí se completó

1. En la copia aislada se tomó Mesa 1 y se añadieron Rincón Clásica Q52 y Limonada con Menta Q18.
2. Se enviaron a cocina: orden ficticia #116, total Q70.
3. “Partes iguales” mostró Q35 por persona, manteniendo el cobro completo. No se ejecutó ese cobro.
4. “Por platos” permitió cobrar Q52; la mesa quedó abierta con Q18 pendientes.
5. Cocina mostró los dos productos; “Marcar listo” retiró la comanda de pendientes.
6. En móvil se cobró el saldo Q18 con recibido Q50; la interfaz calculó Q32 de vuelto. La mesa quedó libre.
7. Caja informó Q70 cobrados. Se abrió un turno de prueba con fondo cero, se contaron Q50 + Q20 y se cerró cuadrado.
8. Tras recargar, el corte seguía guardado y el nuevo período mostraba Q0; no volvió a incluir los Q70.

Esto confirma el caso normal descrito. **No prueba** pagos simultáneos, mezcla de métodos, redondeos en grupos impares, devoluciones, duplicación de solicitudes ni recuperación tras desconexión.

## 3. Los hallazgos que cambian la prioridad

| ID | Hecho y certeza | Por qué importa | Acción |
|---|---|---|---|
| N01 · P0 · V/C | Superadmin dice que apagar un canal Premium descuenta Q50; la misma configuración y la suscripción explican precio fijo | El dueño y tú pueden entender importes distintos | Un contrato único de planes, modalidades, excepciones y precios; generar textos desde él |
| N02 · P1 · V/C | “Partes iguales” muestra reparto, pero el botón cobra todo | La persona puede creer que registra un pago parcial | Convertir cada parte en saldo cobrable con método propio; mientras tanto, nombrarlo calculadora |
| N03 · P1 · V | En móvil, tras cobrar Q52, el resumen inferior conserva Q70; el saldo Q18 aparece al abrir cobro | Obliga a interpretar qué cifra es consumo y cuál falta | Resumen “Consumo Q70 · pagado Q52 · por cobrar Q18”; prominencia al pendiente |
| N04 · P1 · V | Postres aparecen antes de los controles de cobro, incluso con una parte ya pagada | Interrumpe una tarea de precisión | Sugerir durante pedido o antes de pedir cuenta; cobro dedicado a pagar/corregir |
| N05 · P1 · V/C | Caja puede mostrar “✓ Efectivo sin contar”; con esperado cero permite llegar a cierre sin apertura | El indicador de terminado no equivale a validado | Separar visitado, contado y confirmado; decidir explícitamente política de cierre vacío |
| N06 · P1 · V | Justo después de cerrar, “Cortes recientes” decía que no había arqueos; al recargar apareció | Hace dudar si el dinero quedó registrado | Actualizar historial al éxito y mantener el recibo del cierre como estado persistente |
| N07 · P1 · V | Apertura tardía 10:48: resumen abarca desde 05:00, historial muestra 10:48–10:48 | Apertura física y período financiero son conceptos distintos | Mostrar ambas horas y explicar cobros anteriores incluidos; no comprimirlas en una etiqueta |
| N08 · P1 · V | Los populares de servicio cambiaron posiciones 5 y 6 después de la venta; atajos dependen de posición | La memoria muscular puede agregar el producto equivocado | Favoritos estables por puesto/turno; recalcular fuera de la toma activa |
| N09 · P1 · V | A 1280 px, seis KPI del inicio y ficha superadmin forman cinco arriba y uno solo abajo | Jerarquía desequilibrada y altura innecesaria antes de alertas | Retícula 3×2, cuatro cifras prioritarias o resumen compacto según contexto |
| N10 · P1 · V | Servicio en escritorio combina sidebar global, salón, catálogo y comanda, además de dos búsquedas | La navegación consume anchura de la tarea | Modo de trabajo explícito, shell reducido y búsqueda contextual inequívoca |
| N11 · P1 · V | Modal de lealtad con texto muy claro sobre tarjeta clara en el tema oscuro local | Legibilidad insuficiente en esa combinación | Tokens de superficie/texto coherentes por modal; validar contraste compositado |
| N12 · P0 · C/H | Error genérico en salud de clientes devuelve listas vacías y faltaMigracion=false | Puede presentar ausencia de información como tranquilidad | Estado de carga fiable: correcto/vacío/error/parcial/desactualizado |
| N13 · P0 · C/H | Errores de comprobantes pueden devolver items vacíos, disponible=true y contador cero | Una bandeja pendiente puede parecer resuelta | Error explícito y fecha de último dato válido; bloquear conclusiones financieras sin datos |
| N14 · P1 · V/C | Selección de sucursal local mediante /panel/slug redirigió a Mi cuenta; con perfil legado y /admin fue accesible | Riesgo en el modelo de acceso que usa el alta moderna | Reproducir con membresía sin restaurant_id; comprobar preservación del tenant en rewrite |
| N15 · P1 · V | Hoy de Estándar decía “solo para llevar”; plan actual explica elegir dos modalidades | Se confunde restricción comercial con configuración activa | Texto basado en permisos efectivos, no nombre histórico del plan |
| N16 · P1 · V/C | Primeros pasos reconoce QR por visitas aunque no haya carta útil; con datos sigue priorizando marca pendiente | Progreso de configuración no demuestra activación | Hitos por resultado: carta útil, pedido de prueba, puesto listo y primer turno |
| N17 · P1 · V | Alta de platillo repite título y muestra inglés aunque la traducción global esté apagada; etiquetas como Vegano/Picante se repiten en grupos | Aumenta trabajo e incertidumbre al crear catálogo | Un formulario progresivo con semántica única para etiquetas y dietas |
| N18 · P1 · V | Permisos de personal: 24 chips sin agrupación clara; instrucciones pueden mencionar controles ocultos por plan | Configurar al equipo exige conocer la arquitectura | Presets por trabajo, grupos de permisos y vista de alcance efectivo |
| N19 · P1 · V | “Agregar acceso” de superadmin parte de Dueño; mezcla cuentas actuales y vía de contraseña/usuario legado | Alta autoridad por defecto y dos modelos mentales | Selección explícita de rol, local y consecuencias; transferencia de propiedad separada |
| N20 · P1 · V | Inventario con 38 productos sin control muestra 0 bajo/0 agotados; no se vio buscador ni activación masiva | Cero puede parecer cobertura completa; configurar uno a uno escala mal | “0 de 38 controlados”, buscador, filtro y asistente de carga inicial |
| N21 · P1 · V | Cliente con cero pedidos aparece como “Primera vez” y fecha bajo “Último” | Registro no equivale a visita o consumo | “Registrado, sin compra”; separar alta, última compra y visita si se mide |
| N22 · P1 · V/C | En nueva reserva, campos de nombre/teléfono/fecha carecían de nombre en AX; guardar y sentar son operaciones separadas en servidor | Accesibilidad y posible estado parcial de reserva/mesa | Etiquetas asociadas y transición atómica; probar fallo entre operaciones |
| N23 · P2 · V | Suscripción anuncia siete funciones y enumera ocho | Pequeña incoherencia visible en el momento de pagar | Derivar contador del mismo conjunto mostrado |
| N24 · P1 · V | En cobranza, suspender está muy próximo a la lista de morosos; se explica que pausa menú | Una decisión comercial puede interrumpir un servicio | Flujo con impacto concreto, período y alternativa; política gradual explícita |
| N25 · P1 · V/C | Directorios y agregaciones pueden depender de lecturas completas o límites de filas; API local limita 1000 | Un límite cliente grande no garantiza todos los datos | Paginación, agregación en DB, pruebas sobre límites y conteos reconciliados |

N14 es un fallo observado **en el entorno local**. No se afirma que ocurra en producción ni que su causa exacta esté resuelta. N12, N13, N22 y N25 señalan rutas de riesgo leídas; no se provocaron incidentes en producción.

### Evidencia visual seleccionada

| Evidencia | Qué permite revisar |
|---|---|
| [Alta de platillo](evidencias-v2/02-nuevo-platillo.jpg) | Duplicación de título, densidad y grupos de opciones |
| [Caja antes de abrir](evidencias-v2/08-caja-final-sin-abrir.jpg) | Pasos marcados y ausencia de conteo |
| [Permisos](evidencias-v2/12-permisos.jpg) | Agrupación, lectura y alcance |
| [Lealtad](evidencias-v2/19-lealtad-contraste.jpg) | Combinación de texto y superficie |
| [Inicio superadmin](evidencias-v2/21-super-dashboard.jpg) | Retícula de KPI y cola de alertas |
| [Plan superadmin](evidencias-v2/23-super-plan.jpg) | Explicaciones de precio incompatibles |
| [Rescate de cuenta](evidencias-v2/28-super-rescate.jpg) | Resguardos que deben conservarse y densidad de acciones |
| [Servicio](evidencias-v2/33-servicio.jpg) | Reparto de anchura y navegación |
| [Partes iguales](evidencias-v2/36-partes-iguales.jpg) | Reparto mostrado y botón de cobro total |
| [Pago parcial](evidencias-v2/37-pago-parcial.jpg) | Q52 cobrados y saldo Q18 |
| [Servicio móvil](evidencias-v2/45-servicio-movil-saldo.jpg) | Q70 como cifra dominante tras pago parcial |
| [Cobro móvil](evidencias-v2/46-cobro-movil.jpg) | Saldo correcto, postres y orden de controles |
| [Cierre de prueba](evidencias-v2/49-cierre-demo.jpg) | Caja cuadrada e historial aún vacío en ese instante |
| [Cierre persistido](evidencias-v2/50-cierre-persistido.jpg) | Corte guardado y período siguiente sin duplicar Q70 |

## 4. Qué significa “perfecto” en cada capacidad

No aceptaría “el botón funciona” como definición de terminado. Para cada recorrido se exigen nueve cosas: resultado correcto; intención clara; rapidez; estados coherentes; adaptación al dispositivo; permisos; recuperación; trazabilidad; evidencia de uso por personas nuevas. No todos los módulos necesitan la misma sofisticación, pero ninguno debe mentir sobre su estado.

### 4.1 Web que convierta una necesidad en una prueba

**Problema comercial:** se comunica una plataforma amplia con un CTA de menú gratis, una portada larga y explicaciones de planes inconsistentes. La demo existe y es un activo importante; debe convertirse en el centro de una prueba comprensible.

**Estructura propuesta de portada:**

1. Titular concreto: “Tu salón, cocina y caja trabajando juntos”. Subtítulo con beneficio verificable: pedidos claros, cuentas trazables y una visión del turno. Evitar cifras de ahorro no medidas.
2. CTA principal “Probar un turno”; secundario “Crear mi restaurante”. Si la segunda ruta inicia solo menú gratuito, decirlo junto al botón.
3. Demostración de 60–90 segundos controlable: tomar un pedido, verlo en cocina, cobrar y ver el cierre. Marcar siempre “Demostración · datos ficticios”. Permitir explorar sin entregar teléfono.
4. Tres situaciones, no doce bloques de funciones: “Se llenó el salón”, “Llegó la hora de cobrar”, “Quiero saber qué dejó el día”. Cada una enseña una pantalla y un resultado.
5. Prueba social real con contexto del restaurante y permiso. Hasta tenerla, usar demostraciones verificables y no testimonios fabricados.
6. Planes con diferencias por trabajo, precio fijo visible y restricciones comprensibles. Mantener la comparación exhaustiva en un nivel posterior.
7. Implementación: qué necesita el restaurante, qué puede probar hoy, hardware compatible comprobado y cómo migrar.
8. Preguntas de compra: conexión, impresoras, soporte, datos, cancelación y cambio de plan. Respuestas compatibles con el comportamiento actual.

**Detalle visual:** un hero con composición propia inspirada en comanda, sin acumular halos, tarjetas flotantes y capturas ilegibles. Títulos con máximo dos/tres líneas según dispositivo; un importe que no se parta del símbolo; CTAs con igual altura; microtexto debajo, no dentro de la acción. La identidad del restaurante en capturas debe parecer un negocio coherente, no una colección aleatoria de plantillas.

**Aceptación:** ocho de diez prospectos del segmento explican qué problema resuelve tras la demo; encuentran precio y limitaciones sin ayuda; la ruta móvil no obliga a recorrer toda la portada para probar. Medir abandono y activación por ruta, sin asumir que reducir longitud siempre mejora ventas.

### 4.2 Arranque: del registro a un turno útil

La primera victoria debe ser “ya puedo trabajar”, no “terminé muchas opciones”. Ofrecer dos rutas: usar una carta pequeña de prueba o importar la propia. La prueba nunca contamina ventas reales.

**Secuencia:** nombre/local → modalidad inicial → tres platillos o importación revisada → vista de comensal → pedido de prueba → cocina → cobro → checklist del aparato. Logo, colores avanzados, dominio y campañas pueden esperar. Mostrar requisitos que sí bloquean la modalidad, como zona de entrega; no pedir dirección de entrega para comer en local.

El checklist cambia según estado: negocio nuevo, carta publicada sin pedidos, primer turno, operación recurrente. Cada paso tiene evidencia y salida directa. “Compartir QR” no se completa por una visita anónima. Un negocio con ventas no debe seguir recibiendo una enorme tarea de marca antes de una incidencia de servicio.

**Importación:** foto/PDF/hoja → extracción a borrador → filas con confianza y problemas → categorías/precios/opciones → vista comparativa → publicar solo selección validada. No inventar alérgenos ni precios ilegibles. Repetir una importación debe detectar posibles duplicados y ofrecer actualización con vista previa, no duplicar toda la carta.

**Aceptación:** restaurante de carta pequeña llega a primer pedido de prueba en una meta inicial de 15 minutos, medida y no publicitada como garantía. Al regresar al día siguiente entiende el siguiente paso. La ayuda contextual reduce solicitudes de soporte, no solo visitas a la documentación.

### 4.3 Hoy del dueño: decisiones y evidencia

Diseñar tres versiones: nuevo, operando y fuera de horario. En operación, primera zona con máximo tres excepciones accionables; después cobrado, pendiente y caja; después servicio. Cada cifra lleva período y definición. No usar “ventas” indistintamente para pedidos creados y dinero recibido.

Ejemplo: “2 pedidos esperando aceptación · hace 6 min” abre esos pedidos; “Impresora sin confirmar” muestra la cola; “Caja sin apertura · Q70 ya cobrados” ofrece regularizar con explicación. Las alertas desaparecen por resolución real y dejan historial, no porque se ocultó una tarjeta.

Para datos vacíos, mostrar una próxima acción útil. Para error, “No pudimos consultar los cobros · último dato 10:40 · Reintentar”. Nunca sustituirlo por Q0 o “todo bien”. Para análisis, indicar cobertura: ventas online frente a todas, productos con costo frente al total.

**Aceptación:** el dueño identifica en cinco segundos qué requiere acción y distingue cobrado, pendiente y estimado en una prueba de comprensión. Las métricas se reconcilian con el detalle del mismo período y zona horaria.

### 4.4 Servicio y salón: precisión bajo presión

Conservar tres regiones de trabajo en escritorio cuando caben realmente: mesas/canales, catálogo y comanda. Reducir shell global al entrar a “Modo servicio”, con salida visible. Probar desde 1024 px; no imponer tres columnas a costa de truncar todo. En móvil: salón → mesa → carta/comanda, con regreso que conserva búsqueda y posición.

Favoritos configurables por puesto y atajos estables durante el turno. “Más pedidos” puede sugerir, pero no cambiar lo que significa la tecla 5 mientras trabajan. El producto debe tener acción rápida y opción clara para variantes/notas; evitar controles interactivos anidados sin semántica accesible.

**Modelo de estados:** libre, sentada sin pedido, pedido en borrador, enviado, en cocina, listo, servido, cuenta solicitada, pagada y pendiente de liberar/limpiar cuando aplique. Los estados financieros y de preparación deben ser independientes: pagar antes de comer es válido; pagar no prueba que se sirvió.

“Servido” como botón se convierte en “Marcar servido”; el estado usa “Servido”. El servidor confirma envío con número y hora; mientras tanto, “Enviando” y reintento conservan la misma operación. Si falla, no mostrar mesa libre como si nada hubiera ocurrido.

**Aceptación:** un mesero nuevo toma cinco pedidos con variantes/notas y cambia entre mesas sin perder borradores; uno experto opera con teclado; dos aparatos que editan la misma mesa ven conflictos explicados, no un último guardado silencioso.

### 4.5 Cobro: precisión y claridad al terminar la cuenta

**Orden visual propuesto:** mesa → saldo pendiente → consumo/ajustes/cobros previos → modo de división → importe y método → recibido/vuelto → confirmación. Acción fija “Registrar Q…”. Sin venta adicional dentro del momento de confirmar dinero.

Modalidades: cuenta completa; por platos/cantidades; partes iguales persistentes; importe libre. Pago mixto se registra como movimientos separados dentro de una operación o como pagos sucesivos visibles. Mostrar quién pagó no exige identificar a todos los comensales.

Partes iguales de Q100 entre tres: Q33.34 + Q33.33 + Q33.33, con regla explícita y saldo exacto. Si alguien paga distinto, recalcular el restante sin reescribir lo ya cobrado. Una persona puede pagar dos partes; un plato de cantidad tres puede repartirse. Descuento y propina se asignan con una política consistente y centavos conservados.

Efectivo: mantener denominaciones rápidas y añadir monto recibido libre con teclado numérico. El vuelto es ayuda; guardar qué se recibió y entregó cuando la política lo requiera. Registrar tarjeta no significa que Leogin haya confirmado una transacción bancaria: distinguir registro manual e integración confirmada. La transferencia que usa un cajero es distinta de la función retirada del comensal.

**Pago y mesa:** tras saldo cero ofrecer “Cerrar cuenta y liberar mesa” o “Cuenta pagada · mantener mesa ocupada”, según operación. El pago no borra pendientes de cocina. El usuario ve recibos y correcciones, nunca una edición silenciosa del pasado.

**Aceptación:** cuenta Q200 pagada Q80 tarjeta + Q50 efectivo + Q70 tarjeta termina saldo cero; duplicar el mismo envío no duplica dinero; Q100/3 conserva centavos; devolución parcial no reabre platos erróneos; móvil muestra pendiente antes de abrir el diálogo. Matriz completa en sección 8.

### 4.6 Caja: convertir un formulario en control real del turno

Separar apertura, turno activo, conteo en borrador, cierre y corrección posterior. La pantalla inicial no se titula “Cierre” cuando la tarea disponible es abrir. Definir explícitamente si se permite cobrar sin apertura: si sí, llevar movimientos a un período provisional identificado y guiar su regularización. No esconder la regla.

Apertura muestra fondo, responsable, aparato/caja y hora. Cierre muestra período financiero y apertura física por separado. Conteo puede ser por denominación o total autorizado; cero contado es un dato válido distinto de no contado. Guardar borrador automáticamente con indicador de persistencia y recuperación, conservando el botón manual si ayuda.

Cuadre explicado: fondo + entradas en efectivo − salidas − retiros − devoluciones en efectivo = esperado. Comparar contado y esperado; cada componente abre su detalle. Si hay diferencia, motivo y política de autorización según monto. Registrar propinas por método y reparto sin confundir venta con dinero disponible.

El recibo cerrado debe ser estable, exportable e imprimible; el historial se actualiza al confirmar. “Abrir siguiente turno” es una decisión, no una consecuencia de recargar. Correcciones dejan quién, cuándo, por qué y movimiento compensatorio; preservar los controles existentes y profundizarlos.

**Aceptación:** recargar, cerrar navegador, cambiar de aparato y reintentar conservan resultado; dos operadores no cierran dos veces el mismo período; apertura tardía explica su alcance; cierre con cero explícito es distinto de un campo vacío. Un cajero puede cuadrar sin acceso a toda la rentabilidad del negocio.

### 4.7 Cocina y entrega

La prueba actual confirmó una comanda visible y su marcado como lista. El siguiente nivel es manejar el servicio real: estaciones, productos listos a tiempos distintos, notas destacadas y coordinación de salida. No introducir todas las estaciones si el restaurante solo necesita una pantalla: configuración progresiva.

Cada reloj dice lo que mide: desde pedido, desde aceptación, en preparación y esperando entrega. Priorizar por compromiso de salida y retraso, sin reordenamientos que hagan tocar otra comanda. Pedidos agregados a una mesa existente se distinguen de la primera ronda. La preparación de bebida no debe desaparecer al marcar lista toda la comida si tienen responsables distintos.

Aviso sonoro con prueba de sonido, estado bloqueado visible y alternativa visual. Modo de pantalla grande elimina navegación innecesaria; no depender de iconos pequeños ni color solo. Reimpresión lleva marca de copia y razón; “enviado a impresora” no equivale a papel confirmado.

**Aceptación:** veinte comandas con varias estaciones mantienen lectura a distancia; una cancelación posterior al envío llega a cocina con confirmación; reconectar no repite órdenes ni sonidos antiguos como nuevos. Impresora fallida se distingue de pedido no recibido.

### 4.8 Carta, inventario, recetas y rentabilidad

Alta rápida: nombre, precio, categoría, disponibilidad y foto opcional. Extras, variantes, receta y traducción aparecen bajo demanda. Vista previa junto al formulario donde haya espacio. Crear categoría sin abandonar un borrador. Importación y edición masiva son primera clase para cartas grandes.

Separar distintivos de marketing, preferencias alimentarias e ingredientes/alérgenos declarados. No usar “Vegano” duplicado con significados distintos. Las opciones deben modelar mínimo, máximo, requerido, valores por defecto y efecto en precio/costo. Validar combinaciones imposibles antes de publicar.

Inventario muestra cobertura: “12 de 38 productos controlados”, y diferencia producto terminado de insumo. Asistente inicial por categoría; inventario físico, ajustes y motivos; recepción de compra; merma; rendimiento y unidad base. Conversión de kg/g y paquete/unidad explícita, no un campo numérico sin contexto.

Agotado: hasta hora, hasta reposición o manualmente. No reactivar por una duración implícita de 12 horas. Una cancelación no siempre devuelve insumo consumido: preguntar estado de preparación o aplicar política por evento.

Margen: conservar costo histórico de venta, incluir variantes/extras y mostrar cobertura. Si faltan costos, “margen estimado de 65% de las ventas”, no utilidad completa. Diferenciar margen bruto, gastos operativos y caja. Propuestas de precio deben enseñar supuestos y pedir decisión humana.

**Aceptación:** receta de 150 g descuenta 0.15 kg; merma y anulación no duplican reposición; cambiar costo hoy no reescribe ventas anteriores; dos pedidos de la última unidad producen un resultado consistente y explicable.

### 4.9 Clientes, lealtad, reservas y domicilios

Clientes se organiza por trabajo: nuevos con compra, recurrentes, inactivos y por atender. Separar fecha de registro y última compra. Consentimiento y canales disponibles antes de campañas. Duplicados de teléfono deben resolverse con historial y contexto, sin unir familias automáticamente.

Lealtad aparece tras aportar valor: pedido confirmado o invitación discreta, no interrumpiendo la primera exploración. Beneficio y condiciones visibles antes de registrarse; continuar como invitado sigue siendo posible donde el negocio lo permite. Puntos y cupones deben revertirse de forma coherente ante cancelación/devolución.

Reservas: agenda, capacidad, duración estimada y unión de mesas cuando se requiera; lista de espera con hora de llegada, tamaño, preferencia y prioridad explícita. Sentar debe actualizar reserva, sesión y ocupación de forma conjunta. Una espera de muchos días requiere caducar o revisar el estado, no seguir pareciendo urgencia del turno.

Domicilios: zona y tarifa antes de confirmar; dirección verificable y referencia; promesa de tiempo separada de estado real; pausa de canal por carga con vencimiento y responsable. No prometer seguimiento GPS si solo hay cambios manuales de estado.

**Aceptación:** no se reservan dos veces recursos exclusivos para la misma franja; al fallar abrir mesa no queda reserva falsamente sentada; cancelar pedido restaura beneficios según regla; campañas requieren acción autorizada y preferencias de contacto.

### 4.10 Comensal: apetito, lectura y certeza

El plato debe ser protagonista. Foto consistente, nombre legible, descripción corta y precio base visible. La personalidad está en tipografía, composición, color y fotografía, no en poner todo sobre vidrio. Tema oscuro debe ser una variante completa, incluidos diálogos de lealtad y errores.

Entrada según intención: QR de mesa reconoce mesa con confirmación visible; enlace general permite elegir modalidad sin preguntar datos todavía. Categorías accesibles, buscador tolerante y agotados claramente diferenciados. No obligar a explorar decenas de tarjetas para repetir una bebida.

Ficha: requeridos arriba, opciones agrupadas y total actualizado. Pie fijo con cantidad y agregar; espacio reservado al final para que no tape el último campo. Carrito editable sin reconstruir todo el producto. Conservarlo con límites de vigencia, restaurante y precio; al revalidar cambios, explicar diferencias antes de enviar.

Checkout pide solo lo necesario por modalidad, muestra desglose final y permite volver sin perder datos. Confirmación diferencia “recibido”, “aceptado”, “preparando” y “listo”; el tiempo es estimado con actualización. Si está cerrado, el comensal sabe cuándo abre y si puede programar según capacidad realmente existente.

**Aceptación:** completar pedido a 360 px, zoom 200%, teclado y lector de pantalla; opciones obligatorias no se omiten; precio cambiado se reconfirma; reintentar no duplica orden; al fallar red no se promete que el restaurante ya recibió.

### 4.11 Superadmin: operar el negocio sin convertirte en soporte permanente

Inicio como cola de trabajo: **servicio afectado**, **activación**, **cobranza**, **soporte**. Cada asunto incluye evidencia, antigüedad, impacto, siguiente acción, responsable, estado y pausa con vencimiento. Alertar que no hay pedidos requiere saber si el negocio está cerrado, estacional, usa solo carta o vende por otro canal.

Directorio con búsqueda, filtros por etapa/plan/estado/cobro/actividad y vistas guardadas. Salud comercial y técnica se distinguen: mucho volumen no equivale automáticamente a “mejor cliente”. Un local sin pedidos pero usando QR no se clasifica como perdido sin contexto.

Ficha única: identidad y contactos, estado comercial, operación, acceso, facturación y línea temporal. El historial conecta alta, primer uso, incidencia, cambio de plan y cobro. Modo soporte con contexto visible y duración limitada si se implementa acceso asistido; no ocultar que se opera en nombre del restaurante.

Planes y cobro: catálogo de precios versionado; excepciones identificables; vista previa con antes/después, fecha, moneda y prorrateo. Un selector de moneda no constituye conversión. Deshabilitar modalidades no modifica precio si la política es fija. Plan Pro no publicado permanece fuera de venta hasta completarse y decidir lanzamiento.

Cobranza: estados pendientes, vencidos, en revisión, rechazados, parcialmente pagados y conciliados. Comprobante es evidencia por revisar, no pago confirmado automáticamente. Antes de suspensión, mostrar alcance, horario y alternativas de la política comercial; conservar acceso al estado de cuenta y recuperación según diseño aprobado.

Rescate: ya hay verificación de identidad, auditoría y protección del último dueño. Conservarlo. Convertir la página extensa en tareas guiadas con caso/motivo, datos mínimos y previsualización. No sugerir crear otra cuenta como solución universal. Rol Dueño debe ser elección explícita; permisos efectivos se muestran por restaurante.

Métricas SaaS: MRR contratado, cobrado, vencido, bajas y expansión con definiciones. Comparar mes parcial con igual tramo del anterior o marcar que el período no es comparable. Cohortes de activación y renovación, soporte por local y costo de operación. Las consultas deben cubrir todos los datos, no las primeras filas.

**Aceptación:** puedes identificar el problema prioritario, entenderlo y resolverlo desde una ficha, con evidencia de la acción. Un error de consulta nunca produce “todo al día”. Agregar 100 restaurantes no exige 100 seguimientos manuales diarios.

## 5. Dirección visual concreta: “hospitalidad precisa”

La propuesta no es pintar de otro color los mismos componentes. Es una gramática visual inspirada en carta, comanda y libro de caja. Marca cálida, áreas de trabajo tranquilas, números contundentes y estados inequívocos.

El archivo [DIRECCION_VISUAL_LEOGIN.html](../diseno/DIRECCION_VISUAL_2026-11-03.html) contiene bocetos navegables de **web, Hoy, cobro, carta y superadmin**. Son propuestas con datos ficticios; no representan cambios aplicados ni una integración funcional. Permiten discutir composición y jerarquía antes de programar.

### Especificación inicial

| Elemento | Regla propuesta | Cómo se valida |
|---|---|---|
| Fondo/superficie | Marfil #F7F4EE / blanco cálido #FFFEFB; sólido en tareas | No depende de la foto/fondo para leer |
| Texto | Carbón #202420; secundario #5B625B | Contraste calculado por combinación y estado |
| Marca | Terracota #C74B24; acento, no relleno de todo | Acción principal identificable sin competir con alertas |
| Estados | Verde #25634A, ámbar #875900, rojo #AD3328, azul #255E85 | Texto e icono acompañan el color |
| Tipografía | Titular distintivo; sans para operar; cifras tabulares en dinero | Nombre largo, Q99,999.99 y traducción no rompen diseño |
| Tamaño | Base móvil 16 px; panel 14–16; metadatos útiles 12–13 | Prueba en aparato y a 200% de zoom |
| Toque | Objetivo interno 48 px; 56 px en acciones principales de servicio | No requiere precisión fina con una mano |
| Espacio | Escala 4/8/12/16/24/32/48 | Línea de alineación común por región |
| Superficies | Borde y espacio; sombra reservada a capas | El ojo distingue contenido de diálogo |
| Radios | Controles 10–12; tarjetas 16–20; píldora solo cuando tiene sentido | Menos apariencia de botones en elementos no interactivos |
| Movimiento | Respuesta breve 120–180 ms; hojas 180–240; reducción respetada | No desplaza objetivos ni anima dinero durante confirmación |
| Leo | Bienvenida, ayuda y logros | Se retira de incidentes, cobros y tareas urgentes |

Los colores son candidatos, no una validación completa de todas las combinaciones. WCAG 2.2 establece contraste mínimo de texto normal 4.5:1 y grande 3:1; el tamaño mínimo AA de objetivos tiene reglas y excepciones de 24 CSS px. Nuestro objetivo operativo de 48/56 px es una decisión de producto más exigente para trabajo táctil. [Contraste W3C](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) · [Tamaño de objetivos W3C](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

### Pasada de precisión: detalles pequeños que sí haría

| Lugar | Cambio exacto |
|---|---|
| Precios de planes | Importe y periodicidad en piezas separadas; misma línea base; no partir Q150/Q299 |
| KPI superadmin | Evitar 5+1; probar 3×2 a 1280 y una jerarquía reducida en móvil |
| Formularios | Un título principal; etiqueta asociada; ayuda debajo; requerido explícito |
| Alta de platillo | Ocultar inglés hasta habilitarlo; agrupar opciones avanzadas; conservar barra de guardar existente |
| Tablas | Importes a la derecha; decimales tabulares; encabezado define período/unidad |
| Botones | Verbo para acción; participio para estado; alturas coherentes |
| Iconos | Misma caja y grosor; nombre accesible; tooltip no sustituye texto en acciones críticas |
| Cargas | Skeleton de dimensiones estables; no pintar ceros ficticios |
| Vacíos | Título, razón y una acción; distinguir filtro vacío de falta de configuración |
| Errores | Qué pasó, qué se guardó, qué puede hacer; foco en el campo si corresponde |
| Diálogos | Foco inicial útil; volver al disparador al cerrar; Escape según estado; fondo inerte |
| Cobro | Foco inicial en método/importe, no en vender un postre; saldo siempre visible |
| Servicio móvil | Resumen de saldo, no solo total de consumo; una acción dominante |
| Chips horizontales | Señal de continuidad y desplazamiento accesible; seleccionado visible |
| Nombres largos | Dos líneas donde hay espacio; detalle accesible si se trunca; importe sin colisión |
| Permisos | Grupos Operar/Dinero/Catálogo/Clientes/Ajustes; resumen de lo que realmente podrá hacer |
| Sesión | Identidad y rol reales, no “Administrador” genérico para todos |
| Cierre | ✓ solo al completar; historial inmediato y resumen con período correcto |
| Suscripción | Contador derivado de funciones; explicar beneficio actual, próximo importe y fecha |
| Comensal | Sin cursiva en párrafos largos; contraste consistente; pie agregar fijo |
| Acceso | Título de pestaña de marca; identificador explicado con lenguaje de persona/local |
| Mobile shell | Probar cuatro destinos + Más por rol, conservando acceso directo al trabajo frecuente |
| Compartir | Mostrar exactamente qué incluye antes de enviar datos financieros por otro canal |
| Impresión | Separar imprimir, reimprimir y comprobación del aparato; sin falso éxito |

## 6. Backlog adicional de ejecución

El anexo integrado conserva las **66 tareas base** D/W/A/C/O/M/S/T. Las siguientes 20 especificaciones refinan o amplían ese trabajo con evidencia autenticada. **No son 20 funciones nuevas para añadir indiscriminadamente**; varias son correcciones y contratos compartidos que evitan construir inconsistencias.

### E01 · P0 · M — Contrato único de producto y precio

**Evidencia:** N01/N15/N23 y contradicción de FAQ de pedidos. **Responsables:** producto + backend + frontend. **Depende de:** decisión comercial vigente.

Crear una definición versionada de plan, modalidades elegibles, límites duros/blandos, funcionalidades, moneda, precio y excepciones. Derivar web, comparación, Hoy, suscripción y superadmin. Separar “incluido”, “habilitado”, “configurado” y “activo”. Eliminar reglas de descuento antiguas de textos si ya no aplican. Revisar fixtures de precios públicos/locales sin asumir que su diferencia es un bug.

**Terminado:** el mismo restaurante produce idéntico precio y alcance en cinco superficies; tests de Estándar 2/3, Premium fijo, límite blando y excepción; cambios muestran fecha de efecto. **Riesgo de migración:** no recalcular contratos históricos silenciosamente.

### E02 · P0 · M — Estado desconocido no es estado sano

**Evidencia:** N12/N13. **Responsables:** backend + frontend. **Depende de:** contrato de lectura.

Usar respuestas discriminadas: ok con datos y timestamp; vacío válido; error; parcial; migración ausente. Propagarlo a salud, comprobantes y contadores. Mantener último dato bueno con etiqueta, reintento y observabilidad. Un mensaje de error no debe exponer secretos ni SQL al usuario.

**Terminado:** fallar cada consulta produce aviso verificable; no aparece “Todo en orden”, “No hay comprobantes” ni cero derivado de un error. Recuperar conexión restituye la vista sin perder filtro.

### E03 · P0 · L — Cobros, cierres y beneficios consistentes

**Evidencia:** T01/C08; riesgos leídos, caso normal validado. **Responsables:** backend + QA. **Depende de:** modelo de movimientos.

Definir invariantes y límites transaccionales. Cobro, asignación, saldo, estado de orden y evento deben confirmarse conjuntamente o tener compensación durable. Cupón/puntos no quedan a mitad. Clave idempotente por acción y restricciones de unicidad; bloqueo o control de versión por cuenta/cierre. No envolver dos peticiones independientes en Promise.all y llamarlo transacción.

**Terminado:** matriz de carreras y fallos de sección 8 pasa en Postgres real; saldo y libro se reconcilian; reintento devuelve el resultado original. [Referencia primaria sobre bloqueos de filas](https://www.postgresql.org/docs/current/explicit-locking.html). **Migración:** reconciliar datos previos antes de imponer restricciones.

### E04 · P1 · M — Corregir contexto de sucursal moderno

**Evidencia:** N14 local. **Responsable:** backend/frontend. **Depende de:** reproducción mínima.

Crear casos de dueño con membresía sin restaurant_id, multi-local, grupo y empleado. Trazar rewrite/headers/cookies y contexto de autorización; no restaurar compatibilidad copiando restaurant_id a todos como solución general. Preservar destino al reautenticar.

**Terminado:** cada ruta /panel/slug abre el local elegido o explica denegación; ninguna vuelve silenciosamente a Mi cuenta; navegar A→B no mezcla caché/datos; el mismo conjunto se comprueba en entorno semejante a despliegue.

### E05 · P1 · L — Estados de caja y persistencia

**Evidencia:** N05/N06/N07. **Responsables:** diseño + fullstack. **Depende de:** E03.

Introducir no contado/contado cero/contado positivo; apertura física y período contable; borrador persistente; resumen cerrado recuperable; historial actualizado. Definir apertura tardía y turnos simultáneos por caja. Preparar migración del estado legado con valores desconocidos explícitos.

**Terminado:** cierre Q70 normal sigue funcionando; cero explícito y vacío se distinguen; reload conserva recibo y datos; intento duplicado no crea dos cortes; no se exige volver a contar tras una interrupción recuperable.

### E06 · P1 · L — Cobro completo por persona y método

**Evidencia:** N02/N03/N04. **Responsables:** diseño + fullstack. **Depende de:** E03 y diseño C01–C03.

Implementar partes persistentes, importe libre, pagos mixtos, historial y resumen móvil. Mantener por platos ya funcional. Añadir efectivo recibido libre y regla de centavos. Separar saldo cero de liberación de mesa.

**Terminado:** los cinco escenarios monetarios de sección 8 se explican en UI y libro; el usuario nunca necesita calcular pendiente mentalmente; cobro sin sugerencias comerciales.

### E07 · P1 · M — Servicio estable por turno

**Evidencia:** N08/N10. **Responsables:** diseño + frontend. **Depende de:** prueba con camareros.

Reducir shell, conservar regiones, fijar favoritos y atajos por turno, controlar truncamiento y separar estado/acción de servido. Reordenar solo mediante acción explícita o al iniciar turno.

**Terminado:** mismo atajo conserva producto tras veinte ventas, llegan pedidos sin mover objetivos bajo el dedo, móvil muestra saldo y comanda accesibles con una mano.

### E08 · P1 · M — Diálogos y temas coherentes

**Evidencia:** N11/ficha pública. **Responsables:** diseño + frontend. **Depende de:** tokens semánticos.

Inventariar superficie, texto y overlay por tema; quitar herencia incorrecta entre carta oscura y modal claro. Asociar labels de reserva y comprobar controles anidados. Revisar contraste normal/hover/disabled y focus.

**Terminado:** ficha, lealtad, carrito, cobro y reserva pasan teclado, foco, zoom y contraste; último campo y CTA no quedan ocultos por pie/teclado. No basta una captura de escritorio.

### E09 · P1 · M — Activación medible y Hoy adaptable

**Evidencia:** N16. **Responsables:** producto + frontend + datos. **Depende de:** eventos fiables.

Definir hitos por resultado y cambiar prioridad según etapa. Instrumentar primera carta útil, pedido de prueba, puesto verificado, primer cobro y primer cierre real. Separar pruebas de operaciones reales.

**Terminado:** visitas no completan compartir ni publicar; local activo ve incidentes antes de marca; embudo permite explicar dónde se detuvo cada alta sin leer conversaciones privadas.

### E10 · P1 · M — Catálogo rápido y comprensible

**Evidencia:** N17. **Responsables:** diseño + frontend. **Depende de:** semántica de opciones.

Formulario básico/avanzado, categoría inline, traducción condicional, distintivos únicos y vista previa. Edición por lotes con selección, resumen y deshacer cuando sea reversible.

**Terminado:** crear cinco platillos no exige repetir configuración; cambiar diez precios muestra exactamente qué filas cambian; guardar errores mantiene imágenes y valores.

### E11 · P1 · M — Inventario que declara su cobertura

**Evidencia:** N20. **Responsables:** producto + frontend/backend. **Depende de:** O05/O06 para recetas completas.

Añadir cobertura, búsqueda y activación guiada por categoría. Unidades, cantidades iniciales y umbrales con vista previa. Diferenciar sin control y disponible.

**Terminado:** 0 agotados con 0 controlados no parece disponibilidad garantizada; carga de 38 productos no exige 38 flujos independientes; ajuste conserva responsable y razón.

### E12 · P1 · M — Permisos efectivos por trabajo

**Evidencia:** N18/N19/F14. **Responsables:** producto + backend + diseño. **Depende de:** inventario de capacidades.

Presets mesero, cocina, cajero, encargado; grupos y vista previa. Separar operar caja de finanzas, cerrar de anular y administrar de transferir propiedad. Migrar permisos null con equivalencia revisada y auditoría.

**Terminado:** el dueño sabe qué puede hacer cada rol; acción directa y UI coinciden; instrucciones no mencionan controles escondidos; último dueño conserva protección.

### E13 · P1 · M — Semántica de cliente y métricas

**Evidencia:** N21 y cobertura de margen. **Responsables:** producto + datos. **Depende de:** diccionario de métricas.

Definir registro, compra, visita, recurrente, reactivado, venta, cobro y margen. Etiquetar cohortes y excluir pruebas. No dividir pedidos de todos los canales entre visitas web como conversión.

**Terminado:** cada KPI abre conjunto conciliable; fecha “Última compra” no existe si no hubo compra; período comparativo equivalente o advertido.

### E14 · P1 · L — Reserva y ocupación sin estados parciales

**Evidencia:** N22. **Responsables:** backend + frontend. **Depende de:** modelo de sesión de mesa.

Transición atómica al sentar, capacidad/estado verificado, idempotencia y error recuperable. Definir cuál operación gana si dos empleados asignan la misma mesa. Añadir etiquetas accesibles y feedback local.

**Terminado:** fallar apertura no deja reserva sentada; repetir éxito no abre otra sesión; una mesa ocupada genera elección explícita y no sobreescritura.

### E15 · P1 · L — Cola de trabajo del superadmin

**Evidencia:** N09/N24 y alertas observadas. **Responsables:** diseño + fullstack. **Depende de:** E02/E13.

Asuntos deduplicados con responsable, evidencia, estado, prioridad y vencimiento. Ficha temporal; datos técnicos y comerciales separados. Reducir KPI y acciones globales peligrosas en la vista inicial.

**Terminado:** abrir, asignar, pausar, resolver y reabrir deja historial; no vuelve la misma alerta resuelta sin evento nuevo; error de datos es visible.

### E16 · P1 · L — Cobranza y cambios de contrato explicables

**Evidencia:** N01/N24. **Responsables:** producto + backend + diseño. **Depende de:** E01/E03.

Vista previa de importe, moneda, impuestos si aplican, fecha, prorrateo y alcance; conciliación de comprobantes; restricción gradual aprobada como política comercial. Cambios masivos generan lote auditable y resumen antes de ejecutar.

**Terminado:** reenviar generación no duplica cobro; pago y suspensión concurrentes se resuelven coherentemente; precio del próximo ciclo coincide entre dueño y superadmin.

### E17 · P1 · L — Escala y datos completos

**Evidencia:** N25/F19. **Responsables:** backend + datos. **Depende de:** métricas definidas.

RPC agregadas, índices según consulta, cursor para listados, conteo real separado y exportación por lotes. Probar por encima del max_rows efectivo, no solo del límite escrito en frontend.

**Terminado:** 1.001, 20.001 y 100.001 registros de prueba no truncan totales ni crean falsos huérfanos; filtros y exportación se reconcilian; latencia se mide con volumen representativo.

### E18 · P1 · M — Demo de venta conectada al primer valor

**Evidencia:** demo existente y discrepancia CTA/promesa. **Responsables:** producto + diseño + frontend. **Depende de:** tres recorridos corregidos.

Reutilizar lógica/presentación real con datos sintéticos y reinicio controlado; recorrido corto libre y guiado; CTA al crear restaurante conserva elección de modalidad. No solicitar datos de contacto antes de demostrar utilidad.

**Terminado:** prospecto entiende pedido→cocina→cobro, prueba un error recuperable y sabe exactamente qué incluye su plan; demo nunca envía una orden externa.

### E19 · P1 · L — Continuidad que se puede prometer

**Evidencia:** T02/T04/T05. **Responsables:** backend + operación + QA. **Depende de:** contrato de sincronización.

Matriz sin internet/sin LAN/sin PC/sin energía; cola durable con estado confirmado; respaldo y restauración aislada; diagnóstico por aparato; versión compatible. Definir objetivos de recuperación según capacidad real antes de venderlos.

**Terminado:** almacenamiento denegado no dice guardado; reintento no duplica; restauración reproduce saldos y configuración seleccionados; soporte encuentra el punto exacto de interrupción.

### E20 · P2 · L — Valor semanal y crecimiento con evidencia

**Evidencia:** objetivo comercial, propuesta. **Responsables:** producto + datos + diseño. **Depende de:** E13/E17 y uso real.

Resumen privado: operación, costos cubiertos, incidencias resueltas y una recomendación accionable. Estimaciones llevan supuestos; beneficios atribuibles se separan de correlaciones. Solicitar recomendación después de resultados, con control del cliente sobre compartir.

**Terminado:** dueño explica qué mejoró esta semana; identifica una decisión útil; soporte por local baja y renovación se observa en cohortes. No se inventan minutos ahorrados ni aumentos de venta.

## 7. Orden de implementación y entregables

### Primer bloque: verdad, dinero y acceso

E01, E02, reproducción E04, pruebas E03/C08/T06. Corregir contactos y texto comercial en paralelo a diseño. No esperar un rediseño para eliminar una promesa contradictoria. Salida: política coherente, errores visibles, riesgos priorizados por prueba y acceso moderno verificado.

### Segundo bloque: tres recorridos excelentes

Ficha/carrito del comensal, servicio/cobro y caja. E05–E08 con D01–D04/D08. Diseñar estados antes de migrar componentes; implementar verticalmente un recorrido completo. Salida: pedido, pago y cierre claros, accesibles, recuperables y trazables.

### Tercer bloque: arrancar y operar sin ti

E09–E14, importación, aparato preparado, cocina e inventario. Salida: local piloto completa varios turnos con asistencia decreciente; no acumula configuración sin usar.

### Cuarto bloque: escalar Leogin

E15–E19: cola de trabajo, facturación, métricas, exportación/recuperación y demo comercial fiel. Parte de continuidad y datos comienza antes si la prueba encuentra un riesgo crítico. Salida: los nuevos restaurantes no multiplican tu trabajo manual de forma proporcional.

### Quinto bloque: ventajas propias

E20 y una o dos apuestas de sección 9. No desarrollar cinco motores inteligentes a la vez. La prioridad se decide por problema observado, frecuencia, beneficio y costo de operación.

### Primeros diez días laborables propuestos

| Día | Entregable concreto | Aceptación |
|---|---|---|
| 1 | Contrato de planes + diccionario de dinero/estados | Dueño, web y superadmin describen lo mismo |
| 2 | Reproducciones automatizadas de errores/tenant + matriz monetaria | Cada riesgo tiene caso y resultado, no solo opinión |
| 3–4 | Prototipos ficha/cobro/caja con todos los estados | Datos largos, saldo parcial, cero, error y móvil incluidos |
| 5 | Prueba con 3–5 personas de cada rol prioritario | Registrar tareas, errores y ayudas; no pedir solo “¿te gusta?” |
| 6–8 | Un incremento completo de cobro/caja y correcciones pequeñas | Verificación de dinero y UX pasa antes de ampliar |
| 9 | Ensayo de turno con dos aparatos y red limitada | Recuperación y consistencia explicadas |
| 10 | Piloto acotado y decisión del siguiente ciclo | Métricas base y bloqueos conocidos publicados internamente |

Esto es organización de un primer ciclo, **no una promesa de completar todo en diez días**. El programa completo requiere múltiples ciclos y probablemente meses. Un equipo pequeño debe limitar simultaneidad: un recorrido de experiencia y una línea de confiabilidad, con responsabilidades claras.

## 8. Matriz de aceptación: pruebas que faltan para vender con confianza

Cada fila necesita datos iniciales, pasos, esperado, resultado real, evidencia y versión. Las filas no ejecutadas aquí son un **plan de validación**, no pruebas aprobadas.

| Caso | Resultado obligatorio | Estado de esta auditoría |
|---|---|---|
| Q70, cobrar plato52 y saldo18 | Pendiente18, luego0; caja70; mesa liberada | Probado en demo |
| Abrir fondo0, contar50+20, cerrar | Diferencia0, corte persistente, siguiente período0 | Probado; historial inmediato requiere corrección |
| Q100 entre3 | 33.34+33.33+33.33; pagos independientes | Pendiente; UI actual calcula reparto |
| Q200, 80 tarjeta+50 efectivo+70 tarjeta | Tres movimientos, saldo0, efectivo50 | Pendiente |
| Dos empleados cobran el mismo saldo | Un resultado consistente, sin sobrecobro | Pendiente |
| Doble clic y respuesta perdida | Un cobro; reintento devuelve recibo previo | Pendiente |
| Pago parcial y nuevo platillo | Nuevo saldo conserva pagos previos | Pendiente |
| Devolución de otro turno | Movimiento trazable, caja afectada correcta | Pendiente |
| Descuento y propina fraccionados | Suma de partes = total exacto | Pendiente |
| Conteo cero explícito vs vacío | Estados distintos; política de cierre clara | Vacío y cero esperado observados; falta matriz completa |
| Cierre simultáneo y venta al límite | Cada movimiento pertenece a un período definido | Pendiente |
| Cambio de día a05:00 y zona horaria | Inclusión consistente en caja e informes | Pendiente |
| Cupón última unidad y dos órdenes | No excede política ni deja contador inconsistente | Pendiente |
| Canje y cancelación | Saldo de puntos correcto y auditable | Pendiente |
| Último producto en dos aparatos | Sin promesas contradictorias de disponibilidad | Pendiente |
| Sentar reserva falla en paso intermedio | Reserva y mesa conservan estado consistente | Riesgo C; pendiente reproducir |
| Cola offline, espacio lleno | “No guardado” explícito y recuperación | Riesgo C; pendiente reproducir |
| Reconexión con precio cambiado | Revisión explícita, sin duplicar orden | Pendiente |
| Impresora sin papel o desconectada | Pedido recibido distinto de impresión fallida | Pendiente en hardware |
| Dueño sin restaurant_id con membresía | Ruta correcta y aislamiento | Redirección local observada; pendiente fix/prueba |
| Empleado sin permiso directo a acción | Servidor rechaza sin filtrar datos | Suites enfocadas; falta E2E completo |
| Salud/comprobantes con consulta fallida | Estado error, no vacío ni sano | C; pendiente inyección de fallo |
| Más filas que límite API | Totales exactos y listados paginados | C; pendiente volumen |
| Tema oscuro, zoom y lector | Texto, foco y tareas accesibles | Contraste visual fallido; falta auditoría asistiva completa |
| Restauración aislada | Saldos y configuración reproducibles | No ejecutada; copia fría no equivale a certificación de restore |

Rendimiento: medir campo y laboratorio por ruta. Objetivos de campo al percentil 75: LCP ≤2.5 s, INP ≤200 ms y CLS ≤0.1. Son metas, no resultados actuales. Incluir dispositivos modestos y datos suficientes. [Referencia Web Vitals](https://web.dev/articles/vitals).

## 9. Qué lo haría extraordinario después de lo básico

### A. Turno guiado que previene problemas

Antes de abrir: comprobar aparato, sonido, impresora, caja y agotados. Durante servicio: señalar retrasos y cuentas pendientes. Al cerrar: reunir movimientos y explicar diferencias. Una misma historia conecta las pantallas. Depende de estados fiables y diagnóstico, no de un chatbot decorativo.

### B. Capacidad de cocina traducida en promesas honestas

Estimar carga por estación con tiempos observados y variabilidad. Proponer ampliar tiempo, pausar canal o limitar productos; encargado confirma. Mostrar incertidumbre y permitir intervención. Medir incumplimientos y cancelaciones antes/después; no vender predicción exacta sin historial.

### C. Menú rentable y administrable

Combinar popularidad, margen con cobertura y tiempo de preparación. Detectar plato que vende mucho pero deja poco, extra sin costo o insumo que genera merma. Simular precio/porción/combos con supuestos. Nunca cambiar precios automáticamente sin decisión del dueño.

### D. Migración que sorprende por lo fácil

Importar carta, revisar filas dudosas, elegir una dirección visual y obtener QR/material preparado. Mantener borradores y reversión. La magia es eliminar trabajo repetido sin inventar información; debe funcionar en una carta sucia y real, no solo en una plantilla perfecta.

### E. Dueño informado, sin tener que revisar veinte pantallas

Resumen semanal con hechos: qué se cobró, qué quedó pendiente, dónde hubo demora y qué merece decisión. Comparación equivalente y una recomendación, no diez alertas genéricas. El valor se vuelve visible sin exagerar atribución.

No priorizaría ahora una red social, muchas plantillas adicionales, contabilidad empresarial completa, integraciones no solicitadas por pilotos o IA generalista. Tampoco restauraría encargos ni transferencia del comensal: el historial indica que se retiraron por decisión del dueño. La transferencia para pagar el plan o registrar un cobro de caja es otro flujo.

## 10. Cómo probar que realmente se vende y se vuelve necesario

Elegir primero un segmento: por ejemplo, restaurante independiente con salón, cocina y cobro presencial, carta moderada y equipo pequeño. Es una hipótesis de foco basada en capacidades actuales, no un estudio de mercado. Entrevistar y observar para confirmarla.

| Objetivo | Qué medir | Regla inicial |
|---|---|---|
| Comprensión | Explica beneficio después de demo | 8/10 en prueba cualitativa como meta |
| Activación | Tiempo a carta útil y pedido de prueba | Meta15min para carta pequeña; medir importación aparte |
| Aprendizaje | Completa tomar/enviar/cobrar/corregir | Segunda repetición sin guía; registrar errores |
| Confianza | Duplicados, diferencias y recuperación | Cero duplicados en matriz; diferencia siempre trazable |
| Uso | Turnos, cierres y puestos usados semanalmente | Separar pruebas, estacionalidad y negocio cerrado |
| Valor | Dueño identifica mejora concreta | Entrevista semanal + evidencia de uso |
| Venta | Demo→alta→activación→pago | Línea base por segmento antes de fijar porcentajes |
| Retención | Renovación y uso30/60/90d | Cohortes, motivos y denominadores explícitos |
| Soporte | Minutos por restaurante activo | Bajar sin empeorar resolución |
| Recomendación | Referidos voluntarios atribuibles | Pedir después de resultado, no por obligación |

Eventos mínimos propuestos: demo_started, demo_completed, restaurant_created, menu_published, test_order_completed, device_ready, first_real_order, first_cash_close, trial_activated, plan_paid. Deben definirse con identificador estable, fecha, versión, canal y distinción test/real; no capturar datos personales del comensal innecesarios para el embudo.

## 11. Mapa de implementación y precauciones sobre la evidencia

Rutas relativas al repositorio `C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma`:

| Trabajo | Entradas de código verificadas |
|---|---|
| Planes | src/lib/plans.ts; src/components/super/order-types-editor.tsx; src/app/planes/page.tsx |
| Cobro | src/components/admin/servicio/hoja-cobro.tsx; servicio-panel.tsx del mismo directorio |
| Caja | src/components/admin/caja/cash-close.tsx; src/lib/actions/finanzas.ts |
| Errores superadmin | src/lib/db/client-health.ts; src/lib/db/comprobantes.ts |
| Reservas | src/lib/actions/reservaciones.ts; src/components/admin/reservaciones-panel.tsx |
| Acceso | src/lib/auth/tenant-guard.test.ts; src/lib/permissions.ts; src/lib/auth/segundo-factor-policy.ts |
| Comensal | src/components/menu/product-sheet.tsx; cart.tsx; google-loyalty-intro.tsx |
| Cocina | src/components/admin/kitchen-display.tsx; src/lib/order-status.ts |
| Datos/escala | src/lib/db/super-admin.ts; billing.ts; reports.ts |
| Portabilidad | src/lib/actions/backup.ts; src/components/admin/respaldo-panel.tsx |
| Continuidad | src/lib/order-queue.ts; flujo de pedidos en src/lib/actions/orders.ts |

Se conservan como fortalezas: validación de precios del servidor, identidades de pedido, pagos parciales, borradores de servicio, MFA, protección del último dueño, auditoría de rescate, controles de acceso y base de pruebas. Mejorar no equivale a reescribir todo.

No confundir datos de fixture con fallos: cuentas sin local, correos sin verificar, alertas antiguas, ceros y precios locales distintos no prueban por sí mismos problemas de producción. El estado de verificación del perfil puede ser intencionalmente distinto del auto-confirmado técnico de Auth. No se considera un bug sin comprobar su contrato.

No se probaron todas las integraciones, impresión física, pagos bancarios, condiciones fiscales de un país, cada rol/plan, restauración total ni fallos inducidos de infraestructura. Esta limitación está convertida en pruebas y criterios concretos; no se presenta como trabajo ya aprobado.

## 12. Decisión que tomaría como responsable del producto

**No empezaría añadiendo más módulos.** Primero cerraría contradicciones de estado, dinero, datos y acceso. Después trabajaría recorridos completos de dueño, mesero, cocina, recepción y encargado de inventario, además del cobro y cierre. Catálogo, reservas, espera, promociones, configuración y ayuda deben facilitar una tarea completa y conectarse entre sí. La secuencia por módulos está en el complemento; el recorrido monetario probado aquí es una parte de esa estrategia.

La diferencia que buscas puede construirse con lo que ya existe, pero requiere reducir contradicciones, decidir una dirección visual, profundizar estados y probar el servicio real. El listón no será que algo se vea decente o que una función exista: será que un restaurante nuevo pueda aprenderla, usarla durante presión y confiar en lo que le cuenta.

---

## Anexo A. Backlog base integrado y actualizado

Las 66 tareas siguientes conservan identificadores de la primera entrega para facilitar implementación. Las secciones anteriores y el complemento por apartado son la autoridad sobre el alcance inspeccionado y refinan estos tickets con N01–N25, E01–E20 y X01–X23. No sumar todos los identificadores como si fueran tareas independientes: algunos hallazgos y especificaciones describen el mismo trabajo. Los puntos que dicen “probar” siguen siendo aceptación pendiente salvo los casos expresamente marcados como ejecutados.

## 4. Backlog de diseño: incluso los detalles pequeños

Prioridades: **P0** = corregir promesa/consistencia o validar riesgo antes de escalar; **P1** = siguiente ciclo de mejora; **P2** = después de asegurar los recorridos principales; **P3** = exploración. Esfuerzo orientativo: **S** = 0,5–2 jornadas, **M** = 3–5, **L** = 6–10, **XL** = más de 10 y exige dividir. Incluye implementación y verificación de la tarea, no esperas comerciales. No sumar estos rangos como un presupuesto cerrado.

### D01 · P1 · L — Sistema visual real, además de tokens

**Hacer:** inventariar las variantes actuales de botón, campo, pestaña, lista, tarjeta, hoja, aviso y tabla. Definir una versión por función con estados normal, foco, hover, pulsado, deshabilitado, cargando, éxito y error. Aplicar primero a caja, pedido y ficha de comida.

**Terminado cuando:** las tres pantallas usan el mismo lenguaje y cada control tiene sus estados; los controles críticos no dependen de estilos improvisados. Responsable: diseño + frontend. Dependencia: dirección visual.

### D02 · P1 · M — Jerarquía tipográfica y de números

**Hacer:** corregir importes y `/mes` de F04; alinear columnas monetarias a la derecha y decimales; reducir mayúsculas a rótulos breves; reservar tipografía decorativa para nombres/títulos. Revisar textos de 11–12 px del panel en dispositivos reales.

**Terminado cuando:** Q9.00 y Q99,999.99 no deforman filas; nombres largos no tapan importes; zoom al 200 % conserva acciones. Responsable: diseño + frontend.

### D03 · P1 · M — Menos vidrio en tareas operativas

**Hacer:** prototipar menú y panel con superficies sólidas, manteniendo acentos de marca. El fondo puede tener personalidad, pero los formularios, precios, alertas y comandas deben descansar sobre una base predecible. Conservar temas alternativos sin imponer vidrio a todos.

**Terminado cuando:** textos se leen con fotos claras/oscuras y brillo bajo; participantes encuentran precio y acción sin explorar. Comparar prototipo con la versión actual, no decidir solo por gusto.

### D04 · P1 · M — Acciones fijas y accesibles

**Hacer:** pie fijo en ficha, carrito y cobro; reservar espacio para teclado, área segura del teléfono y última fila. Mantener precio y botón como una sola unidad; mostrar progreso de envío sin mover su posición.

**Terminado cuando:** a 360, 375 y 390 px, con teclado abierto y texto ampliado, siempre se puede completar o corregir la tarea. F09 es el primer caso a resolver. Responsable: frontend + QA.

### D05 · P1 · M — Navegación móvil por trabajo

**Hacer:** probar máximo cuatro destinos principales más «Más» para dueño y superadmin; mantener acceso directo a tomar pedidos en el rol que lo usa. Hoy existen seis grupos de restaurante y siete destinos de superadmin: no reducirlos sin verificar el trabajo frecuente.

**Terminado cuando:** dueño, cajero y mesero localizan sus tres tareas frecuentes sin ayuda; permisos no producen botones que rebotan ni pantallas vacías. Responsable: diseño + frontend.

### D06 · P1 · M — Estados vacíos, carga y errores con salida

**Hacer:** para cada pantalla distinguir «sin datos todavía», «no coincide el filtro», «no tienes permiso», «está incluido pero falta configurar» y «falló cargar». Cada caso explica una acción concreta. Carga con estructura estable, sin cifras falsas de cero.

**Terminado cuando:** el error de una consulta nunca se presenta como «Todo en orden» ni como ventas Q0; reintentar conserva filtros y borradores. Responsable: frontend + backend.

### D07 · P2 · S — Lenguaje de una sola marca

**Hacer:** unificar platillo/producto según contexto; servido/cobrado/libre; cuenta de cliente/cuenta por pagar; pago registrado/pago confirmado. Corregir título «Menú en línea» del acceso. Sustituir jerga como KDS en textos de venta por «pantalla de cocina».

**Terminado cuando:** un glosario breve guía todos los textos y una búsqueda del repositorio detecta las variantes prohibidas. No renombrar entidades internas sin necesidad.

### D08 · P1 · M — Accesibilidad completa de los recorridos

**Hacer:** revisar foco de diálogos, restauración al cerrar, Escape, orden de tabulación, nombres accesibles, avisos de error y controles por teclado. En ficha de producto hay `role=dialog`; esa etiqueta sola no demuestra manejo correcto del foco. Revisar también tarjetas clicables que contienen otro botón.

**Terminado cuando:** se puede elegir, agregar, corregir y confirmar con teclado/lector de pantalla; ninguna acción importante depende solo de color, gesto o sonido.

### D09 · P2 · S — Movimiento, audio y celebraciones oportunas

**Hacer:** diferenciar pedido nuevo, atención y error; probar sonido sin depender de un pedido real; respetar preferencias del aparato. Celebraciones en logros del dueño, nunca encima de una tarea urgente. Reducir efectos de cursor y animaciones decorativas en móviles modestos.

**Terminado cuando:** el equipo entiende cada señal y el modo de movimiento reducido conserva toda la información. Responsable: diseño + frontend.

### D10 · P1 · M — Pasada de precisión visual

**Hacer:** revisar alineación de icono/texto, alturas de campo, bordes, espaciados, truncamientos, tablas, chips, hover, barras fijas, scroll y contraste en todas las pantallas prioritarias. Capturar antes/después por breakpoint y por estado.

**Terminado cuando:** cada observación tiene captura, medida y resolución. No marcar «alineación corregida» sin haber visto la pantalla autenticada. Responsable: diseño + QA.

## 5. Web comercial y activación

### W01 · P0 · S — Una promesa coherente

**Hacer:** resolver F01 y F03. Texto propuesto: «Prueba el sistema 30 días» para la prueba con pedidos; «Solo quiero mi menú gratis» como alternativa clara. Explicar En línea: 300 pedidos/mes, avisos anticipados, sin cortar pedidos y política explícita al excederlo.

**Terminado cuando:** portada, planes, FAQ, alta, suscripción, cotizador y documentos comerciales cuentan exactamente lo mismo. No inferir un cambio automático de tarifa si la operación real requiere intervención.

### W02 · P0 · S — Contacto que cumple lo anunciado

**Hacer:** resolver F02 mediante configuración del canal de ventas o texto condicional. Usar correo del dominio para mejorar continuidad de marca cuando esté disponible. Indicar horario y plazo de respuesta que realmente puedas sostener.

**Terminado cuando:** tocar WhatsApp abre WhatsApp con mensaje correcto; si solo hay correo, el botón dice correo. Medir clic y conversación iniciada cuando sea técnicamente verificable.

### W03 · P1 · M — Portada centrada en una demostración

**Hacer:** aprovechar «Pídelo tú mismo» y elevarla al recorrido principal; mostrar consecuencias en cocina y cobro, con datos de ejemplo identificados. Mantener video como alternativa. Probar una versión de 6–7 bloques frente a la actual, con la galería completa fuera del recorrido obligatorio.

**Terminado cuando:** en pruebas, 8 de 10 prospectos explican qué hace Leogin y para quién es tras una exploración breve; registrar demo iniciada/completada. Esa cifra es meta, no resultado actual.

### W04 · P1 · M — Vender por situaciones reconocibles

**Hacer:** tres entradas iniciales: restaurante con mesas, cafetería/mostrador y venta por redes. Cada una muestra una escena, hardware necesario y plan sugerido. Reutilizar `/vende-en-linea`; no multiplicar sitios ni bases funcionales.

**Terminado cuando:** el visitante reconoce su negocio, entiende qué trabajo desaparece y llega a una demo relevante. El mensaje nunca promete resolver una operación que el plan elegido no incluye.

### W05 · P1 · M — Planes fáciles de elegir

**Hacer:** recomendar plan a partir de tres preguntas de operación, con precio final visible y enlace a comparación. Explicar «caja», «mesero», usuarios, impresión y límite blando con ejemplos. La tabla completa queda como detalle, no como examen de entrada.

**Terminado cuando:** cinco dueños pueden elegir y explicar su plan sin ayuda; se respeta su elección si prefieren otro. Revisar coherencia de precios dinámicos: la web observada sirve Q150/Q299, mientras los defaults locales son Q199/Q349; eso puede ser un override válido, no prueba de un error.

### W06 · P1 · L — Prueba social verificable y venta con evidencia

**Hacer:** conseguir tres casos piloto con permiso: situación inicial, uso real, resultado y límites. Mostrar restaurante, fotos auténticas y testimonio aprobado. Medir tiempo de toma, cierre y entrenamiento; presentar ahorro como observado o estimado, claramente separado.

**Terminado cuando:** puedes enseñar evidencia reproducible sin inventar porcentajes, clientes ni «más vendido». Una calculadora de retorno muestra sus supuestos y no promete ventas nuevas por instalar un QR.

### W07 · P1 · M — Medir el recorrido de adquisición

**Hacer:** verificar la instalación de analítica y ampliar los cuatro eventos actuales: demo iniciada/completada, registro iniciado/terminado, menú publicado, pedido de prueba recibido, primer pedido real, primer cobro, activación y renovación. Distinguir eventos de prueba, duplicados y equipo interno.

**Terminado cuando:** una cuenta de prueba recorre el embudo y sus eventos se reconcilian; se puede medir abandono por paso y origen sin enviar notas de pedidos, teléfonos o datos innecesarios al proveedor.

### W08 · P2 · M — Material comercial consistente

**Hacer:** demo de 90 segundos por segmento, hoja de compatibilidad de impresoras/dispositivos, costos iniciales, importación asistida y preguntas difíciles: corte de internet, salida con datos, soporte y cambio de plan. Generar precios desde una fuente vigente para evitar documentos obsoletos.

**Terminado cuando:** lo que cotizas, muestras y cobras coincide. No vender integraciones fiscales o de terceros basándose solo en que existe código: exigir demostración de la configuración real.

### A01 · P1 · L — Llegar al primer valor antes de configurar todo

**Hacer:** experimentar con alta: nombre del negocio → primer platillo/importación → vista previa. Plan y estilo llegan preseleccionados según intención y se pueden cambiar. Evaluar una prueba completa para restaurantes elegibles, con vencimiento y consecuencias claras; no imponerla sin validar conversión y costos de soporte.

**Terminado cuando:** el tiempo mediano a menú útil baja frente a la línea base y nadie interpreta la prueba como un cobro ya aceptado. Depende de W01, W05 y W07.

### A02 · P1 · M — Primeros pasos por resultado

**Hacer:** reemplazar F08 por «Publica tus primeros platillos → Ábrelo como cliente → Recibe un pedido de prueba». Crear categoría por defecto cuando haga falta. Logo, horarios, entrega e impresión aparecen cuando su contexto los necesita.

**Terminado cuando:** cada paso se completa por un evento comprobable. El plan Básico nunca recibe el mensaje «tus clientes pueden pedir» si no tiene pedidos habilitados.

### A03 · P1 · L — Importar un menú con revisión

**Hacer:** ofrecer carga de archivo tabular y, después, foto/PDF asistido. Mostrar filas detectadas, precio, categoría y errores; marcar dudas para confirmación. Importación en borrador, comparación antes/después y capacidad de deshacer el lote antes de vender.

**Terminado cuando:** importar 50 platillos conserva precios y variantes y no publica datos ambiguos; se informa qué fotos faltan. La extracción automática no debe inventar ingredientes ni alérgenos. Responsable: producto + backend + frontend.

### A04 · P1 · M — «Hazlo por mí» para la marca

**Hacer:** con logo y fotos del negocio ofrecer tres composiciones completas; permitir aprobar una en un toque. Las 208 combinaciones permanecen en exploración avanzada. Vista previa con contenido real, incluidas fotos malas, textos largos y precios distintos.

**Terminado cuando:** alguien sin conocimientos de diseño publica una carta consistente sin tocar CSS, gradientes o terminología de interfaz.

### A05 · P1 · M — Entrenar con un turno de prueba

**Hacer:** recorrido aislado de cinco minutos: abrir mesa, agregar extra, enviar, marcar listo, cobrar y corregir. Usar almacenamiento de demostración separado y etiqueta persistente; los datos de práctica no cuentan en facturación, stock, puntos ni estadísticas reales.

**Terminado cuando:** un empleado repite la secuencia solo y entiende cómo salir del modo de práctica. Se puede reiniciar sin borrar información real. Depende de la demo existente y de la matriz de permisos.

### A06 · P1 · M — Configurar por aparato y por rol

**Hacer:** ofrecer «Caja / Cocina / Mesero / Dueño» al preparar el aparato, con inicio directo y prueba de conexión, sonido e impresora cuando corresponda. Usar el modo servicio existente. Cambiar modo es fácil para quien tenga autorización.

**Terminado cuando:** una tablet de cocina despierta en cocina, un mesero entra a sus mesas y el dueño conserva visión completa; recordar la pantalla nunca equivale a ampliar permisos.

## 6. Caja y cobro: estándar de excelencia

### C01 · P1 · L — Partes iguales que se cobran de verdad

**Hacer:** evolucionar F11 a participaciones independientes con saldo, método y recibo. Repartir centavos de forma determinista: Q100/3 = Q33.34 + Q33.33 + Q33.33. Permitir que alguien pague dos partes sin crear dobles cobros.

**Terminado cuando:** la suma cobrada siempre coincide con el total; una parte pagada no vuelve a cobrarse al recargar, cambiar de aparato o reintentar. Depende de T01. Responsable: backend + frontend + QA.

### C02 · P1 · L — Pago mixto y por importe en el mismo recorrido

**Hacer:** aprovechar el modelo de pagos existente y permitir, en la hoja principal, Q50 efectivo + Q70 tarjeta, o un abono arbitrario. Mostrar restante y cambio sin obligar a elegir productos. Aclarar que registrar tarjeta no significa procesar un cargo bancario.

**Terminado cuando:** el recibo, la mesa y caja muestran los mismos métodos y montos; el cambio corresponde solo al efectivo recibido. Verificar también propina, descuento y reembolso parcial.

### C03 · P1 · M — Cobro sin distracciones

**Hacer:** retirar sugerencias de consumo de la hoja de pago (F12); moverlas a la comanda antes de enviar o a una acción voluntaria. Mostrar consumo, descuentos, propina, pagado y pendiente. Añadir resumen del acto antes de registrar una corrección o devolución.

**Terminado cuando:** un cobro simple usa como meta hasta tres interacciones desde una cuenta lista; no hay promociones, animación de cifras ni enlaces de mejora de plan en ese recorrido.

### C04 · P1 · L — Cierre resistente a interrupciones

**Hacer:** autoguardar conteo por restaurante/turno/operador, con «Guardado a las…» y estado local/nube. Versionar borradores y detectar otro cajero editando. Recuperar tras cerrar pestaña sin mezclar turnos ni locales. Mantener «Guardar y seguir después» como acción explícita adicional.

**Terminado cuando:** recargar, perder red o cambiar de aparato no borra silenciosamente el conteo; los conflictos no sobrescriben el trabajo ajeno. Depende de T02.

### C05 · P1 · L — Permisos de caja por responsabilidad

**Hacer:** separar cobrar, abrir turno, registrar salida, cerrar, ver esperado, corregir, devolver y ver utilidades. Plantillas de cajero/encargado/dueño con vista previa de acceso. Ofrecer arqueo ciego donde el negocio lo prefiera, en lugar de imponerlo.

**Terminado cuando:** el cajero puede operar sin acceder a ganancias, exportar clientes o cambiar suscripción; los permisos se validan en servidor. Migración revisada de permisos antiguos, incluido `null`. F14.

### C06 · P1 · L — Cuadre explicable hasta el movimiento

**Hacer:** cada diferencia lleva a fondo, cobros, gastos, devoluciones, retiros y propinas. Distinguir total vendido de efectivo esperado. Añadir entrega de turno con responsable que entrega/recibe y observaciones; no borrar movimientos para «hacer cuadrar».

**Terminado cuando:** desde una diferencia de Q20 se puede reconstruir su origen o dejarla documentada como no explicada. Un ajuste posterior conserva el cierre original y su autor. Aprovechar correcciones ya existentes.

### C07 · P1 · M — Cerrar y liberar mesa son situaciones distintas

**Hacer:** mostrar pagada, por entregar, por limpiar y libre como estados operativos coherentes. Confirmar solo consecuencias relevantes: pendiente de dinero o productos sin enviar. Incluir reimpresión y reapertura autorizada en el contexto correcto.

**Terminado cuando:** pagar no oculta una entrega pendiente ni sienta otro grupo en una mesa todavía ocupada; liberar sin cobrar queda explícito, autorizado y trazable.

### C08 · P0 · L — Certificar el circuito de dinero

**Hacer:** ejecutar en entorno aislado la matriz de caja de la sección 11: concurrencia, última fracción, propinas, descuentos, anulaciones, cambios de método y cierre mientras entra un cobro. Revisar que cierre, vínculo de gastos y libro no queden parcialmente guardados (F21 es una señal similar en pedidos).

**Terminado cuando:** se cumplen invariantes de centavos y trazabilidad en DB real, no solo mocks. No afirmo una pérdida actual: la tarea es demostrar consistencia antes de ampliar ventas.

## 7. Operación y administración del restaurante

### O01 · P1 · M — Un Hoy que decide qué mostrar

**Hacer:** separar fase de arranque, turno abierto, servicio activo y cierre. Priorizar hasta tres excepciones; el dueño puede ver detalle. Evitar mezclar doce bloques de igual importancia. Comparar ventas con periodos equivalentes y mostrar cobertura temporal.

**Terminado cuando:** el dueño responde en 15 segundos «qué necesita atención, cuánto se cobró y cómo va el servicio». Meta de prueba con usuarios, no una promesa de rendimiento.

### O02 · P1 · L — Cocina por etapa, estación y producto

**Hacer:** partir del KDS existente: reloj desde aceptación para preparación, espera separada, filtros por estación y coordinación de platos. Desarrollar preparación parcial y pase cuando el restaurante lo requiera; aprovechar rutas de impresión ya presentes.

**Terminado cuando:** bebida lista no hace pasar toda una orden a lista; un cocinero reconoce modificaciones y pendientes a distancia. Probar 20–40 comandas sin saltos de posición ni saturación visual. F15.

### O03 · P1 · M — Servicio rápido sin perder contexto

**Hacer:** refinar la pantalla actual: favoritos por puesto, búsqueda tolerante a tildes, variantes legibles, última ronda existente accesible, notas destacadas, contador de pendiente de envío y error por línea. Mantener borradores por mesa y trabajador.

**Terminado cuando:** cambiar entre tres mesas con borradores, modificar una guarnición y regresar no pierde información ni envía dos veces. La misma acción tiene ubicación estable en tablet y atajo documentado en PC.

### O04 · P1 · M — Agotados con intención y reposición clara

**Hacer:** sustituir la regla implícita de 12 horas por opciones explícitas: «hasta próximo servicio», «hasta reponer» y «hasta que lo active». Stock real siempre manda. Mostrar cuándo volverá y permitir cambio masivo por categoría/ingrediente.

**Terminado cuando:** un ingrediente faltante bloquea los platillos afectados y no reaparecen por reloj sin que el negocio lo haya indicado. Servidor y cliente comparten la misma regla. F17.

### O05 · P1 · L — Inventario conectado con la cocina real

**Hacer:** mejorar recetas y kardex existentes con unidades y conversiones, rendimiento, merma y motivo de ajuste. Separar inventario teórico de conteo físico; añadir sesión de conteo y diferencias. Más adelante, lotes/caducidad y compras sugeridas según demanda, sin compra automática.

**Terminado cuando:** comprar 5 kg y vender recetas de 150 g descuenta correctamente; venta, anulación y merma tienen tratamientos distintos; el historial explica cada variación y su responsable.

### O06 · P1 · L — Rentabilidad que no exagera

**Hacer:** costear variantes, extras, empaque y descuentos, además de producto base (F16). Distinguir margen de productos, contribución y resultado después de gastos registrados. Mostrar porcentaje de ventas con costos completos y fecha de actualización.

**Terminado cuando:** una hamburguesa con tocino no aparece artificialmente más rentable por ignorar su costo; cuando faltan datos se muestra «estimación parcial», nunca ganancia total. La advertencia actual de costos incompletos es una base que debe ampliarse.

### O07 · P2 · L — Reservaciones y espera conectadas al salón

**Hacer:** revisar reservas/lista existentes como un solo recorrido: disponibilidad por duración y capacidad, confirmación, llegada, asiento, demora y ausencia. Contemplar mesas unidas y bloqueo manual con motivo. Dar estimaciones como rangos, no promesas exactas sin datos.

**Terminado cuando:** dos personas no asignan la misma capacidad; sentar una reserva actualiza el salón sin recapturar nombre y grupo. Las cancelaciones liberan capacidad y quedan registradas.

### O08 · P1 · L — Clientes y lealtad con resultado visible

**Hacer:** aprovechar historial y puntos para detectar primera compra, recurrencia y ausencia; recomendar acciones con importe/margen previsto. Campañas voluntarias con consentimiento, frecuencia limitada y exclusión de bajas. Medir ingresos asociados y, mediante prueba, si hubo incremento real.

**Terminado cuando:** el dueño sabe cuántos clientes volvieron y cuánto costaron los incentivos; puede parar una campaña. No equiparar todo ingreso de clientes contactados con ingreso causado por Leogin.

### O09 · P2 · L — Entregas y carga de trabajo

**Hacer:** mejorar zonas y repartidores existentes con estados de asignación/recogida/entrega, carga por repartidor y ruta visible. Separar preparar de salir: el reloj «en camino» no debe arrancar al estar listo. Ofrecer pausa temporal de pedidos y plazo ampliado cuando la cocina se satura.

**Terminado cuando:** local y comensal ven el mismo estado; una reasignación conserva historial; fuera de cobertura se informa antes de completar todo el formulario.

### O10 · P2 · L — Menú administrable en minutos

**Hacer:** edición en lote de precios, disponibilidad, categorías y horarios; duplicación de platillo/variantes; previsualización móvil y publicación con resumen. Para múltiples sucursales, plantilla compartida con excepciones explícitas y comparación antes de distribuir cambios.

**Terminado cuando:** actualizar diez precios toma un recorrido, no diez formularios; la vista previa coincide con lo publicado y una sucursal no pierde un precio local sin advertencia. Depende de D01 y T03.

## 8. Experiencia de comensales

### M01 · P1 · M — Entrar directo a la intención

**Hacer:** preservar acceso directo a carta desde QR de mesa, que ya existe. Para redes, abrir una portada breve con comida visible, estado de apertura y canal. Mantener identificación del restaurante y mesa sin pedirla de nuevo innecesariamente.

**Terminado cuando:** el cliente entiende dónde está, si puede pedir y para qué modalidad antes de llenar datos. El QR expirado o inválido tiene salida clara y no confunde mesas.

### M02 · P1 · L — Una carta que venda con la comida

**Hacer:** probar las ocho estructuras con fotografía real, platos claros, fondos oscuros y textos extensos. Limitar badges; diferenciar popularidad comprobada de selección del restaurante. Dar igual tratamiento cuidado a productos sin foto, sin inventar una imagen que prometa algo diferente.

**Terminado cuando:** nombre, precio, disponibilidad y acción son legibles en cada estructura; una carta con 100 productos permite llegar por categoría/búsqueda sin desplazamiento interminable. F10.

### M03 · P1 · M — Opciones inequívocas

**Hacer:** añadir default explícito definido por restaurante en vez de asumir siempre la primera opción. Mostrar requerido, mínimo, máximo y diferencia de precio. Advertir al cambiar una opción incompatible; no borrar silenciosamente lo elegido.

**Terminado cuando:** el resumen y la comanda conservan exactamente las selecciones; se puede corregir sin reconstruir el plato. Probar combos, cantidades, extra gratuito y variante que modifica precio. La preselección no debe decidir por el cliente una preferencia delicada sin indicarlo.

### M04 · P1 · M — Carrito editable y persistente

**Hacer:** editar extras desde cada línea, mostrar subtotal/cargos estimados y conservar carrito al navegar. Al volver después de un cambio de precio o stock, marcar la diferencia y solicitar decisión. Reducir recomendaciones repetidas entre ficha y carrito.

**Terminado cuando:** el usuario modifica una hamburguesa sin borrarla; dos versiones del mismo platillo se distinguen; ningún total cambia silenciosamente al confirmar.

### M05 · P1 · L — Checkout breve por modalidad

**Hacer:** evaluar datos estrictamente necesarios para mesa, retiro y entrega. Mantener compra invitada; autocompletar solo con datos autorizados; mostrar errores al lado del campo sin borrar lo demás. Mostrar total, propina y costo de entrega antes de confirmar.

**Terminado cuando:** pedido simple en mesa no exige un formulario de domicilio; errores de zona, teléfono o local cerrado tienen recuperación. Medir abandono por campo en pruebas, sin registrar su contenido personal.

### M06 · P1 · M — Seguimiento que distingue enviado de aceptado

**Hacer:** conservar página de seguimiento y hacer inequívocos «guardado en tu teléfono», «recibido», «aceptado», «preparando», «listo» y «entregado». Si se demora aceptación, explicar siguiente acción y forma real de contactar. Los tiempos estimados se presentan como rangos fundamentados.

**Terminado cuando:** nadie interpreta un pedido en cola offline como recibido en cocina; recargar no crea otro. Contacto y cancelación respetan el estado real.

### M07 · P2 · M — Lealtad que llega después de ayudar

**Hacer:** revisar la introducción Google de primera visita: ofrecer puntos después de agregar o al terminar, en una tarjeta discreta. Explicar por qué se identifica y si los puntos son de ese restaurante. Evaluar alternativa de acceso para quien no use Google, sin construirla antes de comprobar demanda.

**Terminado cuando:** quien solo quiere ver comida y pedir no debe cerrar una pantalla promocional; quien desea puntos entiende saldo, canje y vencimiento sin una explicación del personal.

### M08 · P1 · M — Accesibilidad y contenido útil de comida

**Hacer:** información de ingredientes/alérgenos confirmada por el restaurante, etiquetas escritas además de iconos, traducciones revisadas y botón de ayuda accesible. Asegurar que una nota relevante llegue a cocina y sea visible al preparar.

**Terminado cuando:** datos desconocidos se marcan como desconocidos; ninguna inferencia automática afirma ausencia de alérgenos. El lector de pantalla puede elegir variantes y oír su precio. Depende de D08.

## 9. Superadmin: operar y hacer crecer Leogin

### S01 · P1 · L — Cola de trabajo en vez de colección de alertas

**Hacer:** evolucionar salud existente a incidencias con responsable, prioridad, antigüedad, diagnóstico, estado y siguiente paso. Agrupar síntomas de la misma caída; permitir reconocer, posponer con razón y cerrar cuando se recupera.

**Terminado cuando:** una impresora caída no produce varias tareas desconectadas; conoces qué restaurante está afectado y qué hiciste. La alerta no desaparece solo por visitarla. Depende de T04.

### S02 · P1 · L — Activación y abandono por cohortes

**Hacer:** medir por semana de alta: menú publicado, primer pedido, primer cobro, uso recurrente y conversión a pago. Usar señales actuales de «sin platillos/sin pedidos» como inicio; distinguir vacaciones, cuenta de prueba y abandono probable.

**Terminado cuando:** puedes localizar el paso donde se atasca un grupo de cuentas y evaluar si un cambio mejoró la activación. No etiquetar «cliente perdido» por una regla de siete días sin contexto.

### S03 · P1 · L — Finanzas SaaS explicables

**Hacer:** ampliar MRR/cobrado/vencido existentes: nuevas altas, expansiones, bajas, morosidad y renovaciones; costo de soporte, infraestructura y mensajería por segmento. Separar mensualidad contratada de cobro recibido y de venta del restaurante.

**Terminado cuando:** toda cifra tiene definición, periodo, moneda y detalle reconciliable; puedes saber si Q99 es rentable para un perfil de uso. Decidir precios con esa evidencia, no solo por resultar baratos.

### S04 · P1 · L — Cobranza y cambios de plan sin sorpresas

**Hacer:** perfeccionar «Paga tu plan»: estados claros de comprobante, revisión, observación y aprobación; detectar reenvío duplicado, pagos parciales y moneda/periodo. Simular efecto de cambio de plan antes de aplicarlo y comunicar fecha efectiva.

**Terminado cuando:** una revisión doble no registra dos pagos, el restaurante sabe qué falta y una degradación no borra su trabajo. El vencimiento debe tener política de continuidad revisada para no interrumpir un servicio de forma inesperada.

### S05 · P1 · M — Ficha única con contexto de soporte

**Hacer:** reunir cuenta, restaurantes, plan, responsables, último acceso, última operación válida, dispositivos y cronología. Guardar notas de soporte con autor; vista del cliente en modo lectura y acceso temporal auditado para intervenciones autorizadas.

**Terminado cuando:** resolver «no puedo entrar» o «no imprime» no exige recorrer varias pantallas ni pedir al cliente que repita todo. No mostrar contraseñas ni secretos; no ampliar privilegios para facilitar soporte.

### S06 · P1 · L — Despliegues y funciones controlados

**Hacer:** estado de versión de web/desktop/agente, compatibilidad, migraciones y funciones por cohorte. Probar cambios de caja primero en entorno aislado y luego en pilotos acordados; definir rollback compatible con datos ya escritos.

**Terminado cuando:** sabes qué clientes usan cada versión y puedes detener una entrega problemática sin improvisar. La existencia de CI no reemplaza esa operación.

### S07 · P2 · L — Autoservicio que reduce dependencia de ti

**Hacer:** diagnóstico de impresora, asistente de arranque, recuperación de cuenta, actualización de datos de cobro y exportaciones desde el restaurante. Medir temas de soporte repetidos y convertir los frecuentes en tareas guiadas.

**Terminado cuando:** baja el tiempo de soporte por restaurante activo y el usuario resuelve los casos frecuentes sin llamarte. «Depender de Leogin» debe significar valor diario, no necesitar al fundador para operar.

### S08 · P2 · M — Panel comercial y recomendación

**Hacer:** embudo de prospecto → demo → piloto → activo → renovación; siguiente acción y motivo de pérdida. Referidos voluntarios tras un resultado real, con condiciones claras y seguimiento. Empezar simple, sin convertir superadmin en otro CRM enorme.

**Terminado cuando:** conoces origen, segmento y tasa de conversión, puedes dar seguimiento y medir recomendaciones. Los mensajes siempre requieren autorización y preferencias de contacto apropiadas.

## 10. Arquitectura y confiabilidad que sostienen la experiencia

### T01 · P0 · XL — Consistencia de pedido, descuento y pago

**Hacer:** inventariar invariantes monetarias y operaciones que deben ser atómicas. Investigar F21: cupón con último uso, puntos simultáneos y error tras crear pedido. Integrar reservas/consumo en transacción o diseñar compensación durable. Idempotencia por operación de cobro y devolución, no solo por pedido.

**Terminado cuando:** dos intentos con la misma clave no duplican dinero ni premios; un fallo intermedio deja resultado recuperable y visible. Probar contra Postgres real. Dividir en pedido/promoción, cobro, devolución y cierre.

### T02 · P0 · L — Guardado offline que no promete más de lo que logró

**Hacer:** `saveQueuedOrder` hoy absorbe fallos de almacenamiento. Cambiar el contrato para distinguir guardado durable, no guardado y conflicto; evaluar IndexedDB, expiración, versión y límite de cola. Reintentar con la misma identidad y conservar evidencia de confirmación.

**Terminado cuando:** almacenamiento lleno/denegado nunca muestra «guardado» falsamente; un pedido antiguo no se envía sin revisar precio, disponibilidad y vigencia. Definir qué sucede sin internet, sin LAN, sin PC y sin energía: son fallos diferentes.

### T03 · P1 · L — Datos completos al crecer

**Hacer:** reemplazar agregaciones de filas limitadas de F19 por consultas agregadas, índices y paginación; definir zona horaria de cada reporte. Mantener una prueba que cruce el límite histórico de filas y reconcilie resultado contra la base.

**Terminado cuando:** 100.001 registros no convierten una métrica en una muestra silenciosa; una consulta fallida no se interpreta como cero. Medir tiempos con datos representativos, sin extrapolar desde una demo vacía.

### T04 · P1 · L — Observabilidad de la cadena completa

**Hacer:** correlacionar creación, aceptación, comanda, impresión, pago y sincronización con identificadores. Usar la infraestructura de errores/salud existente; medir latencias y detectar operaciones atascadas. Confirmación de impresión y reimpresión claramente diferenciadas.

**Terminado cuando:** un pedido reportado puede localizarse sin leer datos personales innecesarios y se distingue «no llegó», «llegó sin aviso» y «falló la impresora». Alertar por impacto, no por cada log.

### T05 · P1 · L — Exportación completa y restauración probada

**Hacer:** renombrar la exportación actual según su alcance; diseñar exportación paginada con pedidos, líneas, pagos, descuentos, impuestos, recetas, stock, configuración y referencias de archivos. Separar portabilidad del cliente y backup operativo de plataforma.

**Terminado cuando:** restaurar en entorno aislado reproduce una muestra verificable de saldos y configuración; hay objetivo acordado de pérdida máxima de datos y tiempo de recuperación. Descargar un Excel de cuatro hojas no cumple por sí solo ese objetivo. F18.

### T06 · P0 · L — Pruebas del modelo de acceso actual

**Hacer:** extender el E2E existente a dueño con membresía y sin `restaurant_id`, empleado restringido, usuario con varios restaurantes y superadmin con segundo factor. Comprobar lectura, escritura, exportación, almacenamiento y acciones privilegiadas entre restaurantes.

**Terminado cuando:** la prueba reproduce las formas reales de alta y los límites se cumplen aunque se invoque directamente la acción. Conservar MFA/RLS/reautenticación existentes; no presentarlos como ausentes. F14/F20.

### T07 · P1 · L — Rendimiento percibido y medido

**Hacer:** medir portada, carta, ficha, checkout y servicio en móvil modesto y conexión limitada; presupuesto por ruta para JS, imágenes y trabajo de render. Medir respuestas de interacción, errores, carga y estabilidad, no solo una puntuación de laboratorio.

**Terminado cuando:** objetivos de campo al percentil 75: LCP ≤2,5 s, INP ≤200 ms y CLS ≤0,1; además, servicio responde con volumen real. Son metas por verificar, no cifras actuales. [Referencia de Web Vitals](https://web.dev/articles/vitals).

### T08 · P1 · M — Documentación viva y definición de terminado

**Hacer:** un registro por capacidad con estado: diseñada, implementada, probada, desplegada, activada y validada con clientes. Enlazar ticket, pruebas y versión; actualizar documentos cuando se retire una función. Los planes viejos no deben declarar vigente algo que el changelog quitó.

**Terminado cuando:** cualquier persona distingue «hay código» de «se puede vender». Un cambio solo cierra cuando su recorrido, error, permisos, accesibilidad y recuperación están verificados.

## 11. Matriz de aceptación: cómo exigir excelencia

No basta con pasar el caso feliz. Esta es la batería mínima para las funciones principales; ejecutar solo en entorno de pruebas aislado o pilotos expresamente acordados.

| Recorrido | Casos que deben pasar | Evidencia exigida |
|---|---|---|
| Alta | Dueño nuevo, membresía, segundo local, nombre largo, volver atrás, recargar, prueba vencida | Tiempo a primer valor y estado final consistente |
| Carta | 0, 1, 50 y 150 productos; foto fallida; búsqueda sin resultados; texto largo; local cerrado | Capturas por ancho y tarea completada |
| Opciones | Extra gratuito/de pago; requerido sin respuesta; máximo; dos versiones del plato; cambio desde carrito | Misma selección y total en cliente, servidor y comanda |
| Pedidos | Doble toque, timeout tras crear, reintento, dos clientes piden última unidad | Un pedido por identidad; stock nunca negativo por esa carrera |
| Promociones | Dos pedidos consumen último uso; saldo de puntos justo; cancelación y reversión | Uso/saldo/pedido consistentes y errores explicables |
| Cobro | Q100 entre 3; parcial por plato/importe; mixto; sobrepago; pago previo | Total exacto al centavo; ningún pago desaparece |
| Correcciones | Cambio de método, devolución parcial, permiso denegado, motivo y aprobación | Libro original conservado y ajuste trazable |
| Caja | Abrir, salida de efectivo, cobro al cerrar, dos aparatos cierran, noche cruza fecha, retomar borrador | Corte consistente con su periodo y movimientos |
| Cocina | 40 comandas, notas, cancelación parcial, plato listo antes que el resto, caída de socket | Estado visible correcto, acciones estables y recuperación |
| Salón | Sentada sin pedido, unir/separar, mover plato, cobro parcial, por limpiar, nueva sesión QR | Sin cobros ni llamadas atribuidas al grupo anterior |
| Offline | Cae WAN, cae LAN, PC apagada, navegador recarga, storage lleno, reconecta dos veces | Matriz de lo que funciona; nada falsamente confirmado |
| Impresión | Sin papel, desconexión, recibo duplicado, acuse perdido, reimpresión | Diferenciar original/reimpresión y conocer resultado pendiente |
| Inventario | Compras/unidades, merma, rendimiento, venta, devolución con o sin reposición | Conteo teórico/físico reconciliable |
| Lealtad | Invitado, Google, sesión caducada, puntos pendientes, canje y devolución | Reglas visibles; sin saldos inconsistentes |
| Suscripción | Alta, vencimiento, comprobante doble, cambio de plan, tope blando, varios locales | Importe/fecha/capacidades iguales en oferta, cuenta y cobro |
| Acceso | Dueño, cajero, cocina, mesero, grupo y superadmin; cambio de local | Solo datos/acciones autorizados; navegación útil por rol |
| Recuperación | Exportar más de 5.000 pedidos y restaurar una muestra aislada | Conteos, saldos y relaciones comprobados |

### Revisión visual por pantalla

- Anchos: 360, 375/390, 768, 1024 y 1440 px; vertical/horizontal donde el puesto lo use.
- Chrome Android y Safari iPhone reales; navegador/desktop usado por el restaurante; teclado virtual y mouse/teclado.
- Luz fuerte, brillo bajo, un uso con una mano y lectura de cocina a distancia.
- Tema claro/oscuro y tres marcas de restaurante muy distintas; foto blanca, foto oscura y foto ausente.
- Zoom al 200 %, texto largo, cantidades grandes, lista vacía, error y carga.
- Objetivos de texto: contraste 4,5:1 para texto normal y 3:1 para grande, con las condiciones del estándar. [W3C: contraste](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
- Objetivos táctiles internos de 48/56 px; WCAG 2.2 AA define un mínimo de 24 × 24 CSS px con excepciones de separación y contexto. No confundir «cumple el mínimo» con «cómodo en un restaurante». [W3C: tamaño de objetivo](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
- Cada tarea principal debe probarse con al menos una persona que no conozca el sistema. Registrar dudas, errores y ayuda recibida; no orientar a la persona durante la medición.


