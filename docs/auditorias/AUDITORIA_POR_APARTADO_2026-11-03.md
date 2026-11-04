# Leogin: auditoría y plan por apartado del restaurante

> **Copia archivada en el repositorio el 2026-11-04.** Texto sin cambios salvo los enlaces entre documentos. Las capturas `evidencias-v2/` (88 imágenes, 7,8 MB) no se suben al repo: quedan en la carpeta original de la entrega (`.codex/visualizations/2026/11/02/01a19d6f-…/evidencias-v2/`), por eso sus enlaces no abren desde aquí. El trabajo derivado se organiza en [PLAN_AUDITORIA_INTEGRAL_2026-11-04](../planes/PLAN_AUDITORIA_INTEGRAL_2026-11-04.md).

**Inspección del 3 de noviembre de 2026 · consolidación del 4 de noviembre · complemento prioritario del informe maestro · código 876dd50.**

Tu observación era correcta: la primera ampliación profundizaba mucho más en caja y cobro que en otros módulos. Este documento corrige esa distribución. Caja es uno de los apartados; catálogo, cocina, sala, clientes, promociones, configuración, dispositivos y análisis tienen especificaciones propias.

No es una lista de funciones que “deberían existir” sin mirar el producto. Se distinguen capacidades existentes, problemas observados, riesgos de código y mejoras propuestas. No se modificó el código del producto. La inspección se hizo en una copia local aislada y autorizada; los datos de las capturas son los de esa demo. Las fechas antiguas, los contadores vacíos y la falta de fotografías de sus fixtures no prueban problemas de producción.

**Cómo leerlo:** V = observado en navegador; C = código revisado; H = riesgo pendiente de reproducción; P = propuesta. P0 = verdad operativa, integridad o acceso antes de escalar; P1 = mejora para pilotos y uso diario; P2 = diferenciación posterior. P0 no significa automáticamente vulnerabilidad explotable. S/M/L/XL expresan tamaño relativo, no una estimación contractual.

El [informe maestro](AUDITORIA_INTEGRAL_2026-11-03.md) cubre además web comercial, comensal y superadmin con sus hallazgos, recorrido funcional y backlog base. Este complemento prevalece sobre formulaciones anteriores demasiado amplias acerca de funciones faltantes.

## 1. Opinión después de revisar más módulos

**El problema principal de Leogin no es tener pocas funciones. Es que su amplitud todavía no se convierte de manera consistente en facilidad, certeza y valor visible.** Hay mucho trabajo aprovechable: horarios con excepciones, recetas para costear, QR por mesa y PDF conjunto, varias estructuras de carta, plantillas personales, segmentación de clientes, analítica, permisos, dispositivos y separación de tareas. Rehacer todo perdería avances reales.

Sin embargo, siguen apareciendo contratos confusos entre pantallas: una pausa que parece aplicada antes de guardar; una encuesta llamada anónima con nombres visibles; “Configurar domicilio” que abre personalización; una copia llamada completa con alcance limitado; utilidad mostrada como cero sin explicar que faltan costos. Son problemas de confianza, además de diseño.

**No haría una carrera por añadir más módulos. Haría que cada módulo termine una tarea del dueño y conecte con la siguiente.** Inventario debe desembocar en qué comprar; reservas, en dónde sentar; promociones, en cuánto cuestan y si convienen; analítica, en una decisión con evidencia; dispositivos, en una prueba verificable de continuidad. La excelencia está en esas conexiones.

En diseño sí cambiaría bastante. Mantendría parte de la identidad cálida, pero reduciría tarjetas idénticas, sombras repetidas, microtexto y formularios permanentes. Distinguiría una carta para elegir comida, una pantalla para producir, una agenda para recibir gente y una herramienta para analizar el negocio. Una misma marca puede tener composiciones distintas según el trabajo.

## 2. Inventario y cobertura verificable

Las rutas `/admin/...` y `/panel/:slug/...` son entradas equivalentes contextualizadas en distintos recorridos. No se cuentan como dos funciones. La inspección visual de una pantalla no implica haber probado todas sus mutaciones, permisos o integraciones.

| ID | Apartado / ruta principal | Cobertura de esta auditoría | Evidencia / límite |
|---|---|---|---|
| R01 | Hoy · `/admin` | V + C | Vacío y con actividad; capturas 03 y recorrido anterior |
| R02 | Pedidos en vivo · `/admin/pedidos` | V + C | Lectura y pedido sintético; 04, 34 |
| R03 | Cocina · `/admin/cocina` | V + C | Comanda real de demo y marcar listo; 05, 38 |
| R04 | Mesas · `/admin/mesas` | V + C | Estado, cuenta y liberación de Mesa 1; 32 |
| R05 | Tomar pedidos · `/admin/mesero` | V + C | Servicio escritorio/móvil y cobros parciales; 33–37, 45–47 |
| R06 | Catálogo · `/admin/menu` | V + C | Vacío y 38 productos, filtros y edición; 01, 64 |
| R07 | Nuevo platillo · `/admin/menu/productos/new` | V + C | Formulario; 02; no publicación real |
| R08 | Editar platillo / opciones / receta | V + C | Ficha y borrador de extras descartado; 65; sin consumo de receta probado |
| R09 | Categorías · `/admin/categorias` | V + C | Edición, orden y disponibilidad; 63; sin reordenación concurrente |
| R10 | Ingredientes · `/admin/ingredientes` | V + C | Estado vacío y lógica de costos; 43 |
| R11 | Inventario · `/admin/inventario` | V + C | Panel con datos y ajustes disponibles; 42; sin conteo físico |
| R12 | Proveedores · `/admin/proveedores` | C + V del acceso | Redirige a Funciones en Premium; 79; compras activas no inspeccionadas visualmente |
| R13 | Clientes · `/admin/clientes` | V + C | Panel con datos; 39; sin contacto a clientes |
| R14 | Lealtad · `/admin/lealtad` | V + C | Miembros, recompensas y configuración; 57–59; sin canje concurrente |
| R15 | Cupones · `/admin/cupones` | V + C | Listado y formulario, escritorio/móvil; 56, 81–82 |
| R16 | Encuestas · `/admin/encuestas` | V + C | Datos, reseñas y explicación; 60 |
| R17 | Reservaciones · `/admin/reservaciones` | V + C | Listado y alta; 40–41; sin ciclo completo de una reserva |
| R18 | Lista de espera · `/admin/lista-espera` | V + C | Cola, alta y selector de mesa; 61–62; no se enviaron avisos |
| R19 | Resumen · `/admin/metricas` | V + C | Vacío y con datos; 06, 85 |
| R20 | Analítica · `/admin/analitica` | V + C | Rangos, mapa, rankings y móvil; 74, 83 |
| R21 | Finanzas · `/admin/finanzas` | V + C | Reporte y cobertura de costos; 09; no auditoría contable |
| R22 | Caja · `/admin/caja` | V + C | Recorrido sintético Q70 y persistencia; 07–08, 48–50 |
| R23 | Facturación · `/admin/facturacion` | C + V del acceso | Pantalla inactiva; 80; sin certificador ni validación fiscal |
| R24 | Ajustes · `/admin/ajustes` | V + C | Índice y enlaces; 10 |
| R25 | Perfil · `/admin/perfil` | V + C | Identidad y WhatsApp manual; 55 |
| R26 | Horarios · `/admin/ajustes/restaurante` | V + C | Pausa en borrador, horario, excepciones, zona y corte; 51 |
| R27 | Salón · `/admin/ajustes/salon` | V + C | Configuración, plano apagado y QR; 52; editor de plano activo no recorrido |
| R28 | Entrega · `/admin/ajustes/entrega` | V + C | Zonas y radio desactivado; 53; geocodificación y fronteras no probadas |
| R29 | Pedidos y cobro · `/admin/ajustes/pedidos` | V + C | Reglas, propina, moneda y semáforos; 54 |
| R30 | Repartidores · `/admin/repartidores` | V + C | Vacío y alta; 76–77; sin reparto real |
| R31 | WhatsApp · `/admin/whatsapp` | V + C | Conexión asistida; 78; sin Meta ni mensajes externos |
| R32 | Personalización · `/admin/personalizacion` | V + C | Cinco pestañas, preview y móvil; 66–68, 84; no todas las combinaciones |
| R33 | QR · `/admin/qr` | V + C | Enlaces y formatos de exportación; 69; sin prueba impresa física |
| R34 | PC del local · `/admin/mi-pc` | V + C | Instalación, impresión y continuidad; 70; sin hardware conectado |
| R35 | Personal y permisos · `/admin/personal` | V + C | Listado y permisos; 11–12; no se cambiaron accesos originales |
| R36 | Suscripción · `/admin/suscripcion` | V + C | Estado y explicación del plan; 44; no cambio contractual |
| R37 | Funciones · `/admin/modulos` | V + C | Canales, módulos y enlaces; 71 |
| R38 | Copia de datos · `/admin/respaldo` | V + C | Alcance visible y generador XLSX; 72; sin restauración probada |
| R39 | Ayuda · `/admin/ayuda` | V + C | Búsqueda y contenido; 73; búsqueda “impresora” |
| R40 | Tu año · `/admin/tu-ano` | V + C | Resumen con datos; 75; no se compartió |

**Extensiones:** Mi cuenta, Resumen, Finanzas y Seguridad se inspeccionaron con la identidad sintética de un solo restaurante (86–88). La comparativa de varios locales y el portal del repartidor se revisaron por código, sin afirmar una prueba visual con sus roles completos. `/central` conserva redirecciones hacia Mi cuenta: no debe tratarse como un panel separado que haya que reconstruir. Impresión/sin-internet/escritorio se consolidan en Mi PC: conservar esa simplificación.

