# Registro de cambios

Cada versión es una etiqueta de git sobre un commit de `main` (`git show v0.7.0`). Las versiones de `v0.2.0` a `v0.10.0` se pusieron **retroactivamente** el 2026-10-09 sobre los hitos grandes que ya existían; desde aquí se etiqueta al cerrar cada hito. Reglas en [`docs/guias/FLUJO_GIT.md`](docs/guias/FLUJO_GIT.md).

Esto es la plataforma (`plataforma/`). El agente de impresión y Leogin Desktop llevan su propia versión (ver sus `package.json`).

## Sin publicar

- **Fase 3 de «La carta que vende»: otro nivel.** Lleva las **migraciones 189 y 190**, que se aplican antes de desplegar; sin ellas no hay estados ni pedido de la mesa y la carta funciona igual.
  - Estados del día (24 h) arriba de la carta, que el dueño publica desde Menú.
  - El pedido de la mesa: cada teléfono suma lo suyo y uno lo manda a cocina como un solo pedido. Viene apagado y se enciende en Ajustes → Salón.
  - La ficha nace de la foto tocada.
  - Vista de PC: categorías a la izquierda y «Tu pedido» a la derecha. Las píldoras del teléfono se ocultan en PC.
  - La demo pública enseña el Rincón 502 real, con sus fotos.
  - Búsqueda por antojo.
  - Foto guiada al subir la de un platillo.
  - El pedido en curso ya no flota sobre la carta.
  - Una carta de más de 1,000 platillos ya no se corta en silencio.

