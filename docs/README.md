# Documentación

Índice de todo lo que no es código. Regla de oro: **un tipo de documento, una carpeta.** Si dudas dónde va algo, mira la columna «Qué va aquí».

| Carpeta | Qué va aquí | Se actualiza |
|---|---|---|
| [`guias/`](guias/) | Cómo hacer cosas: entorno local, despliegue, Cloudflare, flujo de git. | Cuando cambia el procedimiento |
| [`planes/`](planes/) | Un `PLAN_*` por funcionalidad grande, con sus fases y casillas. También listas de pendientes. | Durante la ejecución; al terminar se mueve a `archivo/` |
| [`registros/`](registros/) | Documentos vivos de seguimiento: `IMPLEMENTACIONES`, `ERRORES`, `CHECKLIST_CORRECCIONES`, `MEJORAS_*`. | Siempre |
| [`auditorias/`](auditorias/) | Auditorías vigentes (seguridad, velocidad, pulido). | Mientras tengan hallazgos abiertos |
| [`negocio/`](negocio/) | Precios, ofertas, guion de demo, análisis de competencia, cotizador, seguimiento de prospectos, estrategia de atracción. | Según el negocio |
| [`diseno/`](diseno/) | Lienzos y maquetas de diseño (`.dc.html`) con sus scripts generadores; prototipos animados (`intro-animada/`) y la hoja de marca de Leo y el color (`marca/`). | Al rediseñar |
| [`archivo/`](archivo/README.md) | Lo histórico: ya cumplió su propósito. Solo referencia. | Nunca |

Documentos técnicos que viven pegados al código: [`../plataforma/docs/`](../plataforma/docs/) (offline, FEL, Google Auth, pagos, Leogin Desktop, estrategia instalable).

## Convenciones de nombre

- `PLAN_<TEMA>_<AAAA-MM-DD>.md` — planes. La fecha es la de creación.
- `AUDITORIA_<TEMA>_<AAAA-MM-DD>.md` — auditorías.
- `GUIA_<TEMA>.md` — guías; sin fecha porque se mantienen al día.
- Los nombres no llevan espacios ni acentos.

## Cuando un plan termina

1. Marca todas sus fases como hechas y anota el commit de cierre.
2. Muévelo con `git mv docs/planes/PLAN_X.md docs/archivo/planes-cerrados/` (así se conserva el historial).
3. Si quedó algo pendiente, pásalo a [`registros/CHECKLIST_CORRECCIONES.md`](registros/CHECKLIST_CORRECCIONES.md) antes de archivar.
