# Recomendaciones pendientes — sesión 2026-07-18

Salieron de la auditoría general + renovación del super admin de esta sesión.
No se hicieron esta noche a propósito (fuera de alcance o requieren una decisión tuya). Quedan aquí para retomarlas en otro chat.

## 1. Pedidos/mesas viejos se acumulan como "activos"

En Pedidos y en el KDS de cocina, un pedido que nunca se marcó como completado se queda mostrándose como "en curso" para siempre — vi varios de más de 170 horas (pruebas viejas). En producción real, un pedido olvidado o abandonado por el cliente va a estorbar visualmente sin límite de tiempo.

Ya corregí el síntoma más molesto (el cronómetro mostraba "193:00:12" en vez de algo legible — ahora dice "8 días"), pero el problema de fondo sigue: nada archiva o separa lo viejo.

**Sugerencia:** una sección plegada "Antiguos" en Pedidos/KDS para todo lo que pase de ~24h sin resolverse, o un auto-cambio de estado (ej. a "abandonado") pasado cierto umbral configurable.

## 2. Migraciones pendientes en producción

Según tus notas previas, varias migraciones (074 a 078) están probadas en local pero no corridas en prod. Antes de empezar a vender de verdad, hay que confirmar que producción esté al día con:
- 074_staff_pin
- 075_fix_plan_prices_estandar_premium
- 076_restaurant_theme_templates
- 077_reconciliar_precio_congelado_072
- 078_descuento_por_metodo_y_modulos

(Esto no es nuevo de hoy — es un recordatorio de que sigue sin confirmarse.)

## 3. Pasarela de pago (cuando quieras automatizar el cobro)

Elegiste "manual mejorado" para esta sesión — el super admin ahora tiene todo el ciclo manual pulido (configurar → generar cobro → recordar por WhatsApp → registrar pago → recibo PDF). Las tablas de facturación (`invoices`, `restaurant_billing`) ya están en una forma que soporta conectar una pasarela (Recurrente, Stripe, etc.) más adelante sin rehacer el modelo de datos — solo faltaría el webhook que marque las facturas como pagadas automáticamente.

## 4. Notas del entorno local (para la próxima sesión de desarrollo)

- Si corres `next build` (producción) y luego `next dev` sobre el mismo `.next`, aparecen 404 fantasma en rutas que sí existen. Hay que borrar `.next` entre uno y otro.
- Iniciar sesión como dueño en `localhost:3000` reemplaza la sesión del super admin (las cookies no se comparten entre subdominios `*.localhost` en local — sí lo hacen en producción con dominio real).