## 3. Hallazgos nuevos que requieren tareas concretas

| ID | Evidencia y problema | Impacto | Corrección y aceptación |
|---|---|---|---|
| X01 · P0 | **V/C:** Horarios cambia a “Pedidos en pausa / Tus clientes no pueden pedir” antes de Guardar horario. Captura 51; `hours-editor.tsx`. | El encargado puede creer que detuvo pedidos durante una saturación. | Estado aplicado separado del borrador. Al tocar: “Pausar al guardar” o acción inmediata dedicada con confirmación del servidor. Un fallo nunca debe mostrar pausa aplicada. |
| X02 · P1 | **V/C:** Encuestas muestra nombres y afirma anonimato; `checkout-success.tsx` envía `customerName`. 60. | Promesa contradictoria sobre la información del cliente. | Decidir y documentar modelo real. Si es identificada, explicarlo antes de responder; si es anónima, retirar vínculo e identificadores según diseño acordado. |
| X03 · P1 | **V/C:** Cupones tiene botones de editar y eliminar sin nombre accesible. En móvil medían 32 × 40 CSS px; no afirmar que violan automáticamente el mínimo WCAG. 56, 81. | Acciones poco claras con lector de pantalla y fáciles de confundir. | Etiquetas “Editar BIENVENIDA10”, “Archivar…”, agrupación y objetivo táctil interno 44–48 px. |
| X04 · P0 | **C/H:** `couponStatus` omite `valid_from`; la edición no lo envía y `updateCoupon` lo reemplaza por null. | Un cupón programado puede anunciarse activo o perder su comienzo al editar. | Estado compartido en servidor/cliente, conservar fechas no editadas y probar cupón futuro antes/después de cambiar descripción. |
| X05 · P0 | **C/H:** `valid_until` recibe una fecha sin hora. La semántica UTC de una fecha puede terminar el beneficio antes del final del día local. | Descuentos rechazados mientras el dueño piensa que siguen vigentes. | Fecha local inclusiva en UI, límite exclusivo del día siguiente convertido según zona. Probar 23:59 y 00:00 en Guatemala. Confirmar serialización real antes de migrar datos. |
| X06 · P0 | **C/H:** `hasActiveCoupons` consulta solo 20 activos y después filtra fechas/usos. | Un cupón válido situado después de veinte expirados puede no habilitar el campo del checkout. | Filtrar vigencia en base de datos o consultar existencia completa. Fixture de 21 cupones con el último vigente. |
| X07 · P1 | **C:** Recompensas ignora resultado de errores al eliminar y activar; `loyalty-panel.tsx`. | El usuario no sabe si la operación falló. | Resultado tipado, error visible y conservación del estado previo. Archivar con historial y confirmar alcance; comprobar FK antes de afirmar pérdida de canjes. |
| X08 · P0 | **C/H:** Guardar receta borra líneas y luego inserta; el primer error no se comprueba. `recipes.ts:166`. | Una inserción fallida puede dejar la receta vacía o incompleta. | Reemplazo transaccional con validación de pertenencia y cantidades. Error inyectado debe conservar receta y costo anteriores. |
| X09 · P0 | **V/C/H:** Ficha y Funciones prometen descuento de stock por receta; la migración 088 documenta costeo sin consumo automático. En rutas revisadas no se encontró ese consumo. | Promesa de control de insumos que requiere demostración. | Ejecutar prueba de receta antes de venderlo como automático. Corregir texto si solo costea; implementar consumo versionado e idempotente si se promete. No se afirma un resultado de inventario no ejecutado. |
| X10 · P0 | **C/H:** Cabecera/líneas de compra se guardan por separado; cambio de estado no condiciona el estado previo. Recepción RPC bloquea y protege RECIBIDA, pero reabrirla puede invalidar esa defensa. | Compras parciales o doble recepción en secuencias inválidas. | Creación atómica, máquina de estados y movimientos de reversión; probar recibido→borrador→recibido y rechazarlo sin duplicar stock. |
| X11 · P0 | **C/H:** Compras, recetas y reparto reciben referencias relacionadas sin validación de pertenencia claramente completa en las acciones revisadas. | Posible cruce de restaurante por ID manipulado; no se reprodujo explotación. | Validar restaurante de cada producto/insumo/perfil/repartidor y usar restricciones compuestas donde corresponda. Pruebas negativas entre dos tenants sin fuga ni modificación. |
| X12 · P1 | **C/H:** Orden de categorías se cambia con dos actualizaciones separadas y errores sin devolución útil. | Orden inconsistente ante concurrencia o fallo parcial. | Reordenación atómica de IDs, versión y confirmación visual; dos editores concurrentes reciben conflicto recuperable. |
| X13 · P1 | **V/C:** “Hoy más temprano” en espera usa historial reciente sin filtro de día. Los fixtures antiguos evidencian el rótulo, no una espera real de 202 horas. 61. | Mezcla de períodos y confusión de recepción. | Filtrar por día de negocio o renombrar “Historial reciente” mostrando fecha. |
| X14 · P0 | **C/H:** Sentar grupo actualiza cola antes de `seatTable`; si falla ocupar mesa, el estado sentado ya persistió. | Cola y salón pueden discrepar. | Una transacción o estado explícito de asignación pendiente con recuperación. Conflicto de mesa no debe desaparecer del trabajo pendiente. |
| X15 · P1 | **V:** Configurar domicilio y para llevar en Funciones enlaza a Personalización; configurar local enlaza a Mesas operativas. 71. | El dueño llega a otro trabajo y necesita buscar de nuevo. | Domicilio→Entrega, local→Salón y recogida→reglas correspondientes; enlaces con ancla a sección si hace falta. |
| X16 · P1 | **V/C:** “Copia completa” contiene cuatro hojas y hasta 5.000 pedidos; faltan otras entidades y elementos necesarios para reconstruir el negocio. 72. | Se puede confundir portabilidad parcial con respaldo restaurable. | Llamar “Exportación de datos” al alcance actual; exportación completa paginada con manifiesto, versión y prueba de importación si se ofrece respaldo. |
| X17 · P1 | **C/H:** Salud PC se considera obsoleta a 10 min en Ajustes y desconectada a 90 s en Mi PC. | Dos diagnósticos distintos para un mismo equipo. | Contrato único de salud con fecha, estado y tolerancia; probar heartbeat de 2 min. |
| X18 · P1 | **V:** Buscar “impresora” en Ayuda muestra impresión de pedidos, sin llevar directamente a preparar Mi PC. 73. | Una tarea de instalación termina en una explicación del recibo. | Índice por intención y sinónimos; resultado principal “Configurar impresora / PC del local” con enlace directo. |
| X19 · P1 | **V/C:** Analítica imprime `CARD`; agrupa ventas por nombre del snapshot y usa límites 20.000 pedidos / 2.000 productos. 74, `analytics.ts`. | Terminología técnica; rankings divididos al renombrar; cobertura potencialmente parcial al crecer. | Etiquetas traducidas, IDs estables con nombre histórico y agregación SQL; declarar cobertura. No confundir con Finanzas, que ya usa agregación SQL. |
| X20 · P0 | **C/H:** Varias lecturas de encuestas, cupones, espera y analítica convierten error en lista vacía o cero. | “No pasó nada” puede significar “no pudimos leerlo”. | Estados éxito vacío/error/parcial separados y reintento conservando último dato con fecha. |
| X21 · P1 | **V/C:** Mi cuenta/Finanzas mostró ingreso Q5.689,30, costo Q0 y utilidad Q0 sin nota visible de cobertura. 87. | El dueño puede interpretar desconocimiento de costos como resultado real. | “Margen no disponible: faltan costos” y cobertura; misma semántica en sucursal, consolidado y exportación. |
| X22 · P1 | **V:** Personalización ofrece 8 estructuras, 26 paletas, múltiples fuentes y efectos, con preview apagada inicialmente. 66–68. | Exceso de decisiones antes de ver una carta útil. | Tres recomendaciones por tipo de carta/contenido, muestra ligera inicial y acceso progresivo a todo el editor existente. |
| X23 · P1 | **V/C:** Textos permite mantener tiempos genéricos como 8–12 y 20–30 minutos y “notificado al instante”. | Los textos pueden sonar a promesa operativa sin comprobar tiempos ni recepción. | Variables del estado real, estimación explícita y texto neutro cuando no se sabe. No sustituir un acuse por una frase configurable. |

## 4. Plan detallado: operación y catálogo

### R01 · Hoy — P1 · M

**Conservar:** resumen, pendientes, pedidos, mesas y onboarding existentes. **V:** la primera experiencia y la de negocio activo necesitan jerarquías distintas.

1. Diseñar tres estados: preparando apertura, turno activo y cierre terminado. Un negocio sin carta ve pasos de activación; uno activo ve incidencias y servicio.
2. Encabezado: restaurante, día de negocio, recepción abierta/pausada y última sincronización. Una sola acción dominante según rol.
3. Ordenar pendientes por consecuencia: pedido sin atender, comida lista, caja pendiente, stock; el logo incompleto no debe desplazar servicio.
4. Cada alerta necesita causa, antigüedad, responsable y acción. Agrupar diez productos bajos en una tarea de inventario.
5. Mostrar beneficio verificable semanal: pedidos atendidos, cierres completos, tiempos medidos. No inventar dinero ahorrado.

