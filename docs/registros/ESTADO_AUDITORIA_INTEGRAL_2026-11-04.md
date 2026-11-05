# Estado de la auditoría integral — traspaso del 2026-11-04

Documento de traspaso para retomar el trabajo en otra sesión o cuenta sin perder el contexto. Resume qué se logró, qué está en curso y qué falta, con listas para marcar.

> **Actualización del 2026-11-05:** las **13 fichas originales de la ola 0 están implementadas en sus ramas**, pero la ola **no está cerrada**: la 0.13 ejecutó nueve pruebas de dinero en Postgres y reprodujo **seis defectos**, ahora fichas **0.14–0.19**, que bloquean la ola 1. La suite pasa tres casos y falla seis de forma explícita. PR #82 (0.12) y [#83](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/83) (0.2) tienen CI verde; la 0.13 se entrega en `fix/pruebas-dinero-postgres` (§10). No se fusionó ni se desplegó. Siguiente ficha: **0.14**, con el «sí, sigue» del dueño.

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
| 0.13 Circuito de dinero en Postgres | PR de esta rama | `fix/pruebas-dinero-postgres` | — | Suite reproducible de nueve casos: tres pasan y seis identifican defectos, con fichas 0.14–0.19 antes de la ola 1. Ver §10 |

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

### Ola 0 (6 correcciones nuevas). Siguiente: 0.14

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
- [ ] **0.14 Cobro parcial concurrente sin sobrecobro**: D03 guarda Q20 por consumo Q10.
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

**Siguiente ficha:** 0.14, después del «sí, sigue» del dueño. Antes de la ola 1 deben pasar las nueve invariantes. Fusionar/desplegar siguen siendo pasos separados que debe pedir el dueño, con #71 primero y el CI en verde; el CI general no sustituye esta integración de dinero.

---

*Actualiza este documento al cerrar cada ficha o al fusionar PR, o muévelo a `docs/archivo/` cuando la ola 0 esté fusionada y desplegada.*
