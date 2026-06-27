# Integración de pagos — cómo cobra Leogin sus suscripciones

> Estado actual (2026-06-27): el cobro es **manual** — el restaurante paga por
> transferencia/depósito y tú registras el pago en `/super/cobros` o en la ficha
> del restaurante. Esto ya funciona y es suficiente para los primeros clientes.
>
> Este documento es el **plan para automatizar el cobro** cuando tengas volumen.
> Nada de esto está "conectado" todavía: es el scaffold + la guía.

---

## 1. Qué ya existe (base sobre la que se construye)

- **Facturas** (`invoices`): conceptos MONTHLY/SETUP/PRORATE/OTHER, estados
  PENDING/PAID/CANCELLED, `due_date`, `paid_at`, `payment_method`.
- **Generación automática** de la mensualidad por `pg_cron` (mig. 035) y el motor
  `leogin_billing_cron()` (genera + procesa impago/suspensión).
- **Acción `markInvoicePaid`** (`lib/actions/billing.ts`): marca una factura como
  pagada. Hoy la usa el super admin a mano; mañana la llamará el webhook de pago.
- **Sistema de API keys** (mig. 051 + `lib/api-keys.ts`): llaves con hash que
  Leogin emite a integradores. Útil si algún día expones tu propia API.

## 2. Pasarela recomendada para Guatemala

**[Recurrente](https://recurrente.com)** es la opción más directa para un SaaS en GT:
- Cobros recurrentes (suscripciones) y pagos únicos.
- Acepta tarjeta y transferencias locales; deposita a cuenta bancaria GT.
- Tiene webhooks y checkout hospedado (no manejas datos de tarjeta → menos PCI).

Alternativas: **Stripe** (excelente DX, pero el cobro/payout a cuentas GT es más
complicado), o pasarelas de bancos locales (Visanet/NeoNet) si ya tienes contrato.

> Recomendación: empieza con **checkout hospedado + webhook** de Recurrente. Es lo
> más rápido y seguro (no tocas números de tarjeta).

## 3. Arquitectura de la integración (cuando la actives)

```
Restaurante  →  Checkout hospedado (Recurrente)  →  paga
                                                     │ webhook firmado
                                                     ▼
                          /api/webhooks/recurrente  →  verifica firma
                                                     →  marca invoice PAID
                                                     →  leogin_sync_restaurant_status (reactiva si estaba suspendido)
```

### Reglas de oro de seguridad
1. **Secretos de la pasarela en variables de entorno**, NUNCA en la base de datos
   ni en `api_keys`:
   - `RECURRENTE_PUBLIC_KEY`, `RECURRENTE_SECRET_KEY`, `RECURRENTE_WEBHOOK_SECRET`.
2. **Verifica SIEMPRE la firma del webhook** antes de tocar nada (evita que
   alguien marque facturas como pagadas con un POST falso).
3. **Idempotencia**: un webhook puede llegar dos veces. Usa el id del evento /
   de la factura para no aplicar el pago dos veces (la factura ya en PAID no se
   reprocesa).
4. Responde rápido (2xx) y haz el trabajo pesado de forma asíncrona si hace falta.

## 4. Pasos concretos para implementarlo

1. Crear cuenta en Recurrente y obtener las llaves → ponerlas en Render como env vars.
2. Al generar/mostrar una factura MONTHLY, crear (o reutilizar) un **checkout/suscripción**
   en Recurrente y guardar su id en la factura (columna nueva `external_ref`).
3. Botón "Pagar en línea" en `/admin/suscripcion` que abra ese checkout.
4. Endpoint `app/api/webhooks/recurrente/route.ts`:
   - `runtime = 'nodejs'`.
   - Lee el cuerpo crudo, verifica la firma con `RECURRENTE_WEBHOOK_SECRET`.
   - En `payment.succeeded` → busca la factura por `external_ref` y llama a la
     lógica equivalente a `markInvoicePaid` (con service role) + `leogin_sync_restaurant_status`.
   - Aplica el rate-limit de `lib/rate-limit.ts` por IP.
5. Migración para `invoices.external_ref text` + índice.
6. Pruebas con el modo *test* de Recurrente antes de producción.

## 5. ¿Para qué sirve el sistema de API keys entonces?

`api_keys` (mig. 051) es para cuando **tú** quieras exponer una API a terceros
(un integrador, un panel externo, una app de socio). Esas llaves se emiten desde
`/super/configuracion`, se guardan **hasheadas**, y se verifican en cada request
con `verifyApiKey()` (ver el endpoint de ejemplo `app/api/v1/me/route.ts`).
No las confundas con los secretos de la pasarela (esos van en env).
