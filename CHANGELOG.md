# Registro de cambios

Cada versión es una etiqueta de git sobre un commit de `main` (`git show v0.7.0`). Las versiones de `v0.2.0` a `v0.10.0` se pusieron **retroactivamente** el 2026-10-09 sobre los hitos grandes que ya existían; desde aquí se etiqueta al cerrar cada hito. Reglas en [`docs/guias/FLUJO_GIT.md`](docs/guias/FLUJO_GIT.md).

Esto es la plataforma (`plataforma/`). El agente de impresión y Leogin Desktop llevan su propia versión (ver sus `package.json`).

## Sin publicar
- **Menú del comensal: «Atrás» y Esc cierran la hoja abierta** (auditoría de navegación 2026-10-14): el platillo, el carrito, Mi cuenta, Mis puntos y Mis pedidos dejan una entrada en el historial, así que el gesto «Atrás» de Android cierra la hoja en vez de sacar del menú (o devolver a la cámara si se entró por un QR), y Esc la cierra en PC. Volver desde el pago reabre el carrito.
- **Barra del panel con roles estrechos** (misma auditoría): el mesero puro ya no ve «Hoy» (que lo devolvía a Tomar pedidos) ni una barra inferior con un solo destino, y su salón gana esos 56 px; el botón «Tomar pedido» ya no depende de tener «Menú»; con barra lateral (tablet y PC) «Pedidos» vuelve a marcarse en Tomar pedidos, y el título dice la pantalla cuando no hay fila de pestañas.
- **Caja por turnos** (FUN-01, PROD-02…06 de la [auditoría de salida a producción](docs/auditorias/AUDITORIA_SALIDA_PRODUCCION_2026-10-09.md), migración 145, [plan](docs/planes/PLAN_CAJA_TURNOS_2026-10-09.md)): el turno se abre con quién y fondo y su cuadre cubre solo lo **cobrado** desde el cierre anterior (una mesa abierta ya no es un «faltante»; dos turnos al día cuadran cada uno lo suyo y el historial suma el día). Antes de cerrar avisa de mesas, domicilios y pedidos para llevar sin cobrar. Hora de corte del día por restaurante (05:00 por omisión, en Ajustes › Horarios) para caja, gastos, propinas, Hoy, reportes y analítica. «Cobros de este turno» deja corregir el método, reabrir una mesa cobrada por error y devolver todo o una línea (hasta 3 días), con motivo, firma de encargado y bitácora; el reporte de ventas enseña las devoluciones aparte. Un corte ya no se borra: el último se anula con motivo y firma y el turno se vuelve a contar.

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