**Aceptación:** con 0, 1 y 50 pedidos, un encargado identifica su siguiente tarea en menos de 10 segundos en una prueba moderada. Si falla un dato, no aparece “todo bien”. Dependencias: estados de lectura y contrato de jornada.

### R02 · Pedidos en vivo — P0/P1 · L

**Conservar:** estados, comprobantes, filtros y comunicación con cocina. **Mejorar:** gestión de excepciones y escaneo rápido.

1. Cada tarjeta debe priorizar número, canal, tiempo transcurrido, estado y siguiente acción. Notas operativas con jerarquía superior al contacto secundario.
2. Diferenciar aceptación del restaurante, preparación, entrega y pago. Un pedido entregado no debe implicar cobrado sin un registro compatible.
3. Mostrar causa y responsable de rechazo/cancelación; explicar reposición y tratamiento del cobro antes de confirmar.
4. Añadir indicador de conexión y sincronización sin convertir cada reconexión en ruido. Conservar pedido seleccionado al refrescar.
5. En operaciones repetidas, deshabilitar envío local pendiente y deduplicar en servidor; recuperación con el mismo identificador de operación.
6. Detalle con historial ordenado de cambios, pagos y fallos de avisos. Redacción para cocina y mesero, sin códigos internos.

**Aceptación:** doble clic y reintento generan una transición; dos empleados ven el conflicto y el estado final; filtro activo no esconde una incidencia urgente sin indicador. Pruebas de concurrencia pendientes, no certificadas por el caso Q70.

### R03 · Cocina — P1 · L

**Conservar:** tablero, prioridades temporales configurables y marcar listo. El pedido de demo llegó y salió correctamente.

1. Vista por estación y vista de pase; separar “mi parte lista” de “pedido entero listo”. Preservar identidad de mesa y secuencia de servicio.
2. Tipografía grande para producto/cantidad; modificaciones debajo de cada línea; no relegarlas a una nota general. Alérgenos declarados deben mantener visibilidad.
3. Colores por estado con texto y tiempo; evitar usar solo naranja para toda urgencia. Alto contraste, pocas sombras y movimiento mínimo.
4. Agrupar preparaciones repetidas conservando a qué pedido pertenecen; nunca mezclar variantes incompatibles bajo una cantidad total.
5. Recuperar un marcado accidental con operación auditada; impedir que desaparezca trabajo sin una señal de éxito persistente.
6. Registrar demora por estación y estimación de capacidad, inicialmente como ayuda revisable por encargado.

**Aceptación:** cocina con 30 comandas encuentra la más atrasada, distingue una variante y recupera un marcado sin duplicar el pedido. Prueba física a distancia y con el dispositivo real antes de fijar tamaño final.

### R04 · Mesas — P1 · L

1. Separar ocupación física, estado de servicio, cuenta y reserva. “Pagada” y “libre” deben poder ser distintos cuando el local lo necesita.
2. Diseñar fichas de mesa con número dominante, personas, espera y saldo; color discreto hasta que exista una acción urgente.
3. Panel lateral con comanda, pagos, solicitudes y reserva asociada, sin perder el mapa.
4. Trasladar/unir mesas mediante selección explícita de origen y destino, previsualizando consumos y responsables; conservar historial.
5. Conectar reserva y espera con disponibilidad por capacidad; mostrar conflicto antes de sentar y resolverlo de forma atómica.
6. Añadir estados “limpieza” y “reservada desde…” si el segmento los necesita; no bloquear una mesa todo el día por una reserva futura.

**Aceptación:** dos hosts no ocupan la misma mesa simultáneamente; mover una mesa conserva cuenta y solicitudes; una cuenta pagada puede esperar limpieza sin nuevas ventas accidentales.

### R05 · Tomar pedidos — P1 · L

1. Mantener el flujo rápido existente, pero estabilizar posiciones y atajos durante el turno. Popularidad no debe mover el producto debajo del dedo.
2. Búsqueda por nombre y alias de trabajo; filtros previsibles; favoritos propios por rol/dispositivo con revisión del dueño.
3. Al elegir extras obligatorios, indicar qué falta antes de enviar. Ediciones posteriores deben mostrar qué se añadió, retiró o ya preparó.
4. Mantener mesa, personas, ronda y saldo visibles; en móvil, resumen colapsado que siga mostrando pendiente real.
5. Cobro por persona debe registrar partes, no solo calcularlas. Manejar resto de centavos, métodos mixtos, descuentos y propina con reglas explícitas.
6. Retirar promociones de venta cuando el usuario ya está cerrando la cuenta. Recibido/vuelto y confirmación ocupan la atención.

**Aceptación:** pedido con modificación llega idéntico a cocina; cuenta 100/3 cuadra a centavos; dos cobros simultáneos no exceden saldo; último pago no pierde trazabilidad. Véase recorrido y pruebas pendientes del maestro.

### R06 · Catálogo — P1 · M

**V:** ya hay búsqueda, filtros de categoría, agotados, sin foto, exportación y una lista que explica qué no puede pedirse. Conservarlos.

1. Cabecera compacta con total publicado, problemas accionables y “Nuevo platillo”. Evitar que dos agotados consuman siempre la mayor parte del primer pantallazo.
2. Filtros combinables con contador y limpiar; separar “sin foto”, “sin costo”, “sin categoría”, “agotado por stock” y “oculto”.
3. Orden explícito: categoría/orden público/nombre/última edición. No presentar un orden aparentemente arbitrario como si fuera el del comensal.
4. Acciones masivas para categoría, disponibilidad y precios, con vista previa de antes/después y selección visible. No una hoja de cambios que se publique sin resumen.
5. Edición lateral rápida de precio/disponibilidad y enlace a ficha completa. Al volver, conservar búsqueda, scroll y selección.
6. Indicador de salud del menú con tareas concretas, sin castigar cartas deliberadamente sin fotografía.

**Aceptación:** cambiar disponibilidad de cinco productos toma un flujo con resumen; se puede encontrar y abrir un producto entre 300 sin perder contexto; un fallo de lote no aparenta éxito total.

### R07 · Nuevo platillo — P1 · M

1. Primer paso mínimo: nombre, precio, categoría; guardar borrador y previsualizar. Foto y contenido enriquecido en segundo nivel.
2. Mostrar moneda junto al precio y validar negativos, decimales, nombre vacío y categorías eliminadas en servidor.
3. Duplicar como punto de partida con aviso de qué se copia: opciones, receta, foto y etiquetas; no heredar stock accidentalmente.
4. Fotos con recorte y composición consistentes, estado de subida/error, texto alternativo derivado editable y límites comprensibles.
5. Etiquetas comerciales separadas de declaraciones dietarias/alérgenos. Evitar que “Vegano” libre y “Vegano” estructurado se contradigan.
6. Alta por lote/importación guiada con revisión por fila; sugerencias de texto requieren aprobación del restaurante y no inventan ingredientes.

**Aceptación:** una persona nueva publica tres productos coherentes sin explicación; cancelar no deja imágenes o productos huérfanos; borrador no aparece en la carta.

### R08 · Ficha, extras, combos y receta — P0/P1 · L

**V:** hay opciones de elección única/múltiple/combos, precios adicionales, dietas, costo y puntos. No proponerlos como inexistentes.

1. Pestañas o secciones plegables: Básico, Opciones, Costos/receta, Disponibilidad. Vista del comensal junto a total calculado.
2. En cada grupo: título, obligatorio, mínimo, máximo y elección predeterminada válida. En cada opción: precio final o adicional claramente diferenciado.
3. Biblioteca reutilizable de grupos con versión: cambiar “Bebidas” debe listar productos afectados y permitir excepción por producto.
4. Simulador de tres pedidos: mínimo, configuración habitual y máximo; mostrar precio, costo disponible y comanda resultante.
5. Guardado transaccional de receta; unidad/cantidad/rendimiento y costo incompleto explícitos. Validar que todos los ingredientes pertenecen al restaurante.
6. Precio y receta versionados para que una actualización no cambie el costo histórico de ventas ni una comanda ya confirmada.
7. Archivar producto conservando nombre/precio/opciones del historial. Confirmación con impacto, separada de “agotado por hoy”.

**Aceptación:** cambio de receta con fallo deja versión previa intacta; combo respeta mínimos/máximos; subtotal de ficha, carrito, cocina y recibo coincide; un pedido histórico conserva su snapshot.

### R09 · Categorías — P1 · M

1. Reducir altura de filas; nombre, número de productos, horario y estado en una línea principal. Edición expandida con una sola representación del ícono, evitando duplicidad visual.
2. Orden por arrastre con alternativa teclado/subir/bajar; guardado atómico con versión.
3. Previsualizar disponibilidad “Hoy a las 08:30” y mostrar intersección con horario del local. Una categoría disponible no abre un restaurante cerrado.
4. Renombrar, fusionar y reasignar productos con resumen. Eliminar no debe dejar productos invisibles por accidente.
5. Traducción con cobertura y fallback explícito; nombres largos probados en menú y pestañas.

**Aceptación:** reordenar no duplica posiciones; error de horario devuelve validación y no se transforma silenciosamente en “todo el día”; categorías vacías tienen tratamiento decidido en carta.

### R10 · Ingredientes y recetas — P0/P1 · L

