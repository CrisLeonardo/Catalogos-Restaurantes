# Estado de la auditoría integral — traspaso del 2026-11-04

Documento de traspaso para retomar el trabajo en otra sesión o cuenta sin perder el contexto. Resume qué se logró, qué está en curso y qué falta, con listas para marcar.

> **Actualización del 2026-11-05:** hay **14 fichas implementadas en sus ramas**, incluidas las 13 originales y la **0.14** (§11). El doble cobro concurrente D03 ya pasa; quedan **cinco defectos monetarios, 0.15–0.19**, antes de cerrar la ola 0. La 0.13 está en [#84](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/84); su CI se vio en curso al empezar esta continuación. La 0.14 usa migración **160 antes del código** y conserva el resto de la matriz como fallos explícitos. No se fusionó ni se desplegó. Siguiente ficha: **0.15**, con el «sí, sigue» del dueño.

---

## 1. Cómo retomar (léelo primero)

1. Lee [`CLAUDE.md`](../../CLAUDE.md) (reglas de git y archivos) y [`plataforma/AGENTS.md`](../../plataforma/AGENTS.md). Esta versión de Next.js no es la conocida: lee la guía en `node_modules/next/dist/docs/` antes de escribir código.
2. Lee el plan: [`docs/planes/PLAN_AUDITORIA_INTEGRAL_2026-11-04.md`](../planes/PLAN_AUDITORIA_INTEGRAL_2026-11-04.md). Tiene las 66 fichas originales y los seis bugs de dinero agregados en 0.13, el método (§1), las decisiones (§3), la ola 0 en detalle (§5), las olas 1 a 4 (§6), el tablero (§7) y el índice inverso de cada ID de la auditoría (§8).
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

Todas salen de `docs/plan-auditoria-integral` y van contra `main`. Los PR #71–#81 tenían el CI en verde al revisarlos el 2026-11-04; la 0.12 se valida el 2026-11-05 (§8). Cada PR explica el fallo reproducido, el arreglo y las pruebas.

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
| 0.12 Acceso por sucursal | [#82](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/82) | `fix/acceso-sucursal-membresias` | — | Permiso efectivo por membresía en seis resolutores de acciones; rechazo sin caer a otro local; destino tras login/MFA; «Continuar como» moderno; cocina/mesero con sucursal coherente. Ver §8 |
| 0.2 Plan, precio y alcance | [#83](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/83) | `fix/planes-precio-y-alcance` | — | Contrato de presentación compartido, mensualidad acordada separada de tarifa pública, contador derivado y estados de las funciones distintos. Ver §9 |
| 0.13 Circuito de dinero en Postgres | [#84](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/84) | `fix/pruebas-dinero-postgres` | — | Suite reproducible de nueve casos: tres pasan y seis identifican defectos en esa base, con fichas 0.14–0.19 antes de la ola 1. Ver §10 |
| 0.14 Cobro parcial concurrente | PR de esta rama | `fix/cobro-parcial-concurrente` | **160** (ANTES) | Saldo y asignación por plato dentro de la misma transacción; cierre con bloqueo compartido, rechazo de propuestas desactualizadas y garantías en CI. Ver §11 |

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
  - #84 y 0.14 comparten el arnés de dinero y su documentación: incorporar #84 primero y conservar en 0.14 las nuevas garantías y el transporte RPC, sin eliminar los cinco fallos pendientes de la matriz.
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
| 160 `cobro_parcial_atomico` | PR de 0.14 | **Antes de desplegar**; aplicar después de las anteriores y verificar RPC/columna. No hay respaldo a las escrituras inseguras |

- **La siguiente migración libre es la 161.**
- Una migración ya aplicada en producción no se edita nunca.
- Comprobar lo aplicado con `plataforma/supabase/verificar_migraciones.sql`.
- [ ] Corregir `CLAUDE.md`: dice que la última migración es la 141.

### Al cerrar la ola 0
- [ ] Actualizar `CHANGELOG.md` en el mismo PR que cierre la ola.
- [ ] Proponer al dueño la etiqueta anotada `v0.18.0`. No etiquetar sin su confirmación.

---

## 6. Lo que falta

### Ola 0 (5 correcciones pendientes). Siguiente: 0.15

- [x] 0.1 · [x] 0.3 · [x] 0.4 · [x] 0.5 · [x] 0.6 · [x] 0.7 · [x] 0.8 · [x] 0.9 · [x] 0.10 · [x] 0.11
- [x] **0.12 Acceso por sucursal con membresías** (M). N14, E04, T06, F20, PA-T29. Implementada y probada en su rama ([#82](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/82)); falta fusionar/desplegar.
  - [x] Dueño con membresías y `profiles.restaurant_id = null`, A → B → A, perfil legado con A y membresía B, y dueño de grupo sin restaurante personal.
  - [x] Rewrite y cabeceras: GET y POST conservan el slug de la ruta, aunque el cliente mande otro y aunque rote la cookie de sesión.
  - [x] E2E con empleado restringido, acciones/exportación directas, almacenamiento y superadmin con TOTP real.
  - [x] Sin copiar `restaurant_id` a los perfiles modernos.
  - [x] Denegación explicada en Mi cuenta; sin escritura de respaldo en otro local; destino conservado al acceder y verificar MFA. Evidencia en §8.
- [x] **0.2 Una sola fuente para plan, precio y alcance** (M). E01, N15, N23, R36.1–2, R37.2, W01. Implementada en su rama ([#83](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/83)); falta fusionar/desplegar.
  - [x] Web, comparación y paneles usan `lib/plans.ts`; el servidor comparte la lectura del acuerdo con `getRestaurantPlanPresentation`.
  - [x] Se distingue incluido, habilitado, encendido y configuración comprobada/desconocida; encendido no promete estar listo.
  - [x] Se cuenta la misma lista de prestaciones que se muestra. Las excepciones de inventario, analítica y personal se describen por separado.
  - [x] Hoy muestra las modalidades permitidas y las encendidas, no «Estándar = solo para llevar».
  - [x] Matriz con Estándar 2/3, Premium fijo, En línea con límite blando y acuerdo manual; factura histórica y acuerdo permanecen intactos. Ver §9.
- [x] **0.13 Probar el circuito del dinero en Postgres real** (L). Suite y tabla entregadas; **dinero sin certificar**. C08, E03, T01, M§8. Evidencia en §10 y [guía de ejecución](../../plataforma/docs/PRUEBAS_DINERO_POSTGRES.md).
  - Nueve casos ejecutados: D01 Q100 entre tres, D02 mixtos y D06 devolución posterior pasan; D03/D04/D05/D07/D08/D09 fallan por defectos reproducidos.
  - Cada fallo tiene su ficha a continuación; el comando documentado devuelve 1 mientras no se corrijan, sin omitir pruebas ni tratar los defectos como éxitos.
- [x] **0.14 Cobro parcial concurrente sin sobrecobro**: D03 pasa, con once garantías adicionales de atomicidad/asignación/cierre en CI. Implementada en esta rama; falta fusionar/desplegar (§11).
- [ ] **0.15 Identidad durable del intento de cobro**: D04 repite Q10 al perderse el acuse.
- [ ] **0.16 Cerrar cobrando solo el saldo por pedido**: D05 deja Q120 en el primer pedido y Q0 en la ronda Q20.
- [ ] **0.17 Centavos del reparto persistido**: D07 guarda Q99.99 por una cuenta Q100.
- [ ] **0.18 Cobros en tránsito al cerrar**: D08 confirma Q10 que no entra en ninguno de los dos periodos.
- [ ] **0.19 Instante exacto de las 05:00**: D09 omite Q2 en caja aunque SQL los incluye.

### Ola 1 · Recorridos de trabajo (después de la ola 0)
- [ ] **1.0 Exploración de paleta y sistema visual. Va primero:** maquetas de Hoy, Cobro y Carta del comensal, identidad actual frente a «hospitalidad precisa». Elige el dueño.
- [ ] 1.1 Cobro completo (depende de 0.13 y de corregir 0.14–0.19) · [ ] 1.2 Caja: borrador, cuadre y recibo · [ ] 1.3 Mesa pagada, por limpiar y libre · [ ] 1.4 Servicio estable por turno · [ ] 1.5 Cocina por etapa y estación · [ ] 1.6 Pedidos en vivo · [ ] 1.7 Permisos por trabajo (migración) · [ ] 1.8 Recepción · [ ] 1.9 Catálogo y alta de platillo · [ ] 1.10 Inventario y agotados · [ ] 1.11 Comensal: ficha, carrito, temas y accesibilidad · [ ] 1.12 Comensal: entrada, checkout y seguimiento

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

## 8. Continuación del 2026-11-05 · ficha 0.12

**Rama:** `fix/acceso-sucursal-membresias`, desde `origin/docs/plan-auditoria-integral`. **Base del PR:** `main`; fusionar #71 primero. **Sin migración:** la 160 sigue libre. No se modificaron datos ni despliegues de producción.

### Reproducción y alcance

- El dueño moderno sin restaurante en el perfil pudo abrir sus sucursales en limpio: el rebote concreto N14 de la auditoría no se reprodujo de forma determinista. No se cambia el proxy sin evidencia de que pierda las cabeceras.
- Se ejecutaron las nuevas pruebas contra los archivos de la base anterior y después contra los corregidos: **8 fallos antes, 0 después** en los 19 casos de acciones/membresías. Seis resolutores autorizaban por el rol global (categorías, productos, inventario, canales, WhatsApp y repartidores); dos casos del resolvedor volvían al restaurante del perfil al pedir un slug inexistente o sin acceso.
- Las acciones ahora usan `getStaffUser` y el permiso efectivo de la sucursal mediante `puedeEnSeccion`. Las exportaciones de productos mantienen su comprobación de pertenencia y también pasan por la sesión con MFA.
- `resolveOwnRestaurantId` devuelve `null` ante un tenant desconocido o ajeno; conserva el camino legado cuando no hay tenant en la petición.
- Login, Google, «Continuar como» y MFA conservan el destino `/panel/<slug>/<seccion>` validado; se rechazan destinos externos, barras invertidas y segmentos de escape. Las pantallas de destino vuelven a aplicar sus candados.
- Mi cuenta explica si falta acceso o no se pudo resolver el restaurante, usando el texto existente de la pantalla. Cocina/mesero priorizan el local elegido en su armazón y admiten también el grupo en sus páginas.

### Evidencia

| Comprobación | Resultado |
|---|---|
| Vitest completo | 1.365 pruebas pasan, 1 omitida previamente; 93 archivos |
| TypeScript y build optimizado | Correctos con `npm run build` |
| Lint | Sin errores; tres advertencias previas fuera de la ficha (dos directivas en intro y la dependencia `tp` del checkout) |
| E2E | 8 escenarios nuevos de acceso, más los 2 existentes de creación/anulación y aislamiento de pedidos; se ejecutan contra Supabase local |
| Datos de prueba | Cuentas, restaurantes, organizaciones y archivos propios de cada corrida; limpieza al finalizar |

Los ocho escenarios nuevos cubren: dueño moderno A → B → A; acción directa rechazada por permiso; exportación propia/ajena/restringida; lectura y escritura RLS más fotos; superadmin AAL1 → TOTP → AAL2 con regreso a su sección; rechazo explicado y «Continuar como» moderno; grupo legado; cocina/mesero con perfil legado A y membresía B.

Desde `plataforma/`, con Supabase local arrancado:

```powershell
npm test
npm run lint
npm run build
npm run start
```

En otra terminal, para reutilizar ese servidor optimizado:

```powershell
npx playwright test
```

La CI sigue ejecutando la suite con su servidor de desarrollo. Las navegaciones de lectura toleran el aborto puntual por activación inicial del service worker o compilación, comprobando siempre la URL y el dato esperados; ninguna escritura se reintenta para ocultar un rechazo.

**Siguiente ficha al cerrar 0.12:** 0.2, continuada en §9. Fusionar los PR y desplegar siguen siendo pasos separados que debe pedir el dueño.

## 9. Continuación del 2026-11-05 · ficha 0.2

**Rama:** `fix/planes-precio-y-alcance`, desde `origin/docs/plan-auditoria-integral`. PR contra `main`, encima de #71. No incorpora el código del PR #82; ambas fichas son independientes y este registro conserva el estado de las dos. **Sin migración:** la 160 sigue libre.

### Qué se reprodujo y corrigió

- Una prueba de render reprodujo el texto de Hoy que atribuía solo pedidos para llevar a Estándar. Ahora describe las tres modalidades elegibles, el máximo de dos y cuáles están encendidas en ese local.
- Una prueba de navegador con un acuerdo manual de **Q275.25** reprodujo que la cabecera de Suscripción mostraba la tarifa pública. La misma lectura alimenta ahora cabecera, desglose, Funciones, Hoy y Super, conservando los centavos y la moneda del acuerdo.
- El contador usaba los siete módulos incluidos mientras el listado mostraba otro conjunto de ocho prestaciones. El catálogo compartido incluye ahora las prestaciones base y los módulos; cada contador cuenta sus propias filas. Premium muestra 18 prestaciones incluidas en el catálogo completo, y Funciones distingue los siete módulos de esas prestaciones base.
- Incluido en plan no equivale a habilitado por excepción, encendido ni configurado. Cuando no hay una comprobación de configuración se dice «sin comprobar», nunca «listo».
- La web, las tarjetas y la tabla comparten límites y alcance. La FAQ ya no promete pedidos ilimitados en En línea; los 300 pedidos son un límite blando y no se corta ninguno. No se anuncian como contratables módulos exclusivos de Pro, que sigue pausado.
- La tarjeta del plan actual y la confirmación de cambio respetan un acuerdo manual. Elegir otro plan no se presenta como una sustitución del acuerdo cuando `auto_price = false`; eso coincide con el comportamiento existente del motor. No se cambió la acción que guarda el plan.

### Tarifas y acuerdos

La web pública y su comparación muestran **tarifas publicadas**, sin exponer acuerdos privados. Los paneles autorizados muestran **la mensualidad del restaurante**, con la tarifa pública etiquetada como referencia. No se cambian precios globales, cuotas guardadas, facturas, reglas SQL ni fechas de cobro. La definición de presentación lleva la versión `2026-11-05`; no es una migración ni una nueva revisión de contratos.

`PlanPricing` también transporta los precios vigentes de configuración asistida, evitando que su descripción pública invente que es gratuita. Un importe manual de cero conserva su significado y una factura ya emitida conserva su importe.

### Validación

- **Unitarias:** 1.351 pasan, una omitida previamente, 92 archivos. Esta rama parte de #71: la suite nueva de acceso del PR #82 se incorpora al fusionar aquel PR.
- **TypeScript y lint:** correctos; lint conserva las tres advertencias previas de intro y checkout, sin errores nuevos.
- **Build optimizado:** correcto con `npm run build`.
- **Navegador:** los seis escenarios de la suite pasan contra el servidor optimizado: los cuatro casos de `tests/e2e/planes.spec.ts` y los dos existentes de pedidos. Se comprueban web, comparación, Hoy, Suscripción, Funciones y Super con un superadmin con TOTP real, sin contraseñas introducidas en formularios.
- **Regresión de dinero:** después de recorrer las pantallas se comprueba que `monthly_fee` y `auto_price` no cambiaron y que la factura histórica de Q88.88 mantiene importe, pagado y periodo.
- **Pantalla:** 390, 768 y 1280 px en claro/oscuro; se corrigió el ajuste de línea del bloque de precio para que la descripción completa no desborde en móvil. Capturas de fixtures `AUD`, sin datos de producción.
- Las pruebas crean y eliminan sus restaurantes, usuarios y facturas; no modifican los precios globales ni los restaurantes existentes. Después de la corrida se comprobó en Postgres que quedaron cero restaurantes y cero usuarios con el prefijo temporal `aud-plan-`.

Comandos desde `plataforma/`:

```powershell
npm test
npm run lint
npm run typecheck
npm run build
npm run start
```

En otra terminal: `npx playwright test`. La configuración reutiliza el servidor optimizado local; la CI levanta su propio servidor de desarrollo.

**Siguiente ficha al cerrar 0.2:** 0.13, continuada en §10. Antes de fusionar, #71 debe entrar primero y el CI de cada PR debe estar en verde. No se fusionó ni se desplegó durante 0.2.

## 10. Continuación del 2026-11-05 · ficha 0.13

**Rama:** `fix/pruebas-dinero-postgres`, desde `origin/docs/plan-auditoria-integral` (`2348339`); PR contra `main`, encima de #71. Conserva en este registro el estado de #82/#83, sin incorporar su código. **Sin migración ni modificación de acciones monetarias.** No se modificó producción.

La prueba encontró seis defectos, no seis fallos del arnés. La suite entrega las nueve aserciones de aceptación sin `skip`, `test.fails` ni cambios a los importes esperados para hacerlas pasar. Se corrigió una comprobación del arnés: SQL no promete el orden de movimientos con el mismo timestamp de un INSERT por lote; D02 compara sus importes/métodos como conjunto.

### Alcance y evidencia

- `npm run test:dinero -- --reporter=verbose`, desde `plataforma/`: **3 pasan, 6 fallan, 9 ejecutados**. El código de salida es **1** y seguirá siendo así hasta corregir 0.14–0.19.
- Acciones reales de cobro parcial, cierre de mesa, devolución y caja; lectura real del turno y RPC SQL de reportes. Se sustituyen únicamente sesión/firma de prueba, límites de Next y efectos externos. No se afirma haber certificado RLS, UI, permisos, FEL ni impresoras con esta suite.
- D03 retiene dos lecturas reales para hacer coincidir a ambos empleados. D04 pierde el acuse después del commit real. D08 usa un bloqueo de fila real, espera a observar el INSERT bloqueado mediante `pg_blocking_pids` y solo entonces cierra; libera y espera el cobro en `finally`.
- La guía [PRUEBAS_DINERO_POSTGRES](../../plataforma/docs/PRUEBAS_DINERO_POSTGRES.md) contiene datos iniciales, pasos, importes esperados/reales, explicación de las carreras y los nueve resultados. Las fichas 0.14–0.19 están en el plan, cada una con reproducción y aceptación propias.
- El arnés solo admite API/SQL locales y verifica que ambas conexiones ven el mismo fixture. Crea dos usuarios y un restaurante por caso; limpia por sus IDs incluso tras aserciones fallidas. Se comprobó después que no quedan restaurantes ni usuarios `aud-dinero-`.
- Unitarias de esta rama base: **1.334 pasan, una omitida previamente, 90 archivos**. Las suites de #82/#83 se incorporan al fusionar esos PR.
- TypeScript correcto. Lint completo sin errores, con las tres advertencias previas de intro y checkout. No hay cambios en `plataforma/src/`, interfaz, migraciones ni despliegue; no se requiere una maqueta para esta ficha de pruebas.

La 0.13 entrega su comando y su tabla; **la ola 0 sigue abierta** por los seis bugs. No corresponde cerrar el hito, cambiar el changelog ni proponer la etiqueta de cierre todavía. La siguiente migración libre sigue siendo la 160.

**Siguiente ficha al cerrar 0.13:** 0.14, continuada en §11. Antes de la ola 1 deben pasar las nueve invariantes. Fusionar/desplegar siguen siendo pasos separados que debe pedir el dueño, con #71 primero y el CI en verde; el CI general no sustituye esta integración de dinero.

## 11. Continuación del 2026-11-05 · ficha 0.14

**Rama:** `fix/cobro-parcial-concurrente`, desde `origin/docs/plan-auditoria-integral`. Reutiliza el arnés del PR #84 copiando sus archivos para probar esta rama de forma independiente. PR contra `main`: #71 primero, luego #84 antes de esta ficha para conservar las versiones del arnés. **Migración 160 antes del código**, después de las anteriores; huella agregada al verificador. La siguiente libre pasa a ser la **161**. Solo se aplicó SQL en Supabase local.

### Fallo y corrección

Antes del cambio se ejecutó D03 contra las acciones anteriores: dos empleados cobraron Q10 del mismo consumo, y el libro terminó en Q20. Después, los RPC `leogin_cobrar_parte_mesa` y `leogin_confirmar_cierre_mesa` comparten un bloqueo transaccional por restaurante/mesa y bloquean los pedidos en orden fijo antes de comprobar estado, líneas y saldo.

`order_payments.item_amounts` registra la asignación nueva por plato. Un cobro inferior al valor de la línea no la marca saldada; completar su cuota sí. Movimiento y reparto se confirman juntos: un fallo en el reparto revierte también el dinero. Dos empleados pueden cobrar líneas distintas sin pisarse el reparto, pero no reutilizar el saldo de una ya pagada.

El cierre confirma únicamente los pedidos leídos, con sus movimientos y sesión en la misma transacción. Si el saldo ya cambió, rechaza la propuesta sin escribir dinero ni entregar pedidos. Una ronda nueva fuera del snapshot permanece abierta. Las funciones son `security invoker`, sin permiso para `anon`/`authenticated`; la acción Next conserva la autorización de sesión/sucursal. Si falta la 160 se devuelve el error de migración, sin volver al camino anterior.

No se reconstruyen importes ni asignaciones históricos. Los cobros legados se conservan si su reparto permite verificar los platos pagados; si falta esa evidencia se pide revisar la cuenta en vez de inventarla.

### Qué sigue pendiente

- **0.15:** el reintento después de perder el acuse ya no duplica una línea saldada, pero devuelve rechazo en vez de recuperar el resultado original. Falta identidad durable del intento.
- **0.16:** el cierre con pagos previos y varias rondas puede proponer una asignación equivocada entre pedidos. Ahora se rechaza sin cerrar ni escribir más dinero; falta calcular la distribución correcta.
- **0.17:** la línea todavía prorratea Q33.33 cuando el reparto total exige Q33.34. Se rechaza esa diferencia, sin guardar Q99.99 como cuenta saldada; falta distribuir el centavo.
- **0.18 y 0.19:** siguen fallando los periodos de caja y el instante exacto de las 05:00. El bloqueo de 0.14 es de la cuenta de mesa, no del cierre de caja.

No se marca ninguna de esas cinco fichas como terminada. La ola 0 sigue abierta; no se cambia el changelog ni se crea una etiqueta de cierre.

### Validación

- **Antes:** D03 falla con Q20 persistidos por Q10 de consumo. **Después:** D03 y las once garantías adicionales pasan; el comando de 0.14 también entra al CI.
- **Matriz completa:** 20 ejecutadas, **15 pasan y 5 fallan**, correspondientes exclusivamente a 0.15–0.19. No se omitieron ni invirtieron esos defectos; el comando completo devuelve 1.
- **Unitarias:** 1.336 pasan, una omitida previamente, 90 archivos. TypeScript y build optimizado correctos. Lint completo sin errores, con las tres advertencias previas de intro y checkout. El arnés de sesión y los RPC ausentes tienen pruebas que evitan volver al camino anterior.
- **Navegador:** los tres E2E pasan contra el servidor optimizado: dos empleados con permiso `mesero`, cobro Q52 una sola vez, saldo Q18 y mesa cerrada; además creación/anulación de pedido y aislamiento de los dos locales existentes.
- **Base local:** migración 160 aplicada/reaplicada sin reconstruir dinero, huella «sí» en el verificador, privilegios de los tres RPC comprobados y auditoría de `security definer` sin hallazgos.
- No cambia el diseño de pantalla. Los datos de las pruebas pertenecen a fixtures AUD y se eliminan al finalizar, incluidas las corridas que fallaron al ajustar selectores del navegador.

**Siguiente ficha al cerrar 0.14:** 0.15, autorizada y continuada en §12. Fusionar y desplegar siguen requiriendo la instrucción del dueño, con el CI en verde y el orden de migración indicado.

## 12. Continuación del 2026-11-05 · ficha 0.15

**Rama:** `fix/identidad-intento-cobro`, desde `origin/fix/cobro-parcial-concurrente` (`311f3b3`). Se actualizó `main` antes de crear la rama y se comprobaron #71, #84 y #85: **los tres siguen abiertos**; el CI de #85 terminó en verde. #85 conserva el arnés de #84 aunque sus commits no son ancestros. Esta ficha conserva ambos cambios íntegros; su [PR #86](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/86) está abierto **contra `fix/cobro-parcial-concurrente`** para aislar la revisión. Orden de integración: #71 → #84 → #85 → esta ficha, resolviendo las versiones del arnés al fusionar. No se fusionó, desplegó ni etiquetó nada.

**Migración 161**, libre al comprobar las ramas remotas: aplicar **después de la 160 y ANTES de este código**. La 160 permanece intacta y sus bloqueos/asignaciones siguen siendo la implementación monetaria. Solo se aplicó la 161 en Postgres local, sin reset ni reconstrucción histórica; huellas 160/161 «sí». La corrección de CI añade la **162**, también antes del código y después de la 161. Ambas solo se aplicaron localmente; la siguiente migración libre pasa a ser la **163**. No se comprobó ni modificó el estado SQL de producción.

### Reproducción y corrección

- **Antes:** D04 perdió la respuesta exitosa del RPC después del commit real de Q10; el reintento devolvió «Esos platos ya están pagados. Actualiza la cuenta», sin recuperar su resultado. La prueba adaptada falló antes de cambiar acciones o aplicar la 161.
- El cliente persiste UUID y solicitud completa **antes** de enviar. Una petición en vuelo impide el doble clic; una respuesta incierta conserva el mismo intento sin caducidad. Al recargar Servicio, volver a tener conexión o reintentar se envía la solicitud original, aunque Realtime ya muestre la línea pagada. Sin almacenamiento no se envía el cobro. La clave local se separa por restaurante/empleado; se retira solo al confirmar el resultado o un rechazo transaccional definitivo.
- `cobro_intentos` guarda solicitud, actor, mesa, operación y resultado original (importe e IDs de movimientos/pedidos) en la misma transacción que el pago, reparto y cierre. Su clave única es restaurante/UUID. El bloqueo por intento precede al bloqueo de mesa de la 160; dos solicitudes simultáneas del mismo intento devuelven el mismo resultado. Reutilizar la identidad con otra solicitud, mesa, operación o empleado se rechaza sin dinero nuevo.
- El cierre busca el intento **antes** de volver a leer la mesa. Si se reutilizó para una ronda nueva, recupera únicamente el resultado anterior y no entrega ni cobra esa ronda. No recalcula un recibo a partir del saldo actual. El resultado original también se conserva tras una devolución.
- Una identidad nueva permite pagar de nuevo Q40 de una línea Q100 que ya recibió Q40; aún permite Q20 y rechaza exceder el saldo. No se deduplican pagos por igualdad de importe/método. No se cambian importes, movimientos ni asignaciones históricos.
- Tabla con RLS sin políticas permisivas de cliente; RPC `security invoker` ejecutables solo por `service_role`. El servicio solo puede insertar/leer los intentos, sin actualizarlos ni borrarlos directamente. Cada acción autoriza sesión/sucursal antes de consultar o ejecutar; si falta la 161 no hay vuelta al camino sin identidad.

### Validación

- **Postgres real:** D04 y nueve garantías nuevas de 0.15 pasan, junto con las doce de 0.14: **22 seleccionadas en CI**, comando `npm run test:dinero -- -t '0.14|0.15|D03|D04'`.
- **Matriz completa:** **29 ejecutadas, 25 pasan y 4 fallan**, código de salida 1. D05/0.16 y D07/0.17 siguen rechazando sin escribir la asignación incorrecta; D08/0.18 y D09/0.19 siguen reproduciendo los defectos de periodo/límite. No hay `skip` ni aserciones invertidas en la matriz completa.
- Se observó un desfase de 8 ms entre Windows y Postgres que podía excluir como futuro un pago recién confirmado en una lectura del arnés. Las lecturas sin fecha explícita toman ahora `clock_timestamp()` real de la misma base. D09 mantiene sus instantes explícitos y D08 su bloqueo observado; ni el código de caja ni sus resultados esperados cambian.
- **Unitarias:** 1.342 pasan, una omisión previa, 91 archivos. Se prueban la persistencia anterior al envío, recuperación de payload original, identidad nueva tras resolver, fallo de almacenamiento, autorización, migración ausente, respuesta incierta y recuperación del cierre antes de releer pedidos.
- **Navegador:** cuatro E2E pasan contra el servidor optimizado. Además de las tres regresiones existentes, se confirma un cobro Q52, se pierde la respuesta real de la acción Next, se recarga y se verifica la recuperación con el mismo UUID/recibo y movimientos intactos; el pendiente local desaparece solo después del éxito.
- TypeScript y build optimizado correctos. Lint sin errores, con las tres advertencias previas de intro/checkout. Auditoría `security definer`: cero hallazgos. No cambia el diseño de pantalla; los avisos usan los componentes existentes. La suite no certifica FEL, impresión ni efectos externos.
- Fixtures AUD limpiados al terminar, también en corridas fallidas; comprobación final de restaurantes/usuarios de dinero y cobro sin residuos. No se suben secretos, trazas, reportes ni capturas de pruebas. Archivos conservados en CRLF.

### Corrección del CI de #86 en la misma rama

El primer CI de #86 falló en `audit-rls-candados.mjs`: faltaba en la tabla nueva la política restrictiva `super_admin_segundo_factor` que exige la 137. Se reprodujo localmente con un hallazgo. Se conserva intacta la 161 ya aplicada y se agrega **162_cobro_intentos_segundo_factor.sql**, sin cambiar datos, permisos ni funciones monetarias. La política es restrictiva y no concede acceso al cliente.

Después de aplicar la 162 solo en Postgres local, el auditor de candados devuelve cero hallazgos y pasan las 22 comprobaciones de 0.14–0.15. La garantía de privilegios también comprueba ahora que exista exactamente la política restrictiva esperada, con filtro y condición de escritura de segundo factor. El verificador marca 160, 161 y 162 «sí». Tipos y lint del archivo modificado correctos. Se sube la corrección al mismo PR; el CI nuevo queda pendiente de su resultado, sin polling. Esta corrección no empieza 0.16.

**Siguiente ficha al cerrar 0.15:** 0.16, autorizada y continuada en §13. Esta entrega se detiene en 0.15. La ola 0 sigue abierta: no corresponde cerrar el changelog ni crear etiquetas. Antes de desplegar deben revisarse las dependencias de los PR y aplicar las migraciones en el orden indicado; no basta el verde del subconjunto monetario.

## 13. Continuación del 2026-11-05 · ficha 0.16

**Rama:** `fix/cierre-saldo-por-pedido`, desde `origin/fix/identidad-intento-cobro` (`dcbcdcb`, #86 incluida la corrección de CI con migración 162). `main` actualizado antes de crearla. PR propio **contra `fix/identidad-intento-cobro`** para revisar únicamente 0.16. Se conserva toda la cadena #71 → #84 → #85 → #86 → esta ficha. No se fusiona, despliega ni etiqueta; se pidió aclarar la autorización de fusiones y sigue pendiente; no se infiere del permiso para continuar las fichas.

**Migración 163_cierre_saldo_por_pedido.sql:** número libre en los árboles remotos comprobados; aplicar **después de la 162 y ANTES del código**. Solo aplicada en Postgres local, sin reset. Huellas 160–163 «sí»; migraciones 160–162 intactas. Siguiente libre: **164**. No se consultó ni modificó el SQL de producción.

### Reproducción y corrección

D05 se ejecutó antes de modificar el cierre: Q40 ya pagados en un pedido Q100 y una ronda Q20; cerrar Q80 devolvió «El pago no coincide con el saldo actual de cada pedido». La protección de 0.14 evitó escribir mal el dinero, pero la acción seguía distribuyendo sobre totales completos en vez de saldos.

El nuevo RPC `leogin_cerrar_saldo_mesa` recupera primero el intento de 0.15 y toma el bloqueo de cuenta/pedidos de 0.14. Dentro de ese bloqueo calcula para cada pedido del snapshot **total menos la suma de todos sus movimientos**: pagos, cierres, cambios de método, devoluciones y reaperturas. No consulta solo la primera página de movimientos ni modifica el pasado.

Distribuye los pagos nuevos por antigüedad de pedido (`created_at`, desempate por ID) y orden de método recibido. Un pedido ya saldado no consume dinero nuevo; el efectivo recibido aparece una sola vez por pago. Si falta un único importe, cubre el saldo restante; si los importes no coinciden con el saldo se rechaza íntegramente, sin recortarlos ni cerrar. El mismo RPC de 160–161 confirma asignación, movimientos, estado, sesión y resultado original en una transacción. Liberar sin cobrar conserva su vía explícita anterior. Una ronda que queda fuera del snapshot permanece abierta.

El RPC es `security invoker`, solo ejecutable por `service_role`; la acción mantiene autorización de sesión/sucursal y rechaza si falta la 163, sin volver al reparto anterior. No cambia la pantalla ni se requieren cambios de diseño.

### Validación

- **Postgres real:** D05 pasa con netos Q100/Q20; los Q40 originales quedan idénticos y ambos pedidos se entregan. Ocho garantías adicionales prueban corrección de método y devolución independiente por pedido, pedido ya saldado, varios métodos/efectivo, método sin importe, rechazo del importe incorrecto sin efectos, ronda fuera del snapshot, 1.200 movimientos previos sin truncamiento y privilegios del RPC.
- **Regresión en CI:** `npm run test:dinero -- -t '0.14|0.15|0.16|D03|D04|D05'`: **31 seleccionadas pasan**. Se adaptaron únicamente los puntos de transporte del cierre para seguir probando la pérdida de respuesta y el bloqueo observado con el RPC nuevo. Una corrida simultánea con el build agotó los 30 segundos en un caso previo de legado; al repetir sin el build pasaron las 31, sin ampliar tiempos ni modificar la aserción.
- **Matriz completa:** **37 ejecutadas, 34 pasan y 3 fallan**, salida 1. D07/0.17 conserva la diferencia de centavo; D08/0.18 conserva el cobro fuera de ambos periodos; D09/0.19 conserva la omisión de las 05:00 exactas. No se omiten ni se invierten esas aserciones.
- **Unitarias:** 1.343 pasan y una omisión previa, 91 archivos. Tipos, lint y build optimizado correctos; lint mantiene las tres advertencias previas. Auditores `security definer` y candados de RLS: cero hallazgos.
- **Navegador:** cinco E2E contra el servidor optimizado, incluidas las cuatro regresiones anteriores. El nuevo cobra Q40 en una primera ronda, recibe otra Q20 y cierra Q80: el libro conserva Q100/Q20 por pedido y el movimiento previo intacto.
- Datos temporales AUD limpiados; no se suben secretos, reportes ni trazas. CRLF conservado. El CI remoto se consulta una vez al abrir el PR, sin polling. FEL/impresión siguen fuera del alcance certificado por el arnés.

**Siguiente ficha al cerrar 0.16:** 0.17, autorizada y continuada en §14. Se detiene esta entrega en 0.16; la ola 0 sigue abierta, sin changelog de cierre ni etiquetas. Antes de integrar/desplegar deben verificarse CI, dependencias, autorización y orden de migraciones.

## 14. Continuación del 2026-11-05 · ficha 0.17

**Rama:** `fix/centavos-reparto-persistido`, desde `origin/fix/cierre-saldo-por-pedido` (`45ca69b`, #87), tras actualizar `main` y comprobar el árbol limpio. #86 y #87 siguen abiertos, **con sus CI terminados en verde** en la consulta inicial. PR propio contra `fix/cierre-saldo-por-pedido`; conserva la cadena #71 → #84 → #85 → #86 → #87 → esta ficha. El dueño confirmó **dejar cada PR listo y autorizar las fusiones por separado**. No se fusiona, despliega ni etiqueta, ni se hace polling del CI.

**Migraciones 164_centavos_reparto_platos.sql y 165_saldo_mesa_con_cuotas_no_verificables.sql:** números libres en los árboles remotos comprobados. Aplicar **después de la 163, en ese orden y ANTES del código**. Solo aplicadas en Postgres local, sin reset ni escrituras de datos históricos. La 165 corrige la lectura de un legado no verificable sin editar la 164 ya aplicada. Las migraciones 160–163 se conservan intactas; el verificador marca 160–165 «sí». Siguiente libre: **166**. No se consultó ni modificó producción.

### Reproducción y corrección

- **Antes:** D07 pide Q33.34 en la primera de tres líneas Q30, con Q10 de descuento y Q20 de propina. La cuota SQL redondeaba cada línea a Q33.33 y rechazaba el primer importe. Se ejecutó y falló antes de crear la migración o cambiar el cálculo.
- `leogin_cuotas_platos_pedido` calcula las cuotas por pedido en centavos enteros. Reparte el residuo por fracción descendente (resto mayor), con UUID ascendente como desempate; el orden de clic no decide a quién le toca. Pondera el subtotal por las unidades vivas y distribuye los extras propios de cada pedido, incluidos los descuentos.
- Los platos ya saldados con asignación verificable conservan exactamente su importe. El saldo se distribuye entre los que quedan; los importes parcialmente cobrados se descuentan y una línea no se marca saldada hasta completar su cuota. Si la evidencia histórica no permite repartir sin alterar cobros anteriores, se informa y no se inventa una asignación ni se reconstruye un centavo faltante.
- La 164 reemplaza únicamente el cálculo de cuotas en la función de cobro de la 160: conserva sus bloqueos, autorización externa, validación de saldo, asignaciones por plato y commit conjunto de movimiento/reparto. La envoltura durable de 0.15 y el cierre de saldo de 0.16 siguen intactos.
- `leogin_saldos_platos_mesa` usa el mismo cálculo y devuelve cuotas pendientes, líneas saldadas y total cobrado bajo el bloqueo de cuenta. La hoja de cobro suma esas cuotas en lugar de aplicar otro factor en el navegador. Los errores se muestran con los avisos existentes; no cambia el diseño de pantalla.
- Se reprodujo una regresión intermedia de lectura: con Q40 legados sin reparto, la 164 devolvía error sin el total. La prueba esperaba Q40 y falló. La **165** separa `avisoCuotas` del total: ese pedido no habilita cobro por platos sin evidencia, pero conserva el cierre completo Q60/Q20 de 0.16, con el movimiento Q40 intacto. La 164 aplicada permanece sin editar.

### Validación

- **Postgres real:** D07 confirma Q33.34 + Q33.33 + Q33.33, libro y suma de `item_amounts` Q100. El empate de líneas iguales se prueba en orden de UUID; no se cambia ningún importe esperado.
- Diez garantías nuevas cubren legado sin reparto con cierre íntegro, extras negativos, cantidades, extras diferentes por ronda, una línea histórica saldada a Q33.33, cuota parcialmente cobrada hasta el último centavo, línea gratuita, cuenta histórica marcada saldada a Q99.99 sin backfill, concurrencia por el centavo y privilegios de los RPC.
- **CI:** `npm run test:dinero -- -t '0.14|0.15|0.16|0.17|D03|D04|D05|D07'`: **42 seleccionadas pasan**. Los cinco casos fuera del filtro siguen en la matriz completa, sin omisiones ni inversión de aserciones.
- **Matriz completa:** **47 ejecutadas, 45 pasan y 2 fallan**, salida 1. D08/0.18 y D09/0.19 siguen pendientes. En la corrida con 164 D08 reprodujo dinero fuera de ambos periodos; en la última corrida con 165 falló antes, en la guarda temporal del intercalado por 3 ms entre el reloj de Postgres y el cierre de Windows. No se eliminó ni relajó esa guarda. La 0.18 debe controlar también ese reloj al certificar la carrera. D09 conserva el resultado Q3 frente a Q5 esperado en el inicio exacto del día.
- **Unitarias:** 1.346 pasan y una omisión previa, 91 archivos. Se agregan garantías de autorización, migración ausente sin fallback y respuesta SQL exacta de las cuotas. Tipos, lint y build optimizado correctos; lint conserva las tres advertencias previas. Auditores RLS y `security definer` sin hallazgos. Ejecutar tipos después del build: una corrida simultánea encontró archivos `.next/types` temporalmente retirados por Next; se repitió la comprobación aislada sin cambiar configuración ni ignorar errores.
- **Navegador:** seis E2E contra el servidor optimizado, conservando los cinco anteriores. El nuevo cobra los tres platos con los botones Q33.34/Q33.33/Q33.33 y verifica Q100 en Postgres y pedido entregado. Una corrida de la regresión de dos empleados agotó el tiempo al reabrir el saldo Q18; la traza conservaba el modo por platos en una sesión. El caso aislado pasó sin cambiar producción. El E2E selecciona ahora explícitamente Cuenta completa al reabrir, conservando las aserciones Q52/Q18 y sin ampliar tiempos.
- Fixtures AUD limpiados; sin secretos ni artefactos de prueba en el PR. Archivos en CRLF. La suite no certifica FEL/impresión ni la pertenencia de pagos a caja. La ola 0 sigue abierta.

**Siguiente ficha al cerrar 0.17:** 0.18, autorizada y continuada en §15. Esta entrega se detiene en 0.17; no se cambia el changelog de cierre ni se crean etiquetas. Para fusionar sigue haciendo falta la autorización expresa del dueño, el CI en verde y las dependencias resueltas; desplegar requiere además verificar las migraciones de producción en el orden indicado.

## 15. Continuación del 2026-11-05 · ficha 0.18

**Rama:** `fix/cobros-en-transito-caja`, desde `origin/fix/centavos-reparto-persistido` (`2b59755`, #88), tras actualizar `main` y comprobar el árbol limpio. #88 sigue abierto y su CI terminó en verde en la consulta inicial. PR propio contra `fix/centavos-reparto-persistido`; conserva #71 → #84 → #85 → #86 → #87 → #88 → esta ficha. Se mantiene la decisión del dueño: cada fusión se autoriza por separado. No se fusiona, despliega ni etiqueta, ni se hace polling del CI.

**Migraciones 166_cobros_y_cierre_caja_coordinados.sql y 167_ventana_negocio_registro_caja.sql:** libres en todos los árboles remotos comprobados; aplicar **después de 165, en ese orden y ANTES del código**. Solo aplicadas en Postgres local, sin reset. La 166 se validó primero en una transacción revertida, incluidos movimiento, cierre y borrado de su fixture. No se editaron migraciones ya aplicadas: la 167 ajusta la ventana de lectura después de la 166. Huellas 160–167 «sí»; 160–165 intactas. Siguiente libre: **168**. No se consultó ni modificó producción.

### Reproducción y corrección

- **Antes:** D08 bloqueó un pedido real, observó el cobro esperando en Postgres y cerró caja antes de liberar. Se fijó únicamente el reloj `Date` del cierre anterior al reloj SQL leído después de observar la espera, para evitar que el desfase Windows/Postgres detuviera la reproducción. Se mantuvieron las transacciones y respuestas reales. La guarda temporal pasó y la invariante falló: Q0 del corte + Q0 siguiente frente a Q10 confirmados.
- **Registro durable:** los movimientos operativos nuevos que usan el timestamp por defecto conservan `created_at` y reciben `caja_registrado_en` y `caja_corte_previo` bajo el bloqueo transaccional `caja/<restaurante>`. La marca SQL es monótona, conserva microsegundos y queda después del último corte. Una devolución/corrección usa el mismo registro. Las inserciones explícitamente fechadas (historia y síntesis legada) mantienen la vía anterior y no se convierten en dinero actual. No hay backfill de filas existentes.
- Las entregas nuevas de pedidos sin movimientos conservan la segunda fuente del libro: se registra el instante de caja en el pedido, sin inventar un pago adicional. Si la entrega confirma después del corte, su importe entra en el siguiente periodo aunque `delivered_at` original sea anterior. La vista usa la marca de caja para mostrar el instante correspondiente; el campo original permanece intacto.
- **Lectura y confirmación:** `caja_control` lleva una revisión por restaurante. Cambios en pagos, pedidos, gastos o turnos la incrementan. La lectura captura revisión, corte previo y hora SQL; el RPC de cierre adquiere el mismo bloqueo y rechaza si el libro cambió o apareció otro corte. No recalcula un recibo firmado después ni introduce pausas para ordenar la carrera. Corte y vínculo de los gastos se confirman juntos, con rollback ante fallo.
- Los triggers de registro usan `security definer` restringido, sin argumentos de usuario ni ejecución de cliente, para que también invaliden la revisión las escrituras de sesión que RLS ya permite. Los RPC son `security invoker` exclusivos del servicio. `caja_control` lleva RLS, sin políticas permisivas de cliente y con el candado restrictivo de segundo factor. La acción conserva su autorización previa y rechaza cerrar sin la 166.
- **Cortes firmados:** se reprodujo que un guardado de borrador atrasado era aceptado después del cierre. Guardar, descartar y abrir ese borrador ahora condicionan la escritura a que el turno siga OPEN/DRAFT; no reabren ni cambian el recibo cerrado. Las tres carreras se prueban comparando todas las columnas del corte guardado.
- **Ventana conservada:** una prueba detectó que el primer registro podía arrastrar dinero/gastos del día anterior. La 167 y la lectura conservan el inicio del día y el corte vigente, con el timestamp SQL exacto del corte para los registros nuevos. No se edita la 166 aplicada. Los límites del instante exacto de las 05:00 siguen pendientes en 0.19.
- Las lecturas nuevas agregan pagos/gastos e IDs de entregas en SQL, sin truncar al tope de filas de PostgREST; el detalle por pedido se pagina. Un error de lectura no se convierte en un cero que pueda firmarse.

### Validación

- **Postgres real:** D08 y trece garantías nuevas pasan (14 de esta ficha): gana el pago con espera del cierre observada; gana el cierre con cobro registrado en el siguiente; pago entre lectura/guardado; dos cajeros; devolución posterior con recibo intacto; rollback de gastos; entrega sin filas después del corte; 1.200 movimientos; escritura autenticada por RLS; privilegios/MFA; borrador atrasado al guardar/descartar/abrir; y ventana de negocio conservada. El caso de cierre primero es D08, no un test duplicado.
- **CI:** `npm run test:dinero -- -t '0.14|0.15|0.16|0.17|0.18|D03|D04|D05|D07|D08'`: **56 seleccionadas pasan**. Los otros cuatro casos siguen en la matriz completa.
- **Matriz completa:** **60 ejecutadas, 59 pasan y 1 falla**, salida 1. D09/0.19 sigue dando Q3 frente a Q5 esperado. Se mantienen sus tres timestamps y aserciones originales; no se omite ni se invierte el fallo.
- **Unitarias:** 1.350 pasan y una omisión previa, 92 archivos. Cuatro garantías nuevas cubren autorización, migración ausente sin fallback, lectura obsoleta sin recibo y transmisión del timestamp de seis decimales sin perder microsegundos. Tipos, lint y build optimizado correctos; lint conserva las tres advertencias previas. Auditores RLS y `security definer`: cero hallazgos.
- **Navegador:** siete E2E contra el servidor optimizado. Se conservan los seis anteriores; el nuevo cierra Q10, registra otros Q10, cierra el siguiente periodo Q10 y verifica el primer recibo íntegro y el enlace de ambos periodos. No cambia el diseño de pantalla.
- SQL no actualiza importes, fechas originales ni cortes históricos. La comparación de huellas previa/posterior a la DDL coincide (en esta base local había cero pagos/cortes persistentes antes de las pruebas); las garantías usan fixtures históricos con contenido y comprueban sus filas completas intactas después de nuevas operaciones. Se comprueba limpieza AUD al terminar. CRLF conservado; no se suben secretos, trazas, reportes ni capturas. FEL/impresión no quedan certificados.

### Revisión del chat y corrección del CI de #89 · 2026-11-05

El chat «Recupera el resultado del cobro» permanece archivado, con sus turnos y entregas 0.15–0.18 legibles. El último turno pidió pasar a otro chat y cerrarlo; su respuesta anunció el archivo y se interrumpió antes de entregar el prompt final. Los commits y PR #86–#89 se conservan, sin fusiones. El CI de #89 terminó después de la entrega con un fallo del E2E nuevo: Playwright llenaba el HTML antes de la hidratación y React mantenía el conteo en cero, por lo que «Cerrar el turno» seguía deshabilitado. Se reprodujo localmente con el mismo error. La prueba ahora introduce el conteo y exige su atributo derivado `data-filled=1` antes de avanzar, con reintento acotado; no fuerza clics ni cambia las aserciones Q10/Q10 o el primer recibo íntegro. El caso pasa contra el servidor de desarrollo, igual que el modo del CI. Next actualizó automáticamente el encabezado de su bloque gestionado en AGENTS.md; se conserva ese cambio.

**Siguiente ficha:** 0.19, autorizada en la continuación del 2026-11-05. La entrega se detiene en 0.18. La ola 0 sigue abierta: no se cambia el changelog de cierre ni se crean etiquetas. Para fusionar se requiere la autorización expresa del dueño, CI verde y dependencias resueltas; para desplegar, verificar antes las migraciones de producción y su orden.

## 16. Continuación del 2026-11-05 · ficha 0.19

**Revisión del chat anterior:** «Recupera el resultado del cobro» está archivado, no perdido: se leyeron sus seis turnos disponibles, incluido el último interrumpido que pidió pasar a otro chat y cerrarlo. Sus entregas 0.15–0.18 coinciden con los commits locales/remotos y los PR #86–#89. No había cambios locales sin guardar al empezar. Se comprobó CI verde de #86, #87 y #88. El fallo posterior del primer CI de #89 se reprodujo y corrigió en su propia rama con `a7e80a0` (§15); su CI nuevo terminó en verde en una consulta posterior, sin polling. No se restaura ni borra el chat archivado; se conserva el cierre solicitado.

**Rama:** `fix/limite-inicio-dia-caja`, desde `origin/fix/cobros-en-transito-caja` (`a7e80a0`, #89), después de actualizar `main`. PR propio contra esa rama para aislar 0.19 y conservar #71 → #84 → #85 → #86 → #87 → #88 → #89 → esta ficha. Continúan las reglas de Claude/repositorio: reproducción previa, Postgres real, rama/PR por ficha y traspaso con el código. Cada fusión requiere autorización expresa por separado; no se fusiona, despliega ni etiqueta.

**Migración 168_limites_periodo_caja.sql:** número libre en los árboles remotos comprobados. Aplicar **después de 167 y ANTES de este código**. Solo aplicada en Postgres local, sin reset ni DML histórico. Las migraciones anteriores quedan intactas. Verificador 160–168 «sí»; siguiente número previsto: **169**, que debe verificarse al empezar la siguiente migración. No se consultó ni modificó producción.

### Reproducción y corrección

- **Antes:** se ejecutó D09 sobre el código de #89 y la base 160–167: Q1 a 04:59:59.999, Q2 a 05:00:00.000 y Q3 a 05:00:00.001. El reporte devuelve Q5 y caja Q3; falla la aserción original. No se cambian sus instantes ni expectativas.
- **Límite según su origen:** el inicio del día de negocio es inclusivo; el último corte firmado es exclusivo porque ya incluyó su instante final. Si coinciden exactamente a las 05:00, prevalece el corte exclusivo. La hora y la zona siguen siendo las configuradas por el local, y un turno abierto conserva el día en que abrió.
- **Precisión:** el timestamp original del corte se envía completo a Postgres, sin convertirlo de nuevo a ISO a través de `Date`, tanto para el legado como para el registro gestionado. Se prueban movimientos a un microsegundo antes, en y después del corte, la unión de ambos periodos y la conservación íntegra del recibo.
- **Todas las fuentes:** pagos, entregas sin movimientos, gastos y propinas comparten los límites. La selección de entregados también decide si una mesa cerró en el periodo y puede reabrirse; evita otra comparación textual de timestamps. El camino de compatibilidad sin la 166 conserva la misma inclusión y el límite superior de gastos, sin habilitar cierres desprotegidos.
- **Despliegue:** el RPC nuevo `leogin_leer_periodo_caja_limites` es `security invoker` y exclusivo de `service_role`. Se conserva intacto el lector anterior para el código previo durante el despliegue por etapas. Si falta la 168, el cierre devuelve error de migración antes de guardar dinero o un recibo; no vuelve al lector incorrecto.
- No se reconstruyen cortes ni se cambian importes o fechas de los movimientos existentes. La 168 solo crea función y permisos. Se conserva la revisión y coordinación transaccional de 0.18 y las garantías monetarias de 0.14–0.17.

### Validación

- **Postgres real:** matriz completa **69/69, salida 0**, sin omisiones ni aserciones invertidas. D09 y nueve garantías nuevas incluyen legado/registro SQL, pagos/entregas/gastos/propinas, microsegundos, corte al inicio, corte anterior, turno nocturno, otra zona/corte a medianoche y privilegios. Los periodos adyacentes reconcilian sus importes sin pérdidas ni duplicados.
- **CI:** se reemplaza el filtro monetario por `npm run test:dinero`; ahora también bloquean D01, D02 y D06. La matriz certifica el dinero bajo el alcance de su arnés, no toda la auditoría pendiente ni FEL/impresión.
- **Unitarias:** 1.350 pasan y una omisión previa, 92 archivos; ejecución con `--maxWorkers=2`. La primera corrida simultánea con build agotó tiempos; se repitió sin ampliar límites. Tipos y build optimizado correctos; lint completo sin errores, con las tres advertencias previas. Auditores RLS y security definer: cero hallazgos.
- **Navegador:** ocho E2E pasan contra el servidor optimizado. La prueba nueva usa restaurante y empleado propios. Cierra Q5 (Q2 exactos + Q3 posteriores), cierra el siguiente Q0 y compara todas las columnas del primer corte. La primera versión del fixture reutilizaba al empleado de otro restaurante y perdió el conteo al navegar; el fixture aislado y su navegación por pasos pasan sin ampliar tiempos ni alterar la aserción monetaria. Se conserva la regresión Q10/Q10 de 0.18.
- CRLF conservado; secretos, trazas y reportes de prueba quedan fuera del commit. La limpieza AUD se comprueba al terminar.

**Siguiente paso:** integrar las fichas de la ola 0 en su orden de dependencias, con autorización por cada fusión, CI verde y comprobación/orden de migraciones de producción. La ola 0 sigue pendiente de integración y despliegue: no se cierra el plan ni el changelog, ni se propone una etiqueta como si ya estuviera publicada. La próxima ficha funcional es 1.0; cualquier cambio visual requiere su maqueta y aprobación según el plan. Esta entrega se detiene en 0.19.

## 17. Continuación del 2026-11-05 · ficha 1.0 en revisión

**Rama:** `feat/exploracion-sistema-visual`, sobre `origin/fix/limite-inicio-dia-caja` (`f08bda8`, PR #90), después de actualizar `main`. El PR de maquetas queda en borrador y su base aísla los documentos de esta ficha. #90 sigue abierto y su CI terminó en verde. Cada fusión conserva la autorización por separado.

**Maquetas:** [comparador interactivo](../diseno/MAQUETAS_SISTEMA_VISUAL_2026-11-05.html) de Hoy, Cobro y Carta. Identidad actual depurada usa coral y neutros del panel. Hospitalidad precisa usa marfil, terracota, títulos editoriales y un oscuro de carbón verdoso propuesto para revisión. Ambas comparten datos ficticios, jerarquía y estados. El [inventario y contrato candidato](../diseno/SISTEMA_VISUAL_2026-11-05.md) recogen componentes y alcance de las fichas posteriores. Este PR contiene la exploración y sus notas, sin migraciones ni cambios de aplicación.

**Validación:** Chromium revisó 88 combinaciones de pantalla, tema, ancho y estado, y dos recorridos interactivos. Los tres anchos son 390, 768 y 1280 px. También se comprobó el reflujo a 195 px de ancho efectivo, equivalente a 390 px al 200 %, y se inspeccionaron las capturas de Hoy y Cobro y la comparación móvil. Se verificaron el pie visible, el bloqueo de efectivo insuficiente y de cálculo de partes, la cantidad y el total de Carta, el cierre con Escape y la devolución de foco. Cero errores de JavaScript, solicitudes externas o desbordes horizontales en las vistas revisadas. Contraste del texto blanco del botón principal de 4,56:1 y 4,71:1, respectivamente. Esta verificación corresponde al prototipo.

**Chat:** «Continuar implementación de auditoría» sigue sin proyecto asociado. Codex devolvió éxito al moverlo a **Leogin** en dos intentos, pero la consulta posterior aún indica proyecto nulo y lo coloca en Tareas. La asociación y la aparición del icono siguen pendientes. La rama y el PR se verifican en Git y GitHub.

**Decisión pendiente:** elegir Identidad actual depurada u Hospitalidad precisa, como indica el plan en §1 y §3. Después se aterrizan los tokens y componentes en la rama de 1.0. La ficha permanece abierta y el plan conserva las dependencias de integración de la ola 0.

## 18. Implementación de la base visual · ficha 1.0

**Rama:** `feat/exploracion-sistema-visual`, [PR #91](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/91), con base en #90. Se actualizó `main` y se retomó la misma rama de la maqueta. Al pedir la implementación, se tomó Identidad actual depurada como valor predeterminado, con los tokens de marca vigentes y la alternativa editorial en la comparación. La fusión se autoriza por separado.

- **Antes:** la prueba con una cuenta real de Q70 en un ancho de 390 px encontró el importe sin el rótulo «Por cobrar». La hoja de Carta colocaba su acción al final del contenido desplazable. En Cobro los métodos y los platos marcados se distinguían principalmente por sus estilos.
- **Hoja compartida:** Cobro y Carta usan `HojaOperativa`, con cabecera y pie visibles, cuerpo desplazable y superficie sólida que lee el tema. El diálogo nativo deja inerte el fondo. Tab y Shift+Tab recorren la hoja, Escape cierra y el foco vuelve al disparador. El atajo global de Servicio no abre la paleta por detrás de la hoja.
- **Cobro:** el saldo tiene un rótulo explícito. La acción de 56 px, los métodos y la selección por platos usan los estados accesibles del control. El selector admite flechas. «Calcular partes» explica el importe de referencia y mantiene la acción de cobrar el saldo completo. Los importes y los intentos pasan por las acciones y reglas de la ola 0.
- **Carta:** cantidad y total se leen junto a la acción, mientras el platillo y sus opciones se desplazan. La ficha conserva los textos y precios configurados, la marca, la selección de opciones, el carrito y el historial. En **Hoy**, el botón compartido da 48 px a las acciones y el resumen adapta su cifra al ancho de la celda. Se mantienen los permisos y fuentes de datos de las tres pantallas.
- **Validación:** build y tipos correctos, 1.350 unitarias aprobadas y una omisión previa. Lint sin errores y con las tres advertencias previas. Pasaron 10 E2E contra el servidor optimizado y la matriz de 69 casos de dinero en Supabase local. El commit `6fe3f74` desempata por ID al leer movimientos de la prueba con el mismo `created_at`. Las comparaciones siguen exigiendo igualdad de las filas completas.
- **Revisión visual:** Hoy, Cobro y Carta en 390, 768 y 1280 px, claro y oscuro, con datos ficticios. Se ajustó el ancho del método Transferencia y se quitó la interferencia del mínimo móvil de 40 px en los dos tamaños táctiles. El E2E verifica los 56 px del cobro, la acción visible, el ciclo de foco y el regreso al disparador. Las capturas locales no forman parte del commit.

La siguiente ficha es **1.1 · Cobro completo**, con rama y PR propios. La lectura de fallos de datos depende de 0.3 y el recorrido completo de Carta se valida con 1.11. Las pruebas con personas y lectores de pantalla en recorridos reales siguen en el plan. Esta ficha no requiere una migración SQL.

## 19. Cobro completo de mesa · ficha 1.1

**Rama:** `feat/cobro-completo`, con base en #91 (`54863d5`) para aislar la revisión. Se actualizó `main` antes de crear la rama. Los PR se integran en orden y cada fusión requiere su autorización.

- **Antes:** Playwright abrió la cuenta móvil de Q200, pero falló al buscar «Importe libre». Las partes iguales solo eran una referencia. El cobro de mesa usaba un solo método desde esta hoja y el efectivo recibido se elegía de una lista.
- **Cobro:** la comanda muestra consumo, pagado y pendiente. La hoja de 1.0 agrega importe libre, partes persistentes y pago mixto con efectivo, tarjeta o transferencia. El campo de efectivo recibido calcula el vuelto sobre la parte aplicada en efectivo. La hoja muestra recibos de los abonos y movimientos del libro. Se retiraron las sugerencias comerciales del cobro.
- **Partes:** Q100 se reparte en Q33.34 + Q33.33 + Q33.33. Un pago puede cubrir varias partes. Al entrar otra ronda o cambiar el saldo fuera del reparto, el nuevo reparto conserva los recibos y divide el importe restante. Los abonos y partes que agotan el saldo dejan la cuenta pagada y abierta hasta el cierre explícito. La acción de cobrar y cerrar el saldo completo sigue disponible dentro de la hoja. Los nuevos modos corresponden a las cuentas de mesa; los estados del salón se tratan en 1.3 y las correcciones y devoluciones de Caja en 1.2.
- **Base:** aplicar `169_abonos_y_partes_de_mesa.sql` después de la 168 y antes del código. El intento durable, los movimientos, el reparto y su confirmación comparten transacción. Los cobros anteriores conservan sus filas. Si un cobro legado impide verificar las cuotas, se puede cerrar por saldo completo. La 169 se aplicó al Supabase local.
- **Pruebas:** la matriz de Postgres pasa 74 casos. Incluye un abono mixto con respuesta perdida, dos cajeros sobre la misma parte, redivisión tras una ronda, cierre sin un segundo movimiento, y una cuenta de más de 120 platos con propina, descuento y devolución parcial. Los auditores de RLS y de funciones SQL devuelven cero hallazgos.
- **Pantalla:** las pruebas nuevas abren la cuenta en móvil y escritorio, comparan recibo, saldo y movimientos, y recargan el reparto antes de pagar la última parte. La revisión en 390, 768 y 1280 px, en claro y oscuro, llevó el vuelto al pie fijo junto al botón de registro. Build correcto y 1.350 pruebas unitarias aprobadas, con una omisión previa.

La siguiente ficha es **1.2 · Caja: borrador, cuadre y recibo**. La ola 1 sigue en curso.

---

*Actualiza este documento al cerrar cada ficha o al fusionar PR, o muévelo a `docs/archivo/` cuando la ola 0 esté fusionada y desplegada.*
