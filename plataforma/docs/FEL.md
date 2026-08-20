# Factura Electrónica en Línea (FEL) — Guatemala

Guía del módulo de facturación: cómo está construido, qué hay que configurar
para que funcione y qué falta antes de facturar en producción.

---

## 0. ESTADO: apagado a propósito

El módulo está **terminado y verificado, pero desactivado**. Falta elegir
certificador, verificar su contrato, correr la migración 118 en producción y
que un contador confirme el régimen fiscal (ver §5).

El apagado es **a nivel plataforma**, no restaurante por restaurante:

```
NEXT_PUBLIC_FEL_ENABLED   ausente o != '1'  →  APAGADO (estado actual)
                          '1'               →  encendido
```

Se apaga así y no desde `restaurants.modules` porque **la emisión automática
se dispara sola** al cerrar un cobro: bastaría con que una fila tuviera
`fel=true` —algunas lo tienen desde la migración 038— para que esa caja
empezara a emitir documentos fiscales reales que nadie pidió. Un interruptor
en la base se enciende por descuido; este no.

Qué hace el apagado, todo desde un único paso obligado (`isManaged()` en
`lib/modules.ts`):

| | Con el interruptor apagado |
|---|---|
| Pestaña «Facturación» en el panel | No aparece |
| `/admin/facturacion` | Redirige a módulos |
| Acciones de emisión/anulación | Rechazan: «El módulo de Facturación no está activo» |
| Emisión automática al cobrar | No se dispara (candado propio, además del anterior) |
| `POST /api/fel/cola` | Responde `{ok:true, desactivado:true}` sin transmitir nada |
| Reloj de la cola (GitHub Actions) | `schedule` comentado |

Nada de esto borra código ni datos: `src/lib/modules-fel-apagado.test.ts` fija
el comportamiento, y para encenderlo basta la variable de entorno más
descomentar el `schedule` del workflow.

---

## 1. Lo que hay que saber del régimen

Cada venta se documenta con un **DTE** (Documento Tributario Electrónico): un
XML con el esquema `dte:GTDocumento` del SAT que un **certificador** firma,
transmite al SAT y devuelve con un **número de autorización** (un UUID). Ese
UUID es la identidad fiscal del documento.

Leogin **no es certificador**. Genera el DTE y lo manda a certificar. El
restaurante contrata su propia cuenta con un certificador (INFILE, Digifact,
G4S…) y sus credenciales se guardan cifradas por restaurante.

Reglas que el código aplica y conviene tener presentes:

| Regla | Dónde vive |
|---|---|
| IVA 12 %, incluido en el precio de carta | `fel/totales.ts` |
| Pequeño contribuyente emite `FPEQ` y **no** desglosa IVA | `fel/frases.ts` |
| Consumidor Final solo hasta **Q2,500** (arriba: NIT o DPI; Q100 de multa por documento) | `fel.ts` → `problemaDeConsumidorFinal` |
| Anular solo dentro de **24 h**; después toca **nota de crédito** | `fel.ts` → `ventanaDeAnulacion` |
| Nota de crédito de más de **2 meses** no lleva IVA | `actions/fel.ts` → `emitirNotaCredito` |
| Hora de emisión en UTC−6, no en UTC | `fel/xml.ts` → `felDateTime` |

---

## 2. Cómo está armado

Las piezas de abajo son **puras**: sin red, sin base de datos. Por eso el
cálculo completo de una factura se puede probar con vitest sin tocar un
certificador, que es justo lo que no se puede hacer a mano.

```
fel/nit.ts        quién es el receptor (NIT con dígito verificador, DPI, CF, extranjero)
fel/frases.ts     qué leyendas legales lleva el DTE según el régimen del emisor
fel/totales.ts    cuánto se factura, con el descuento prorrateado y cuadrando con la caja
fel/xml.ts        cómo se serializa para el SAT
fel/verificacion.ts   el enlace del verificador que va impreso en el ticket
        │
fel.ts            junta configuración + pedido + receptor → documento listo
        │
fel/transmit.ts   lo manda al certificador y lleva la cola de reintentos
fel/providers/*   un adaptador por certificador, todos contra el mismo contrato
actions/fel.ts    autorización, persistencia y las acciones del panel
```