1. Separar claramente costeo teórico, existencia y consumo real. Hasta probar el descuento automático, no prometerlo.
2. Unidad base por ingrediente; conversiones de compra a receta, rendimiento y merma esperada. No permitir gramos × precio/kg sin conversión visible.
3. Lista con costo actual, última compra, productos que lo usan y avisos de costo faltante. Abrir detalle muestra efecto sobre márgenes.
4. Simular alza de un insumo: productos afectados y margen estimado; el dueño decide precios, el sistema no los cambia solo.
5. Crear consumo por evento definido —por ejemplo confirmación/preparación— con deduplicación, devolución y desperdicio separados. Cambiar una receta no reescribe ventas anteriores.
6. Ajuste de costo o unidad con validación y explicación de impacto; conservar trazabilidad de compras y correcciones.

**Aceptación:** una receta de 150 g consume/costea 0,15 kg cuando corresponde; anulación antes/después de preparación tiene tratamiento definido; nueva compra recalcula costo futuro sin alterar histórico. Dependencias: libro de movimientos, versiones y contratos de pedidos.

### R11 · Inventario — P1 · L

1. Vista de trabajo “por revisar hoy”: agotados, bajo mínimo, sin contar y diferencias, en lugar de una tabla sin priorización.
2. Diferenciar existencias registradas, comprometidas y disponibles. Distinguir producto terminado de insumo de receta.
3. Conteo ciego opcional: capturar cantidad física, después mostrar diferencia y exigir motivo de ajuste según umbral.
4. Movimientos con origen navegable: venta, compra, devolución, merma, traslado o corrección. Evitar editar un número sin explicación.
5. Reposición sugerida a partir de consumo observado y plazo del proveedor, mostrando poca confianza cuando falta historial.
6. Conciliar agotado manual vs agotado por stock; reactivar no debe vender una unidad que sigue sin existir.

**Aceptación:** stock inicial + entradas − salidas coincide con final; dos pedidos por la última unidad no venden dos; ajuste sin permiso falla también en servidor; desactivar control tiene impacto explícito.

### R12 · Proveedores y compras — P0/P2 · XL

**C/V de acceso:** módulo condicional, no accesible como compra activa en la demo Premium. Ya existe recepción atómica con costo promedio; conservarla y cerrar transiciones que la debilitan.

1. Estados: borrador, enviada, parcialmente recibida, recibida, cancelada. Devolución como documento relacionado, no volver a poner RECIBIDA en borrador.
2. Cabecera y líneas transaccionales; cantidades, moneda, unidad, referencia de proveedor e idempotencia validadas.
3. Recibir con pedido vs entregado, faltantes, sobreentrega permitida y razón; sumar solo cantidad aceptada.
4. Proveedor con productos habituales, precios anteriores y plazos; comparación de costo por unidad comparable.
5. Crear propuesta de compra desde faltantes/stock mínimo; el encargado revisa antes de enviarla.
6. Deuda y vencimiento separados de recepción física; un producto recibido no equivale a factura pagada.
7. Probar referencias entre tenants y permisos; un proveedor o insumo ajeno no puede asociarse por manipulación del formulario.

**Aceptación:** recibir 6 de 10 conserva 4 pendientes; repetir la recepción no suma otras 6; error en líneas no deja cabecera huérfana; reversión mantiene libro de movimientos. No habilitar comercialmente por tener la pantalla construida.

## 5. Plan detallado: clientes, crecimiento y recepción

### R13 · Clientes — P1 · L

1. Lista orientada a decisiones: nuevos, frecuentes, por recuperar, con incidencia abierta; reglas de cada segmento visibles.
2. Ficha con historial de compras, preferencias declaradas, lealtad y atención. No inferir alergias ni datos sensibles de comentarios ambiguos.
3. Identidad: distinguir invitado, usuario identificado, teléfono compartido y registros potencialmente duplicados. Fusionar con revisión e historial.
4. Métricas con período: gasto registrado, última compra, frecuencia; no llamar “cliente nuevo” a alguien solo porque se creó un perfil después de comprar.
5. Acción de seguimiento ligada a motivo y consentimiento/canal disponible, con vista previa. Ningún envío masivo automático por crear segmento.
6. Mostrar qué datos faltan para medir recompra; conservar exportación y control de acceso.

**Aceptación:** dos clientes que comparten teléfono no se fusionan silenciosamente; segmentación puede explicarse con pedidos reales; cambiar filtro y volver de ficha conserva contexto.

### R14 · Lealtad — P0/P1 · L

**Conservar:** miembros, recompensas, límites, reglas, guardado de cambios y explicación de Google. **V:** la pantalla inicial pone el ajuste manual por encima de la comprensión del programa.

1. Resumen con miembros activos, recompra observada, puntos emitidos/canjeados y costo de premios; ajustes manuales dentro de ficha o acción secundaria.
2. Diseñador con ejemplo: “Por Q100 obtiene X puntos; necesita N compras para este premio”. Mostrar costo estimado con cobertura de ingredientes.
3. Catálogo de recompensas previsualizable, disponibilidad y límites; archivos en lugar de borrado cuando hay historial.
4. Libro de puntos: motivo, pedido, actor, vencimiento si se introduce y saldo resultante. Ajuste con razón obligatoria, autorización y error recuperable.
5. Reglas de acumulación/canje ante cancelación, pago parcial, descuento, redención concurrente y cambio de programa. Publicarlas para el comensal con lenguaje simple.
6. Doble de puntos y sorpresa: presupuesto y condiciones explícitos; premio prometido debe poder cumplirse. Medir efecto sin afirmar causalidad por una subida de ventas.
7. Incorporación progresiva: explicar valor antes de pedir Google; evaluar alternativa de identificación para el segmento, sin imponer una cuenta para ver o pedir.

**Aceptación:** dos canjes contra un mismo saldo solo consumen lo disponible; anulación revierte según regla; una recompensa pausada no se ofrece; error de guardado queda visible. Mostrar ejemplo económico antes de activar.

### R15 · Cupones — P0/P1 · L

1. Estados reales: borrador, programado, vigente, pausado, agotado y vencido, con inicio/fin y zona horaria.
2. Formulario en tres bloques: beneficio, condiciones y vigencia. Resumen “10% hasta QX, compra mínima QY, termina…” y pedido de prueba.
3. Moneda única del restaurante, límites por cliente/global, compatibilidad con lealtad y descuentos, presupuesto si se añade.
4. Conservar fechas al editar, registrar cambios y separar pausar de archivar. Historial de usos permanece accesible.
5. Medir órdenes con cupón, descuento entregado y margen cubierto; distinguir atribución del cupón de venta incremental demostrada.
6. Evitar falsas promociones para nuevos clientes cuando no se puede determinar identidad; explicar la regla verificable.

**Aceptación:** 21 cupones, último válido, campo visible; dos usos por la última plaza no sobrepasan el límite; vigencia funciona a medianoche local; suma de beneficios respeta tope y total no negativo.

### R16 · Encuestas — P1 · M

1. Resolver la promesa de anonimato antes de mejorar gráficos. Texto coherente para dueño y comensal.
2. Período y número de respuestas visibles; promedio acompañado de distribución y tasa de respuesta sobre pedidos elegibles.
3. Bandeja de comentarios con tema, prioridad, responsable y resolución. Una reseña leída no equivale a atendida.
4. Detalle de contexto permitido por el modelo de privacidad, sin exponer más datos de los necesarios.
5. Solicitar en momento apropiado y evitar pedir calificar antes de recibir servicio. No suprimir comentarios negativos ni enviar solo los positivos a reseñas públicas.
6. Agregación completa en servidor; filtros por fecha/canal y manejo explícito de errores. El límite de 100 reseñas de la lista no debe definir todo el análisis.

**Aceptación:** 1.500 respuestas producen total exacto; período respeta zona del restaurante; encuestado entiende si se guarda su nombre; un comentario puede asignarse, resolverse y auditarse.

### R17 · Reservaciones — P1 · L

1. Agenda por turno con ocupación prevista, capacidad y próximas llegadas, además del listado existente.
2. Alta rápida: fecha, hora, personas, nombre/contacto; mesa opcional hasta validación de capacidad. Duración por tipo de servicio configurable.
3. Estados pendiente, confirmada, llegó, sentada, completada, no asistió y cancelada; cada transición explica su efecto sobre disponibilidad.
4. Recordatorios y confirmación solo mediante canal conectado; mostrar enviado/entregado/fallido según evidencia disponible.
5. Reprogramar con conflicto visible y conservar cambios. Alertar solapamiento de mesa y reserva importante sin convertir toda la agenda en alarma.
6. Políticas de tolerancia y depósitos, si el segmento los necesita, como fase posterior con reglas claras; no introducir cobro externo en una demo de lectura.

**Aceptación:** dos reservas simultáneas no superan capacidad sin autorización explícita; llegada abre la mesa correcta una vez; fallo entre reserva y salón se recupera sin estados contradictorios.

### R18 · Lista de espera — P0/P1 · L

**Conservar:** alta rápida, aviso, selección de mesa y conexión con `seatTable`. Ya no es solo una lista desconectada.

1. Fila por grupo: personas, espera, estado del aviso, mesa compatible y próxima acción. No obligar a leer teléfono antes del tiempo.
2. Diferenciar “abrí WhatsApp”, “aviso registrado” y “mensaje confirmado” según integración. Un enlace externo no garantiza entrega.
3. Sugerir mesa por capacidad y disponibilidad, manteniendo la decisión del host. Mostrar por qué un grupo posterior puede caber antes.
4. Sentar con transacción y control de versión; si falla asignación, mantener tarea recuperable.
5. Historial con fecha correcta y filtros; grupos pendientes de días anteriores deben pedir revisión, no borrarse automáticamente sin política.
6. Tiempo estimado como rango con evidencia, cancelación/no presentación y seguimiento de precisión.

