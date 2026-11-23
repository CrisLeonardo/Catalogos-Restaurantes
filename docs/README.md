# Documentación

Índice de todo lo que no es código. Regla de oro: **un tipo de documento, una carpeta.** Si dudas dónde va algo, mira la columna «Qué va aquí».

| Carpeta | Qué va aquí | Se actualiza |
|---|---|---|
| [`guias/`](guias/) | Cómo hacer cosas: entorno local, despliegue, Cloudflare, flujo de git. | Cuando cambia el procedimiento |
| [`planes/`](planes/) | Un `PLAN_*` por funcionalidad grande, con sus fases y casillas. También listas de pendientes. | Durante la ejecución; al terminar se mueve a `archivo/` |
| [`registros/`](registros/) | Documentos vivos de seguimiento: `IMPLEMENTACIONES`, `ERRORES`, `CHECKLIST_CORRECCIONES`, `MEJORAS_*`. | Siempre |
| [`auditorias/`](auditorias/) | Auditorías vigentes (seguridad, velocidad, pulido). | Mientras tengan hallazgos abiertos |
| [`negocio/`](negocio/) | Precios, ofertas, guion de demo, guion del video promocional (`promo-video/`), análisis de competencia, cotizador, seguimiento de prospectos, estrategia de atracción. | Según el negocio |
| [`diseno/`](diseno/) | Lienzos y maquetas de diseño (`.dc.html`) con sus scripts generadores; prototipos animados (`intro-animada/`) y la hoja de marca de Leo y el color (`marca/`). | Al rediseñar |
| [`archivo/`](archivo/README.md) | Lo histórico: ya cumplió su propósito. Solo referencia. | Nunca |

Documentos técnicos que viven pegados al código: [`../plataforma/docs/`](../plataforma/docs/) (offline, FEL, Google Auth, pagos, Leogin Desktop, estrategia instalable).

La [validación de lanzamiento del 18 de noviembre](auditorias/AUDITORIA_VALIDACION_LANZAMIENTO_2026-11-18.md) reúne la evidencia de producción, el ensayo de primera mensualidad y los pendientes de venta.

La [auditoría de lanzamiento del 23 de noviembre](auditorias/AUDITORIA_LANZAMIENTO_LEOGIN_2026-11-23.md) contrasta la oferta pública con el código desplegado, reúne el checklist de salida por flujo y prepara el piloto para los primeros tres clientes de pago.

Para mejorar la carta del comensal como vendedora del restaurante, consulta la [auditoría «La carta que vende»](auditorias/AUDITORIA_CARTA_QUE_VENDE_2026-11-18.md) y su [maqueta](diseno/MAQUETA_CARTA_QUE_VENDE_2026-11-18.html).

## Convenciones de nombre

- `PLAN_<TEMA>_<AAAA-MM-DD>.md` — planes. La fecha es la de creación.
- `AUDITORIA_<TEMA>_<AAAA-MM-DD>.md` — auditorías.
- `GUIA_<TEMA>.md` — guías; sin fecha porque se mantienen al día.
- Los nombres no llevan espacios ni acentos.

## Cuando un plan termina

1. Marca todas sus fases como hechas y anota el commit de cierre.
2. Muévelo con `git mv docs/planes/PLAN_X.md docs/archivo/planes-cerrados/` (así se conserva el historial).
3. Si quedó algo pendiente, pásalo a [`registros/CHECKLIST_CORRECCIONES.md`](registros/CHECKLIST_CORRECCIONES.md) antes de archivar.
