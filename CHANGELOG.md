# Registro de cambios

Cada versión es una etiqueta de git sobre un commit de `main` (`git show v0.7.0`). Las versiones de `v0.2.0` a `v0.10.0` se pusieron **retroactivamente** el 2026-10-09 sobre los hitos grandes que ya existían; desde aquí se etiqueta al cerrar cada hito. Reglas en [`docs/guias/FLUJO_GIT.md`](docs/guias/FLUJO_GIT.md).

Esto es la plataforma (`plataforma/`). El agente de impresión y Leogin Desktop llevan su propia versión (ver sus `package.json`).

## Sin publicar

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