**Aceptación:** falla al ocupar mesa y el grupo continúa pendiente con causa; historial de ayer no se titula “hoy”; no se marca mensaje entregado al abrir un enlace.

## 6. Plan detallado: resultados, dinero y configuración

### R19 · Resumen de negocio — P1 · M

1. Mantener comparación 7/30 días, pero unificar rótulos de período; la gráfica de visitas de 14 días y personas de 30 deben ser distinguibles.
2. Declarar qué es venta, pedido válido, visita y persona/dispositivo. No equiparar sesión con persona única real.
3. Cada cifra debe abrir su detalle con el mismo filtro y los mismos límites de jornada.
4. Tres observaciones útiles con evidencia y acción, por ejemplo “subieron cancelaciones” → ver pedidos y razones.
5. Fecha de actualización, cobertura y error visibles; evitar variaciones porcentuales rotundas con bases mínimas sin contexto.

**Aceptación:** total del resumen concilia con detalle filtrado; comparación usa períodos equivalentes; 0→1 no produce infinito ni falsa mejora significativa.

### R20 · Analítica — P1 · L

1. Traducir `CARD` a Tarjeta y centralizar diccionario de métodos. Definir si cuenta intención de pago o movimientos efectivamente cobrados.
2. Mapa de calor con escala, valor por celda accesible y alternativa tabular; scroll horizontal visible en móvil.
3. Ranking por producto estable, con disponibilidad y días a la venta. Un producto agotado todo el período no es necesariamente poco deseado.
4. Tiempos con número de muestras, mediana/percentiles y fases separadas; un promedio solo puede ocultar colas largas.
5. Mover cálculos limitados a agregación completa en base; distinguir fallo de cero. Conservar contrato de día de negocio ya implementado.
6. Vincular hallazgo a tarea: preparar más, revisar una cancelación, editar un producto. Predicción posterior con rango de confianza y posibilidad de ignorar.

**Aceptación:** más de 20.000 pedidos no trunca análisis; renombrar producto no lo duplica en ranking; lector de pantalla obtiene el valor del mapa; una recomendación dice de qué datos nace.

### R21 · Finanzas — P0/P1 · L

1. Diferenciar venta, cobro, devolución, propina, envío, costo cubierto y margen bruto. No llamar beneficio neto a una resta parcial.
2. Cuando falta costo, mostrar desconocido y porcentaje de ventas costadas; excluirlas de margen calculado con explicación.
3. Mantener agregación SQL existente; revisar coherencia con pagos parciales, métodos mixtos y fecha de negocio.
4. Detalle reconciliable desde cada cifra hasta movimientos; exportación con período, moneda, zona y definiciones.
5. Vista sencilla para dueño y detalle ampliable; no cinco tarjetas numéricas sin saber qué decisión tomar.
6. Gastos operativos, cuentas por pagar y beneficio neto solo cuando exista modelo completo y reconciliado; no maquillar un indicador con datos insuficientes.

**Aceptación:** mismos filtros arrojan mismos importes en resumen, detalle y XLSX/PDF; costo faltante nunca se confunde con costo cero real. En consolidado se conserva esa advertencia.

### R22 · Caja — P0/P1 · L

El detalle de caja ya está desarrollado en el maestro; se conserva y se equilibra con el resto de este documento.

1. Abrir, operar, contar, explicar diferencias y cerrar como estados distintos. No mostrar ✓ en un paso sin realizar.
2. No permitir cierre sin apertura cuando esa es la regla del local; alternativa de caja sin turno debe ser un modo explícito.
3. Período de movimientos y horario de turno diferenciados, especialmente si se abre tarde.
4. Conteo por denominación y método, movimientos justificados, devolución y traspaso entre responsables.
5. Tras cerrar, mostrar corte persistido sin depender de recargar. No mezclar corte con día civil.

**Aceptación:** el caso Q70 ya funcionó; faltan conflictos de dos cajeros, corte a medianoche, devoluciones y caída entre guardado/respuesta. No repetir la prueba simple como sustituto de esas pruebas.

### R23 · Facturación FEL — P0 antes de habilitar · XL

**Límite:** se vio el estado inactivo y se revisó código. No se certifica cumplimiento fiscal ni comportamiento de un proveedor externo.

1. Preparación guiada con datos faltantes, ambiente de pruebas/producción inequívoco y diagnóstico de conexión sin exponer secretos.
2. Estados separados de venta/cobro/documento: pendiente, enviado, certificado, rechazado, resultado desconocido y corrección correspondiente.
3. Identificador idempotente, consulta de resultado tras timeout y bloqueo de duplicados antes de reintentar.
4. Errores traducidos con campo y acción; XML/PDF/identificador relacionados al pedido y a la operación real.
5. Correcciones, anulaciones y notas según reglas confirmadas con fuentes oficiales y certificador durante implementación; no fijar una regla legal porque exista una constante en código.
6. Cola de contingencias y conciliación de documentos con ventas; permisos y auditoría por acción.

**Aceptación:** timeout después de certificación no emite una segunda factura; rechazo no aparece como éxito; ambientes no se confunden. Habilitación solo después de pruebas con certificador y validación fiscal específica.

### R24 · Índice de Ajustes — P1 · M

1. Mantener separación de operación diaria y configuración. Agrupar por identidad, servicio, equipo, cuenta.
2. Mostrar estado resumido útil: “horario sin configurar”, “impresión pendiente de prueba”, “2 usuarios”; no sumar indicadores decorativos.
3. Usar enlaces directos con anclas; búsqueda por tarea: cerrar hoy, cambiar horario, imprimir QR, dar acceso.
4. Alinear tarjetas, alturas de iconos y rótulos; limitar descripciones a dos líneas y evitar sombras en cada nivel anidado.
5. Estado de configuración compartido con Hoy y módulos; nunca definir conexión de PC con umbrales distintos.

**Aceptación:** cinco tareas de configuración llegan a su editor en un máximo propuesto de dos acciones desde Ajustes; ningún enlace abre otra familia de trabajo por error.

### R25 · Perfil — P1 · M

1. Separar datos públicos del negocio, contacto operativo y datos de cuenta. Mostrar qué verá el comensal.
2. Definir fuente de nombre/lema frente a Personalización: heredar por defecto y permitir variante de marca explícita, evitando dos verdades silenciosas.
3. Validación telefónica acorde al país servido; no vender internacionalización por permitir cambiar un símbolo de moneda.
4. Renombrar WhatsApp manual: “Mostrar botón para que el cliente envíe su pedido”; diferenciarlo de avisos automáticos de Business.
5. Guardado con estado de borrador, error en campo y preview; cambios de dirección pueden requerir revisar cobertura de entrega.

**Aceptación:** cambiar lema muestra dónde se aplica; texto público y contacto privado no se intercambian; el dueño entiende quién envía el mensaje de WhatsApp.

### R26 · Horarios — P0/P1 · M

**Conservar:** varios turnos, madrugada, excepciones, zona y corte de negocio; ya existen.

1. Arreglar X01 con prioridad: separar estado aplicado y edición de pausa.
2. Pausa rápida 15/30/60 minutos o hasta reactivar, con próxima reapertura visible y mensaje al comensal; guardar la fecha en servidor.
3. Diferenciar “sin configurar”, “abierto 24 horas” y “cerrado todos los días”. No depender de interpretar una semana vacía.
4. Copiar horarios a varios días, detectar solapamientos y previsualizar próximas aperturas y excepciones.
5. Mostrar impacto del corte de negocio sin mezclarlo con horario de atención. Cambio de corte no debe alterar cortes históricos.

**Aceptación:** cerrar 20:00–02:00 funciona ambos lados de medianoche; feriado prevalece según regla; fallo de pausa muestra que sigue recibiendo; pausa temporal reabre a la hora prometida.

### R27 · Configuración de salón — P1 · L

1. Asistente de mesas con nombres/números, zonas, pisos y capacidades. Conservar cuadrícula y plano ya existentes.
2. Al reducir mesas, listar sesiones, reservas y QR afectados; archivar identificadores en vez de reasignarlos a otra mesa silenciosamente.
3. Plano con ajustar a rejilla, deshacer, límites y alternativa de edición por lista/teclado. Diferenciar edición de operar mesas.
4. QR por mesa con número y destino visibles; impresión conjunta ya existe, mejorar previsualización, selección por zona y reimpresión.
5. Simulación de salón desde móvil para verificar que la distribución ayuda al mesero.

**Aceptación:** renombrar/reordenar no desvía un QR impreso a otra mesa; no se elimina una mesa ocupada sin resolverla; plano usable con mesas cercanas y nombres largos.

### R28 · Zona de entrega — P1 · L

1. Elección inicial explícita: zonas manuales, radio o cobertura abierta. No dejar “cualquier dirección” como consecuencia que el dueño descubre tarde.
2. Simulador de dirección/pin: aceptada o fuera, tarifa, mínimo y tiempo estimado. Explicar prioridad cuando coinciden zona y radio.
3. Distinguir tarifa cero deliberada de tarifa sin configurar; advertir costo sin prohibir envío gratuito.
4. Error del mapa o geocodificador con alternativa comprensible; no cobrar o confirmar cobertura incierta como si estuviera validada.
5. Futuro: polígonos, franjas de reparto y capacidad por zona, con alcance definido y pruebas de frontera.

**Aceptación:** punto exactamente en frontera tiene resultado estable; cambio de zona invalida cotización anterior de forma explicada; mapa caído no deja pedir silenciosamente a cualquier dirección.

### R29 · Pedidos y cobro — P1 · M

