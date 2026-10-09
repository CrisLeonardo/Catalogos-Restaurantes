# Archivo

Documentos históricos: **ya cumplieron su propósito**, no describen el estado actual del sistema. Se guardan por referencia, no como algo a mantener al día.

- **`auditorias/`** — seis auditorías "completas/integrales" hechas entre 2026-06-09 y 2026-07-29. Cada una volvía a revisar seguridad, UX, rendimiento y arquitectura desde cero, sin conectarse con la anterior — varios hallazgos (contraste/WCAG, por ejemplo) se repiten en tres de ellas. El hábito hacia adelante es un documento vivo de seguimiento (ver [`CHECKLIST_CORRECCIONES.md`](../registros/CHECKLIST_CORRECCIONES.md) en la raíz, que sí se actualiza con checkboxes en vez de reemplazarse), no una auditoría nueva de "todo" cada par de semanas.
- **`planes-cerrados/`** — planes de features cuyas fases están 100% marcadas ✅ y sin commits desde hace semanas: Admin Pro, Grupos, Personalización (parte de esto se revirtió después — el panel admin ya no se personaliza), Planes/Pricing (el modelo cambió más de una vez desde entonces), Offline v1 (reemplazado por v2), Login con PIN de personal, y el Plan Maestro original (fases 0-5, congelado desde 2026-06-08 mientras el trabajo real siguió en otro lado).

Si necesitás contexto histórico de por qué algo se construyó así, está acá. Si necesitás saber el estado *actual*, no — para eso están la memoria del proyecto y el código.

- **`apoyo-estructura-fastapi-2026-06/`** — antes `Apoyo Estructura/`. Documentación técnica (arquitectura, flujo de datos, BD, seguridad) escrita el 2026-06-09 para un stack **FastAPI + PostgreSQL + Redis** que no es el de la plataforma actual (Next.js 16 + Supabase). **No la uses como referencia del sistema vigente**; para eso ver [`plataforma/docs/`](../../plataforma/docs/) y [`plataforma/CLAUDE.md`](../../plataforma/CLAUDE.md).
- **`capturas-errores-plantillas-2026-07-15/`** — antes `Errores plantillas personalizadas/`. 13 capturas del fallo de plantillas personalizadas corregido en la ampliación a 16 plantillas.
