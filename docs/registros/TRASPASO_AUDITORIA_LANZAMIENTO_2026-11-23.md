# Traspaso · auditoría de lanzamiento · 23 de noviembre de 2026

Para retomar en un chat nuevo. La auditoría es [`AUDITORIA_LANZAMIENTO_LEOGIN_2026-11-23.md`](../auditorias/AUDITORIA_LANZAMIENTO_LEOGIN_2026-11-23.md); su §4 («Avance en código») dice qué se hizo en cada punto y qué falta. Lo publicado está en `CHANGELOG.md`, v0.33.0.

## Dónde quedó

- Rama `audit/lanzamiento-leogin-2026-11-23`, PR #177 (auditoría y correcciones juntas).
- **Migración 191** (precio acordado): se aplica en producción **antes** de desplegar el código. Script armado con guarda: `node plataforma/scripts/armar-migraciones-produccion.mjs 191 191` → `plataforma/supabase/.produccion/migraciones_191_a_191.sql` (se pega en el SQL Editor de Supabase). La guarda exige la 190 aplicada y se niega si la 191 ya está.
- Después de desplegar:
  1. Pegar `plataforma/supabase/verificar_huellas.sql` en el SQL Editor: las 20 funciones deben decir «coincide».
  2. `plataforma/supabase/verificar_migraciones.sql`: la 191 debe decir «sí».
  3. En Cobranza, buscar locales de pago con una mensualidad vencida desde su alta (el error del día de cobro 1) y corregir su día de cobro.
  4. Volver a medir la carta: `node scripts/medir-carta.mjs https://rincon502.distleogin.com/` (desde `plataforma/`). Antes del cambio de fotos, el LCP en producción era de ~4 s.
  5. Etiquetas `v0.33.0` y `prod-AAAA-MM-DD`, si el dueño lo confirma.

## Decisiones del dueño en esta sesión

- **Tarifas de Estándar y Premium: pendientes** (duda entre Q150/Q199 y Q299). El piloto es En línea a Q99. Cambiarlas en superadmin ya no afecta a quien paga (migración 191). Cuando se decidan, alinear los valores de respaldo de `plans.ts` y de las funciones SQL.
- **Usuarios por plan:** cuenta todo el equipo, dueño y PIN incluidos; quien ya excede conserva a su gente.
- **Impago:** la carta y el QR siguen visibles como Básico, sin pedidos. La suspensión manual sí la quita.
- Maqueta del alta con el plan elegido: aprobada y construida.

## Lo que queda (casi todo es manual o de decisión)

- WhatsApp de ventas: cargar `NEXT_PUBLIC_CONTACT_WHATSAPP` en Render si se atenderá por ahí (LZ-03).
- Firmar el instalador de Escritorio y ensayar impresión y respaldo con equipo (LZ-06, LZ-07).
- Ensayar un turno En línea con dos aparatos y conciliar; restauración aislada (LZ-02, LZ-05).
- Probar el registro con lector de pantalla y teclado en Android/iPhone (LZ-04); vista previa en WhatsApp y Search Console (LZ-09).
- Aligerar los 319 KB de JS de la carta; medir el panel con aviso en ≤ 5 s (LZ-12).
- Inventario de retención y borrado de datos (LZ-10).

## Trampas vistas

- El servidor de desarrollo a veces sirve un bundle viejo de un módulo compartido (`plans.ts`): reiniciarlo antes de concluir que un cambio no funciona.
- La base local de trabajo (puerto 54601) va en la 181 y su `leogin_cobrar_parte_mesa` no es la del repositorio; las pruebas de integración ahora lo detectan y se niegan a correr. Se pueden correr contra la base de pruebas al día: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55600 DINERO_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55601/postgres npm run test:dinero`.
- Si cambias una de las 20 funciones críticas en una migración, regenera las huellas: `node scripts/huellas-funciones.mjs --escribir` sobre una base recién migrada.