1. Dividir reglas en aceptación, tiempos, medios de pago y presentación. Moneda debe ser código real más formato, no solo símbolo libre si se amplía alcance.
2. Renombrar “Confirmarlos solo” a “Confirmar automáticamente” con tiempo, canales y condiciones de capacidad.
3. Preview de semáforos con línea de tiempo; validar ámbar < rojo y valores positivos. Alarmas por marca deben mantener significado reconocible.
4. Propina claramente opcional cuando así sea; base de cálculo, redondeo, distribución y efecto en reportes definidos.
5. Confirmación de cambios con impacto sobre nuevos pedidos; los existentes conservan reglas aplicables o migración explícita.
6. Pago con tarjeta presencial descrito como tal; no sugerir que hay cobro en línea solo por activar el switch.

**Aceptación:** una configuración inválida es rechazada en servidor; total, propina y moneda coinciden en todos los comprobantes; usuario distingue pedido recibido de aceptado.

## 7. Plan detallado: equipo, marca y autonomía

### R30 · Repartidores y portal de entrega — P0/P1 · L

1. Alta de persona y vinculación de acceso como pasos conectados; mostrar “sin usuario”, “sin permiso” o “listo” en vez de obligar a recordar dos pantallas.
2. Validar que perfil y repartidor pertenecen al restaurante; asignación a pedido con estado permitido y versión.
3. Tablero de despacho con pendientes, asignados y retrasados. Desactivar repartidor exige resolver entregas activas o dejar responsable explícito.
4. En teléfono: dirección, contacto, indicaciones, importe pendiente, método y próxima acción. Evitar información innecesaria de otros clientes.
5. Entrega fallida, cliente ausente, devolución y reasignación con motivos. Importe de efectivo vacío no debe significar indistintamente tarjeta o pendiente.
6. Liquidación de efectivo por repartidor y turno, con recibido/vuelto y entrega a caja; confirmación de ambas partes si se introduce.

**Aceptación:** repartidor no mueve pedido ajeno; asignación de tenant ajeno rechazada; entrega sin cobro queda explícitamente pendiente; reintento no duplica movimiento. Portal revisado por código, ruta con repartidor activo pendiente de prueba funcional.

### R31 · WhatsApp — P1 · L

1. Mantener conexión asistida mientras no exista autoservicio fiable. Explicar requisitos, alcance y siguiente paso.
2. Separar botón manual, avisos transaccionales y campañas; cada uno tiene capacidad, permiso y estado distinto.
3. Estado de conexión, última entrega, error accionable y plantillas aprobadas según integración real. No exponer tokens.
4. Cola con deduplicación, reintentos limitados y diagnóstico para soporte; un evento de pedido no debe enviar varias notificaciones al reconectar.
5. Preferencias del cliente y respeto de baja; campañas requieren revisión y consentimiento aplicable. No asumir autorización porque hay un teléfono en una orden.

**Aceptación:** proveedor caído no impide registrar el pedido; estado enviado no se llama entregado sin acuse; mismo evento produce un aviso; dueño entiende qué está conectado.

### R32 · Personalizar el sitio — P1 · L

**Conservar:** ocho estructuras, 26 paletas, cinco pestañas, plantillas personales y preview real. La amplitud es una ventaja si se guía.

1. Entrada recomendada según contenido: carta sin fotos, carta fotográfica, servicio rápido. Tres muestras grandes con datos del restaurante; “Ver todas” conserva el catálogo.
2. Preview ligera visible sin activar una página completa; modo vivo opcional. Sustituir explicación de CPU por “Vista rápida / Vista interactiva”.
3. Básico: logo, paleta, tipografía emparejada y estructura. Avanzado conserva efectos y controles independientes.
4. Validar contraste de pares críticos, tamaño mínimo, títulos largos y fallback sin imagen; no ofrecer combinaciones que rompen carrito/modal.
5. Previsualizar directamente ficha, carrito, checkout, cerrado y error, además de portada. Un tema se acepta por el recorrido entero.
6. Publicar con resumen, versión y restaurar anterior. Plantilla guardada no equivale automáticamente a versión publicada.
7. Textos semánticos protegidos: precio, disponibilidad, tiempos, notificación y pago usan datos; la personalización no transforma un dato desconocido en una promesa.
8. Móvil: acceso a preview y guardado sin superponerse al botón flotante “Tomar pedido”; controlar barras fijas y espacio inferior.

**Aceptación:** dueño consigue identidad coherente en un recorrido breve; se conserva lo no visual al cambiar plantilla; todas las variantes críticas son legibles en claro/oscuro; publicar fallido mantiene versión anterior.

### R33 · Código QR — P1 · M

1. Mantener tarjeta social PNG, cartel PDF A6 y código puro; ya existen. Explicar tamaño de papel real y escala de impresión sin ambigüedad A5/A6.
2. Mostrar destino: carta general o mesa, dirección pública y nombre; detectar entorno de prueba antes de usar material en local.
3. Vista previa del archivo que se descarga. Revisar diferencia entre logo superpuesto del preview y PNG puro generado por canvas.
4. Estados de descarga/copia con error real y alternativa; no mostrar éxito si solo se intentó.
5. Plantillas de señalética con CTA de beneficio —ver carta/pedir/llamar— sin prometer funciones apagadas.

**Aceptación:** lectura física con varios teléfonos y distancias, contraste y margen adecuados; archivo conserva destino y composición; cambiar nombre/slug conserva alias donde ya exista mecanismo de QR estable.

### R34 · PC, impresión y continuidad — P0/P1 · XL

1. Estado por componente: app, servicio, impresora, red local y sincronización. “PC conectada” no equivale a “todo listo”.
2. Asistente de instalación, vinculación, selección de impresora, ticket de prueba y corte controlado de internet; cada paso con evidencia.
3. Umbrales de heartbeat compartidos en Hoy/Ajustes/Mi PC; última comunicación con hora y reintento.
4. Distinguir pedido en cola, enviado a impresora y confirmado según lo que el hardware realmente informa. Reimpresión marcada como copia.
5. Modo local con límites claros: qué dispositivos pueden entrar, qué pasa si se apaga la PC, qué funciones necesitan proveedor externo.
6. Reconciliación tras reconexión: mismo pedido, mismos importes, una sola impresión salvo copia deliberada, conflicto visible.
7. Diagnóstico descargable sin secretos para soporte y política de actualización/retroceso durante horario de servicio.

**Aceptación:** prueba real de red, energía y papel; pedido no se pierde ni duplica al volver; una promesa “funciona sin internet” solo se publica para escenarios demostrados. Esta auditoría no probó hardware ni red local real.

### R35 · Personal y permisos — P0/P1 · L

1. Plantillas por trabajo: dueño, encargado, caja, mesero, cocina, recepción y reparto. Mostrar capacidades efectivas y excepciones.
2. Alta empieza por el rol menos privilegiado adecuado, no por Dueño. Describir permisos con tareas y agruparlos por área.
3. Previsualizar “Así verá el panel” y mostrar acciones delicadas: descuentos, devoluciones, exportaciones, usuarios y configuración.
4. Revocar con sesiones activas y operaciones pendientes definidas. Mantener protección del último dueño y MFA del superadmin.
5. Acceso de soporte temporal, con propósito, vencimiento, trazabilidad y límites si se incorpora; nunca una puerta trasera general.
6. Mantener identidad personal y membresías por restaurante; todas las acciones deben resolver permisos efectivos en la sucursal actual.

**Aceptación:** matriz positiva/negativa por rol cubre servidor y UI; revocación surte efecto según política; multi-restaurante no hereda permisos erróneos; último dueño no puede quedar eliminado.

### R36 · Suscripción — P0/P1 · M

1. Una fuente de contrato para precio, descuento, impuestos si aplican, período, vencimiento, módulos y límites. Web, superadmin y dueño coinciden.
2. Mostrar mensualidad efectiva y por qué difiere de tarifa pública; siguiente cobro y recibos separados de promesas generales de precio fijo.
3. Comparación por resultado y capacidad relevante al restaurante, sin esconder límites en FAQ.
4. Cambio de plan con antes/después, fecha efectiva, funciones afectadas y tratamiento de datos. No quitar capacidades a mitad de un turno sin política.
5. Cancelación/exportación claras y recuperación de cobro fallido con comunicación proporcional; no usar retención de datos como dependencia comercial.

**Aceptación:** precio y fecha coinciden en ambos paneles; comprobante recibido no equivale a pago conciliado; downgrade conserva historia y explica acceso.

### R37 · Funciones — P1 · M

1. Corregir destinos X15; cada módulo enlaza al ajuste o trabajo correspondiente.
2. Mostrar cuatro dimensiones distintas: incluido en plan, activado, configurado y usado. “7 activas” no es “7 listas”.
3. Antes de apagar, mostrar efecto sobre pedidos en curso, visibilidad y conservación de datos; bloquear solo conflictos reales.
4. Dependencias guiadas: reparto requiere canal y personal; lealtad necesita reglas/premios; local requiere mesas.
5. Cambio de combinación de canales con confirmación conjunta, especialmente cuando el plan limita cantidad; evitar pasar por un estado comercial incoherente.

**Aceptación:** apagar/encender no borra historia; cambio fallido revierte UI con explicación; módulos del plan pausado no se anuncian como disponibles públicamente.

### R38 · Copia de datos — P1 · L

