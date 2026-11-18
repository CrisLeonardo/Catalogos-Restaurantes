# Estado de la auditoría integral — traspaso del 2026-11-04

Documento de traspaso para retomar el trabajo en otra sesión o cuenta sin perder el contexto. Resume qué se logró, qué está en curso y qué falta, con listas para marcar.

> **Actualización del 2026-11-09:** fichas **1.8** (`feat/recepcion`, migración 178, §30), **1.9** (`feat/catalogo`, migración 179, con 0.7 incorporada, §31), **1.10** (`feat/inventario`, migración 180, §32) , **1.11** (`feat/comensal`, sin migración, §33) y **1.12** (`feat/checkout-seguimiento`, sin migración, §34) implementadas: **la Ola 1 queda terminada**. Siguiente: integrar la Ola 0 que falta en la cadena y preparar el despliegue, cuando el dueño lo decida.
>
> **Actualización del 2026-11-08:** ficha **1.7** implementada en `feat/permisos-por-trabajo` (migración 177, §29); la cadena no contenía 0.1–0.13 y se incorporó 0.12 (§28). Siguiente: **1.8 · Recepción**.
>
> **Estado vigente al 2026-11-07:** implementación de Ola 0 y fichas **1.0–1.6** disponibles en sus ramas; navegación aprobada en **PR #101**, CI correcto sobre `0f523f4` (1,353 unitarias, 90 Postgres, 19 E2E). Siguiente: **1.7 · Permisos por trabajo**. Quedan seis fichas de implementación de Ola 1. Continúa desde la rama `codex/navegacion-capsula`, sin fusionar ni desplegar hasta indicación del usuario. Lee el [traspaso para Claude Code](TRASPASO_CLAUDE_CODE_2026-11-07.md) antes de usar instrucciones históricas de este registro. Las pruebas de campo y la integración siguen pendientes.

### Nota histórica del 5 de noviembre

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
5. Para las fichas actuales, consulta la base apilada del traspaso vigente. La instrucción inicial de crear todas las ramas desde `origin/docs/plan-auditoria-integral` dejó de aplicar a esta cadena; no la uses para 1.7.

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

## 20. Recibo durable de Caja · primera entrega de 1.2

