# Observaciones sobre la auditoría integral · 2026-11-09

Nota para retomar en otra sesión. Recoge qué conservar y qué cambiar de la auditoría del 3 de noviembre y de su ejecución, tras revisar el [informe maestro](../auditorias/AUDITORIA_INTEGRAL_2026-11-03.md), el [plan](../planes/PLAN_AUDITORIA_INTEGRAL_2026-11-04.md), el [registro](ESTADO_AUDITORIA_INTEGRAL_2026-11-04.md) (§28–34) y el [traspaso](TRASPASO_CLAUDE_CODE_2026-11-07.md).

**Estado al escribirla:** rama `feat/checkout-seguimiento` (`2627b50`), PR #108. Es una opinión de revisión; no se cambió código ni se tomó ninguna decisión. Nada de lo que sigue está aprobado por el dueño.

## Conclusión

El diagnóstico de la auditoría es bueno y se conserva. Lo que hay que cambiar es la ejecución: integrar, desplegar y probar con personas antes de empezar la Ola 2.

## Lo que se conserva

- **Honestidad sobre la evidencia.** Cada hallazgo dice si se vio en pantalla (V), se leyó en código (C), es propuesta (P) o hipótesis (H). El informe se negó a dar una nota tipo «8/10».
- **El orden de prioridades.** Primero verdad, dinero y acceso; después recorridos; no añadir módulos.
- **Reproducir antes de arreglar.** La prueba de dinero en Postgres real (0.13) encontró seis fallos que la auditoría no había visto (0.14–0.19).

## Lo que se cambiaría

### 1. Nada ha llegado a `main` ni a producción

- 37 PR abiertos, #72–#108, todos `MERGEABLE` el 2026-11-09. `main` sigue en `876dd50` (v0.17.0).
- La cadena frente a `main`: 307 archivos, unas 32.700 líneas añadidas (16.300 en `plataforma/src` y `plataforma/supabase`).
- Última etiqueta de producción: `prod-2026-10-27`. Entre la 148 y la 180 hay 33 migraciones por aplicar.
- El plan (§1, «Antes de empezar la ola 0») pedía desplegar v0.17.0 antes de la Ola 0 y no se hizo.

**Propuesta:** integrar y desplegar por lotes ahora, antes de tocar la Ola 2.

### 2. Las prioridades quedaron invertidas en la práctica

La cadena apilada #85 → #108 contiene todo el pulido de la Ola 1 (P1), pero le faltan diez correcciones P0 de la Ola 0, que siguen en PR sueltos contra `main`:

| Ficha | PR | Tema |
|---|---|---|
| 0.1 | #72 | Textos y enlaces que prometen otra cosa |
| 0.2 | #83 | Una sola fuente para plan, precio y alcance |
| 0.3 | #75 | Error no es vacío ni cero |
| 0.4 | #74 | Pausa de pedidos real |
| 0.5 | #73 | Cupones: vigencia, programación y límites |
| 0.6 | #77 | Pedido, cupón y puntos en una sola operación |
| 0.8 | #80 | Compras atómicas y estados válidos |
| 0.10 | #78 | Caja honesta |
| 0.11 | #81 | Cola offline que no promete de más |
| 0.13 | #84 | Pruebas del circuito del dinero en Postgres |

Ya están dentro de la cadena 0.7 (#76), 0.9 (#79) y 0.12 (#82). El registro §28 anticipa conflictos al integrar el resto: `verificar_migraciones.sql` (154–159), Caja (`cash-close.tsx`, `finanzas.ts`), Servicio (`servicio-panel.tsx`, `order-queue.ts`, `hoja-cobro.tsx`), lista de espera, reservaciones y el arnés de dinero.

### 3. «Ola 1 terminada» no cumple su propio criterio

El plan (§4) dice que la Ola 1 sale cuando cada recorrido está «probado por una persona nueva». Eso no ha ocurrido. Tampoco están hechas:

- las pruebas de Servicio y Cocina en el local, lectura a distancia y audio;
- la impresión física;
- el teclado del teléfono en un aparato real (1.12);
- la pasada completa de temas claros (1.11).

**Propuesta:** llamarla «implementada, sin validar» hasta que pasen esas pruebas.

### 4. Nadie independiente ha revisado el código

Cada ficha la verificó el mismo agente que la escribió. Antes de producción conviene una revisión aparte de lo que toca dinero y permisos: migraciones 160–180 y los resolutores de permisos de la 1.7.

### 5. La línea comercial no arrancó

Debía ir en paralelo desde la Ola 1 y ninguna ficha V.1–V.6 está hecha. La auditoría recomendaba pilotos acompañados y un segmento inicial concreto; aún no hay clientes. Sin pilotos, las olas 2 a 4 (31 fichas) se priorizan a ciegas.

**Propuesta:** que uno o dos pilotos decidan qué sigue, en lugar de ejecutar las olas 2–4 en el orden del plan.

### 6. El documento es difícil de usar

- Tres informes (unas 2.500 líneas) con cerca de 196 identificadores en 13 prefijos, donde uno «prevalece» sobre otro.
- Las 88 capturas de evidencia viven fuera del repo, en `.codex/visualizations/2026/11/02/…/evidencias-v2/`; los enlaces del informe no abren.

**Propuesta:** un solo registro vivo de hallazgos con su estado, y la evidencia en un sitio estable (sin datos reales, según las reglas del repo).

### 7. Faltan líneas base medibles y tres pruebas

- No se midió rendimiento (LCP, INP, CLS) ni tiempo por tarea: no hay con qué comparar la mejora.
- No hubo revisión de seguridad dedicada, ensayo de restauración del respaldo ni pasada con lector de pantalla. La auditoría lo admite (§2 y §11), pero quedaron lejos, en la Ola 4 (4.5, 4.12).

**Propuesta:** adelantar la restauración probada y la revisión de seguridad a antes del primer cliente de pago.

### 8. El tablero del plan está desfasado

En la rama actual, el tablero (§7 del plan) marca sin hacer 0.1–0.6, 0.8 y 0.10–0.13, que sí están entregadas en sus ramas. Hay que reconciliarlo al integrar.

## Orden sugerido

1. Integrar la Ola 0 que falta en la cadena, resolviendo los conflictos previstos.
2. Revisión independiente de dinero y permisos.
3. Plan de despliegue con las migraciones 148–180 en orden y su relación con el código.
4. Desplegar, etiquetar `prod-…` y proponer la versión.
5. Pruebas con personas y en aparatos reales de los recorridos de la Ola 1.
6. Uno o dos pilotos, y con lo que salga decidir la Ola 2.

Fusionar, desplegar y etiquetar siguen necesitando la petición explícita del dueño ([CLAUDE.md](../../CLAUDE.md)).