1. Corregir nombre del alcance actual: exportación de catálogo/categorías/clientes/últimos pedidos. El límite de 5.000 ya se informa; no ocultarlo ni llamarlo todo.
2. Exportación completa paginada con conteos esperados/obtenidos, filtros, moneda, zona y fecha de corte.
3. Para respaldo restaurable: IDs, relaciones, opciones, recetas, movimientos, configuración, medios y manifiesto versionado según política de seguridad.
4. Proceso en segundo plano para volúmenes grandes con progreso y reanudación; error de una sección no debe entregar archivo silenciosamente incompleto.
5. Conservar reautenticación y permisos existentes; registrar exportación y evitar secretos de integraciones en archivos portables.
6. Separar exportación del restaurante de backups operativos del SaaS y practicar restauración en entorno aislado.

**Aceptación:** 5.001 y 50.000 pedidos exportan completos cuando se promete; conteos cuadran; fallo de lectura genera error; importación de prueba reconstruye alcance declarado.

### R39 · Ayuda — P1 · M

1. Búsqueda por intención y sinónimos, con enlaces exactos. Casos iniciales: impresora, no entran pedidos, cerrar por hoy, cambiar precio, recuperar acceso.
2. Primer resultado ofrece acción; explicación breve; tutorial interactivo después. Conservar guías que señalan elementos reales.
3. Filtrar por permisos además de plan y módulo; no guiar a un cocinero a una pantalla que no puede abrir.
4. Incluir contexto seguro al solicitar soporte: restaurante, módulo, versión y código de error, previa revisión cuando se envíe; no copiar secretos ni pedidos completos por defecto.
5. Publicar contacto real y expectativa de respuesta mantenida. Los datos de prueba visibles no prueban contacto de producción.
6. Medir búsquedas sin resultado y resolución; convertir motivos de soporte recurrentes en mejoras del producto.

**Aceptación:** “impresora” llega al asistente correcto; un tour con elemento ausente no se bloquea; usuario con permisos mínimos recibe ayuda realizable.

### R40 · Tu año — P2 · M

1. Mantenerlo como resumen memorable después de dominar operación diaria. Corregir cabecera genérica “Panel”.
2. Cada cifra usa definiciones del reporte; indicar período parcial, cobertura y exclusiones.
3. Compartir con previsualización y elección de ocultar ventas/datos comerciales; nada se publica por abrir la vista.
4. Mostrar logros verificables y tres mejoras sugeridas para el siguiente período. Sin rankings externos inventados.
5. Ofrecer resumen mensual/semanal útil antes de esperar fin de año.

**Aceptación:** cifras concilian con el reporte; preview no expone números ocultados; compartir es una acción explícita del dueño.

## 8. Extensiones de cuenta: no dejarlas fuera

### Mi cuenta, resumen, comparativa y finanzas — P1 · L

Se revisó visualmente un solo restaurante; no se simuló una organización completa. `/central` redirige a `/mi-cuenta/...` y se debe mantener compatibilidad.

- Selector siempre indica local o consolidado. Navegar a un local conserva rango y contexto cuando tiene sentido.
- Comparar sucursales con períodos y monedas compatibles; no sumar monedas distintas ni comparar un local cerrado contra uno abierto sin contexto.
- Corregir costo/utilidad cero cuando se desconoce costo; cobertura agregada ponderada, no promedio simple de porcentajes.
- Matriz de accesos por local y acciones de grupo; vistas de resumen no deben permitir mutaciones fuera de membresía.
- Nuevo restaurante con borrador, precio incremental explícito, pasos pendientes y regreso al negocio anterior. No se ejecutó alta contractual durante la auditoría.

**Aceptación:** usuario de dos locales ve solo esos dos; consolidado concilia con sus sumas válidas; error en una sucursal se declara como parcial.

### Seguridad de cuenta — P0/P1 · M

La pantalla actual permite cambio de contraseña y explica cierre de otras sesiones. No se cambió ninguna credencial original.

- Añadir gestión de sesiones/dispositivos y recuperación comprensible si el modelo de autenticación lo permite; MFA voluntaria para dueños como mejora a diseñar, manteniendo la obligatoria del creador.
- Estado coherente para identidad Google, contraseña y cuenta sin contraseña; no pedir una contraseña actual inexistente sin ofrecer ruta válida.
- Acciones delicadas con reautenticación contextual y retorno al trabajo que se estaba realizando.

**Aceptación:** recuperación no pierde restaurante ni permisos; cerrar otras sesiones funciona; error de autenticación no borra un formulario operativo en curso.

## 9. Diseño de precisión: cambios pequeños, específicos y transversales

Estos son criterios propuestos, no mediciones universales del estado actual.

| Elemento | Decisión de diseño | Cómo comprobarla |
|---|---|---|
| Encabezado de módulo | Área + título concreto: “Clientes / Cupones”, no solo “Clientes” | El usuario sabe dónde está sin depender de una pestaña horizontal fuera de pantalla |
| Tipografía operativa | Cuerpo 14–16 px; metadatos importantes 12–14; cifras con ancho tabular | Lectura en tablet y móvil sin zoom; probar nombres largos y cifras grandes |
| Tipografía de marca | Una familia expresiva para títulos y una legible para trabajo; evitar cinco estilos compitiendo | Portada conserva identidad y tabla conserva escaneo rápido |
| Superficies | Fondo cálido, panel sólido, borde ligero; sombra solo para elevación real | Menos tarjetas anidadas y jerarquía visible sin color |
| Espaciado | Escala 4/8/12/16/24/32; alinear texto, inputs y pie de acciones | Revisión de filas repetidas y bordes a 390/768/1280 px |
| Botón principal | Uno por bloque de tarea; verbos con objeto: “Guardar horario”, “Crear cupón” | No compiten Guardar genéricos de configuraciones independientes |
| Íconos | Familia consistente, tamaños ópticos comunes, nombre accesible; texto en acciones ambiguas | Teclado/lector anuncian propósito y registro afectado |
| Colores de estado | Verde éxito confirmado; ámbar atención; rojo error/acción destructiva; gris inactivo/desconocido con texto propio | Desconocido no se pinta como sano; marca no sustituye semántica |
| Formularios | Etiqueta persistente, unidad, ejemplo y error junto al campo; asterisco explicado | Placeholder no es la única etiqueta; errores no aparecen solo en toast |
| Switches | Separar inmediato vs borrador; estado guardado siempre distinguible | Prueba con red lenta, error y salida sin guardar |
| Acciones destructivas | Separadas de edición; impacto y recuperación claros | No se borra recompensa/producto histórico por un toque confuso |
| Pestañas móviles | Scroll con indicio de continuidad y selección visible; sin recortar contexto | Se encuentra Lista de espera y Avanzado sin ensayo |
| Navegación móvil | Revisar siete destinos y botón de pedido superpuesto a acciones de editor | Nada queda cubierto con teclado abierto y safe area |
| Tablas | Cabecera alineada, números a derecha, filtros persistentes; móvil por filas con detalle | No resolver todo reduciendo fuente o escondiendo columnas esenciales |
| Estados vacíos | Explicar valor y primera acción; ilustración secundaria | Una pantalla vacía enseña a comenzar sin parecer una venta dentro del producto |
| Carga y errores | Skeleton breve, texto de error accionable, último dato fechado | No confundir skeleton capturado con defecto permanente; no falsear ceros |
| Movimiento | Reducir animación de cifras en pantallas de trabajo; respetar preferencia de movimiento reducido | Cifras se pueden leer inmediatamente; captura durante transición no se usa como defecto final |
| Mensajes | Sustituir CPU, glass, kicker y códigos técnicos en flujo básico | Encargado entiende sin vocabulario de diseño o desarrollo |
| Impresión/exportación | Lo que se muestra coincide con lo que se obtiene; formato y alcance explícitos | Comparar preview, archivo y papel real |

Para contraste y controles, usar [WCAG: contraste mínimo](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) y [tamaño mínimo de objetivo](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). El mínimo AA de objetivo contempla 24 CSS px y excepciones; 44–48 px aquí es una meta interna de comodidad, no una cita incorrecta del mínimo. El contraste debe medirse por combinación real y estado, no deducirse solo de una captura.

## 10. Cómo darle un diseño propio a cada trabajo

**No basta con pasar de naranja a verde.** Propongo mantener una identidad de hospitalidad cálida y cambiar la composición por contexto:

- **Web comercial:** narrativa editorial con una escena real de turno; promesa y demostración juntas. Fotografía real y pruebas de valor auténticas. La comanda como recurso gráfico propio, sin llenar la página de tarjetas genéricas.
- **Carta del restaurante:** fotografía y tipografía expresiva, precio visible, opciones legibles, acción fija. Plantillas guiadas por contenido, no por efectos.
- **Operación:** estructura estable, datos densos pero legibles, estado y acción. Cocina con menos decoración; mesero con targets grandes; recepción con agenda/plano.
- **Catálogo:** mesa de edición con preview lateral y filtros de calidad. El producto es protagonista; no una pared de formularios.
- **Clientes y crecimiento:** línea temporal y campañas con resultado económico, no solo contadores de puntos/códigos.
- **Finanzas:** números reconciliables, definiciones y cobertura; gráfica al servicio de la pregunta, no de llenar espacio.
- **Superadmin:** bandeja de asuntos con responsable, impacto y próxima acción, más detalle comercial cuando se necesita.

El [estudio visual HTML](../diseno/DIRECCION_VISUAL_2026-11-03.html) muestra cinco direcciones de composición. Es un boceto independiente con datos ficticios, no el rediseño de todos los módulos ni una interfaz implementada en el producto. La especificación por módulo de este documento es la referencia para extenderlo.

## 11. Secuencia de implementación con entregables verificables

### Ola 0 · Verdad y protección del trabajo