## v0.27.0 · 2026-11-19 · «La carta que vende»: fase 2
PR #160 y #161 · **migración 188** (antes o después de desplegar; si falta, solo no se cuenta el embudo).
- **Pedido de mesa sin nombre** (#160): se llama «Mesa N» en vez de rechazarse con «El nombre es requerido». El fallo estaba en producción desde v0.26.0.
- **Fase 2 de «La carta que vende»: la carta vende.** Lleva la **migración 188**, que se puede aplicar antes o después de desplegar: si falta, solo no se cuenta el embudo.
  - Cada platillo tiene su enlace (`?platillo=`), con su propia vista previa (foto, nombre y precio) y «Compartir» en la ficha.
  - «Lo más pedido esta semana» con ventas reales.
  - Precios de la carta sin «.00» y con la letra de la carta.
  - «Pedir lo de la última vez».
  - Embudo anónimo por canal (QR de mesa, enlace general y enlace de platillo) en Analítica.

## v0.26.0 · 2026-11-19 · «La carta que vende»: fases 0 y 1
PR #153, #154 y #157, fusionados juntos (apilados), más #156 contra `main` · **sin migración**.
- Auditoría del menú digital «La carta que vende» (Claude): 8 estructuras medidas en producción a 320/390/1280 px, recorridos de compra, rendimiento con 4G lenta, 4 fallos P1 (recarga en la primera visita, carta vacía cacheada, aviso de Google al entrar, enlace sin vista previa), propuesta en seis piezas con maqueta interactiva y comparación con la auditoría de ChatGPT. [Auditoría](docs/auditorias/AUDITORIA_CARTA_QUE_VENDE_2026-11-18.md) · [maqueta](docs/diseno/MAQUETA_CARTA_QUE_VENDE_2026-11-18.html).
- **Fase 0 de «La carta que vende»** (sin diseño nuevo, sin migración):
  - La carta ya no se recarga sola en la primera visita.
  - Una lectura fallida dice «No pudimos cargar la carta» en vez de enseñar un restaurante vacío durante un minuto.
  - Se quitó el aviso de Google al entrar.
  - Un enlace a la carta sin logo lleva tarjeta de vista previa con la paleta.
  - «Agregar» funciona con teclado.
  - Estantes ya no desborda en el teléfono.
  - La búsqueda encuentra en inglés.
  - Desaparece el «EST · 2024» inventado.
  - Lo agotado se puede abrir y dice cuándo vuelve.
- **Fase 1 de «La carta que vende»** (nada saturado, sin migración):
  - La carta abre con una cabecera breve y la comida a la vista: el primer precio sube de ~1,000 px a menos de 450. La portada completa queda como opción del editor.
  - Una sola barra abajo con el pedido y el mesero.
  - «Cierra en 40 min» solo cuando cuenta.
  - Sin el «El menú» repetido.
  - Alérgenos en una línea.
  - «Va bien con» con fotos.
  - Checkout de mesa sin campos que no se usan.
- **Next.js 16.4.3 → 16.4.6** (#156): cierra dos avisos moderados de caché de `'use cache'`, que Leogin no usaba.

## v0.25.0 · 2026-11-18 · Cierre de la Ola 2 y línea N «nada saturado»
PR #137 a #146, fusionados juntos por #146 (apilados), más #144 contra `main` · **migración 187, antes de desplegar** (si falta, la cola del superadmin se ve sin estados y lo dice).
- **Navegación por rol** (ficha 2.11, #137): si el trabajo cabe en cuatro casillas, la barra del teléfono nombra pantallas (caja, recepción, cocina); si no, Hoy · Pedidos · [+] · Menú · Más.
- **Glosario** (ficha 2.12, #138): «platillo», «pantalla de cocina», «función» y los tres modos de pedido en toda la interfaz, vigilados por `glosario.test.ts`. Tomar pedidos y Cocina usan el menú del panel.
- **Línea N «nada saturado»** (una maqueta aprobada por pantalla, registro §48–§54):
  - **Recepción** (#139): pestañas, una acción por fila y lo demás en una hoja.
  - **Inventario** (#140): lo que cuentas, con «+1» y una hoja por platillo (de 3,987 a 912 px).
  - **Cupones, lealtad y encuestas** (#141): un cupón usado ya no se borra; el ajuste de puntos exige motivo y muestra los movimientos.
  - **Finanzas y Analítica** (#142): selector de periodo de una línea; la gráfica por día vuelve a verse; la ganancia nunca sale en Q0.00 (sin costos lleva a ponerlos; con costos a medias dice «estimación parcial»); una lectura caída avisa en vez de mostrar ceros; Analítica cuenta los platillos por id.
  - **Mi cuenta** (#143): Restaurantes con lo de hoy en cada fila; Comparativa pasa a Finanzas como «Por restaurante»; dos pestañas en vez de cuatro.
  - **Superadmin** (#145, ficha 4.9, **migración 187**): el inicio es una cola de trabajo (servicio afectado, cobranza, activación, seguimiento) con asuntos que se posponen, anotan o resuelven, con historia; la ficha abre con el resumen de soporte; el cobro caído ya no se lee como «todo al día»; dar acceso dice qué podrá hacer cada papel.
  - **Web pública** (#146, fichas V.1–V.3): la portada pasa de 13 a 7 bloques (de 16,577 a 7,459 px en el teléfono), con «Probar la demo» primero, tres casos con su plan y «¿qué plan te conviene?» con la misma regla del alta; /planes con la misma pregunta y la tabla plegada; la lealtad ya no promete canje al pagar.
- **Herramienta local** (#144): el superadmin de prueba `super-demo@local.test` entra con `dev-login` sin teclear el código de dos pasos. En producción no existe.

## v0.24.0 · 2026-11-17 · Ola 2: arranque y autonomía
PR #135 (merge `a89d7ca`), que junta #125–#128 y #130–#134 · migraciones 184, 185 y 186 · en producción el 2026-11-17 (`prod-2026-11-17`). El dueño corrió las tres antes del despliegue.
- **Alta hasta el primer valor** (ficha 2.3; rama `feat/alta-primer-valor`; maqueta aprobada `docs/diseno/MAQUETA_ALTA_PRIMER_VALOR_2026-11-16.html`) · sin migraciones:
  - El alta pasa de 7 pantallas a 4: la cuenta en una sola, después el negocio con «¿Cómo te piden tus clientes?», «¿Qué vendes?» (nombre y precio de los primeros platillos) y «Así se ve tu carta», con la carta de verdad. Al crear, entra directo a Hoy.
  - El plan ya no viene en Premium para todos: se sugiere por cómo le piden (Básico, En línea o Premium) y se cambia antes de crear, con el precio a la vista. El estilo llega elegido y se cambia entre tres sugerencias; los demás están en Personalizar.
  - Los platillos del alta se crean en «Platillos». En PC, la carta se arma en vivo junto al formulario.
  - Salen la confirmación aparte del registro, la contraseña repetida, la pantalla «¡Tu restaurante está en vivo!» y la ventana «¡Listo!».
- **Importar una carta con revisión** (ficha 2.4; rama `feat/importar-carta`; maqueta aprobada `docs/diseno/MAQUETA_IMPORTAR_CARTA_2026-11-16.html`) · sin migraciones:
  - En Platillos › «Importar o exportar» › «Importar carta», la carta entra con una **foto o un PDF** (leídos sin IA: OCR libre en el propio navegador, y el texto del PDF), con un **Excel o CSV** con las mismas columnas que la exportación (hay plantilla) o pegando la lista tal como está en WhatsApp o Word. Lo leído de una foto o PDF se muestra como texto para corregirlo antes de revisar.
  - Antes de publicar se revisa cada fila: lo dudoso (sin precio, precio sospechoso, repetido) queda sin marcar y se corrige en la misma fila. Si el platillo ya existe, no se duplica: se ofrece cambiarle el precio. El botón dice exactamente qué pasará.
  - Lo importado sale visible y se puede **deshacer** el lote completo; lo que ya se vendió se conserva.
  - En el alta, «Pegar mi lista» llena los primeros platillos.
- **Turno de práctica** (ficha 2.5 de la auditoría; rama `feat/turno-practica`; maqueta aprobada `docs/diseno/MAQUETA_TURNO_PRACTICA_2026-11-16.html`) · sin migraciones:
  - Una «Mesa P» con tu carta real y las mismas pantallas de Tomar pedidos para practicar una mesa completa en seis pasos: abrir, pedir con un extra, enviar a cocina, marcar listo, anular un plato y cobrar con vuelto. La franja de arriba dice el paso y cómo salir.
  - No cuenta en nada: no crea pedidos ni cobros, no mueve existencias, no imprime y anular no pide PIN (lo avisa). Al salir se olvida.
  - Se ofrece al final del recorrido de bienvenida y en la búsqueda de Tomar pedidos. El dueño ve en Personal quién la hizo y en cuántos minutos.
- **Aparato por rol y La PC del local con un solo estado** (ficha 2.6 de la auditoría; rama `feat/aparato-y-mi-pc`; maqueta aprobada `docs/diseno/MAQUETA_APARATO_Y_MI_PC_2026-11-16.html`) · **migración 184, antes de desplegar**:
  - **La PC del local** abre con el veredicto («Revisa la impresora de cocina», «Todo listo para el servicio») y cuatro piezas: la PC, la impresora de cocina, la de caja y el respaldo sin internet. Si hay comandas que no salieron, lo dice con la hora y ofrece **Reintentar** (sin duplicar lo que ya se reimprimió). También lo avisa Hoy.
  - **Un solo reloj** para la PC en Hoy, Ajustes, La PC del local y el superadmin: «Conectada», «Sin señal desde las 12:31» (desde los 90 s) o «Desconectada desde las 12:31» (desde los 10 min).
  - **Este aparato:** en «⋯» (teléfono) o en la barra lateral (PC), el dueño o quien maneja el personal elige si el aparato es para Cocina, Caja, Tomar pedidos o el panel completo. Al abrir la app, el aparato va directo a esa pantalla, a pantalla completa, sin ampliar permisos de nadie. Después de elegir se puede probar el sonido y la impresora. Personal › Dispositivos dice el uso de cada aparato.
  - Caja también tiene pantalla completa.
- **Personalizar con ayuda** (ficha 2.7 de la auditoría; rama `feat/personalizacion-guiada`; maqueta aprobada `docs/diseno/MAQUETA_PERSONALIZACION_GUIADA_2026-11-16.html`) · **migración 185, antes de desplegar**:
  - La pestaña Diseño abre con **tres diseños recomendados para tu carta**, según cuántos platillos tienen foto, cuántos son y si vendes sobre todo para llevar. Cada uno se ve con tu logo, tus platillos y tus precios, y se usa con un toque. Las 208 combinaciones siguen en «Ver todos los diseños».
  - **Así queda** está siempre encendida: Portada, un platillo abierto y el carrito, con lo que suele romperse a la vista (el nombre más largo, el precio más alto y un platillo sin foto). «Probar como cliente» abre la carta interactiva.
  - Al publicar dice qué diseño quedó y ofrece **Volver al anterior**. Tu logo, tus textos y tus pedidos nunca cambian con un diseño.
  - No se recomienda ninguna combinación poco legible, y en el catálogo se marcan. Las plantillas propias solo aparecen si tienes alguna; guardar una nueva está en «⋯».
- **Ajustes que dicen cómo estás** (ficha 2.8 de la auditoría; rama `feat/ajustes-claros`; maqueta aprobada `docs/diseno/MAQUETA_AJUSTES_CLAROS_2026-11-16.html`) · sin migraciones:
  - Cada fila de Ajustes dice su estado: horario, mesas, hasta dónde repartes, quién confirma y cuántas funciones están encendidas. Lo que conviene revisar sale en ámbar.
  - **Horarios:** eliges «Con horario» o «A toda hora» (ya no dice «Sin horario»). El día apagado dice «Cerrado», puedes copiar un día a los demás, dos turnos que se pisan no se guardan y ves las próximas aperturas con los feriados.
  - **Zona de entrega:** eliges por zonas, por distancia o a cualquier dirección. «Prueba un punto» en el mapa dice si un cliente queda dentro. Una zona sin tarifa no se guarda hasta escribirla; 0 se ve como «Gratis».
  - **Pedidos y cobro:** «Confirmar automáticamente» dice en cuántos minutos, el semáforo se ve como línea de tiempo y no se guarda un ámbar después del rojo. «Pago con tarjeta» aclara que es con tu terminal.
  - **Funciones:** antes de apagar una, dice qué pasa y qué se conserva. **Salón:** no deja quitar una mesa con una cuenta abierta. **Perfil:** separa lo que ve tu cliente y aclara el botón de WhatsApp.
- **Ayuda por lo que necesitas** (ficha 2.9; rama `feat/ayuda-por-intencion`; maqueta aprobada `docs/diseno/MAQUETA_AYUDA_POR_INTENCION_2026-11-16.html`) · **migración 186, antes o después de desplegar**:
  - El Centro de ayuda pregunta «¿Qué necesitas hacer?» y arriba ofrece cinco casos comunes. Entiende frases como «se trabó la impresora» o «cerrar por hoy», con o sin acentos. La primera respuesta es un botón a la pantalla exacta; si la persona no puede abrirla, se le dice a quién pedírselo.
  - **«No me entran pedidos» revisa el restaurante en ese momento:** pausa, horario, modos de pedido y PC del local. Lo que falla va primero, y la pausa trae «Reanudar» ahí mismo.
  - El buscador del panel (Ctrl K) usa el mismo índice: en «Hacer» salen solo las acciones que la persona puede abrir.
  - El mensaje a soporte ya va escrito con el restaurante, el plan, lo que se buscó y la versión, y se puede cambiar antes de enviarlo.
  - **Migración 186:** lo que se busca y no tiene respuesta se anota (solo la frase, nunca quién la escribió) y se ve en Superadmin › Configuración › Soporte, agrupado y con lo más pedido primero.
- **Código QR** (ficha 2.10; rama `feat/codigo-qr`; maqueta aprobada `docs/diseno/MAQUETA_CODIGO_QR_2026-11-17.html`) · sin migraciones:
  - Eliges para qué lo quieres (Redes, Imprimir o Solo el código) y ves exactamente el archivo que se descarga, con un solo botón. «Solo el código» ya trae el logo, igual que la vista previa.
  - El cartel sale en **hoja carta** con dos carteles de 10.5 × 14.8 cm para recortar. La pantalla dice cómo imprimirlo para que el código mida 7 cm.
  - **Lo impreso ya no se rompe** si cambias el nombre del restaurante: el QR apunta a `distleogin.com/m/<tu-restaurante>`. El enlace corto sigue escrito para teclearlo.
  - El cartel solo promete lo que tienes encendido: sin pedidos en línea dice «Mira nuestra carta».
  - En una copia de prueba la pantalla avisa que el QR no abrirá en el restaurante. Si copiar o descargar falla, lo dice, y «Archivo listo» solo sale cuando el archivo existe.
  - En la PC, la vista previa queda a la izquierda y las opciones a la derecha.

## v0.23.0 · 2026-11-16 · Hoy por etapa, pedido de prueba y sin prueba gratis
PR #124 (merge `0d15c36`), PR #121 (merge `fd9e728`) y PR #120 (merge `a7a8040`) · migraciones 182 y 183 · en producción el 2026-11-16 (`prod-2026-11-16`). El dueño corrió la 183 antes del despliegue, la 182 después, y también las pendientes 154 y 181.
- **Serie de video «Una sola toma»** (PR #120, `promo-video/`, aparte de la app): tres videos de 34 s (con meseros, comedor y domicilio) en vertical y horizontal, en los que un pedido cruza el restaurante sin cortes. Convive con «Otra vez» y «Un solo lugar», que son los que están en uso.
- **Sin prueba gratis** (PR #121, merge `fd9e728`) · **migración 182, justo después de desplegar**: los planes con pedidos (En línea, Estándar y Premium) se cobran desde el primer día; el gancho gratis sigue siendo el plan Básico. La 182 pone `trial_days = 0` y los textos de registro, planes, portada, Mi cuenta y términos dejan de prometer días gratis. Los restaurantes que ya estaban en prueba la terminan como estaba.
- **Hoy por etapa y Primeros pasos por resultado** (fichas 2.1 y 2.2 de la auditoría; rama `feat/hoy-por-etapa`; maqueta aprobada `docs/diseno/MAQUETA_HOY_POR_ETAPA_2026-11-15.html`) · **migración 183, antes de desplegar**:
  - Hoy elige sola su versión. **Nuevo:** la guía «Llega a tu primer pedido», sin cifras en cero. **Operando:** arriba, hasta tres cosas que piden acción (pedidos por aceptar, pedidos atascados en cocina, comida lista que espera, caja sin abrir…), con «Ver N más» para el resto. **Cerrado:** cuando la caja ya cerró y no queda nada vivo, lo cobrado del día, el cuadre y lo comprobable de la semana.
  - La cifra grande es **«Cobrado hoy»**, el mismo libro de Caja, con «Por cobrar» y el estado de la caja al lado. Lo pedido queda en una línea debajo. Quien no tiene Caja ve «Pedido hoy».
  - «En curso» y «La casa» se juntan en **«Servicio»**, con lo que está listo primero. Ya no repite «Mesa 7 · Mesa 7». El lema y los platillos sin foto pasan a «Mejora tu carta», al final. En la PC, la tendencia va en una segunda columna.
  - **Primeros pasos por resultado:** publicar platillos, abrir la carta como cliente y recibir un pedido de prueba (sin pedidos en el plan, poner el QR). Si no hay categorías, el primer platillo crea «Platillos».
  - **Pedido de prueba** (migración 183): el dueño lo pide desde su carta con un pase firmado y lo ve en Pedidos con la etiqueta «Prueba». Al estar listo, «Terminar la prueba» lo cierra sin cobro, repone existencias y devuelve canjes. No registra cliente ni cuenta en cifras, caja, puntos ni tope de pedidos.
  - «Tu menú en línea» ya no dice «Piden 263 %»: cuenta solo los pedidos hechos desde la carta y los divide entre las personas distintas.
  - La tarjeta «Funciones disponibles en Premium» sale de Hoy y pasa al final de Negocio › Resumen.

## v0.22.0 · 2026-11-15 · Video «Un solo lugar» en la portada y serie «Otra vez»
PR #122 (merge `3a2046e`) · sin migraciones. Para que la portada cambie en producción basta desplegar el código.
- **La portada abre el video «Un solo lugar»** en lugar de la animación «Las tres fugas»: en pantallas anchas se ve el horizontal y en las verticales (teléfono) el vertical, a pantalla completa. La tarjeta muestra el gancho —«Hoy tu restaurante vive en 8 lugares»— con un bucle sin sonido y la etiqueta «Qué es Leogin · 53 s»; el video (unos 3 MB) solo se descarga al tocar «play». `/vende-en-linea` no cambia y la ruta `/intro` queda sin enlace desde la portada.
- **Video general «Un solo lugar»** (`promo-video/`, 53,4 s, vertical y horizontal): el restaurante repartido en ocho lugares se junta en uno; luego los tres tipos de negocio con pantallas reales de Rincón 502, cocina, caja y ventas, y el cierre con QR. Guion: [`docs/negocio/GUION_VIDEO_UN_SOLO_LUGAR_2026-11-15.md`](docs/negocio/GUION_VIDEO_UN_SOLO_LUGAR_2026-11-15.md).
- **Serie «Otra vez»**, aprobada por el dueño para visitas y redes: el domingo de hora pico se congela, se rebobina y se repite con Leogin. Tres videos de 45,6 s (con meseros, sin meseros y venta en línea), cada uno en vertical y horizontal. Guion: [`docs/negocio/GUION_VIDEO_OTRA_VEZ_2026-11-15.md`](docs/negocio/GUION_VIDEO_OTRA_VEZ_2026-11-15.md).
- Ningún video muestra precios ni prueba gratis, y ninguno hace zoom sobre las pantallas: lo señalado queda nítido dentro de un anillo y el resto se desenfoca. Se reproducen con `npm run otra-vez:grabar`, `otra-vez:render`, `un-lugar:render` y `un-lugar:web`.

## v0.21.0 · 2026-11-15 · Video promocional y pedido que llega a cocina
PR #118 (merge `a6ca706`) y PR #117 (merge `0a1dbb5`) · migración 181. La 181 no depende del despliegue: corrige producción en cuanto se corre (fuera de la hora pico, porque bloquea `orders` un momento). Ningún cambio de la app pide desplegar.
- **«Enviar a cocina» ya funciona con un pedido recién hecho** (migración 181): desde v0.18.0, todo pedido nuevo respondía «Operación de pedido inválida.» al mandarlo a cocina u operarlo desde Pedidos en vivo, porque nacía sin versión (`orders.updated_at` vacío). Ahora la versión nace con el pedido, los pedidos que ya existían la toman de su hora de creación y la columna no puede volver a quedar vacía.
- **Video promocional «Bajo control»** (`promo-video/`, aparte de la app): anuncio vertical de 40 s para TikTok y Reels, dirigido a la cafetería o restaurante pequeño que empieza. Las pantallas son de la app real, con datos ficticios de Rincón 502. Lo graba Playwright y lo monta Remotion. Trae tres ganchos para pruebas A/B y música hecha con código, sin derechos de terceros. Se reproduce con `npm run seed`, `grabar`, `render` y `verificar`. Guion: [`docs/negocio/GUION_VIDEO_PROMO_2026-11-14.md`](docs/negocio/GUION_VIDEO_PROMO_2026-11-14.md).

## v0.20.0 · 2026-11-11 · Nada saturado, segunda parte
PR #112 (merge `551a3f2`) · sin migraciones · en producción desde la noche del 2026-11-11 (`prod-2026-11-12`; `prod-2026-11-11` marca el despliegue anterior del mismo día).
- **Nada saturado, segunda parte** (rama `feat/nada-saturado-2`; maqueta aprobada `docs/diseno/MAQUETA_NADA_SATURADO_2_2026-11-11.html`):
  - Cocina: una fila con las estaciones y «⋯» (probar sonido, silenciar, modo servicio y filtro por etapa). Salen la tarjeta de estado y el título «Pase»; el sonido solo avisa cuando está apagado o en silencio, con su botón.
  - Caja › Cierre del turno: los tres pasos y «⋯» (fecha, nombre del turno, «Guardar y seguir después»); en el teléfono el cuadre (esperado y diferencia) va en el pie junto a «Siguiente». Ningún cálculo ni paso cambia.
  - Clientes: primero el buscador; «Todos N» y «Sin venir +30 días» como píldoras; el resumen queda en un renglón y sale «Total histórico»; en el teléfono cada fila enseña el gasto a la derecha.
  - Negocio: «Tu año con Leogin» baja debajo de las cifras. Ajustes: sale la frase de arriba y entra un buscador de ajustes.

## v0.19.0 · 2026-11-11 · Experiencia práctica y sin saturar
PR #110 (merge `c9e7ce5`) · sin migraciones · en producción el 2026-11-11 (`prod-2026-11-11`).
- **Experiencia práctica, sin saturar** (rama `feat/experiencia-practica-movil`; principio rector del dueño, 2026-11-10):
  - Tomar pedidos: el salón pasa de título + contador + tres botones + filtros + zonas + pie fijo a una fila de mandos (Mesas | Plano · buscar · Para llevar) y una de filtros. Quien toma el pedido elige plano o mesas y el aparato lo recuerda; el teléfono abre en mesas. Las mesas libres ocupan menos, las que están fuera del plano siguen la página, tocar una mesa libre abre la carta directo y «atrás» sin nada apuntado vuelve al salón.
  - Carta del mesero: con dedo, los favoritos son una tira deslizable sin teclas; el pie «0 por enviar · Q0.00» ya no sale vacío.
  - Un plato personalizable abre su hoja al tocarlo (antes entraba sin opciones salvo grupo obligatorio) y la hoja usa las mismas reglas que la ficha del comensal: opción por omisión, mínimos y máximos.
  - Menú en línea: vuelve la barra de icono y nombre, ahora sólida y con la paleta del restaurante; el carrito es un solo botón. La cápsula gris queda solo en superadmin.
  - Panel: el aviso «Estás administrando…» es una línea y no una tarjeta; «Pantalla completa» sale de la barra del teléfono.
  - Pedidos en vivo: el estado («En línea · sin incidencias») solo ocupa sitio cuando hay algo que atender; las cifras quedan en un renglón («N pedidos hoy»); los listos van primero; exportar baja al pie en el teléfono.
  - Menú › Platillos: una fila (buscar, filtros, «+») y una de categorías con «Agotados» como píldora; los filtros ocasionales, el orden y «Seleccionar varios» van en una hoja (exportar, al pie en el teléfono); la fila entera abre el platillo.
  - Hoy: primero el resumen del día; la guía de pasos empezada es una fila; salen «Agregar platillo», el nombre repetido y el pie del plan.
  - Método escrito para cualquier asistente: `docs/guias/GUIA_DISENO_NADA_SATURADO.md`, enlazado desde `CLAUDE.md` y el nuevo `AGENTS.md`. Maqueta aprobada: `docs/diseno/MAQUETA_NADA_SATURADO_2026-11-10.html`.

## v0.18.0 — 2026-11-10 · Auditoría integral: olas 0 y 1
PR de integración `release/integracion-2026-11-09` (#72–#108) · migraciones 154–180. En producción: 155–180 en un solo script ANTES del despliegue y la 154 DESPUÉS ([guía, parte 7d](docs/guias/GUIA_DESPLIEGUE.md)).
- **Correcciones de la Ola 0 que faltaban** (fichas 0.1–0.6, 0.8, 0.10, 0.11 y 0.13):
  - textos y enlaces que prometían otra cosa (0.1);
  - una sola fuente para precio y alcance de cada plan (0.2);
  - un error de consulta ya no se muestra como vacío ni como cero (0.3);
  - pausa de pedidos inmediata, confirmada y con fin automático (0.4, migración 155);
  - cupones que valen el día completo en la zona del local, programados y con estado único (0.5, migración 154);
  - pedido, cupón y puntos en una sola operación (0.6, migración 157);
  - compras creadas en una transacción y sin reabrir una recibida (0.8, migración 159);
  - un solo corte de caja por periodo y «sin apertura» marcado en el historial (0.10, migración 158);
  - la cola offline dice si guardó y la del mesero se reenvía sola (0.11);
  - pruebas del circuito del dinero en Postgres (0.13).
- **Lo ya descrito abajo** de las fichas 0.7, 0.9, 0.12, 0.14–0.19 y 1.0–1.12.
- **Herramienta:** `scripts/armar-migraciones-produccion.mjs` junta un rango de migraciones en un script transaccional con guarda contra doble aplicación.

- **Pedido y seguimiento honestos del comensal** (auditoría 1.12):
  - la confirmación dice «lo recibió; te avisamos cuando lo acepte», sin el «20–30 min» ni el «notificado al instante» fijos;
  - el seguimiento muestra Recibido, Aceptado, En preparación (platos listos), Listo y Entregado con su hora real;
  - si en 10 minutos no lo aceptan, lo dice y da el WhatsApp del local;
  - la carta confirma la mesa del QR, y una mesa que no existe no recibe pedidos.
- **Ficha y carrito del comensal** (auditoría 1.11):
  - opciones inequívocas: lo obligatorio sin predeterminada empieza vacío y se respeta el mínimo;
  - carrito accesible con «Cambiar» por línea;
  - aviso de lealtad legible en oscuro;
  - «Agotado · vuelve mañana» y «Otros» para lo que no tiene categoría.
- **Inventario y agotados con intención** (auditoría 1.10, migración 180):
  - agotar «hasta mañana», «hasta reponer» o «hasta que lo active», y agotar por ingrediente;
  - cobertura «N de M» y «Por revisar hoy»;
  - ajustes con motivo bajo bloqueo y activación del control en lote.
- **Catálogo** (auditoría 1.9, migración 179): ficha progresiva, filtros combinables, cambios en lote con vista previa, duplicar y borrar categoría con destino.
- **Recepción** (auditoría 1.8, migración 178): agenda con capacidad, «no asistió», aviso honesto y día de negocio.
- **Permisos por trabajo** (auditoría 1.7, migración 177): plantillas por puesto, Caja separada en capacidades y arqueo ciego opcional.
- **Navegación inferior del comensal y superadmin.** La cápsula sigue la referencia aprobada: gris claro, bisel elevado, selección negra e iconos junto al texto. El comensal muestra cantidad, producto e importe sobre la barra cuando tiene un carrito. Superadmin conserva tres accesos visibles y reúne los otros cuatro en «Más». El panel del restaurante conserva sus accesos operativos.
- **Pedidos en vivo** (auditoría 1.6, migración 176). El tablero avisa cuando un filtro oculta una incidencia. Cada pedido tiene un historial de estados, anulaciones, cobros y avisos fallidos. Los avances y anulaciones del tablero recuperan el resultado de un reintento y detectan cambios hechos desde otro dispositivo.
- **Cocina por etapa y estación** (auditoría 1.5, migración 175): cada puesto marca sus platos y Pase confirma cuándo los recoge Servicio. El tablero separa los tiempos de preparación y espera de salida, y muestra variantes, alérgenos, anulaciones y fallos de impresión en la comanda.
- **Servicio estable por turno** (auditoría 1.4, migración 174): los favoritos tienen puestos fijos en cada dispositivo. Tomar pedidos busca por nombre o alias y conserva los borradores al cambiar de mesa. La comanda distingue saldo enviado, platos por enviar y notas para cocina.
- **Salón y comanda** (auditoría 1.3, migración 173): el plano permanece junto a la comanda en escritorio y el teléfono abre cada mesa por separado. Cobrar conserva los pedidos pendientes de entrega. El personal confirma la limpieza antes de volver a sentar a un grupo. Traslados y llegadas desde Recepción actualizan la ocupación en una transacción.

## v0.17.0 — 2026-11-02 · Tomar pedidos como un POS y En línea con tope
PR #63-#69 · migraciones 151-153 (en producción: la 152 ANTES del despliegue, la 151 cuando sea, la 153 DESPUÉS; la 149 ya no hace falta)
- **El plano cabe en cualquier pantalla** (PR #63): en el teléfono el plano de Mesas medía 620 px de ancho mínimo y el de Tomar pedidos 460 px en 4:3 (el editor guarda 16:10), así que la página entera se corría de lado y las mesas se encimaban. Ahora los dos usan un visor común: se encuadra en lo dibujado, se gira 90° solo en pantalla vertical (con botón para girarlo a mano), las mesas miden lo que permite su vecina más cercana con 44 px de mínimo, y se acerca con dos dedos, Ctrl + rueda o botones; al acercar, cada mesa enseña más. Las zonas son pestañas tocables con cuántas mesas tienen gente («Salón 3/14»). «Fuera del plano» ya no cuenta las mesas colocadas en otra zona.
- **La carta del mesero con la foto de cada plato** (PR #64): funciona como cualquier POS. Un toque agrega uno, o abre la hoja si el plato tiene un grupo obligatorio. El número de la esquina dice cuántos van, «−» quita uno y «⋯» abre opciones y nota. Sale «Quedan N» cuando quedan pocos y «Agotado» en gris; sin foto, iniciales sobre un color fijo, y si el restaurante no tiene fotos se quedan las tarjetas compactas. Son 3 columnas en el teléfono, 5 en tablet y 4 en la PC.
- **Cinco funciones de POS en Tomar pedidos** (PR #66):
  - «Mis mesas»: un filtro con solo las mesas del mesero;
  - agotar un plato desde el servicio y devolverlo con «Ya hay», para quien tiene permiso de carta;
  - «Otra ronda»: copia la última ronda de la mesa al carrito contra la carta de hoy;
  - alergias de la mesa (migración 151): se anotan una vez, se ven en rojo en la comanda y salen en cada envío como «ALERGIA: …»;
  - pasar un plato ya enviado a otra mesa o a otro asiento (migración 152): `move_order_item` reparte subtotal, propina y total en una transacción y no deja mover lo anulado ni cuentas con cobros o descuentos.
- **Arreglo: dueños con varios restaurantes** (PR #66): no podían mandar comandas en la sucursal a la que entran por membresía («No autorizado» y el pedido de vuelta al carrito). Ahora la comprobación es la misma que en el resto del servicio.
- **Se retiran los encargos y la transferencia del comensal** (PR #67, migración 153): por decisión del dueño salen **Pedidos › Encargos**, la franja de encargos del menú, la opción «Transferencia» del checkout con su comprobante, la cuenta del restaurante en Ajustes › Pedidos y cobro y el aviso de pago en la tarjeta del pedido. La 153 devuelve el archivado automático al de la 099 y borra `encargo_fechas` y sus columnas en `orders`. **Paga tu plan** (148) no cambia.
- **Tope de 300 pedidos al mes en En línea** (PR #69): es lo que ahora lo separa de Estándar. Es un tope blando: nunca se corta un pedido. El panel «Hoy» avisa al llegar al 80 % y al pasarlo, Mi suscripción enseña «Pedidos este mes: N de 300» y se pide pasar a Estándar el mes siguiente. Cuenta el mes del calendario en la zona del restaurante, sin los cancelados. Planes, el alta y /vende-en-linea lo dicen y presentan En línea con zonas de reparto y seguimiento del pedido.
- **CI con la CLI 3 de Supabase** (PR #68): la versión nueva ya no aceptaba `[inbucket]` en `config.toml` y `supabase start` fallaba en todos los PR. Ahora la sección se llama `[local_smtp]` y la CLI queda fijada en 3.0.0.

## v0.16.0 — 2026-11-02 · Paga tu plan, encargos y plan En línea
PR #58-#61 · migraciones 148-150 (pendientes en producción: aplicar en ese orden ANTES del despliegue)
- **Plan de necesidad y plan En línea** (PR #58 y #59, [plan](docs/planes/PLAN_NECESIDAD_Y_PLAN_EN_LINEA_2026-10-28.md)): qué agregar para que un restaurante *necesite* Leogin, en nueve fases. Decisiones del dueño: un plan para quien solo vende en línea a **Q99**, el cobro de Leogin por transferencia pero profesional, y «Leo contesta tu WhatsApp» queda pendiente. Este hito cierra las fases 1 a 3.
- **Paga tu plan** (PR #59, migración 148): «Mi suscripción» enseña cómo pagar en tres pasos: la cuenta con botón de copiar, un código de pago fijo (`LG-XXXXXX`) y la subida del comprobante a un bucket privado. El comprobante queda «en revisión» hasta que el super admin lo aprueba o lo rechaza con motivo en la bandeja nueva **Finanzas › Comprobantes**. Aprobar marca pagadas las facturas y reactiva al restaurante si estaba suspendido. Hoy avisa del cobro pendiente y Super › Configuración guarda la cuenta en campos separados.
- **Encargos con cupo** (PR #60, migración 149): en **Pedidos › Encargos** el restaurante abre una tanda («Tamales del sábado») con día de entrega, cierre y cupo, y puede pedir pago por adelantado. El menú enseña una franja con «Quedan N» y deja encargar aunque el local esté cerrado. El encargo sale en la tarjeta del pedido y en la comanda, y el seguimiento dice para cuándo es. Si dos personas piden el último lugar a la vez, solo una se lo queda. La 149 también evita que el archivado automático de 6 horas cancele los encargos antes de su día.
- **Pago por transferencia del comensal** (PR #60, migración 149): el restaurante pone su cuenta en **Ajustes › Pedidos y cobro**. El cliente elige «Transferencia», ve la cuenta en el seguimiento y sube su comprobante. El restaurante lo confirma desde la tarjeta del pedido («Confirmar pago» o «No llegó»). Con el pago enviado, el cliente ya no puede cancelar solo.
- **Plan En línea** (PR #61, migración 150): Q99 al mes, sin costo de alta, para llevar y a domicilio, encargos y transferencia, con 150 productos y 1 usuario. No incluye comer en local, finanzas, cupones, lealtad ni mesero. La 150 lo agrega a la restricción de planes, al cobro y a su piso de módulos (sin ella habría recibido gratis los de Premium). Se ve en `/planes`, en la portada (cuatro planes, en 4, 2 o 1 columna), en el alta y en `/vende-en-linea` («Menos de Q4 al día»).
- **Cambiar de plan desde el panel** (PR #61): Mi suscripción muestra los cuatro planes y, antes de confirmar, el precio, desde cuándo se cobra y lo que se deja de tener al bajar. Al bajar se apagan los módulos del plan anterior y se ajustan los modos de pedido y la mensualidad. Solo el dueño puede hacerlo. Se quitaron los botones «Actualizar a…» que abrían WhatsApp.
- **Arreglos** (PR #61): cinco pantallas decidían si un restaurante tiene panel de mesero con una lista de planes escrita a mano; ahora lo leen del plan.
- **Dependencias por avisos de seguridad** (PR #59): `node-forge` 1.4.2, que usa `acme-client` para el HTTPS del hub local.

## v0.15.0 — 2026-10-27 · Vende en línea
PR #55 y #56 · sin migraciones
- **Leogin para quien vende en línea** (PR #56, [plan](docs/planes/PLAN_PORTADA_Y_VENDE_EN_LINEA_2026-10-27.md)): página `/vende-en-linea` para quien vende por WhatsApp o Instagram sin local («Tu menú en un link. Tus pedidos, en orden.»), con el chat que se vuelve un pedido, lo que no le va a estorbar tachado, la Vitrina por temporadas y «Menos de Q7 al día». Puerta en la segunda pantalla de la portada y enlace en la cabecera, el menú y el pie. El alta llega con Estándar «para llevar + a domicilio» ya marcado.
- **Video «Del chat al pedido»** (PR #56, mismo plan §3): 30 s vertical (y corte de 15 s) para quien vende en línea, hecho con código como la intro: el chat lleno de «¿precio?» y el pedido perdido, Leo, el link en la bio, el cliente que pide solo, el pedido que llega completo y la semana. Se ve en `/vende-en-linea` («Míralo en 30 segundos», ruta `/intro-en-linea`); `grabar-video.mjs` y `publicar-en-web.mjs` aceptan `--archivo en-linea.html`.
- **La portada en el teléfono** (PR #56): sin desborde lateral (la intro salía cortada), el video en el primer pantallazo, cabecera sólida, la vitrina de diseños «mitad y mitad», menos recorrido en «Del caos al control», cifras 2×2 y carruseles; la intro vertical centrada.
- **También en PR #56:** en el teléfono la tarjeta de la intro es cuadrada, con la versión vertical (el gancho casi al doble de tamaño); el panel de quien vende solo en línea ya no enseña Mesas, Tomar pedidos ni Salón con candado; Leo del video con los dos brazos y la campanita (#55); y los videos ya no salen con una franja oscura de 8 px en el borde.
- **Leo con los dos brazos en la intro** (PR #55): el Leo de la intro solo dibujaba el brazo izquierdo y no tenía la campanita; ahora lleva el brazo derecho apoyado en la campana, igual que el componente `leo.tsx`. Se regeneró `/intro`. Los medios de la portada (imagen y bucle) no tienen a Leo, así que no cambian.

## v0.14.1 — 2026-10-27 · Leo v3 y sticker de logros
PR #51-#53 · sin migraciones
- **Leo v3** (PR #51 y #52, [propuesta](docs/diseno/marca/leo-v3-propuesta.html) y [variantes](docs/diseno/marca/leo-v3-variantes.html)): silueta S2 con campanita en la punta del pie y ojos E1. Tiene ceja derecha siempre alzada, sonrisa con dientes y dos brazos, con tres niveles de detalle según el tamaño (completo, compacto y mínimo, con color plano en los chicos). Aplicado en el componente y en la intro.
- **Pie recto y sticker de logros** (PR #53, [hoja de cara y sticker](docs/diseno/marca/leo-cara-y-sticker.html)): el pie termina en punta recta para que la silueta no se lea como bota, en el panel y en la intro. Leo sale como calcomanía (borde blanco, giro y animación de pegado) solo en los logros del panel: la fiesta del primer pedido, las tarjetas de hito, el récord de «Tu día» y «Tu año». La cara se queda igual.

## v0.14.0 — 2026-10-27 · Pídelo tú mismo
PR #45-#49 · sin migraciones
- **Pídelo tú mismo** (PR #49, hallazgo EV-01 de la [auditoría de experiencia y venta](docs/auditorias/AUDITORIA_EXPERIENCIA_Y_VENTA_2026-10-27.md)): la demo de Rincón 502 deja pedir. El carrito termina en «Enviar mi pedido de prueba» y enseña «¡Así le llegó a la cocina!», el panel con el pedido sonando, que se puede aceptar y marcar listo. En la web, en PC, «Haz un pedido de prueba» abre una sala con su QR: lo que el visitante pide desde su celular aparece y suena en el panel de la página, con su nombre. Sin base de datos (difusión de Supabase Realtime).
- **Auditoría de experiencia y venta** (PR #46): el panel, la web y el catálogo evaluados con la vara de Nintendo y Apple y de venta, con pasada en pantalla. 19 hallazgos (EV-00 a EV-18; EV-12 ya estaba hecho); quedan pendientes EV-02 a EV-09 y EV-13.
- **Primera impresión** (PR #48): Hoy ya no dice «↓ 100 %» antes de la primera venta, sino con cuánto cierra un día igual (EV-15). El aviso de la PC principal deja de salir en todas las pantallas y pasa a «Necesita tu atención» en Hoy, solo con pedidos; el tour de bienvenida no se abre encima de los primeros pasos (EV-14). El panel dice «platillo» en todas partes (EV-17). Las llamadas al mesero dejan de contar a las 3 horas (EV-18). En la web, «0 apps que descargar» en lugar de «7 herramientas» y Premium «Recomendado» en lugar de «Más popular» (EV-10 y EV-11).
- **Arreglos** (PR #47): Tomar pedidos salía en blanco y Cocina devolvía al login al dueño del modelo de membresías (EV-00). «Carbón de Autor» salía clara pese a ser la paleta oscura insignia; ahora tiene sus colores, y el alta arranca en claro con la paleta nueva «Lino & Coral», igual que antes (EV-16).
- **Ventana con versión vieja** (PR #45): una pestaña abierta desde antes de un despliegue se recarga sola ante «Failed to find Server Action» en vez de quedarse rota.

## v0.13.0 — 2026-10-26 · Tu restaurante, bajo control
PR #27, #28, #33-#36, #38-#42 · migraciones 145-147 (aplicadas en producción antes del despliegue)
- **Tu restaurante, bajo control** (PR #38 y #39, [estrategia de atracción](docs/negocio/ESTRATEGIA_ATRACCION_2026-10-25.md)): la promesa de marca, Leo v2 y una portada nueva con la intro animada de 54 s («Las tres fugas», con cortes de 30 y 15 s para redes) en `/intro`, «Del caos al control» al deslizar y la vitrina «Tu menú, a tu manera» con el menú de verdad en las 8 estructuras.
- **El menú y el panel se mueven con sentido** (PR #40, [plan](docs/planes/PLAN_EXPERIENCIA_VIVA_2026-10-26.md)): en el menú los platillos entran al deslizar y vuelan al carrito; en el panel las cifras ruedan, el pedido nuevo cae y la caja se estampa al cuadrar.
- **Rincón 502, el único restaurante de ejemplo** (PR #39 y #41): la demo en vivo, las pruebas, los scripts, las guías y Leogin Desktop dejan Azúcar Negra.
- **Momentos pico, Leo y ganchos** (fases C, D y E de la [estrategia de atracción](docs/negocio/ESTRATEGIA_ATRACCION_2026-10-25.md), PR #42, migración 147, [plan](docs/planes/PLAN_MOMENTOS_PICO_2026-10-26.md)). **Panel:** «Termina de armar tu restaurante» arranca en 20 % y Leo señala el paso que sigue; Leo en todas las pantallas vacías; el primer pedido del restaurante es una fiesta; en Hoy, el plato estrella, la hora pico y el récord del día cuando lo es de verdad; hitos (100 pedidos, primer mes, cada año); al cerrar el turno, lo vendido en el día con su récord y un aviso al dueño; «Comparte tu plato del día» y «Tu año con Leogin» con imagen para el estado de WhatsApp. **Menú:** al enviar el pedido vuela, suena un «pop» y la palomita se dibuja en verde; se dicen los puntos que suma y cuánto falta para el premio (o los que se pierden sin cuenta); doble de puntos en el primer pedido desde el celular y sorpresa de la casa al azar, las dos en Lealtad. **Web:** «Crear mi menú gratis», «Míralo en tu celular» con QR en computadora, la tarjeta de la intro en movimiento y «Ver todo lo que incluye»; al crear el restaurante, «Así se ve TU restaurante». **Billetera:** Leo da la bienvenida.
- **Cuenta Leogin del comensal** (PR #33-#35, migración 146, [plan](docs/planes/PLAN_BILLETERA_COMENSAL_2026-10-25.md)): una sola cuenta de Google para todos sus restaurantes, la billetera «Mis restaurantes» en `distleogin.com/billetera` y el puente que abre su sesión en cada restaurante por el link estable `/m/<slug>`.
- **Menú del comensal: «Atrás» y Esc cierran la hoja abierta** (auditoría de navegación 2026-10-14, PR #28): el platillo, el carrito, Mi cuenta, Mis puntos y Mis pedidos dejan una entrada en el historial, así que el gesto «Atrás» de Android cierra la hoja en vez de sacar del menú (o devolver a la cámara si se entró por un QR), y Esc la cierra en PC. Volver desde el pago reabre el carrito.
- **Barra del panel con roles estrechos** (misma auditoría, PR #28): el mesero puro ya no ve «Hoy» (que lo devolvía a Tomar pedidos) ni una barra inferior con un solo destino, y su salón gana esos 56 px; el botón «Tomar pedido» ya no depende de tener «Menú»; con barra lateral (tablet y PC) «Pedidos» vuelve a marcarse en Tomar pedidos, y el título dice la pantalla cuando no hay fila de pestañas.
- **Caja por turnos** (FUN-01, PROD-02…06 de la [auditoría de salida a producción](docs/auditorias/AUDITORIA_SALIDA_PRODUCCION_2026-10-09.md), PR #27, migración 145, [plan](docs/planes/PLAN_CAJA_TURNOS_2026-10-09.md)): el turno se abre con quién y fondo y su cuadre cubre solo lo **cobrado** desde el cierre anterior (una mesa abierta ya no es un «faltante»; dos turnos al día cuadran cada uno lo suyo y el historial suma el día). Antes de cerrar avisa de mesas, domicilios y pedidos para llevar sin cobrar. Hora de corte del día por restaurante (05:00 por omisión, en Ajustes › Horarios) para caja, gastos, propinas, Hoy, reportes y analítica. «Cobros de este turno» deja corregir el método, reabrir una mesa cobrada por error y devolver todo o una línea (hasta 3 días), con motivo, firma de encargado y bitácora; el reporte de ventas enseña las devoluciones aparte. Un corte ya no se borra: el último se anula con motivo y firma y el turno se vuelve a contar.
- **Arreglos** (PR #42): el asistente para crear un restaurante se saltaba el resumen («Continuar» lo creaba ahí mismo); la ventana de la intro de la portada salía pegada arriba a la izquierda; la CI dejó de pasar ESLint por el GSAP minificado de la intro.
- **Dependencias por avisos de seguridad** (PR #36): Next.js 16.4.3, zod 4, `dompurify` 3.4.17 y `follow-redirects` 1.16.2.

## v0.12.0 — 2026-10-13 · Auditoría de salida a producción
PR #10-#25 · migraciones 142-144 (pendientes en producción, en ese orden)
- [Auditoría de salida a producción](docs/auditorias/AUDITORIA_SALIDA_PRODUCCION_2026-10-09.md): qué falta para vender (errores del sistema, errores humanos, seguridad, legal y fiscal, funciones). Los planes de servidores quedan como decisión cerrada (Render Starter en `render.yaml`).
- Arreglos de la auditoría (migraciones 142-144): el dueño registrado solo ya puede subir fotos y logo (142); cobrar una mesa cierra solo lo que leyó y registra el pago una vez; la cancelación del comensal es atómica y ya no pisa la confirmación de cocina (143); anular o cancelar devuelve los puntos canjeados y el uso del cupón (144); el cambio de estado usa el restaurante del pedido para comanda, puntos, FEL y bitácora; la bitácora anota precios, borrados, cupones, gastos, pausa y horario, con filtro por persona.
- Dependencias al día: grupo de menores de la plataforma (Next.js 16.4.0, React 19.3, `@supabase/ssr` 0.12.7, entre otras), del agente de impresión y de Leogin Desktop, y las GitHub Actions. Dependabot ya no propone versiones mayores de zod, TypeScript, vitest ni `@types/node` (se migrarán a propósito).
- Seguridad de dependencias (SEG-01/02/03/05 de la [auditoría de salida a producción](docs/auditorias/AUDITORIA_SALIDA_PRODUCCION_2026-10-09.md)): Next.js 16.2.7 → 16.3.8 (cierra la vulnerabilidad crítica de saltarse el proxy y las de ejecución remota), `sharp` 0.34 → 0.35.5 (fotos subidas en `/img`), `npm audit fix` para el resto. La CI ahora corre las pruebas unitarias, el `build` y un `npm audit` de producción; Dependabot revisa cada semana las dependencias de la plataforma, el agente, Leogin Desktop y las GitHub Actions.
- Vista previa en vivo del editor de personalización fiel al menú real: ya no se pinta con los colores de Leogin (coral y grises claros) en lugar de los del restaurante; el editor arranca con el nombre y lema reales; y la vista previa muestra también el botón de WhatsApp, la pestaña de Fidelidad, «Llamar al mesero» y el selector de idioma.

## v0.11.0 — 2026-10-09 · Estructura Vitrina y lanzamientos
`5388e2f` · migración 141
- Orden de la carpeta: documentación en `docs/` por tipo, archivos de prueba fuera del repositorio.
- Flujo de git: ramas + Pull Request, plantilla de commit, hooks `pre-push` y `commit-msg`, `.mailmap`.
- Estructura de menú **Vitrina** (8.ª) para comercios que venden con la vista: pieza grande por producto, portada de cartel y paletas Cereza, Cacao y Pistache. Opcionales en cualquier estructura: cinta de anuncios, modo lanzamiento con cuenta regresiva y aviso «quedan pocas». Plan: [`PLAN_VITRINA_2026-10-09`](docs/planes/PLAN_VITRINA_2026-10-09.md).
- Vitrina, Fase 2 (migración 141): la edición abre y cierra de verdad (el servidor rechaza pedidos en línea fuera de la edición), archivo de ediciones con «Agotado en …», próximo drop con «Avísame por WhatsApp» y «Quedan 9 de 30».

## v0.10.0 — 2026-10-08 · Acceso y monitoreo antes del lanzamiento
`ef37fa0` · migraciones 136-140
- Candados de escritura y de pedidos/dinero, permisos por sección del panel.
- Super admin con segundo factor y salud de clientes.
- Plan: [`PLAN_ACCESO_Y_MONITOREO_2026-10-08`](docs/planes/PLAN_ACCESO_Y_MONITOREO_2026-10-08.md). Pendiente según el plan: TOTP/2FA completo, Sentry y cron.

## v0.9.0 — 2026-10-04 · Auditoría de pulido (146/148)
`3990f46` · migraciones 134-135
- Textos y claves, piezas comunes, pantallas largas y buscadores, marketing.
- Pedidos y Mesas según la maqueta aprobada (D-2); QR de mesa con dirección corta `/m/<slug>/<mesa>` (D-5).
- Render movido a Virginia, junto a Supabase.
- Registro: [`AUDITORIA_PULIDO_2026-10-02`](docs/auditorias/AUDITORIA_PULIDO_2026-10-02.md).

## v0.8.0 — 2026-09-26 · Auditorías QA visual y de velocidad
`61911fb`
- ~60 arreglos de la auditoría QA visual de todo el panel.
- Imágenes servidas desde `/img`, CSS del admin aparte, «Enviar a cocina» optimista.
- Registro: [`AUDITORIA_2026-09-25`](docs/auditorias/AUDITORIA_2026-09-25.md).

## v0.7.0 — 2026-09-08 · Impresión por estación (M-07)
`12db70e` · migración 130
- Cinco fases: estación, reparto de comandas, papeles, pantalla de activación y reparto sin internet.
- Plan: [`PLAN_IMPRESION_POR_ESTACION`](docs/planes/PLAN_IMPRESION_POR_ESTACION.md).

## v0.6.0 — 2026-09-02 · Origen único y auditoría del salón
`e94c493` · migraciones 124-127
- El panel pasa de subdominio a `/panel/<slug>`.
- 25 hallazgos de Mesas y Tomar pedidos.
- Plan: [`PLAN_ORIGEN_UNICO`](docs/planes/PLAN_ORIGEN_UNICO.md).

## v0.5.0 — 2026-08-26 · Sistema de acceso y rediseño del salón
`745f8d9`
- Login con Google, «Mi cuenta» multi-restaurante, gerentes e invitaciones.
- Rediseño de pedidos y mesas, modo servicio, avisos.
- Plan: [`PLAN_ACCESO_MULTICUENTA`](docs/planes/PLAN_ACCESO_MULTICUENTA.md).

## v0.4.0 — 2026-07-27 · Red de seguridad (CI) y preventa
`4bb2aec` · migraciones 091-092
- CI con Supabase efímero, prueba E2E de pedidos y auditoría de funciones `security definer` en cada push.
- Precios unificados y caja de herramientas de venta.
- Plan: [`PLAN_CORRECCION_PREVENTA`](docs/planes/PLAN_CORRECCION_PREVENTA.md).

## v0.3.0 — 2026-07-22 · Cierre del plan de auditoría de lanzamiento
`1cb9197` · migraciones 074-088
- Login de personal por PIN, anulación con motivo y PIN, auto-archivo de mesas.
- Kardex con costo promedio ponderado y respaldo self-service.
- Alérgenos y dietas, menú bilingüe, lista de espera.
- Plan: [`PLAN_AUDITORIA_LANZAMIENTO`](docs/planes/PLAN_AUDITORIA_LANZAMIENTO.md).

## v0.2.0 — 2026-07-11 · Modo offline y Leogin Desktop
`94c2c78`
- Hub local que toma pedidos sin internet, imprime y sincroniza; cola de pedidos idempotente.
- Leogin Desktop (Tauri v2) v0.3.0 con agente de impresión v0.7.0.

## v0.1.0 — 2026-06-21 · Primera versión etiquetada
`eef5c61`
- Menú digital, pedidos, panel de administración y agente de impresión.