**El certificador es intercambiable a propósito.** Añadir uno es escribir su
adaptador contra `providers/types.ts` y sumarlo a `providers/registry.ts`. No
se toca la emisión, ni la cola, ni la caja, ni el ticket.

### Por qué el documento se guarda antes de transmitir

El orden es **guardar `PENDIENTE` → transmitir → marcar `CERTIFICADO`**. Al
revés parece más limpio y es peor: si el proceso muere entre la respuesta del
certificador y el insert, el SAT tiene una factura que Leogin no registró —
nadie la reimprime y aparece en la declaración del mes como un documento
fantasma. Guardando primero, el peor caso es un `PENDIENTE` que la cola
reintenta.

### La clave de idempotencia

`transmitirDocumento` le pasa al adaptador el **id del documento** como
`idempotencyKey`, y ese id no cambia entre reintentos. Es la única defensa
contra la doble factura: si el certificador recibe el DTE, lo transmite y la
respuesta se pierde por un timeout, la cola reintenta — y con un
identificador nuevo en cada intento el certificador emitiría un **segundo**
DTE por la misma venta. Nunca derivarlo de `Date.now()` ni de un aleatorio.

---

## 3. Configuración obligatoria

### Variables de entorno

| Variable | Para qué | Si falta |
|---|---|---|
| `NEXT_PUBLIC_FEL_ENABLED` | Interruptor general (§0). `1` para encender | Todo el módulo queda apagado |
| `LEOGIN_SECRET_KEY` | Cifra las credenciales del certificador (AES-256-GCM). 32 bytes en base64 o hex | No se pueden guardar credenciales; la app se niega en vez de dejarlas en claro |
| `FEL_CRON_SECRET` | Autoriza `POST /api/fel/cola` | El endpoint queda **cerrado** y la cola nunca se drena |
| `FEL_INFILE_URL_FIRMA` | Opcional: sobrescribe el endpoint de firma de INFILE | Se usa el valor por defecto |
| `FEL_INFILE_URL_CERTIFICACION` | Opcional: idem para certificación | Se usa el valor por defecto |

```bash
openssl rand -base64 32   # LEOGIN_SECRET_KEY
openssl rand -hex 32      # FEL_CRON_SECRET
```

### La cola de reintentos

`/api/fel/cola` recupera las facturas que quedaron pendientes porque el
certificador estaba caído. **Necesita un reloj externo**: sin él, cada factura
que no certifica al primer intento se queda pendiente para siempre.

El reloj vive en `.github/workflows/fel-cola.yml` (cada 5 minutos, gratis).
Requiere dos secretos del repositorio: `FEL_CRON_URL` y `FEL_CRON_SECRET`.

No se usa `pg_cron` como en el cobro automatizado porque reintentar es hablar
por HTTPS con el certificador, y Postgres no debe salir a internet.

### Migraciones

`039` (tablas) · `106` (credenciales cifradas + cola) · `118` (régimen fiscal,
identificación del receptor, índice único por pedido, correlativo atómico).

---

## 4. Verificación

### Contra los esquemas oficiales del SAT

Los XSD oficiales están versionados en `scripts/fel/xsd/`. Para comprobar que
lo que generamos valida contra ellos:

```bash
npx vitest run src/lib/fel/muestras-xml.test.ts && python scripts/fel/validar-dte.py scripts/fel/muestras
```

Cubre factura, pequeño contribuyente, receptor con DPI, nota de crédito con su
complemento, y anulación.

> **Ojo con los patrones del SAT.** Varios `xs:pattern` del XSD publicado
> terminan en `$` y algunos empiezan por `^`. En XSD esos caracteres son
> *literales* (el patrón ya va anclado), así que bajo lectura estricta ni
> siquiera el valor `CF` —que el propio SAT documenta— valida contra su
> esquema. El script les quita las anclas y lo deja anotado en la salida. No
> es un problema de nuestro XML.