**Entradas:** X01, X04–X11, X14, X20–X21 y riesgos monetarios del maestro. **Responsables propuestos:** backend/datos + frontend; seguridad para pruebas de referencias. **Tamaño:** mezcla de S/M y L; dividir en tickets, no un único megacambio.

Entregables: estado aplicado/borrador; contrato de fechas y jornada; lecturas con error explícito; recetas/compras/ocupación atómicas; tests negativos entre restaurantes; contratos de costo y precio; inventario por receta demostrado o promesa corregida. Cada ticket cierra con reproducción anterior y caso posterior verificable.

### Ola 1 · Trabajo diario de cinco roles

Diseñar y validar recorridos de dueño, mesero, cocina, recepción y encargado de inventario. No otra ola dedicada solo a caja.

Entregables: navegación por rol; catálogo y ficha mejorados; agenda+espera+mesa conectadas; cocina por prioridad; cierres y cobros pendientes del maestro; configuración y ayuda con destinos correctos. Prueba moderada con usuarios nuevos y tareas de un turno, no solo comentarios sobre capturas.

### Ola 2 · Arranque y autonomía

Entregables: importación con revisión, carta guiada, horarios/cobertura listos, QR verificado, personal preparado, pedido de prueba completo y diagnóstico de PC. El onboarding termina con un resultado demostrable, no con cinco checks de formularios.

### Ola 3 · Retención y crecimiento responsable

Entregables: lealtad con economía visible, cupones programables, comentarios gestionables, métricas conciliables y resumen semanal con evidencia. Probar recompra y uso; no prometer incrementos universales.

### Ola 4 · Operación avanzada y escala del SaaS

Entregables: compras/recepción parcial, consumo de recetas si se promete, reparto/liquidación, respaldo restaurable, operación local demostrada y FEL validada. Superadmin incorpora activación, salud, soporte y cobros como trabajo asignable. Activar por clientes piloto y señales de fiabilidad.

### Primer lote concreto sugerido

| Orden | Ticket | Salida revisable |
|---|---|---|
| 1 | X01 pausa real vs borrador | Video con éxito, fallo y red lenta; texto nunca miente |
| 2 | X20 lecturas fallidas | Contrato común y pantallas con error/último dato; pruebas por módulo |
| 3 | X08 receta atómica + X11 referencias | Prueba rollback y dos tenants |
| 4 | X04–X06 cupones | Fixture de vigencia, límites y fecha local |
| 5 | X09 verdad de consumo | Prueba venta/cancelación de receta y documentación comercial alineada |
| 6 | X14 espera→mesa | Conflicto concurrente sin grupo desaparecido |
| 7 | X15/X18 enlaces y ayuda | Recorrido desde Funciones y búsqueda hasta editor correcto |
| 8 | X02/X16 lenguaje exacto | Encuesta y exportación coherentes con los datos reales |
| 9 | R06–R09 catálogo completo | Prototipo y prueba de alta/edición/orden con 300 productos |
| 10 | R32 guía visual | Tres rutas de diseño y preview de estados críticos |
| 11 | R19–R21 y Mi cuenta | Mismos números y cobertura en detalle/exportación |
| 12 | R35/R34 equipo y dispositivos | Rol efectivo + ticket impreso + escenario local documentado |

## 12. Matriz adicional de pruebas antes de cerrar el plan

Estos casos son **trabajo de implementación/validación pendiente**, no resultados ya aprobados.

| Caso | Escenario | Resultado requerido |
|---|---|---|
| T01 | Pausar con error de red | Sigue mostrando estado aplicado anterior y permite reintentar |
| T02 | Semana vacía vs 24 horas vs cerrado | Tres decisiones distintas en panel y menú |
| T03 | Categoría 20:00–02:00 y feriado | Intersección coherente con horario local |
| T04 | Cupón futuro, editar descripción | Conserva inicio y sigue programado |
| T05 | Cupón vence hoy, 23:59 Guatemala | Vigente según regla inclusiva publicada |
| T06 | Veinte cupones inactivos por fecha + uno válido | Checkout ofrece campo y valida el correcto |
| T07 | Dos clientes usan último cupón | Límite global respetado |
| T08 | Dos canjes contra saldo insuficiente conjunto | Solo se acepta lo cubierto por saldo |
| T09 | Eliminar/pausar recompensa falla | Error visible, estado no aparenta éxito |
| T10 | Receta falla al insertar | Receta/costo anteriores intactos |
| T11 | ID de ingrediente/repartidor de otro tenant | Rechazo sin lectura ni modificación ajena |
| T12 | Comprar y recibir dos veces | Una entrada efectiva; reabrir recibida se rechaza |
| T13 | Recepción parcial y devolución | Cantidad/costo/pendiente conciliables |
| T14 | Producto renombrado durante período | Ranking conserva identidad; pedido conserva nombre histórico |
| T15 | Más de 20.000 pedidos y 1.500 reseñas | Agregados completos o límite explícito, nunca cifra parcial presentada como total |
| T16 | Error en consulta de analítica | Error, no “0 pedidos” |
| T17 | Falta costo en 40% de ventas | Margen parcial y cobertura visibles en todos los paneles |
| T18 | Sentar grupo en mesa ya ocupada | Sigue pendiente de resolución, sin actualización parcial |
| T19 | Historial de espera de ayer | Fecha correcta, no “hoy más temprano” |
| T20 | Abrir WhatsApp y cerrar sin enviar | No se presenta como entrega confirmada del aviso |
| T21 | PC con heartbeat hace dos minutos | Mismo diagnóstico en Hoy, Ajustes y Mi PC |
| T22 | Impresora sin papel / reimpresión | Estado y copia explicables, sin duplicado silencioso |
| T23 | Corte de internet y retorno | Pedido/saldo/stock reconciliados y señal de pendientes |
| T24 | Nombre largo y traducción incompleta | Fallback legible, botones no tapados |
| T25 | Tema claro/oscuro en ficha, carrito, lealtad y error | Contraste comprobado en todos los estados |
| T26 | 390 px + teclado abierto + barras fijas | Último campo y acción siguen accesibles |
| T27 | Exportación 5.001 y 50.000 pedidos | Alcance completo cuando se anuncia, conteos y manifiesto |
| T28 | Cambio de plan con pedidos abiertos | Política explícita, historial preservado |
| T29 | Dueño con dos membresías y permisos distintos | Contexto correcto en cada acción y exportación |
| T30 | Certificador responde y luego hay timeout | Consulta/reconciliación, no segunda emisión |

## 13. Qué medir para saber si esto logra vender y retener

No medir éxito por cantidad de pantallas ni número de funciones. Instrumentar con definiciones y línea base:

1. **Primer valor:** proporción que publica una carta válida y completa un pedido de prueba; tiempo y pasos donde abandona.
2. **Trabajo:** tiempo mediano de tomar una orden, resolver una reserva, reponer stock, crear una promoción y cerrar un turno; errores y ayudas necesarias.
3. **Autonomía:** solicitudes de soporte por restaurante activo, búsquedas sin resultado y tareas completadas sin intervención tuya.
4. **Confianza:** diferencias sin explicar, operaciones duplicadas, estados desconocidos ocultos y recuperación de fallos.
5. **Valor recurrente:** uso por rol, locales que operan turnos completos, recompra medida con identidad adecuada y retención por cohorte.
6. **Venta:** demo→prueba→primer valor→pago, motivos de abandono y tiempo de configuración. Conversión solo tiene sentido con volumen y segmento definidos.

Metas internas iniciales sugeridas para pilotos: 4 de 5 usuarios nuevos completan cada tarea crítica sin explicación; ningún error grave de dinero o acceso en escenarios aceptados; primer menú útil en una sesión guiada corta; reducción comprobable de tiempo y soporte frente a línea base. Son criterios de experimentación, no resultados obtenidos ni garantía de mercado.

## 14. Evidencia y límites finales

Las capturas nuevas son 51–88 en [evidencias-v2](evidencias-v2/). Las 51–55 pertenecen a la pasada de ajustes inmediatamente anterior; 56–88 completan esta revisión. La 79 registra la redirección de Proveedores a Funciones; la 80 muestra FEL inactiva. La 83 puede capturar cifras animándose: no se considera prueba de un defecto de tipografía. Las 14 y 31 de la primera serie tampoco sustentan hallazgos, por transición y sesión expirada.

Código orientador para implementación, relativo a `plataforma/`: `src/lib/admin-nav.ts`; `src/components/admin/{cupones-panel,loyalty-panel,encuestas-panel,categories-panel,admin-theme-editor,waitlist-panel,drivers-panel,qr-display}.tsx`; `src/lib/actions/{cupones,recipes,suppliers,waitlist,drivers,backup,fel}.ts`; `src/lib/db/{cupones,encuestas,waitlist,analytics,reports}.ts`; migraciones `037_recetas.sql`, `088_kardex_costo_promedio.sql` y las posteriores de jornada/permisos. Confirmar líneas sobre la revisión vigente al implementar.

No se probaron todas las combinaciones de temas, impresoras físicas, red local desconectada, servicios Meta/FEL, dos usuarios actuando simultáneamente, volúmenes grandes ni todos los roles con credenciales dedicadas. Esas limitaciones están convertidas en casos de aceptación, no escondidas bajo la palabra “auditado”.

**Decisión de producto:** primero verdad operativa; después recorridos completos por rol; después arranque autónomo; después crecimiento con evidencia. El resultado deseado no es que el restaurante tenga cuarenta apartados disponibles. Es que cada tarea termine con menos esfuerzo y con un resultado que pueda confiar.
