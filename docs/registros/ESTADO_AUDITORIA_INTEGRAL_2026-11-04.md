# Estado de la auditoría integral — traspaso del 2026-11-04

Documento de traspaso para retomar el trabajo en otra sesión o cuenta sin perder el contexto. Resume qué se logró, qué está en curso y qué falta, con listas para marcar.

> **Resumen:** la ola 0 lleva **10 de 13 fichas hechas**, cada una en su rama y su PR. Hay **11 PR abiertos** (#71 a #81), todos con el CI en verde y **ninguno fusionado**. Faltan las fichas **0.12, 0.2 y 0.13**. Después viene la ola 1, que empieza por la **1.0 (paleta)**. Nada de esto está desplegado.

---

## 1. Cómo retomar (léelo primero)

1. Lee [`CLAUDE.md`](../../CLAUDE.md) (reglas de git y archivos) y [`plataforma/AGENTS.md`](../../plataforma/AGENTS.md). Esta versión de Next.js no es la conocida: lee la guía en `node_modules/next/dist/docs/` antes de escribir código.
2. Lee el plan: [`docs/planes/PLAN_AUDITORIA_INTEGRAL_2026-11-04.md`](../planes/PLAN_AUDITORIA_INTEGRAL_2026-11-04.md). Tiene las 66 fichas, el método (§1), las decisiones (§3), la ola 0 en detalle (§5), las olas 1 a 4 (§6), el tablero (§7) y el índice inverso de cada ID de la auditoría (§8).
3. La especificación detallada de cada hallazgo está en la auditoría archivada:
   - [`AUDITORIA_INTEGRAL_2026-11-03.md`](../auditorias/AUDITORIA_INTEGRAL_2026-11-03.md): IDs N, E, D, W, A, C, O, M, S y T, y la matriz de dinero M§8.
   - [`AUDITORIA_POR_APARTADO_2026-11-03.md`](../auditorias/AUDITORIA_POR_APARTADO_2026-11-03.md): IDs R01–R40, X01–X23 y las pruebas PA-T01–T30.
   - [`AUDITORIA_INICIAL_2026-11-02.md`](../auditorias/AUDITORIA_INICIAL_2026-11-02.md): IDs F01–F22.
   - [`DIRECCION_VISUAL_2026-11-03.html`](../diseno/DIRECCION_VISUAL_2026-11-03.html): la propuesta visual «hospitalidad precisa».
4. Este documento vive en la rama `docs/plan-auditoria-integral` (PR #71). **Cada rama de ficha marca solo su propia casilla del tablero**; el estado completo está aquí.
5. Para seguir con la siguiente ficha: `git fetch`, crea la rama desde `origin/docs/plan-auditoria-integral` (así lo hicieron todas las fichas) y abre el PR contra `main` con la nota «Va encima de #71».

---

## 2. Decisiones del dueño

### Tomadas (2026-11-04)

| Tema | Decisión | Dónde se aplica |
|---|---|---|
| Recetas e inventario (X09) | Corregir el texto ya; construir el consumo automático después | 0.1 (hecho) y 4.1 |
| Encuestas (X02) | Identificadas, y se avisa al comensal | 0.1 (hecho) |
| Cierre de caja sin apertura (N05) | Se permite, pero queda marcado | 0.10 (hecho) |
| Dirección visual | Explorar la paleta nueva en maquetas antes de decidir | 1.0, antes de cualquier ficha visual de la ola 1 |
| Forma de trabajar | Ficha por ficha, con la aprobación del dueño en cada paso («Sí, sigue»); maqueta aprobada antes de cada cambio visual («Sí, constrúyela») | Todas |

### Pendientes

- [ ] **Número de WhatsApp de ventas** (F02/W02). En 0.1 se resolvió sin número: el contacto sigue a `NEXT_PUBLIC_CONTACT_WHATSAPP`. Falta el número real en producción.
- [ ] **Paleta actual o nueva:** se decide al ver las maquetas de la 1.0.
- [ ] **«Partes iguales» definitivo** (bloquea 1.1). Por ahora se renombró «Calcular partes».
- [ ] **Opciones de agotado manual** (bloquea 1.10). Propuesta: «hasta mañana», «hasta reponer» y «hasta que lo active».
- [ ] **Política de suspensión por falta de pago** (bloquea 4.10).
- [ ] **De 3 a 5 personas por rol** para las pruebas de uso (Q.3, desde la ola 1).
- [ ] **Restaurantes piloto** (V.5).

---

## 3. Lo logrado: fichas de la ola 0

Todas salen de `docs/plan-auditoria-integral`, van contra `main` y tienen el CI en verde (revisado el 2026-11-04). Cada PR explica el fallo reproducido, el arreglo y las pruebas.

| Ficha | PR | Rama | Migración | Qué resolvió |
|---|---|---|---|---|
| — Plan y auditorías | [#71](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/71) | `docs/plan-auditoria-integral` | — | Archiva las auditorías y agrega el plan de 66 fichas |
| 0.1 Textos que prometen otra cosa | [#72](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/72) | `fix/textos-que-prometen-otra-cosa` | — | Recetas «calcula el costo», encuesta identificada, «Exportar datos», «Calcular partes», enlaces de módulos, etiquetas de analítica y contacto |
| 0.5 Cupones: vigencia | [#73](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/73) | `fix/cupones-vigencia` | **154** (DESPUÉS de desplegar) | Los cupones vencían a las 18:00 del día anterior en Guatemala (X05). Fuente única en `lib/cupones/vigencia.ts` |
| 0.4 Pausa de pedidos real | [#74](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/74) | `fix/pausa-pedidos-real` | **155** (ANTES) | Pausa inmediata, confirmada y con fin automático (`lib/pausa-pedidos.ts`, `components/admin/pausa-pedidos.tsx`). [Maqueta](https://claude.ai/artifact/EPL6nSoti8abF1My1YiN8p) |
| 0.3 Error no es vacío ni cero | [#75](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/75) | `fix/error-no-es-vacio` | — | `Lectura<T>` en `lib/db/lectura.ts` y `components/admin/aviso-lectura.tsx`: una consulta fallida ya no se muestra como vacío ni como Q0. [Maqueta](https://claude.ai/artifact/FxT8MLXqic1YJk3xvuE7xF) |
| 0.7 Receta atómica y referencias | [#76](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/76) | `fix/receta-atomica-y-referencias` | **156** (ANTES) | `leogin_reemplazar_receta`, `leogin_mover_categoria` y candados entre restaurantes (recetas, compras, proveedor, repartidor). Prueba `supabase/pruebas/156_*.sql` |
| 0.6 Pedido, cupón y puntos atómicos | [#77](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/77) | `fix/pedido-cupon-puntos-atomico` | **157** (ANTES) | `leogin_crear_pedido`: pedido, cupón (con candado y tope) y canje en una transacción (errores LGC01/LGC02). Carrera real probada. Prueba `157_*.sql` |
| 0.10 Caja honesta | [#78](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/78) | `fix/caja-honesta` | **158** (ANTES o a la vez) | Conteo confirmado, turno sin apertura marcado, las dos horas en el recibo, un corte por periodo. [Maqueta](https://claude.ai/artifact/VgTzm7KQTRk4W1Cy2X8XGz) |
| 0.9 Sentar sin estados partidos | [#79](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/79) | `fix/sentar-sin-estados-partidos` | — | Primero la mesa, después el grupo (`lib/mesa/sentar-desde-origen.ts`); repetir no abre otra; etiquetas en los formularios de reserva y espera |
| 0.8 Compras atómicas y estados | [#80](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/80) | `fix/compras-atomicas-y-estados` | **159** (ANTES o a la vez) | Una compra recibida ya no vuelve a borrador (antes sumaba el stock dos veces). `leogin_crear_compra` con folio bajo candado. Prueba `159_*.sql` |
| 0.11 Cola offline honesta | [#81](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/81) | `fix/cola-offline-honesta` | — | `saveQueuedOrder` dice si guardó de verdad; «No se guardó en este teléfono». **La cola del mesero vuelve a reenviarse** (ver §4) |

### Hallazgos importantes del camino

- **X05 confirmado (0.5):** con la base en UTC, un cupón «hasta el 10» vencía el 9 a las 18:00 en Guatemala.
- **Doble stock (0.8):** recibir → borrador → recibir sumaba 20 kg en lugar de 10.
- **La cola del mesero no se reenviaba (0.11):** desde el commit 669bbdd (cuando `waiter-panel.tsx` pasó a `servicio-panel.tsx`), los pedidos que el mesero mandaba sin señal se quedaban en el aparato para siempre, mientras el aviso decía «se enviará solo». No estaba en la auditoría; ya está corregido.
- **Sentar en mesa ocupada (0.9):** la lista de espera o la reserva decían «sentados en la 9» con la 9 ocupada por otro grupo.

---

## 4. Estado de los PR y orden para fusionar

- [ ] Fusionar **#71 primero**. Todas las fichas van encima de él.
- [ ] Fusionar las fichas una por una, con el CI en verde y **solo cuando el dueño lo pida** (CLAUDE.md). No usar `gh pr merge --auto`. Al fusionar, borrar la rama remota y la local.
- [ ] **Conflictos esperados al fusionar en cadena:**
  - `plataforma/supabase/verificar_migraciones.sql`: #73, #74, #76, #77, #78 y #80 agregan cada uno su fila. Se resuelve dejando las filas **154 a 159 en orden**.
  - **Tablero del plan** (§7): cada rama marcó solo su casilla. Se resuelve dejando **todas** las `[x]`. Las notas «Estado» de cada ficha están en secciones distintas y no chocan.
  - #73 y #75 tocan los dos el panel y la página de cupones (props). Revisar a mano.
- [ ] Tras cada conflicto resuelto: `npx tsc --noEmit -p .` y `npx vitest run` desde `plataforma/`.

---

## 5. Migraciones y despliegue

**Producción no tiene nada de esto.** Además sigue pendiente desplegar **v0.17.0** (etiqueta puesta en 876dd50).

### Pendiente de v0.17.0 (de antes de la auditoría)
- [ ] En producción, **antes** de desplegar: migraciones 148, 150, 151 y 152 (la 149 la retira la 153).
- [ ] Desplegar v0.17.0.
- [ ] **Después** de desplegar: migración 153.
- [ ] Etiqueta `prod-AAAA-MM-DD` sobre el commit desplegado.

### Migraciones de la ola 0 (en vuelo)

| Mig | PR | Cuándo aplicarla |
|---|---|---|
| 154 `cupones_vencen_al_final_del_dia` | #73 | **Después** de desplegar |
| 155 `pausa_de_pedidos_con_fin` | #74 | **Antes** |
| 156 `receta_atomica_y_referencias` | #76 | **Antes** |
| 157 `pedido_cupon_y_puntos_atomico` | #77 | **Antes** (el código tiene respaldo si falta) |
| 158 `un_corte_por_periodo` | #78 | **Antes o a la vez**; si el verificador dice NO, hay cortes repetidos que revisar a mano |
| 159 `compras_atomicas_y_estados` | #80 | **Antes o a la vez** (el código tiene respaldo si falta) |

- **La siguiente migración libre es la 160.**
- Una migración ya aplicada en producción no se edita nunca.
- Comprobar lo aplicado con `plataforma/supabase/verificar_migraciones.sql`.
- [ ] Corregir `CLAUDE.md`: dice que la última migración es la 141.

### Al cerrar la ola 0
- [ ] Actualizar `CHANGELOG.md` en el mismo PR que cierre la ola.
- [ ] Proponer al dueño la etiqueta anotada `v0.18.0`. No etiquetar sin su confirmación.

---

## 6. Lo que falta

### Ola 0 (3 fichas). Orden recomendado: 0.12 → 0.2 → 0.13

- [x] 0.1 · [x] 0.3 · [x] 0.4 · [x] 0.5 · [x] 0.6 · [x] 0.7 · [x] 0.8 · [x] 0.9 · [x] 0.10 · [x] 0.11
- [ ] **0.12 Acceso por sucursal con membresías** (M). N14, E04, T06, F20, PA-T29.
  - [ ] Reproducir primero el caso de un dueño con membresía y sin `profiles.restaurant_id`, y el de varios locales.
  - [ ] Rastrear la reescritura de `proxy.ts`, las cabeceras y `resolveRestaurantId`.
  - [ ] Ampliar el E2E con esos usuarios, con un empleado restringido y con el superadmin con MFA.
  - [ ] **No** corregirlo copiando `restaurant_id` a todos.
  - [ ] Aceptación: cada `/panel/<slug>` abre el local elegido o explica por qué no; pasar del local A al B no mezcla datos; una acción llamada directamente sin permiso se rechaza en el servidor.
- [ ] **0.2 Una sola fuente para plan, precio y alcance** (M). E01, N15, N23, R36.1–2, R37.2, W01.
  - [ ] Que web, comparación, Hoy, suscripción y superadmin lean su texto de `lib/plans.ts`.
  - [ ] Separar «incluido», «habilitado», «configurado» y «activo».
  - [ ] Contar las funciones a partir de la misma lista que se muestra (hoy dice «7 funciones» con ocho en la lista).
  - [ ] En Hoy, Estándar se describe con los permisos efectivos, no con el nombre del plan.
  - [ ] Aceptación: pruebas en cinco superficies con Estándar con 2 de 3 canales, Premium a precio fijo, En línea con tope blando y un precio de excepción; el mismo importe y el mismo alcance en todas. No recalcula contratos históricos.
- [ ] **0.13 Probar el circuito del dinero en Postgres real** (L). C08, E03, T01, M§8.
  - [ ] Suite de integración contra la base local con estos casos:
    - [ ] Q100 entre 3 personas (33,34 + 33,33 + 33,33).
    - [ ] Q200 con tres pagos mixtos.
    - [ ] Dos empleados que cobran el mismo saldo.
    - [ ] Doble clic con la respuesta perdida.
    - [ ] Pago parcial y luego un platillo nuevo.
    - [ ] Devolución de otro turno.
    - [ ] Descuento y propina repartidos.
    - [ ] Cierre de caja mientras entra un cobro.
    - [ ] Corte de las 05:00 con la zona horaria.
  - [ ] Cada fallo que encuentre se vuelve una ficha propia antes de la ola 1.
  - [ ] Aceptación: la suite corre en CI o tiene un comando documentado, con una tabla de resultados por caso.
  - Patrón disponible: `plataforma/supabase/pruebas/NNN_*.sql` (DO-blocks dentro de `begin … rollback`) y carreras con dos `psql` en paralelo.

### Ola 1 · Recorridos de trabajo (después de la ola 0)
- [ ] **1.0 Exploración de paleta y sistema visual. Va primero:** maquetas de Hoy, Cobro y Carta del comensal, identidad actual frente a «hospitalidad precisa». Elige el dueño.
- [ ] 1.1 Cobro completo (depende de 0.13) · [ ] 1.2 Caja: borrador, cuadre y recibo · [ ] 1.3 Mesa pagada, por limpiar y libre · [ ] 1.4 Servicio estable por turno · [ ] 1.5 Cocina por etapa y estación · [ ] 1.6 Pedidos en vivo · [ ] 1.7 Permisos por trabajo (migración) · [ ] 1.8 Recepción · [ ] 1.9 Catálogo y alta de platillo · [ ] 1.10 Inventario y agotados · [ ] 1.11 Comensal: ficha, carrito, temas y accesibilidad · [ ] 1.12 Comensal: entrada, checkout y seguimiento

### Olas 2, 3 y 4, línea comercial y calidad
Lista completa en el plan (§6) y el tablero (§7):
- 2.1 a 2.12: arranque y autonomía.
- 3.1 a 3.7: números confiables y retención.
- 4.1 a 4.12: operación avanzada y escala.
- V.1 a V.6: línea comercial, en paralelo desde la ola 1.
- Q.1 a Q.3: calidad, continuas.

### Anotado durante la ola 0 para fichas futuras
- [ ] **1.0:** el KPI se parte en dos renglones («Q5,388.3/0»).
- [ ] **1.2:** el borrador de caja no recuerda la casilla «No hay efectivo en la caja».
- [ ] **1.11:** `CheckoutBlocked` (vidrio) casi ilegible; contraste del modal de lealtad con Google (también 3.3).
- [ ] **1.12:** el éxito del pedido dice «ya recibió tu pedido y lo está preparando» aunque nadie lo haya aceptado.
- [ ] **3.4:** los botones editar y borrar de cupones no tienen nombre accesible.
- [ ] **4.2:** recepción parcial, devoluciones de compra y doble orden por doble toque.
- [ ] **4.6:** IndexedDB, caducidad y revisión de precio de un pedido viejo en cola, y la matriz sin internet, sin LAN y sin PC.
- [ ] Lint: aviso previo `react-hooks/exhaustive-deps` (falta `tp`) en `checkout-form.tsx`.

---

## 7. Método de trabajo (lo que funcionó)

Por cada ficha:
1. Leer la ficha en el plan y su especificación en la auditoría.
2. **Reproducir el fallo antes de tocar código:** SQL dentro de `begin … rollback` o el flujo real en el navegador.
3. Si hay cambio visual, publicar una maqueta y esperar el «Sí, constrúyela».
4. Corregir, agregar pruebas (vitest y, si hay SQL, `supabase/pruebas/NNN_*.sql`), y correr `tsc`, eslint y vitest.
5. Probar en el navegador con datos de prueba (prefijo «AUD») y **borrarlos después**. Mirar la pantalla antes de decir «hecho».
6. Escribir la nota «Estado» de la ficha y marcar su casilla del tablero **en el mismo commit**.
7. Hacer un commit `tipo(ámbito): qué cambió (auditoría X.Y)` con la línea `Co-Authored-By`.
8. Push, PR con la plantilla y revisar el CI con las herramientas `ccd_pr`.

### Entorno local y trampas conocidas
- **Base local:**
  - Docker con Supabase; arrancar con `npx supabase start -x studio` **desde `plataforma/`**. Si Studio no pasa el healthcheck, `supabase start` apaga todo.
  - Para psql: `docker exec -i supabase_db_plataforma psql -U postgres`.
  - **La base local ya tiene aplicadas las migraciones 154 a 159** (de ramas distintas). La CLI se niega a `migration up` por eso: aplicar con `psql < archivo`.
- **Sesión y direcciones:**
  - Sesión de prueba: `http://localhost:3000/api/dev-login?next=/panel/rincon502` (dueño de Rincón 502). Nunca escribir contraseñas ni PIN en formularios.
  - Menú público: `http://rincon502.localhost:3000`. Si muestra «module factory is not available», es un service worker viejo: desregistrarlo y borrar las cachés.
- **Servidor de desarrollo:**
  - Si sirve un bundle viejo (texto viejo, «reading 'apply'», 409 o la página sin hidratar): detener el servidor, `rm -rf .next node_modules/.cache` y volver a arrancar.
  - En el panel del navegador los clics por coordenada fallan: usar refs o JS.
  - Proveedores está apagado en Rincón 502. Para probarlo, encender `restaurants.modules.proveedores` y apagarlo al terminar.
- **Simular fallos en el navegador:**
  - Sin señal: parchear `window.fetch` para rechazar las peticiones con cabecera `Next-Action`.
  - Memoria llena: `Storage.prototype.setItem` que lanza `DOMException('…','QuotaExceededError')`.
  - Lectura fallida real: `revoke select on <tabla> from service_role` y luego `grant`.
- **Código y SQL:**
  - En plpgsql el marcador de `RAISE` es `%`, no `%s`; y `hint = null` revienta.
  - El test `type-scale` solo acepta tamaños de la escala (11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 40).
  - En rutas reescritas `/panel/<slug>/…`, `revalidatePath` no siempre repinta: usar `router.refresh()`.
  - Python en Windows: preservar CRLF al editar; escribir los scripts largos en un archivo, no en un heredoc.

### Datos de prueba que quedan en la base local
- Pedido de la Mesa 1 por Q52, sin cobrar (de la ficha 0.1).
- Cliente «AUD Cola» (de una prueba del 2026-10-27).

---

*Actualiza este documento al cerrar cada ficha o al fusionar PR, o muévelo a `docs/archivo/` cuando la ola 0 esté fusionada y desplegada.*