### Contra pedidos reales

`src/lib/fel/pedidos-reales.test.ts` toma pedidos exportados de la base
(`scripts/fel/pedidos-reales.json`) y comprueba lo único que de verdad
importa: **lo que dice la factura es lo que cobró la caja**. Para
regenerarlos:

```bash
docker exec -i supabase_db_plataforma psql -U postgres -d postgres -A -t -c "select json_agg(row_to_json(t)) from (select o.id, o.order_number, o.total, o.delivery_fee, o.tip, o.discount, o.loyalty_discount, o.status, (select json_agg(json_build_object('name_snapshot', oi.name_snapshot, 'quantity', oi.quantity, 'subtotal', oi.subtotal)) from order_items oi where oi.order_id = o.id) as items from orders o where o.status <> 'CANCEL' order by o.created_at desc limit 40) t;" > scripts/fel/pedidos-reales.json
```

---

## 5. Qué falta antes de facturar en producción

0. **Encender el interruptor** (`NEXT_PUBLIC_FEL_ENABLED=1`) y descomentar el
   `schedule` de `.github/workflows/fel-cola.yml`. Hacerlo **al final**, no al
   principio: es lo que convierte todo lo demás en documentos fiscales reales.
1. **Verificar el contrato del certificador.** Los endpoints de INFILE están
   confirmados; los **nombres de campo del JSON** no pude verificarlos en
   fuente oficial — vienen del contrato que entregan en el onboarding, que no
   es público. Todo lo incierto está aislado en el bloque `CONTRATO` de
   `providers/infile.ts` y la lectura de respuestas es tolerante, así que
   corregirlo es tocar un solo archivo. **Probar primero en su ambiente de
   pruebas.**
2. **Correr la migración 118 en producción.**
3. **Configurar `LEOGIN_SECRET_KEY` y `FEL_CRON_SECRET`**, y los dos secretos
   del workflow.
4. **Que el dueño confirme su régimen con su contador.** La pantalla de
   configuración enseña las frases exactas que saldrán impresas justo para
   eso. Un régimen mal declarado no falla al emitir: falla meses después,
   cuando a alguien le retienen lo que no correspondía.
5. **Probar el QR en la impresora real.** Se imprime con el comando nativo
   ESC/POS (`GS ( k`), que las térmicas de 80 mm actuales entienden, pero no
   está probado contra el hardware del cliente. La dirección del verificador
   también sale en texto, así que un fallo del QR no deja al cliente sin
   forma de consultar su factura.
6. **Quitar `comingSoon: true`** del módulo `fel` en `lib/plans.ts` cuando se
   vaya a vender.

---

## 6. Modos de fallo, y qué hace el sistema

| Situación | Qué pasa |
|---|---|
| Certificador caído | El documento queda `PENDIENTE` y la cola reintenta con backoff (1 min → 5 → 15 → 1 h → 6 h). **La caja no se bloquea.** |
| El certificador rechaza el DTE | No se reintenta (reenviar lo mismo da el mismo rechazo). Queda en `ERROR` con el motivo visible en el panel. |
| Timeout tras haber llegado | La clave de idempotencia evita el documento duplicado. |
| Dos cajas facturan el mismo pedido a la vez | El índice único de la migración 118 deja pasar solo una. |
| Falta un dato fiscal | No se emite y el panel dice exactamente cuál falta. |
| Venta CF arriba de Q2,500 | Se bloquea antes de emitir, con el aviso de la multa. |
| NIT mal tecleado | Se rechaza en el momento con el dígito verificador correcto sugerido. |
| Sin certificador contratado | Modo interno: numera pero **no** factura. El ticket lo imprime como «NO ES UNA FACTURA» y el panel lo marca «SIN VALIDEZ FISCAL». |
| Factura aún en cola al imprimir | El ticket dice «FACTURA EN PROCESO» en vez de fingir un número. |
| Pasadas las 24 h para anular | El botón de anular desaparece y aparece «Nota de crédito». |