**Rama:** `feat/caja-borrador-cuadre-recibo`, sobre [PR #92](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/92) (`c15ed66`, CI verde). La rama de trabajo parte de esa base después de actualizar `main`. La ficha 1.2 continúa abierta.

- **Antes:** repetir el cierre Q70, después de registrar Q10 del siguiente turno, creó un segundo corte con Q60 de sobrante en el Postgres local.
- **Base:** aplicar `170_recibo_durable_caja.sql` después de la 169 y antes del código. El cierre de la 166, sus gastos y el nuevo recibo quedan en una transacción. El recibo incluye periodo, fondo, efectivo esperado, conteo por denominación, diferencias, métodos, gastos, propinas, devoluciones y responsables. Queda disponible para lectura autorizada por ID de corte. Los cortes anteriores se conservan en su historial.
- **Reintento:** la acción acepta una identidad asociada al operador, la solicitud y el turno leído. Repetirla recupera el recibo original aunque haya otro turno activo. Un intento que nunca se confirmó se rechaza si el turno ya cambió. La pantalla existente genera la identidad en el servidor por cada confirmación. Persistirla en el navegador y reabrir el recibo desde Caja corresponden a la siguiente entrega.
- **Interfaz:** se preparó una maqueta con datos ficticios para revisar el autoguardado, la diferencia entre «sin contar» y «conteo en cero», el origen del cuadre y la confirmación guardada. El §1 pide su aprobación antes de cambiar Caja. Quedan pendientes el borrador versionado, la recuperación desde la interfaz, el detalle completo de movimientos y el traspaso entre responsables.
- **Validación:** pasaron 77 casos de Postgres, incluidos el acuse perdido, las solicitudes simultáneas y el rechazo de un intento de otro turno. Los E2E de Caja 0.18 y 0.19 conservan los cortes consecutivos y el límite de las 05:00. Los auditores de RLS y funciones SQL devolvieron cero hallazgos. La maqueta se ejercitó a 390, 768 y 1280 px en claro y oscuro.

---

## 21. Conteo y recuperación en la pantalla de Caja · ficha 1.2

**Rama:** `feat/caja-conteo-autoguardado`, sobre [PR #93](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/93) (`c544c44`, CI verde). La interfaz se implementó después de la aprobación de la maqueta corregida y usa los componentes y tokens del panel.

- **Conteo:** 13 denominaciones, con billete de Q1 y moneda de Q0.01 diferenciados. Cada fila lleva una sola etiqueta de importe, campo centrado, botones de 44 px y subtotal. En móvil se alterna entre billetes y monedas sin perder cantidades. «Sin contar» y «conteo en cero» son estados distintos.
- **Borrador:** la copia local se guarda por restaurante, periodo y operador. El servidor conserva una versión compartida por periodo. Otro aparato recibe un conflicto si intenta sobrescribir una versión más reciente. El borrador anterior de `cash_counts` sigue disponible para las cuentas legadas.
- **Cuadre y recibo:** Caja separa contado, esperado y diferencia, enlaza a los movimientos del turno y conserva la solicitud de cierre en el aparato. Al volver a abrir Caja puede recuperar el recibo. Los cortes nuevos se consultan también desde el historial. Queda pendiente la entrega formal entre responsables.
- **Base:** aplicar la migración 171 después de la 170 y antes de desplegar el código.
- **Verificación local:** pasaron 79 casos de Postgres. Playwright verificó el cierre de los turnos consecutivos, el límite de las 05:00 y el borrador móvil de Q5.01 tras recargar. La cuenta local de auditoría de Rincón 502 permite abrir Caja, Tomar pedidos, Pedidos y Finanzas.
- **Revisión del pie de Caja (2026-11-06):** el botón compartido por los tres pasos quedó sin espacio interior a los lados cuando pasó a ancho automático. Se recuperan los 12 px de la maqueta aprobada. En Caja autenticada, Chromium comprobó ambos lados, la altura de 54 px y la ausencia de desborde a 390, 768 y 1280 px, en claro y oscuro. El arreglo visual se revisa sobre #94. El traspaso entre responsables sigue pendiente de aprobación del recorrido.

## 22. Traspaso formal entre responsables · cierre de 1.2

**Rama:** `feat/caja-traspaso-turno`, sobre [PR #95](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/95). La maqueta del recorrido de entrega y recepción se aprobó antes de implementar.

- **Antes:** el cierre conservaba al operador y el cuadre, pero faltaba un registro que identificara a la persona entrante y distinguiera la solicitud de la recepción confirmada.
- **Entrega:** quien hizo el cierre elige a otra persona con acceso a Caja en ese restaurante. Si el recibo muestra una diferencia, debe dejar una observación. El traspaso se puede consultar desde el recibo al cerrar o al volver al historial.
- **Recepción:** la persona designada recibe el pendiente en Caja y confirma con su propia sesión. Los reintentos conservan la primera confirmación. Un corte anulado deja de estar disponible para recepción y el historial conserva el registro. La apertura del siguiente turno sigue siendo una acción independiente.
- **Base:** aplicar la migración 172 después de la 171 y antes del código. Los registros de traspaso referencian el recibo sin actualizar el corte, sus importes ni sus movimientos.
- **Pruebas de Postgres:** la matriz llega a 81 casos. Los nuevos comprueban diferencias, reintentos simultáneos, permisos efectivos del receptor, aislamiento entre restaurantes y anulación.
- **Navegador:** dos sesiones independientes recorrieron el cierre en móvil, el registro de la diferencia, la confirmación desde otra cuenta y la lectura posterior del recibo. El verificador confirmó la 172 y los auditores de RLS y funciones SQL devolvieron cero hallazgos.
- **Revisión visual:** el primer refresco después de cerrar podía reiniciar el formulario de entrega. El formulario se muestra cuando Caja termina de refrescar. El recorrido volvió a pasar y la bandeja de recepción se revisó a 390, 768 y 1280 px, en claro y oscuro.

## 23. Mesa pagada, por limpiar y libre · ficha 1.3

**Rama:** `feat/salon-pagada-limpieza`, sobre [PR #96](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/96). Se implementa la segunda vista aprobada del plano con comanda.

- **C07 y M§4.4.** El pago se registra con la misma identidad durable de un abono. Pagar conserva el estado de cocina y entrega. Una mesa pasa a limpieza cuando el grupo se retira y la comanda está entregada. La confirmación de limpieza libera el turno. Las salidas con saldo pendiente y la reapertura desde limpieza requieren Finanzas y quedan en la bitácora. Los recibos leen los métodos e importes registrados.
- **R04.** Las fichas muestran número, personas, tiempo, saldo y estado. La comanda conserva solicitudes y reserva asociada. Trasladar o unir exige elegir y revisar el origen y destino. Se conservan la cuenta, los avisos y el historial. Si dos grupos tienen reservas vinculadas o un reparto abierto impide unir sin perder información, se informa el conflicto. Recepción comprueba capacidad y ocupación antes de sentar y confirma el turno con el grupo en una sola transacción. Una reserva prevista indica la hora y deja la mesa disponible mientras nadie la ocupe. La ficha 1.8 conserva el trabajo específico de Recepción.
- **Base.** Aplicar `173_ciclo_operativo_de_mesa.sql` después de la 172 y antes de desplegar el código. La migración protege contra pedidos nuevos y cierres durante la limpieza. El archivador conserva los pedidos con movimientos de caja.
- **Verificación.** La matriz local llega a 86 casos de Postgres. Los casos nuevos comprueban el pago antes de la entrega, el bloqueo durante limpieza, una salida con saldo, la reapertura, dos llegadas simultáneas, capacidad, reservas futuras y traslado con recibo y solicitudes. Ambos auditores de acceso SQL devolvieron cero hallazgos. Chromium completó el recorrido en 390, 768 y 1280 px y los 12 casos de cobro y Caja. Pasaron 1.350 pruebas unitarias y quedó la omisión previa.

## 24. Servicio estable por turno · ficha 1.4

**Rama:** `feat/servicio-turno-estable`, sobre [PR #97](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/97). Se implementa la maqueta aprobada para Tomar pedidos.

- **E07, N08 y N10.** Los puestos 1 a 9 quedan fijados por restaurante, operador y dispositivo. Un agotado conserva su número. Preparar otro turno permite aplicar cambios deliberados. La carta tiene una búsqueda y el modo servicio reduce la navegación alrededor de salón, carta y comanda.
- **O03 y R05.1–4.** El dueño publica una lista base por perfil y asigna alias internos. La búsqueda tolera tildes. La comanda muestra mesa, personas, ronda, notas, saldo enviado y platos por enviar. Los borradores se conservan por mesa. Los modificadores obligatorios se eligen antes de agregar el plato y el recargo se cuenta una vez. Si cocina rechaza una comanda, el borrador vuelve con el motivo visible. Ante un error de red con conexión aparente se reintenta una vez con el mismo identificador.
- **Base.** Aplicar `174_preferencias_de_servicio.sql` después de la 173 y antes del código. La tabla tiene RLS y solo permite acceso al servidor. Los favoritos activos de un dispositivo se conservan localmente hasta que el operador los cambie.
- **Verificación.** Chromium probó veinte ventas, un plato agotado, alias y tildes, tres borradores, una guarnición con recargo, el rechazo del servidor y la pérdida de respuesta tras registrar el pedido. El reintento conservó la identidad y la base recibió una sola comanda. Se verificaron Carta y comanda en 390, 768 y 1280 px.
- **Prueba de campo.** Queda pendiente observar a personal de servicio durante un turno real, como pide E07.

## 25. Cocina por etapa y estación · ficha 1.5

**Rama** `feat/cocina-etapas-estaciones`, sobre el [PR #98](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/98). El tablero implementa la maqueta aprobada para Cocina y Pase.

- **O02, F15 y M§4.7.** Cada estación conserva su avance por renglón. El último renglón vivo completa la comanda en la misma transacción. Los relojes distinguen aceptación, preparación y espera de salida. Pase registra el retiro de la comanda y Servicio conserva la entrega al comensal.
- **R03 y D09.** Los puestos reutilizan la configuración de impresión. El tablero conserva la posición de las comandas al actualizar, muestra la ronda cuando hay una ocupación registrada y distingue variantes, notas y alérgenos. La agrupación conserva las referencias de cada comanda. Los marcados se pueden deshacer con bitácora. Cocina confirma los avisos de anulación y puede probar el sonido, silenciarlo o leer los avisos visuales. Una copia de impresión requiere un motivo.
- **Base.** Aplicar `175_cocina_por_etapa_y_estacion.sql` después de la 174 y antes del código. La migración inicializa las comandas activas y restringe las transiciones a la acción del servidor.
- **Verificación.** Pasaron 88 casos con Postgres real y ambos auditores de acceso devolvieron cero hallazgos. Chromium conservó la posición de 30 comandas al avanzar y reabrir preparaciones, comprobó la espera en Pase y probó el audio y el ancho del tablero en 390, 768 y 1280 px.
- **Validación de campo pendiente.** Revisar legibilidad a distancia, audio e impresión con el equipo del local. El tablero muestra la cola y la demora observada por estación cuando hay suficientes muestras. El encargado debe contrastar esos tiempos con un turno real antes de estimar la capacidad operativa.

## 26. Pedidos en vivo · ficha 1.6

**Rama** `feat/pedidos-en-vivo`, sobre el [PR #99](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/99).

- **R02.** La franja de incidencias señala demoras, fallos de impresión y avisos fallidos aunque un filtro los oculte. Las tarjetas priorizan número, canal, tiempo y próxima acción. El detalle permanece abierto al actualizarse el pedido. La conexión muestra la hora de la lectura y utiliza actualización de respaldo.
- **Cobro y anulaciones.** Las tarjetas separan el estado de servicio del dinero registrado. El historial ordena preparación, entrega, cobros, anulaciones y avisos fallidos. Conserva el motivo y quién solicitó y autorizó una anulación cuando existe el registro. La confirmación explica la reposición y el paso de Caja para una devolución.
- **Concurrencia.** La migración `176_operaciones_de_pedidos_en_vivo.sql` conserva la identidad del intento y la versión de la tarjeta. El recibo se escribe en la bitácora en la misma transacción. Una repetición recupera el resultado y un intento obsoleto informa el estado vigente. Aplicar después de la 175 y antes del código.
- **Verificación.** Pasaron 90 casos de Postgres, incluidos los intentos simultáneos y una anulación parcial reintentada. Chromium comprobó una incidencia fuera del filtro y un historial abierto mientras el pedido cambiaba de estado en 390, 768 y 1280 px.

La siguiente ficha es **1.7 · Permisos por trabajo**. Quedan seis fichas de implementación de la Ola 1. La integración y el despliegue se gestionan por separado.

## 27. Navegación inferior aprobada · complemento visual

**Rama** `codex/navegacion-capsula`, sobre el [PR #100](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/100). El usuario aprobó la reconstrucción de su referencia y pidió conservar el resumen auxiliar únicamente en el comensal.

- **Comensal.** La navegación compartida usa una cápsula gris clara con selección negra e iconos y texto en horizontal. Conserva los destinos y las acciones existentes, incluidos los cuatro accesos cuando hay puntos. El resumen usa la cantidad, el nombre y el importe reales del carrito; abre la hoja y se oculta al abrirla o al consultar un platillo. Vitrina conserva su navegación superior propia.
- **Superadmin.** En móvil quedan Inicio, Locales, Cuentas y Más. La hoja Más mantiene Grupos, Métricas, Finanzas y Ajustes; conserva Escape, foco y selección al cambiar de sección. En escritorio siguen visibles los siete destinos de la barra lateral.
- **Panel del restaurante.** Se conserva la navegación operativa actual, una de las dos opciones autorizadas por el usuario, por sus destinos y accesos según el trabajo y los permisos de cada operador. No se añade una fila auxiliar.
- **Verificación.** Tipos, lint y compilación pasan. Chromium comprueba carrito con teclado, cierre, creación y anulación de pedido, aislamiento entre restaurantes y los destinos de superadmin con una sesión de segundo factor real. Las variantes de tres y cuatro destinos caben sin desbordamiento en 320, 390, 768 y 1280 px, con botones de 48 px. Las capturas usan datos locales; no se versionan.
- **Alcance de auditoría.** Este complemento no cierra 1.11 ni 1.12: quedan la revisión integral de temas, accesibilidad, entrada, checkout y seguimiento. La siguiente ficha continúa siendo **1.7**. No requiere migración ni modifica producción.
- **CI.** La primera corrida detectó un peso de letra 650 fuera de la escala del panel en el destino activo de Más. Se reprodujo con `type-scale.test.ts` y se ajustó a 600, conservando la prueba y el diseño de la cápsula.

## 28. Base de la ficha 1.7 · se incorpora 0.12 (2026-11-08)

**Rama** `feat/permisos-por-trabajo`, desde `origin/codex/navegacion-capsula` (`4d9036d`); PR contra esa rama.

- **Hallazgo al retomar con Claude Code.** La cadena apilada #85 → #101 parte de `main` y **no contiene** las fichas 0.1–0.13 (PR #72–#84), ni por historia ni como parches equivalentes; tampoco las migraciones 154–159. Era una decisión de integración posterior, pero 1.7 trabaja sobre los mismos resolutores de permisos que **0.12** (PR #82: `tenant-guard`, `membership`, destino tras acceso/MFA y seis resolutores de acciones).
- **Decisión del usuario.** 1.7 parte con 0.12 incorporada: se fusionó `origin/fix/acceso-sucursal-membresias` en esta rama. El código entró sin conflictos; sólo chocaron este registro y el plan, y se conservó la versión de la cadena, que ya documenta 0.12 en §8. Al integrar, #82 queda contenido en este PR.
- **Resto de la ola 0.** #72–#81, #83 y #84 siguen fuera de la cadena. La fusión de prueba (`git merge-tree`) contra `4d9036d` anticipa conflictos en `verificar_migraciones.sql` (154–159), Caja (`cash-close.tsx`, `finanzas.ts`), Servicio (`servicio-panel.tsx`, `order-queue.ts`, `hoja-cobro.tsx`), lista de espera y reservaciones, y en el arnés de dinero. Los números de migración no se repiten (154–159 frente a 160–176).
- **CI.** Todos los PR #72–#101 tenían el último CI en verde el 2026-11-08.

## 29. Permisos por trabajo · ficha 1.7 (2026-11-08)

**Rama** `feat/permisos-por-trabajo` (con 0.12 incorporada, §28); PR contra `codex/navegacion-capsula`. Detalle en el [plan de la ficha](../planes/PLAN_PERMISOS_POR_TRABAJO_2026-11-08.md).

- **Decisiones del dueño:** el mesero cobra; arqueo ciego como opción del local, apagado por defecto; el puesto lo decide la plantilla y no la forma de entrar; sin acceso de soporte temporal. Maqueta aprobada antes del código.
- **Migración 177, ANTES del código y después de la 176.** Convierte cada `null` del personal en lista explícita (nadie pierde acceso), separa Caja en siete capacidades, deja constancia en la bitácora y bloquea futuros `null`. Idempotente y con huella en el verificador.
- **Regla única** en app y base: `can()`/`leogin_puede` ya no leen `null` como todo; las acciones resuelven el rol efectivo de la sucursal con `actorEn`. Cupones, FEL y módulos dejaron de leer el perfil.
- **Pantallas:** Personal por trabajo con excepciones, tareas delicadas y «Así verá el panel» calculado con `buildNav`; superadmin elige papel sin valor por defecto; Caja en modo ciego; Servicio admite al puesto Caja sólo para cobrar.
- **Verificación local:** 1,426 unitarias, 101 de Postgres, auditorías con cero hallazgos y revisión en navegador en 1024/375 px, claro y oscuro. Ver el plan §6 para el detalle y §7 para lo pendiente.

La siguiente ficha es **1.8 · Recepción**. Quedan cinco fichas de implementación de la Ola 1.

## 30. Recepción · ficha 1.8 (2026-11-09)

**Rama** `feat/recepcion`, sobre `feat/permisos-por-trabajo` (PR #102). Detalle en el [plan de la ficha](../planes/PLAN_RECEPCION_2026-11-09.md).

- **Base:** se incorporó la ficha 0.9 (PR #79). Sus conflictos se resolvieron con la versión de la cadena: la 1.3 ya sienta y actualiza la recepción en una sola transacción (migración 173).
- **Decisiones del dueño:** reservas de 90 min por defecto; exceder el aforo se avisa y se permite con «Reservar de todas formas», que queda en la bitácora; maqueta aprobada.
- **Migración 178, ANTES del código y después de la 177:** «no asistió», aviso honesto y capacidad por franja bajo bloqueo.
- **Arreglos comprobados:** «hoy» es el día de negocio del local (X13, PA-T19); abrir WhatsApp ya no cuenta como aviso (R18.2, PA-T20); lo no resuelto de días anteriores pasa a «Por revisar»; la agenda muestra ocupación frente al aforo; se sugiere mesa y se estima la espera como rango.
- **Verificación local:** 1,438 unitarias, 110 de Postgres y revisión en navegador con datos de prueba que se retiraron. Ver el plan §6–7.

La siguiente ficha es **1.9 · Catálogo**. Quedan cuatro fichas de implementación de la Ola 1.

## 31. Catálogo y alta de platillo · ficha 1.9 (2026-11-09)

**Rama** `feat/catalogo`, sobre `feat/recepcion` (PR #103). Detalle en el [plan de la ficha](../planes/PLAN_CATALOGO_2026-11-09.md).

- **Base:** se incorporó la ficha 0.7 (PR #76, migración 156: receta y orden de categorías atómicos y candados entre restaurantes). Sólo chocó el verificador. En producción la 156 va con 154–159, antes de la 177.
- **Decisiones del dueño:** precio en lote sí, con vista previa y todo o nada; el platillo duplicado nace oculto; maqueta aprobada.
- **Migración 179, ANTES del código y después de la 178:** lote todo o nada con bitácora, borrar categoría exigiendo destino, candado de categoría del mismo restaurante, sellos que eran dietas pasados a dieta y `updated_at` para ordenar.
- **Pantallas:** ficha progresiva con un solo título, categoría en línea, «Crear y agregar otro», sellos separados de dietas, inglés sólo si aplica, opción predeterminada y mínimo/máximo, «Duplicar»; catálogo con lo agotado en una línea, filtros combinables, orden, estado en la dirección y cambios en lote con vista previa; borrar categoría con destino.
- **Verificación local:** 1,447 unitarias, 118 de Postgres, auditorías con cero hallazgos y revisión en navegador con datos de prueba que se retiraron. Ver el plan §6–7.

La siguiente ficha es **1.10 · Inventario y agotados**. Quedan tres fichas de implementación de la Ola 1.

## 32. Inventario y agotados · ficha 1.10 (2026-11-09)

**Rama** `feat/inventario`, sobre `feat/catalogo` (PR #105). Detalle en el [plan de la ficha](../planes/PLAN_INVENTARIO_2026-11-09.md).

- **Decisiones del dueño:** agotar «hasta mañana» por omisión (vuelve a la hora de corte); los agotados de hoy conservan sus 12 h; motivo obligatorio al restar o fijar; maqueta aprobada.
- **Migración 180, ANTES del código y después de la 179:** agotados con intención y un disparador que la mantiene coherente en cualquier escritura; agotar por ingrediente; ajustar existencias bajo bloqueo con motivo; activar el control en lote.
- **Pantallas:** Inventario con cobertura, «Por revisar hoy», filtros, activación en lote y ajuste con motivo; hoja «Agotar» en Catálogo y lote; opciones en la ficha y en Servicio; «Se acabó» en Ingredientes.
- **Promesas corregidas:** la ficha y la web pública ya no dicen que las recetas descuentan inventario.
- **Verificación local:** 1,448 unitarias, 128 de Postgres (incluida la última unidad en dos aparatos), auditorías con cero hallazgos y revisión en navegador con datos de prueba retirados.

La siguiente ficha es **1.11 · Comensal: ficha, carrito, temas y accesibilidad**. Quedan dos fichas de implementación de la Ola 1.

## 33. Comensal: ficha, carrito, temas y accesibilidad · ficha 1.11 (2026-11-09)

**Rama** `feat/comensal`, sobre `feat/inventario` (PR #106). Detalle en el [plan de la ficha](../planes/PLAN_COMENSAL_FICHA_CARRITO_2026-11-09.md).

- **Decisiones del dueño:** lo obligatorio sin predeterminada empieza vacío; se quitan las tarjetas fijas «8–12 min» y «Recién hecho»; el aviso de lealtad sigue, sólido y accesible; maqueta aprobada.
- **Sin migración:** usa la predeterminada y el mínimo de la 1.9 y `vuelve_at` de la 1.10.
- **Pantallas:**
  - ficha con opciones inequívocas, un botón que dice qué falta, semántica de radios y casillas y alérgenos «no indicados»;
  - carrito accesible y sólido con «Cambiar» por línea;
  - aviso de lealtad legible en oscuro;
  - «Agotado · vuelve mañana» en todas las tarjetas y «Otros» para lo que no tiene categoría.
- **Verificación local:** 1,455 unitarias y revisión en navegador en dos temas oscuros, con datos de prueba retirados. Falta la pasada completa de temas claros (plan §7).
- **Entorno:** durante la verificación, la falta de memoria del equipo detuvo Supabase local y rompió el reenvío de puertos de Docker. Se arrancó de nuevo sin Studio ni el buzón de correo, y los datos y las migraciones quedaron intactos.

La siguiente ficha es **1.12 · Comensal: entrada, checkout y seguimiento**. Queda una ficha de implementación de la Ola 1.

## 34. Comensal: entrada, checkout y seguimiento · ficha 1.12 (2026-11-09)

**Rama** `feat/checkout-seguimiento`, sobre `feat/comensal` (PR #107). Detalle en el [plan de la ficha](../planes/PLAN_COMENSAL_CHECKOUT_SEGUIMIENTO_2026-11-09.md).

- **Decisiones del dueño:** ningún tiempo estimado; aviso a los 10 minutos sin aceptar; una mesa que no existe no recibe pedidos; maqueta aprobada sin la fila de tiempo.
- **Sin migración.**
- **Pantallas:**
  - confirmación sin promesas;
  - seguimiento con Recibido, Aceptado, En preparación (platos listos), Listo y Entregado con hora real, y aviso con WhatsApp a los 10 minutos;
  - la carta confirma o rechaza la mesa del QR, y el servidor también la valida;
  - «Aún no se envía» sin conexión;
  - fuera los textos fijos del tema.
- **Verificación local:** 1,461 unitarias y revisión en navegador con pedidos de prueba retirados. El teclado del teléfono queda por comprobar en un aparato real (plan §7).
- **CHANGELOG:** «Sin publicar» recoge las fichas 1.7–1.12.

**La Ola 1 está terminada** (1.0–1.12), apilada en #85 → #107. Pendiente, por decisión del dueño: integrar las fichas 0.1–0.13 que no están en la cadena (salvo 0.7, 0.9 y 0.12), revisar el despliegue con sus migraciones en orden y proponer la etiqueta de versión.

## 35. Integración de las olas 0 y 1 para producción (2026-11-10)

**Rama** `release/integracion-2026-11-09`, desde `feat/checkout-seguimiento` (`2627b50`); PR contra `main`. Pedido explícito del dueño: integrar todo, fusionarlo y llevarlo a producción.

- **Qué entra:** la cadena #85 → #108 completa (0.7, 0.9, 0.12, 0.14–0.19, 1.0–1.12 y la navegación de Codex, #101) más las diez fichas de la Ola 0 que estaban fuera: 0.1 (#72), 0.2 (#83), 0.3 (#75), 0.4 (#74), 0.5 (#73), 0.6 (#77), 0.8 (#80), 0.10 (#78), 0.11 (#81) y 0.13 (#84). Una fusión por ficha, sin reescribir historia.
- **Conflictos y cómo se resolvieron:**
  - lista de espera (0.1, 0.3): se conserva la de la 1.8, que ya usa el día de negocio, enseña fecha y hora en la zona del local y lanza el error de lectura en vez de pintar vacío;
  - receta en la ficha del platillo (0.1) y «Partes iguales» en la hoja de cobro (0.1): la cadena ya no promete descontar inventario y la 1.1 cobra partes de verdad; se conserva la cadena;
  - landing (0.1): se conserva el texto de inventario de la 1.10;
  - planes (0.1 + 0.2): se suman el contacto de la 0.1 y la fuente única de precio y alcance de la 0.2;
  - cupones (0.3 + 0.5): el panel recibe a la vez el estado de lectura y la zona del local;
  - Caja (0.10): la 1.2 ya cierra en una transacción con recibo durable, revisa que el turno no haya cambiado y distingue «contado en cero» de «sin contar». Se conserva ese cierre y se portan dos detalles de la 0.10: los errores de dinero no se ocultan solos y la tarjeta de turno sin abrir avisa que el corte quedará «sin apertura». El historial «Sin apertura» y el periodo de cobros (N07) entran sin conflicto. Queda fuera el paso «ámbar» del indicador de pasos de la 0.10;
  - cola offline (0.11): se queda el tipo con motivo (`lleno`/`bloqueado`). En Servicio sigue sin enviarse una comanda que el aparato no pudo guardar, como en la 1.4, ahora con la causa; la cola del mesero se reenvía sola al abrir el panel, al volver la señal y cada 15 s (0.11). La pantalla del comensal conserva «Aún no se envía» de la 1.12 y suma el aviso de «no se guardó en este teléfono»;
  - arnés de dinero (0.13): la cadena ya lo contiene ampliado (85 escenarios frente a 9); se conserva;
  - `verificar_migraciones.sql`: se unen las huellas 154–159 con las 156 y 160–180, en orden.
- **Migraciones:** 154, 155, 157, 158 y 159 vivían en las ramas de la Ola 0; por eso la cadena saltaba de la 153 a la 156. No hay números repetidos ni huecos entre 148 y 180.
- **Ensayo de producción:** una segunda base local con solo 001–153 y la carta demo de Rincón 502 (110 pedidos, 4 cupones). El script armado 155–180 se aplicó en una sola transacción sin errores, luego la 154, y el verificador marcó «sí» de 148 a 180. Volver a correr el script se rechaza por su guarda.
- **Verificación local:** `typecheck` y `lint` sin errores (tres avisos previos); 1,548 unitarias y una omisión previa. Las pruebas de Postgres, seguridad y E2E corren en el CI del PR.
- **Despliegue:** procedimiento en la [guía de despliegue](../guias/GUIA_DESPLIEGUE.md), parte 7d.
- **Sigue pendiente** ([observaciones](OBSERVACIONES_AUDITORIA_2026-11-09.md)): pruebas con personas, en el local y con impresora; revisión independiente de dinero y permisos; ensayo de restauración del respaldo.

## 36. Hoy por etapa y primeros pasos · fichas 2.1 y 2.2 (2026-11-16)

**Rama** `feat/hoy-por-etapa`, desde `main` (`257e315`). Es la primera ficha de la Ola 2 y la primera en que la auditoría y el método «nada saturado» van juntos (decisión del dueño del 2026-11-15). Maqueta aprobada: [`MAQUETA_HOY_POR_ETAPA_2026-11-15.html`](../diseno/MAQUETA_HOY_POR_ETAPA_2026-11-15.html).

- **Reglas puras** en `plataforma/src/lib/hoy-etapa.ts`, con 12 pruebas: la etapa (nuevo, operando o cerrado), los pasos por resultado, las excepciones del servicio (por aceptar, más de una hora en cocina, listo hace más de 10 min) y el orden por urgencia. Las lecturas están en `lib/db/hoy-etapa.ts`.
- **Dinero:** «Cobrado hoy» suma los cierres del día de negocio y el periodo abierto, igual que Caja (comprobado en local: Q5,005.00 y Q467.00 por cobrar en las dos pantallas). Con arqueo ciego o sin Caja no se enseña.
- **Pedido de prueba (migración 183):** `orders.es_prueba` protegido por el candado de columnas y `leogin_terminar_pedido_prueba`, que repone, devuelve canjes y deja CANCEL. Así lo excluyen sin cambios el informe de ventas, la caja y el tope. Hoy y lo pendiente de Caja lo excluyen también mientras está vivo. No pasa por DELIVERED, así que no da puntos. **Desviación de la maqueta:** decía «y cóbralo»; no se cobra, para no meter dinero ficticio en el cuadre.
- **Recorrido probado en local** con Comedor Ana: el primer platillo creó «Platillos»; el pase quedó en la sesión de la pestaña y se borró de la URL; el pedido nació marcado y sin cliente; Hoy avisó «Un pedido espera que lo aceptes». Luego se aceptó, pasó a listo y «Terminar la prueba» lo dejó en CANCEL, con su registro en la bitácora y sin cobros. La guía desapareció sola.
- **Comprobado en pantalla:** 375 y 1280 px en claro (Rincón 502 operando y Comedor Ana nuevo), y 1280 px en oscuro (Rincón 502).
- **No comprobado en pantalla:** la versión «cerrado», que solo está cubierta por las pruebas de la regla. La 183 está aplicada en local, pero no en una base con solo 001–181.
- **Validación:** `typecheck` y `lint` sin errores (los tres avisos de siempre); 1,562 unitarias pasan, con una omitida.
- **Limpieza:** se quitaron la guía anterior (`onboarding-checklist.tsx`), el widget «La casa» y `getActiveOrdersPreview`, que ya no usaba nadie.

## 37. Alta hasta el primer valor · ficha 2.3 (2026-11-16)

**Rama** `feat/alta-primer-valor`, desde `main` (`a7a8040`). Maqueta aprobada: [`MAQUETA_ALTA_PRIMER_VALOR_2026-11-16.html`](../diseno/MAQUETA_ALTA_PRIMER_VALOR_2026-11-16.html). Sin migraciones.

- **Registro (`/registro`) en una pantalla:** sale «Confirmar». La contraseña se escribe una vez, con «Ver», y los términos se aceptan al crear la cuenta, con el aviso junto al botón; el servidor recibe la misma contraseña como repetición. En el teléfono se ocultan las ventajas para que el formulario suba.
- **Crear restaurante (`/mi-cuenta/nuevo`) en tres pasos:** tu negocio (nombre, la dirección con «Cambiar» y «¿Cómo te piden tus clientes?»), «¿Qué vendes?» (nombre y precio, «Agregar otro», «Lo hago después») y «Así se ve tu carta» (la carta de verdad, con el estilo y el plan con su precio y «Cambiar»). En PC la carta se arma en vivo junto al formulario.
- **Reglas** en `plataforma/src/lib/alta.ts`, con 7 pruebas: plan por intención (carta → Básico, para llevar y a domicilio → En línea, mesas → Premium), los dos modos de Estándar y la lectura de los platillos (coma decimal, filas a medias rechazadas y un tope de 20).
- **Servidor:** `createAnotherRestaurant` crea la categoría «Platillos» con los platillos y siempre devuelve la URL del panel; ya no hay `/registro/listo` ni la ventana «¡Listo!». La vista previa reutiliza `/preview/muestra` con `?alta=1` y los platillos por `postMessage`, sin tocar la base.
- **Recorrido probado en local** como Comedor Ana (segundo restaurante). «Para llevar y a domicilio» con dos platillos («12,50» se guardó como Q12.50) creó el plan En línea, con para llevar y a domicilio, y entró directo a Hoy con el paso 1 de la guía hecho. «Mesas» sugirió Premium y «Solo ven la carta» sugirió Básico gratis, con «Lo hago después». Cambiar el estilo repinta la carta al momento.
- **Comprobado en pantalla:** 375 px y 1280 px, en claro. **No comprobado:** el alta del primer restaurante de una cuenta nueva en pantalla (cambian la barra de pasos y los textos de cobro) ni el modo oscuro.
- **Hallazgo:** el servidor de desarrollo volvió a servir JavaScript viejo; se arregló reiniciándolo sin `.next`.

## 38. Importar una carta con revisión · ficha 2.4 (2026-11-16)

**Rama** `feat/importar-carta`, apilada sobre `feat/alta-primer-valor` (PR #126). Maqueta aprobada: [`MAQUETA_IMPORTAR_CARTA_2026-11-16.html`](../diseno/MAQUETA_IMPORTAR_CARTA_2026-11-16.html). Sin migraciones.

- **Decisiones del dueño:** lista pegada y hoja de cálculo ahora; foto y PDF después (le parecen lo más práctico, pero hoy implican IA de pago). Lo importado sale visible, porque ya pasó por la revisión. Si el platillo ya existe, se ofrece cambiarle el precio. «Pegar mi lista» también va en el alta.
- **Reglas** en `plataforma/src/lib/importar-carta.ts` (12 pruebas). Lista: el último número es el precio; una línea sin precio abre categoría si va en mayúsculas, termina en «:» o va tras una línea en blanco; si no, es un platillo con duda. Hoja: columnas «Producto» y «Precio», más «Categoría» y «Descripción» opcionales, las mismas que la exportación; acepta .xlsx (`importar-carta-xlsx.ts`, probada con un libro real) y CSV con comas o punto y coma. Dudas: sin precio, precio de Q1,000 o más, repetido. La comparación ignora tildes y mayúsculas.
- **Servidor** (`lib/actions/importar-carta.ts`): vuelve a comparar contra la base al publicar, respeta el tope de productos del plan, usa las categorías que existen y crea las que faltan («Platillos» si no hay). Anota el lote en `activity_log` (`importar_carta`). Deshacer borra lo creado que no se haya vendido, devuelve los precios que nadie volvió a cambiar y quita las categorías que quedaron vacías (`importar_carta_deshecha`). El control de acceso del catálogo pasó a `lib/catalogo/contexto.ts`, compartido con `products.ts`.
- **Pantallas:** `/admin/menu/importar` (en el teléfono, lista con pie fijo; en la PC, tabla editable en la fila). Se entra desde «Importar o exportar» en Platillos y desde el catálogo vacío («O importa tu carta completa»). Al volver sale un aviso con «Deshacer».
- **Recorrido probado en local** (Comedor Ana, PC y teléfono). Una lista de 9 líneas dio dos categorías y 5 platillos nuevos. «Pepian de pollo» encontró el «Pepián de pollo» existente y ofreció pasar de Q45.00 a Q48.00. «Caldo de res» quedó sin precio hasta escribirlo, y «Coca cola 1500» quedó en duda. Al publicar entró todo; «Deshacer» lo devolvió exacto (5 borrados, precio restaurado, categorías quitadas). En el alta, «Pegar mi lista» llenó las filas y avisa lo que no usó.
- **No comprobado en pantalla:** subir un archivo desde el navegador (la lectura de Excel y CSV sí está probada) ni el aviso del catálogo vacío.
- **Foto y PDF sin IA (misma rama, a pedido del dueño).** El PDF se lee en el servidor con pdf.js (`unpdf`, `lib/importar-carta-pdf.ts`), que rearma los renglones por altura y separa dos columnas cuando un precio va seguido de otro platillo; tiene 5 pruebas, con PDF reales. Un PDF escaneado no trae texto y se pide subirlo como foto. La foto se lee con OCR libre (`tesseract.js`, `lib/ocr-carta.ts`) en un trabajador del navegador: la imagen no sale del aparato. Los archivos del lector (unos 6 MB, en caché tras la primera vez) se copian de `node_modules` a `public/ocr/` en `postinstall` (`scripts/copiar-ocr.mjs`); esa carpeta está fuera de git, del linter y del proxy (sin la CSP de páginas, para el WebAssembly). Lo leído llega como texto a la lista, con un aviso para corregirlo, y de ahí a la revisión de siempre. «Foto o PDF» es ahora la primera pestaña, luego «Excel» y «Pegar lista».
- **Probado en el navegador:** una carta dibujada como imagen dio «Desayunos» (3) y «Bebidas» (1) con sus precios exactos. Un PDF hecho a mano, con el precio en otra columna, dio «Pepian de pollo Q45.00» e «Hilachas Q48.50». Una foto real de teléfono, con sombras o letra decorativa, no se probó: puede leer menos, y eso queda a la vista en la revisión.
## 39. Turno de práctica · ficha 2.5 (2026-11-16)

**Rama** `feat/turno-practica`, desde `main` (`a7a8040`). Los §37 y §38 (fichas 2.3 y 2.4) están en las ramas de los PR #126 y #127. Maqueta aprobada: [`MAQUETA_TURNO_PRACTICA_2026-11-16.html`](../diseno/MAQUETA_TURNO_PRACTICA_2026-11-16.html), con las cuatro recomendaciones.

- **Cómo es:** `/admin/mesero/practica` atiende una «Mesa P» con la carta real y las mismas piezas de Tomar pedidos: carta, hoja de opciones, comanda, hoja del plato y hoja de cobro. Una franja azul dice «Paso N de 6» y tiene «Salir». Los seis pasos son abrir la mesa, pedir dos platillos (uno con extra, si la carta los tiene), enviar a cocina, marcarlo listo, anular un plato y cobrar con vuelto. Al final dice cuánto tardó, con «Empezar el servicio» y «Repetir la práctica».
- **Nada cuenta:** todo vive en la memoria del aparato. No crea pedidos, cobros, movimientos de existencias ni comandas impresas, y al salir se olvida. Lo único que guarda es `activity_log` `turno_practica` con los minutos, que Personal muestra como «Ana hizo el turno de práctica en 4 minutos». Se comprobó en la base local: cero pedidos nuevos después de dos prácticas completas.
- **Desviaciones de la maqueta:** (1) pantalla propia en vez del salón en vivo. Enganchar la Mesa P al módulo de servicio (más de 2,000 líneas) obligaba a esquivar, en cada envío, cobro, anulación, impresión y lectura del salón, que nada se escribiera, y un descuido ahí cobra de verdad. Además, la mesa del servidor va de 1 a 200 y la anulación exige firma. (2) La cocina se simula dentro de la práctica, con la etiqueta «Práctica»: no aparece en Pedidos ni en Cocina. (3) «Corregir» va antes de «cobrar»: en un turno real no se anula un plato ya cobrado. (4) No usa el pedido de prueba de la 2.2: no hace falta, porque nada llega a la base.
- **Entradas:** último paso del recorrido de bienvenida («¿Practicamos una mesa?», solo si el restaurante tiene Tomar pedidos) y la búsqueda de Tomar pedidos («Turno de práctica»). Pueden practicar quienes tienen permiso de tomar pedidos o de cobrar.
- **Cambios pequeños en piezas compartidas:** la hoja de cobro admite una `nota` («Cobro de práctica: no entra dinero a la caja.») y el armazón da el título «Turno de práctica».
- **Comprobado en pantalla:** 375 px en claro y 1280 px en claro y oscuro (Rincón 502), del recorrido al final. También la entrada desde la búsqueda de Tomar pedidos y la línea en Personal.
- **No comprobado:** la práctica con una carta sin platillos con opciones (cubierta por la prueba de la regla) ni con un rol de solo cobro.
- **Validación:** `typecheck` y `lint` sin errores; 1,568 unitarias pasan, con una omitida (incluye `lib/turno-practica.test.ts` y la frase nueva de la bitácora).
## 40. Aparato por rol y Mi PC con un solo estado · ficha 2.6 (2026-11-16)

**Rama** `feat/aparato-y-mi-pc`, desde `main` (`a7a8040`). Los §37–§39 (fichas 2.3, 2.4 y 2.5) están en las ramas de los PR #126, #127 y #128. Maqueta aprobada: [`MAQUETA_APARATO_Y_MI_PC_2026-11-16.html`](../diseno/MAQUETA_APARATO_Y_MI_PC_2026-11-16.html), con las cuatro recomendaciones. Cubre A06, R34 (1, 3 y parte del 4), X17, PA-T21 y PA-T22.

- **Un solo reloj (X17, PA-T21):** `lib/estado-pc.ts` decide para todos: «Conectada» con señal de menos de 90 s; «Sin señal desde las 12:31» hasta los 10 min; «Desconectada desde las 12:31» después; «Apagada» si el dueño la apagó. Lo usan Hoy (avisa solo con «Desconectada»), Ajustes, Mi PC, la tarjeta de impresoras, el interruptor de la PC principal (`lib/main-pc.ts`) y el superadmin (`MIN_PC_CAIDA` pasa de 15 a 10 min). Antes eran 90 s, 10 min y 15 min, con palabras distintas. Se comprobó en local con una PC sin señal hace 30 min: Hoy, Ajustes y Mi PC dijeron «Desconectada desde las 5:17 p. m.».
- **La PC del local (R34.1):** arriba va el veredicto («Revisa la impresora de cocina», «Todo listo para el servicio»…). Debajo, cuatro piezas: PC, impresora de cocina, impresora de caja y respaldo sin internet. «PC conectada» ya no es «todo listo»: una impresora con papeles fallidos de las últimas 12 h cuenta como falla (`lib/db/estado-pc.ts`; un papel que se reimprimió y salió ya no cuenta). La explicación de qué es la PC principal solo sale cuando todavía no hay una.
- **Reintentar (PA-T22):** `reintentarImpresiones` devuelve a la cola solo los papeles que fallaron y nadie volvió a mandar. Salen como el original, no como COPIA, porque nunca llegaron a la cocina. Queda en la bitácora (`impresion_reintento`). Las reimpresiones deliberadas siguen saliendo como COPIA. Si hay papeles que no salieron, Hoy lo avisa con «Reintentar». Probado en local: 3 comandas fallidas volvieron a pendientes y el titular pasó a «Todo listo».
- **Este aparato (A06), migración 184:** `restaurant_devices.uso` (`cocina`, `caja`, `mesero` o vacío para el panel completo). Se elige en «⋯ › Este aparato» en el teléfono y en la barra lateral en la PC. Solo lo cambian el dueño y quien tiene el permiso de Personal (`ownerCtx`). El aparato es siempre el de la cookie del navegador, y queda además en la lista de aparatos del local. Al guardar se abre esa pantalla a pantalla completa, con «Probar sonido» e «Imprimir prueba». Cada vez que se abre la app en Hoy, el aparato lleva a su pantalla, una vez por sesión de la pestaña, y solo si la persona la tiene en su menú (`destinoDelAparato`). Si no, sale un aviso y entra a su pantalla de siempre. Personal › Dispositivos dice el uso: «Tablet de cocina · Cocina». Caja ganó pantalla completa, como Cocina y Tomar pedidos.
- **Comprobado en pantalla:** Mi PC a 375 px en claro (falla y todo listo) y a 1280 px en oscuro (desconectada). También la hoja «Este aparato» a 1280 px, el paso a Cocina a pantalla completa con su aviso y el inicio directo desde Hoy (y que la segunda visita a Hoy ya no rebota). Además, Caja a pantalla completa con desplazamiento, Personal › Dispositivos y el «⋯» del teléfono.
- **No comprobado:** con hardware real (la PC se simuló con una fila en `print_agents`), una persona sin acceso a la pantalla del aparato (lo cubre la prueba de `destinoDelAparato`), «Probar sonido» con audio y el superadmin en pantalla (lo cubre `client-health.test.ts`).
- **Validación:** `typecheck` y `lint` sin errores (los tres avisos de siempre); 1,577 unitarias pasan, con una omitida. Incluye `estado-pc.test.ts` (11), `aparato.test.ts` (3) y la bitácora nueva.
- **Fuera de esta ficha (R34):** el asistente de instalación con corte controlado de internet, el diagnóstico descargable y la reconciliación tras reconexión siguen pendientes.
## 41. Personalizar con ayuda · ficha 2.7 (2026-11-16)

**Rama** `feat/personalizacion-guiada`, desde `main` (`a7a8040`). Los §37–§40 (fichas 2.3–2.6) están en las ramas de los PR #126, #127, #128 y #130. Maqueta aprobada: [`MAQUETA_PERSONALIZACION_GUIADA_2026-11-16.html`](../diseno/MAQUETA_PERSONALIZACION_GUIADA_2026-11-16.html), con las cuatro recomendaciones. Cubre A04, X22 y R32 (1, 2, 4, 5, 6 y 8).

- **Tres recomendados (R32.1, X22, A04):** `lib/theme/recomendaciones.ts` elige el orden con lo que la carta ya tiene: con 60 % o más de platillos con foto, «Fotos grandes»; desde 25 %, «Rápida de pedir» (filas con miniatura); con menos, «Carta elegante», y «Fotos grandes» no se ofrece si vende para llevar. Con más de 60 platillos, «Rápida de pedir» va primero. Cada uno es una estructura con su paleta, y la paleta se cambia por la primera legible si hiciera falta. Las muestras usan el logo, los platillos, los precios y las fotos reales (`components/admin/personalizar/`). En Rincón 502 (13 de 38 con foto) recomienda «Rápida de pedir». El catálogo de 208 combinaciones sigue intacto en «Ver todos los diseños».
- **Legible (R32.4):** contraste WCAG de texto sobre fondo (4.5:1) y letra del botón sobre el acento (3:1). Nada poco legible se recomienda, y el catálogo marca «Poco legible». Hoy las 208 combinaciones pasan; la marca queda para las que se agreguen.
- **Vista rápida (R32.2 y R32.5):** «Así queda» ya no arranca apagada «porque consume CPU». Enseña Portada, Platillo (el de nombre más largo) y Carrito (el más caro y uno sin foto) con los colores, letras y radios del tema, y cambia al instante con cada ajuste. «Probar como cliente» abre la carta interactiva en otra pestaña, por el mismo canal de vista previa en vivo. Es una aproximación: la de verdad sigue siendo la interactiva.
- **Volver al anterior (R32.6), migración 185:** `restaurant_themes.config_anterior`. Al publicar un cambio de DISEÑO se guarda el anterior (solo lo visual). El aviso dice «Publicado: «Carta de autor · Papel de Autor». Tu logo, tus textos y tus pedidos no cambiaron» con «Volver al anterior». `volverAlDisenoAnterior` intercambia los dos diseños, así que volver también se deshace. Sin la 185, publica como siempre y no ofrece volver.
- **Plantillas propias:** solo aparecen si existen. «Guardar este diseño como plantilla» y «Volver al diseño anterior» están en el «⋯» de Recomendados.
- **Móvil (R32.8):** ya estaba resuelto, así que no se tocó: «Ver cómo queda» va a la derecha y, con la barra de guardar puesta, el botón «Tomar pedido» se aplana.
- **Comprobado en pantalla:** a 375 px en claro (tres recomendados y vista rápida) y a 1280 px en claro y oscuro (tres por fila). Se probaron aplicar «Carta elegante» con la vista rápida en vivo, publicar con su resumen, «Volver al anterior» (el diseño original quedó en la base y el logo y los textos no se tocaron), «⋯ › Guardar como plantilla» y cancelarlo, las pestañas Platillo y Carrito, y «Ver todos».
- **No comprobado:** una carta sin platillos, una casi sin fotos y una de solo para llevar (lo cubren las pruebas de la regla), y la vista interactiva en otra pestaña.
- **Validación:** `typecheck` y `lint` sin errores (los tres avisos de siempre); 1,571 unitarias pasan, con una omitida, incluidas las 9 de `recomendaciones.test.ts`.
- **Fuera de esta ficha (R32):** el modo Básico/Avanzado de la pestaña Marca (R32.3) y los textos semánticos protegidos (R32.7) siguen pendientes.
## 42. Ajustes que dicen cómo estás · ficha 2.8 (2026-11-16)

**Rama** `feat/ajustes-claros`, desde `main` (`a7a8040`). Los §37–§41 (fichas 2.3–2.7) están en las ramas de los PR #126, #127, #128, #130 y #131. Maqueta aprobada: [`MAQUETA_AJUSTES_CLAROS_2026-11-16.html`](../diseno/MAQUETA_AJUSTES_CLAROS_2026-11-16.html), con las cuatro recomendaciones. Sin migración. Cubre R24.2, R25.1, R25.2, R25.4, R26.3, R26.4, R27.2, R28.1–R28.3, R29.2, R29.3, R29.6, R37.3, PA-T02 y PA-T03.

- **Ajustes (R24.2):** cada fila lleva su estado, calculado en `lib/ajustes-estado.ts`: «Rincón 502», «A toda hora» (ámbar), «20 mesas · 7 en el plano», «Hasta 6 km», «Confirmas tú» y «7 encendidas» (antes decía «7 activas»). La fila de la PC no se tocó, porque su reloj único está en la 2.6 (#130).
- **Horarios (PA-T02, PA-T03, R26.3–4):**
  - «¿Cuándo recibes pedidos?» se responde con «Con horario» o «A toda hora». Una semana sin días sigue siendo «A toda hora»: el cliente no nota cambio, pero ya no dice «Sin horario».
  - Con horario, el día apagado dice «Cerrado», y la primera vez se parte de todos los días abiertos.
  - «Copiar el lunes a los demás días abiertos».
  - Dos turnos que se pisan no se guardan, ni en pantalla ni en el servidor (`parseHours`). Un turno de madrugada (20:00–02:00) no choca con uno de la mañana.
  - «Próximas aperturas» enseña tres días tal como los verá el cliente, y el feriado manda sobre la semana.
- **Entrega (R28.1–3):**
  - «¿A dónde repartes?»: Por zonas, Por distancia o A cualquier dirección (`elegirModoDeEntrega`). Pasar a distancia o a cualquier dirección apaga las zonas (no las borra) después de confirmar. Pasar a zonas apaga la distancia y conserva la ubicación.
  - Si hoy usa las dos, se dice. «A cualquier dirección» sale en ámbar.
  - «Prueba un punto»: un toque en el mapa responde «✓ Dentro: 0.7 km de tu local» o «Fuera». Usa la misma fórmula del servidor, y la frontera exacta cuenta como dentro.
  - Una zona nueva nace sin tarifa: no se guarda hasta escribirla, y 0 se ve como «Gratis».
- **Pedidos y cobro (R29.2, R29.3, R29.6):**
  - «Confirmar automáticamente» dice en cuántos minutos.
  - El semáforo se ve como línea de tiempo.
  - `saveOrdersAndCurrency` rechaza el ámbar después del rojo, tiempos en cero o negativos y una confirmación de más de 60 min (`problemaDeTiempos`).
  - «Pago con tarjeta» aclara que se cobra con la terminal y no en línea.
- **Perfil (R25.1, R25.2, R25.4):**
  - «Lo que ve tu cliente», y el lema dice dónde sale.
  - El interruptor de WhatsApp se llama «Botón "Enviar mi pedido por WhatsApp"» y aclara que no son avisos automáticos.
- **Funciones (R37.3):** apagar una función pide confirmación con lo que pasa y lo que se conserva, por ejemplo «Los puntos que ya tienen se guardan y vuelven al encenderla».
- **Salón (R27.2):** al bajar el número de mesas, se avisa debajo del control si una mesa con cuenta abierta queda fuera («La mesa 20 tiene una cuenta abierta (Q70.00)») y qué QR dejan de servir. Esa mesa no se puede quitar, ni en pantalla ni en el servidor.
- **De paso:** el mapa de entrega ya no falla en desarrollo con «Map container is already initialized» (doble montaje).
- **Comprobado en pantalla:** a 375 px en claro (Ajustes, Horarios con turno que se pisa y guardado bloqueado, Entrega con prueba de punto, Por zonas y envío sin tarifa, Pedidos y cobro) y a 1280 px en claro y oscuro (Funciones al apagar, Salón con la mesa 20 ocupada y guardado bloqueado, Ajustes). Para la prueba del Salón se abrió y luego se devolvió un pedido viejo en local; también se restauró la entrega de Rincón (6 km).
- **No comprobado:** guardar de verdad un horario con turnos de madrugada y la vista de Perfil en pantalla (los cambios son de texto).
- **Validación:** `typecheck` y `lint` sin errores (los tres avisos de siempre); 1,573 unitarias pasan, con una omitida, incluidas las 11 de `ajustes-estado.test.ts`.
- **Fuera de esta ficha:** búsqueda por tarea en Ajustes (R24.3), asistente de mesas y QR por zona (R27.1, R27.3–5), polígonos y franjas de reparto (R28.5), propina y moneda real (R29.4–5) y dependencias entre funciones (R37.4–5).
## 43. Ayuda por lo que necesitas · ficha 2.9 (2026-11-16)

**Rama** `feat/ayuda-por-intencion`, desde `main` (`a7a8040`). Maqueta aprobada con sus cuatro recomendaciones: [`MAQUETA_AYUDA_POR_INTENCION_2026-11-16.html`](../diseno/MAQUETA_AYUDA_POR_INTENCION_2026-11-16.html). Las secciones 37–42 (fichas 2.3–2.8) están en sus propias ramas.

- **Un solo índice de intenciones** en `plataforma/src/lib/ayuda/intenciones.ts` (15 casos con sinónimos, sin depender de acentos) que usan el Centro de ayuda y el buscador del panel (Ctrl K, grupo «Hacer»). La primera respuesta es un botón a la pantalla exacta. Si la persona no puede abrirla, se le dice a quién pedírselo, y Ctrl K solo ofrece lo que puede abrir.
- **«No me entran pedidos» se revisa en vivo** (`lib/ayuda/diagnostico.ts` y la acción `diagnosticoDePedidos`): pausa (con «Reanudar» ahí mismo), horario, pedidos y modos encendidos y PC del local, con el reloj de la ficha 2.6. Lo que falla va primero. Si quien pregunta no puede reanudar, se le dice que lo pida al dueño o al encargado.
- **Mensaje a soporte con contexto editable**: restaurante, plan, lo que buscó y versión, en WhatsApp y correo. La persona puede cambiarlo antes de enviarlo.
- **Migración 186 `ayuda_sin_respuesta`**: guarda solo la frase y el restaurante, nunca quién la escribió. RLS sin políticas permisivas, solo con el candado del segundo factor (migración 137, lo exige el CI). Se anota 1.5 s después de dejar de escribir, así que solo queda la frase final, sin las letras intermedias. Si falta la tabla, la búsqueda funciona igual. Superadmin › Configuración › Soporte la muestra agrupada y con lo más pedido primero (`lib/ayuda/sin-respuesta.ts`).
- **Comprobado en pantalla** con Rincón 502:
  - A 390 px en claro: casos comunes; diagnóstico con pausa; «Reanudar», que deja todo en verde; respuesta «se trabo la impresora»; búsqueda sin respuesta («exportar a contpaq» quedó anotada una sola vez).
  - A 390 px en oscuro: el diagnóstico.
  - A 1280 px en oscuro: respuesta, diagnóstico y Ctrl K «Hacer».
  - En PC, el botón de la respuesta ya no cruza toda la columna, sino que mide lo que dice.
  - La lista del superadmin se vio montada a mano en la página de Ayuda, solo en local. El superadmin local pide el segundo factor y no se saltó.
- **No comprobado en pantalla:** el caso «sin permiso» con una cuenta de mesero; lo cubren las pruebas del índice. Tampoco la fila de la PC dentro del diagnóstico, porque la base local no tiene agente; lo cubre su prueba.
- **Validación:** `typecheck` y `lint` sin errores; 1,575 unitarias pasan (13 nuevas de ayuda) y una omitida.
## 44. Código QR · ficha 2.10 (2026-11-17)

**Rama** `feat/codigo-qr`, desde `main` (`a7a8040`). Maqueta aprobada con sus cuatro recomendaciones: [`MAQUETA_CODIGO_QR_2026-11-17.html`](../diseno/MAQUETA_CODIGO_QR_2026-11-17.html). Las secciones 37–43 (fichas 2.3–2.9) están en sus propias ramas.

- **La vista previa es el archivo.** Se elige Redes, Imprimir o Solo el código, y `lib/documents/qr-art.ts` dibuja un canvas (`dibujarTarjeta`, `dibujarHojaCartel`, `dibujarCodigo`). La pantalla enseña ese canvas y el botón lo guarda tal cual; el PDF lleva la misma imagen a tamaño real. Salen los tres botones y la diferencia entre el logo de la vista previa y el PNG sin logo.
- **Cartel en hoja carta** (jsPDF `letter`): dos carteles de 105 × 148 mm lado a lado, con línea de corte, código de 70 mm y la indicación de imprimir en «Tamaño real». Se dibuja a 200 ppp.
- **Lo impreso no se rompe:** el QR codifica `/m/<slug>` (`stableMenuSlugUrl` en `lib/tenant.ts`), que sigue abriendo la carta por los alias de la migración 134. El enlace corto queda escrito para teclearlo.
- **Frases según lo encendido** (`lib/qr-material.ts`, con 7 pruebas): sin pedidos en línea solo «Mira nuestra carta»; con pedidos, también «Mira la carta y pide» y la de los modos que estén encendidos.
- **Avisos que dicen la verdad:** en una copia de prueba la pantalla pide no imprimir. «Copiar» que falla dice cómo copiar a mano, y «Archivo listo» solo sale cuando el archivo existe.
- **Comprobado en pantalla** con Rincón 502:
  - A 390 px en claro: Redes e Imprimir. A 390 px en oscuro: Solo el código, «Copiado» y el error de copia simulado.
  - A 1280 px: Imprimir en claro y Redes en oscuro, con la vista previa a la izquierda y las opciones a la derecha.
  - La hoja, ampliada a resolución real, se lee nítida.
  - Los tres archivos se interceptaron antes de guardarse: PDF de 84 KB que empieza con `%PDF-`, tarjeta PNG de 94 KB y código PNG de 35 KB.
  - El QR pide `localhost:3000/m/rincon502`, y esa dirección abre la carta.
- **No comprobado en pantalla:**
  - **Sin pedidos en línea:** la base local vuelve a encender pedidos según el plan; lo cubren las pruebas.
  - **Con logo:** Rincón 502 no tiene. El dibujo del logo es el de antes.
  - **Lectura física con teléfonos:** queda para el dueño.
- **Validación:** `typecheck` y `lint` sin errores; 1,569 unitarias pasan, con una omitida.

## 45. La Ola 2 en producción (2026-11-17)

A pedido del dueño, las fichas 2.3–2.10 y el CHANGELOG de v0.23.0 se juntaron en la rama `integracion/ola-2` (PR #135), como se hizo en el §35.

- **Choques resueltos:**
  - CHANGELOG, plan y registro: se conservan las entradas de todas las ramas, ordenadas, con un solo tablero.
  - `activity-labels.ts` y su prueba: se conservan las etiquetas de 2.5 y de 2.6.
  - Ajustes: `ajustes/page.tsx` conserva los imports de 2.6 y 2.8.
  - `verificar_migraciones.sql`: lleva las huellas 184–186.
- **Validación con todo junto:** tipos y lint sin errores; 1,647 unitarias pasan. Las pantallas principales abren en local y el CI del #135 pasó en verde.
- **Despliegue:** el dueño corrió 184, 185 y 186 en producción antes de fusionar. El merge `a89d7ca` se desplegó en unos 4 minutos.
- **Comprobado en producción:**
  - `/registro/listo` responde 404 y el registro es de una pantalla.
  - `distleogin.com/m/rincon502` abre la carta.
- **No comprobado:** el panel en producción, porque pide sesión.
- **Etiquetas:** `v0.24.0` y `prod-2026-11-17` sobre `a89d7ca`, con el visto bueno del dueño.
- **PR y ramas:**
  - GitHub marcó como fusionados #125, #126, #128 y #130–#134.
  - El #127 se cerró con una nota: su base era la rama de la 2.3 y ya estaba completo en `main`.
  - Las ramas se borraron.
  - Siguen abiertos el #129 (propuesta de planes) y los de dependencias.
- **Lo que sigue:** fichas 2.11 (navegación móvil por rol) y 2.12 (glosario), y la línea N.

## 46. Navegación por rol · ficha 2.11 (2026-11-17)

**Rama** `feat/navegacion-por-rol`, desde `main` (`a89d7ca`). Maqueta aprobada con sus cuatro recomendaciones: [`MAQUETA_NAVEGACION_POR_ROL_2026-11-17.html`](../diseno/MAQUETA_NAVEGACION_POR_ROL_2026-11-17.html). Sin migración.

- **Una regla** (`barraMovil` en `lib/admin-nav.ts`): si las pantallas de trabajo de la persona caben en cuatro casillas (contando el botón de tomar pedido), la barra las nombra una por una. Si no, van las cuatro secciones más usadas y «Más». Nunca hay más de cinco casillas.
- **Dueño y encargado:** Hoy · Pedidos · Tomar pedido · Menú · Más. Sin «Tomar pedido» en el plan, la casilla la ocupa Negocio.
- **Puestos:**
  - Caja: Pedidos · Mesas · Tomar pedido · Caja · Más (Hoy y Salón).
  - Recepción: Mesas · Reservas · Espera · Pedidos · Más. Quien no toma pedidos tiene Pedidos al final.
  - Cocina: Hoy · Cocina, sin «Más».
  - Mesero: sigue sin barra.
- **«Más» vive en la barra** y se marca estando en lo que trae dentro (`destinoActivo`). Abre una hoja con el buscador y una fila por sección que dice lo que trae. Así no se repite lo que se revirtió el 2026-09-07.
- **Una sección de una sola pantalla se llama como ella** (`destinoDeGrupo`): el encargado ve «Caja» y no «Negocio», también en la barra lateral.
- **Sin pestañas repetidas:** en modo «trabajo» la barra ya nombra cada pantalla, así que no se pinta la fila de pestañas. Caja y Cocina ganaron su título (caían en «Panel»).
- **PC:** el dueño conserva sus seis secciones. Los puestos ven su lista y, bajo «También», lo que en el teléfono está en «Más».
- **Barra sólida** (`--adm-card`, sin vidrio) con etiquetas de 12 px.
- **Tours:** `lib/tutorial/objetivo.ts` señala «Más» cuando la sección del paso está dentro. El tour de bienvenida ya no dice «seis lugares».
- **Comprobado en pantalla** con Rincón 502 y personal de prueba local (`caja@`, `recepcion@`, `cocina@rincon502.test`, solo en la base local):
  - Dueño a 375 px en claro: cinco casillas de 70 px, hoja «Más», buscador desde la hoja, «Más» marcado en Clientes y Escape que devuelve el foco.
  - Dueño a 320 px en oscuro, en Negocio: «Más» marcado, sin etiquetas cortadas ni desborde.
  - Dueño a 1280 px: las seis secciones, sin «Más».
  - Caja a 375 px (con «Más»: Hoy y Salón) y a 1280 px (con «También»). Recepción a 375 px en Espera. Cocina a 375 px en oscuro.
- **Arreglo posterior (rama `feat/glosario`):** Tomar pedidos y Cocina tienen su propio layout y le pasaban al armazón cuatro datos, así que allí el menú se armaba como si el plan fuera Básico: al entrar a Tomar pedidos desaparecía el botón, aparecía «Negocio» y nada quedaba marcado. Los tres layouts usan ahora `menuDelPanel` (`lib/admin/menu-del-panel.ts`). Tomar pedidos y Cocina siguen sin fila de pestañas, como se aprobaron. Comprobado a 515 px: Tomar pedidos con el botón marcado y Cocina con Pedidos marcado.
- **No comprobado:** el encargado en pantalla (lo cubren las pruebas) y una prueba con personas.
- **Validación:** `typecheck` y `lint` sin errores; 1,652 unitarias pasan, con una omitida. `admin-nav.test.ts` cubre cada puesto, que ningún destino lleve a una pantalla sin permiso y cuándo se marca «Más».

## 47. Glosario de una sola marca · ficha 2.12 (2026-11-17)

**Rama** `feat/glosario`, apilada sobre `feat/navegacion-por-rol`. Glosario aprobado con sus cuatro recomendaciones: [`GUIA_GLOSARIO.md`](../guias/GUIA_GLOSARIO.md). Sin migración.

- **«Platillo» para todo lo que se vende:** Tomar pedidos, la mesa, el cobro, Cocina, exportaciones, planes, Importar carta, Lealtad e Inicio. Se respetan «plato principal» y «Platos fuertes». La carta del comensal sigue con la palabra que eligió cada restaurante para su carrito.
- **Cómo se cambió sin tocar código:** un script con el analizador de TypeScript cambió solo literales, plantillas y texto JSX (unas 190 ediciones). Quedaron fuera las rutas (`/admin/menu/productos`), los sinónimos del buscador, las claves de datos (`formData.get('platos')`, el valor interno de la pestaña «Por platillos») y Canales, que sigue apagado.
- **Exportaciones con los estados de la pantalla:** el Excel y el respaldo usan `STATUS_LABEL` de `lib/order-status.ts`. Antes decían «Nuevo», «En preparación» y «Cancelado».
- **Contabilidad:** «Costo de lo vendido» e «Ingreso por platillos». El Excel de la carta se titula «Tu carta».
- **Sin jerga:** «pantalla de cocina» en vez de KDS; «función» en vez de «módulo» en avisos, errores, Funciones, Ayuda y planes; «pantalla completa» en vez de «modo kiosco». La pestaña del navegador sin título propio dice «Leogin».
- **Los tres modos con un solo nombre:** Comer en local, Para llevar y A domicilio, en tarjetas, alertas, filtros, comandas impresas, Hoy y exportaciones.
- **Importar carta:** la plantilla trae la columna «Platillo» y la hoja vieja con «Producto» se sigue leyendo.
- **Prueba que vigila:** `src/lib/glosario.test.ts` lee con el analizador de TypeScript los textos visibles de todo `src` (sin superadmin) y falla con la lista de cada palabra prohibida. Al estrenarse encontró 5 textos que la barrida no había cambiado.
- **Comprobado en pantalla** con Rincón 502: Tomar pedidos («Buscar platillo, mesa o acción», «Mesa 1 · 1 platillo», «Agregar platillos», «Toca un platillo y aparece aquí»), la pestaña del navegador de Cocina («Cocina») y la web pública («una foto del platillo»). La limonada de prueba se quitó antes de enviarla y no quedó nada en la base.
- **No comprobado en pantalla:** los archivos de exportación (lo cubren las pruebas y el código comparte `STATUS_LABEL`).
- **Aviso:** la PC tenía unos 150 MB de memoria libre durante la prueba y el servidor de desarrollo se trababa. Hubo que reiniciarlo varias veces.
- **Validación:** `typecheck` y `lint` sin errores; 1,658 unitarias pasan, con una omitida.

## 48. Recepción sin saturar · línea N (2026-11-17)

**Rama** `feat/recepcion-nada-saturado`, apilada sobre `feat/glosario`. [Maqueta](../diseno/MAQUETA_RECEPCION_NADA_SATURADO_2026-11-17.html) aprobada con sus cinco recomendaciones. Sin migración.

- **Antes (390 px, una noche normal):** Reservas medía 3,484 px con 48 mandos; la primera llegada empezaba a 438 px y «Nueva reserva» a 2,388 px. En Espera cada grupo ocupaba unos 400 px y arriba había dos tarjetas de resumen, una con «—». «Cancelar» cancelaba con un toque y sin preguntar.
- **Una fila de mandos** en las dos pantallas: pestañas (Hoy · Próximos · Revisar y Esperan · Atendidos · Revisar) y el botón para anotar. «Revisar» solo aparece si quedó algo de días anteriores. Las piezas compartidas viven en `components/admin/recepcion-comun.tsx`.
- **Una acción por fila:** Sentar en N, Confirmar, Terminó, Llegó o No llegó; en Espera, además, avisar por WhatsApp si tiene teléfono y aún no se le avisó. Lo demás está en la hoja que se abre al tocar la fila (`HojaOperativa`): otra mesa, mesa prevista, cambiar día u hora, llamar, no asistió y cancelar (Reservas); otra mesa, WhatsApp, llamar, avisé en persona, no llegó y quitar (Espera).
- **Anotar en una hoja:** «Nueva reserva» con Hoy y Mañana de un toque, la hora propuesta (las 19:00 o la siguiente media hora) y los lugares que quedan a esa hora antes de guardar; la nota es opcional. «Agregar grupo» con tres campos. El aviso de sobrecupo con horas sugeridas sigue igual.
- **La agenda** es una línea en el teléfono que se abre al tocarla y queda abierta a la derecha en la PC, con la duración de las reservas dentro. «Confirmada» ya no se anuncia: solo «Sin confirmar». «¿Se envió el WhatsApp?» sigue en la fila.
- **Cancelar pide confirmación**, como «No asistió». Las confirmaciones se abren después de cerrar la hoja, porque el diálogo de confirmar no puede quedar encima de una hoja nativa.
- **Comprobado en pantalla** a 390 px y 1280 px, claro y oscuro, con datos de prueba locales: las cuatro reservas de hoy caben en una pantalla (filas de 68 px, la primera a 218 px); guardar una reserva para mañana, confirmar una pendiente, abrir la confirmación de cancelar y la pregunta «¿se envió?».
- **No comprobado:** abrir WhatsApp de verdad (se probó marcando el aviso abierto en la base local) y una prueba con una persona en la puerta.
- **Validación:** `typecheck` y `lint` sin errores; 1,658 unitarias pasan, con una omitida (incluidas la escala tipográfica y el glosario).

## 49. Inventario sin saturar · línea N (2026-11-17)

**Rama** `feat/inventario-nada-saturado`, apilada sobre `feat/recepcion-nada-saturado`. [Maqueta](../diseno/MAQUETA_INVENTARIO_NADA_SATURADO_2026-11-17.html) aprobada con sus cinco recomendaciones. Sin migración.

- **Antes (390 px, 6 de 38 platillos contados):** 3,987 px y 120 mandos; tarjeta de cobertura, «Por revisar» y tres filas de mandos antes de la lista; el primer platillo a 764 px; los 32 sin contar llenaban la lista con casilla y botón; cada platillo contado medía 153 px con cinco botones, «Bien» y «mínimo N».
- **Después:** 912 px y 30 mandos. Buscador y una fila de píldoras (Contados · Sin contar · categorías, como en Platillos). «Por revisar» es el primer grupo de la lista y el platillo no se repite abajo. Filas de 64 px con cuántos quedan y «+1»; en la PC también «−», que abre la hoja en «Restar».
- **Hoja del platillo:** abre en «Sumar · Reposición»; ahí están restar, número exacto (con motivo obligatorio), el mínimo, el historial y «Dejar de contar» (confirma después de cerrar la hoja).
- **Sin contar:** la fila entera marca la casilla, «Elegir los N» con una categoría o búsqueda, y «Contar existencias…» abre una hoja con la tabla de existencias iniciales y mínimo, todos o ninguno. La cobertura «6 de 38» es una línea aquí. Si no se cuenta nada, la pantalla abre en esta vista.
- **Comprobado en pantalla** a 390 px y 1280 px, claro y oscuro, con datos locales: sumar 12 a la Gaseosa, empezar a contar dos bebidas (una en 0 pasó a «Por revisar») y la confirmación de «Dejar de contar». Los datos de prueba se deshicieron después.
- **No comprobado:** «Ya hay» de un ingrediente agotado (no había ninguno) y una prueba con una persona.
- **Validación:** `typecheck` y `lint` sin errores; 1,658 unitarias pasan, con una omitida.

## 50. Cupones, lealtad y encuestas sin saturar · línea N (2026-11-18)

**Rama** `feat/promociones-nada-saturado`, apilada sobre `feat/inventario-nada-saturado`. [Maqueta](../diseno/MAQUETA_PROMOCIONES_NADA_SATURADO_2026-11-18.html) aprobada con sus seis recomendaciones. Sin migración.

- **Cupones, antes:** 31 mandos en el teléfono; «Activos 2 · En total 4» y una fila solo para «Nuevo cupón»; cada cupón con interruptor, lápiz y basura de 32 px sin nombre; la basura borraba aunque el cupón ya se hubiera usado.
- **Cupones, después:** 19 mandos y cabe en una pantalla. Una línea («2 en uso · usados 10 veces») con «Nuevo cupón»; «En uso» arriba y «Sin usar ahora» abajo, en gris; cada fila dice beneficio, fecha y usos, con el estado escrito. La hoja del cupón resume lo que hace en una frase y lleva «Pausar» o «Reanudar»; si ya venció o se agotó, el botón grande es «Cambiar la fecha» o «Cambiar el límite de usos». «Nuevo cupón» pide código, descuento y hasta cuándo; compra mínima, límite, inicio y nota se abren aparte.
- **Un cupón usado no se elimina** (`deleteCoupon` borra solo con `uses = 0`, en el mismo DELETE, y si no, explica que se pause).
- **Lealtad, antes:** cuatro cifras en cero y el formulario de ajuste manual arriba; la lista de miembros a 711 px; reglas en una tercera pestaña con dos «Guardar».
- **Lealtad, después:** el programa en una frase («1 punto por cada Q10 · 20 de bienvenida — para Tres Leches se gastan Q2,500») con «Reglas», pestañas Miembros y Recompensas, y el primer miembro a 350 px. La hoja del cliente suma o resta con motivo obligatorio (`adjustPoints` lo exige también) y enseña los movimientos (`movimientosDePuntos`). Reglas guarda tasas, premios en la carta, doble del primer pedido y sorpresa con un solo botón. Cada premio dice cuánto hay que gastar para ganarlo. El mínimo para canjear ya no se muestra: el comensal no lo usa desde que se quitó el pago con puntos; se conserva su valor al guardar.
- **Dentro de una hoja no se usa el Select de Base UI:** su lista se abre fuera del `<dialog>` y queda tapada. El cliente y el platillo se eligen con un buscador de hasta seis resultados.
- **Encuestas, después:** el promedio, «18 respuestas · ninguna este mes» y la distribución en una tarjeta (a la izquierda en la PC); las reseñas en una lista sólida a 379 px, veinte por vez; «Con comentario» y «3 o menos» solo si hay alguna; «¿Quién ve el nombre?» plegado. Estrellas con `--c-warn` en vez de `#fbbf24`.
- **Comprobado en pantalla** a 390 px y 1280 px, claro y oscuro: crear, pausar y eliminar un cupón de prueba; sumar 50 puntos con motivo y ver los movimientos; Reglas; elegir un platillo para un premio. Los datos de prueba (cupón, cuentas, movimientos, premios y bitácora) se borraron después.
- **No comprobado:** el programa sin activar y Encuestas sin respuestas, en pantalla; una prueba con una persona.
- **Validación:** `typecheck` y `lint` sin errores; 1,658 unitarias pasan, con una omitida.

## 51. Finanzas y Analítica sin saturar · línea N (2026-11-18)

**Rama** `feat/analitica-nada-saturado`, apilada sobre `feat/promociones-nada-saturado`. [Maqueta](../diseno/MAQUETA_ANALITICA_FINANZAS_NADA_SATURADO_2026-11-18.html) aprobada con sus seis recomendaciones. Sin migración. La ficha 3.2 sigue abierta: aquí entra solo lo que se resuelve sin tocar la base de datos.

- **Finanzas, antes:**
  - Ocho mandos antes del primer número: dos fechas, «Aplicar», tres atajos, Excel y PDF. La cifra quedaba a 330 px.
  - Seis cifras, dos en Q0.00 porque no había costos, y una nota que lo explicaba.
  - **La gráfica «Ingreso por día» no se veía**: las barras quedaban aplastadas en 2 px, en el teléfono y en la PC.
  - Con la lectura caída, la pantalla mostraba Q0.00.
  - El porcentaje por zona se calculaba sobre todo lo vendido.
  - 2,190 px de alto.
- **Finanzas, después** (1,366 px de alto, la cifra a 196 px):
  - Una línea de periodo (7 · 30 · 90 días · Otro…) con «Descargar».
  - «Vendiste del 20 oct al 18 nov» con la cifra, los pedidos, el ticket y la gráfica. La gráfica se lee al tocar una barra (`ChartReadout`).
  - «¿Cuánto ganaste?» lleva a poner costos. Con costos a medias dice «Estimación parcial» y qué parte de lo vendido cuenta. Con todos: ganancia y margen, «antes de sueldos y gastos».
  - Envíos y propinas van en una línea.
  - «De dónde vino» junta canal, pago y zona en una tarjeta con pestañas; cada fila dice dinero, pedidos y porcentaje. Zona se mide contra lo vendido a domicilio, con una fila «Sin zona anotada» para el resto.
  - «Lo que más vendiste» enseña cinco y el resto si se pide. «Por ganancia» solo existe si hay costos.
  - En la PC, lo vendido va a la izquierda y la ganancia y el reparto a la derecha. En el DOM hay un solo orden, el del teléfono.
- **Analítica, antes:**
  - El mismo selector.
  - El mapa de 24 horas había que deslizarlo de lado en el teléfono.
  - Dos listas de diez, con ceros en rojo.
  - Canal, pago y zona repetidos, contados en pedidos.
  - 2,366 px de alto.
- **Analítica, después** (1,038 px de alto):
  - Tres cifras en una franja: pedidos, cancelados y minutos en preparar. Los cancelados van en ámbar desde el 10 %.
  - El mapa se titula con la respuesta («Se llena el sábado a las 7 a. m.») y se recorta a las horas con pedidos, con la semana empezando el lunes.
  - El tiempo de un domicilio va en una línea.
  - «Tus platillos» tiene «Más pedidos» y «Sin pedidos». La segunda lista son solo los disponibles que nadie pidió, y cada uno abre su ficha en Menú.
  - Canal, pago y zona se quedan en Finanzas.
- **Lecturas:**
  - `getSalesReport` devuelve `estado: 'error'` cuando el RPC falla (X20/PA-T16), y Finanzas pone el aviso de lectura.
  - `getAnalytics` suma los platillos por `product_id` y usa el nombre de hoy, así que renombrar ya no parte el ranking (X19/PA-T14). Los vendidos sin id conservan el nombre del pedido.
  - Nueva `sinPedidos`: los platillos disponibles con cero pedidos.
  - El reporte en SQL (`leogin_sales_report`) sigue agrupando por nombre: es de la ficha 3.2.
- **Atajos del periodo:** cuentan desde el día de negocio que calcula el servidor, no desde el reloj del aparato. Una fecha futura en la URL se corta a hoy.
- **Comprobado en pantalla** a 390 px y 1280 px, claro y oscuro:
  - Finanzas: 30 días; la pestaña Zona; «Otro…» del 1 al 15 nov; 7 días; la hoja «Descargar» (sin descargar); un rango sin ventas.
  - Analítica: 30 días, «Sin pedidos» y sus enlaces, y un rango sin pedidos.
  - Resumen sigue igual.
- **No comprobado en pantalla:** la ganancia parcial y completa, porque los datos locales no tienen costos; la descarga real de Excel y PDF; el aviso de lectura caída. Tampoco hay una prueba con una persona.
- **Validación:**
  - `typecheck` y `lint` sin errores.
  - 1,663 unitarias pasan, con una omitida.
  - Nueva `rango-en-palabras.test.ts`: dice el año solo cuando no es el actual o cuando el rango cruza de año.

---

*Actualiza este documento al cerrar cada ficha o al fusionar PR, o muévelo a `docs/archivo/` cuando la ola 0 esté fusionada y desplegada.*
