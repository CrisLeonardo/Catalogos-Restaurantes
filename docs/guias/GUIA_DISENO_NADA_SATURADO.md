# Cómo se diseña en Leogin: nada saturado

Regla del dueño desde el 2026-11-10. Aplica a **todo** lo que se implemente, agregue o mejore en Leogin —panel, superadmin, Mi cuenta, carta del comensal y web pública— en teléfono y en PC, y a **cualquier asistente** que trabaje en el repo (Claude, ChatGPT/Codex u otro).

La meta: un sistema práctico, útil, moderno, minimalista y fácil de usar, que resuelva la vida de quien lo usa. Si una pantalla se siente saturada o agobiante, está mal aunque funcione.

## El método, en orden

1. **Ponte en el papel de quien usa la pantalla.** Mesero con prisa, cajero con dinero en la mano, dueño que abre el teléfono, comensal desde un QR. Di en una frase a qué entra esa persona.
2. **Cuenta cada toque** hasta lograr eso. Si un paso no decide nada (una pantalla vacía de paso, un «Aceptar» sin alternativa), sobra.
3. **Mide dónde empieza lo que vino a ver.** En el teléfono, lo principal debe empezar en el primer tercio de la pantalla. Si antes hay más de dos filas de mandos, hay que quitar.
4. **Por cada elemento fijo, pregunta: ¿se usa en cada visita?**
   - Sí → se queda a la vista.
   - A veces → va a una hoja de filtros, a «⋯» o a la búsqueda.
   - Casi nunca, o no sirve en ese aparato → desaparece ahí.
5. **Mira la pantalla real** (390 px y 1280 px, claro y oscuro) antes de opinar y antes de decir «listo». El código no dice cómo se ve.
6. **Cambio visual nuevo = maqueta primero.** Antes y propuesta lado a lado, con datos realistas, la medida de dónde empieza el contenido y las decisiones que le tocan al dueño. Se construye solo con su visto bueno. Van en `docs/diseno/MAQUETA_<TEMA>_<AAAA-MM-DD>.html`.
7. **Construye, comprueba en pantalla, corre las pruebas** y deja anotado lo que no se comprobó.

## Reglas que salen de ahí

- **Una fila de mandos** sobre el contenido y, si hace falta, una de filtros. No más.
- **Ningún título repite la barra superior.** Si la barra dice «Pedidos», la página no vuelve a decir «Pedidos en vivo».
- **Nada se anuncia cuando va bien.** «En línea», «Sin incidencias», «Todo al día»: el estado toma sitio solo cuando hay algo que atender.
- **Nada en cero.** Un resumen «0 por enviar · Q0.00» o un contador vacío no se pinta.
- **Ningún pie fijo para una acción ocasional.** El pie fijo es para la acción principal del momento (enviar a cocina, cobrar).
- **Lo hecho no se enseña.** Una guía de pasos muestra el que falta; los completados se ven al abrirla.
- **La fila entera es el botón.** Si tocar una fila abre el detalle, no lleva además un botón «Editar».
- **Un aviso que es un filtro, es un filtro.** «3 agotados» es una píldora en la fila de categorías, no una tarjeta encima.
- **Quien trabaja elige cómo ver** cuando hay dos maneras válidas (plano o mesas) y el aparato lo recuerda.
- **Paridad:** lo que puede hacer el comensal, lo puede hacer el mesero con las mismas reglas (ejemplo: `plataforma/src/lib/menu/opciones.ts`).
- **Quitar del primer plano no es quitar la función.** Todo lo que sale de la vista debe seguir alcanzable en uno o dos toques.
- **Superficies sólidas y colores del sistema.** Nada translúcido ni grises fijos que ignoren el tema o la paleta del restaurante.
- Objetivos táctiles de 44–48 px, texto mínimo de 12 px, dinero con cifras tabulares.

## Dónde está lo demás

- Tokens, componentes y decisiones aprobadas: `.claude/skills/leogin-diseno/SKILL.md` y `docs/diseno/SISTEMA_VISUAL_2026-11-05.md`.
- Ejemplo completo del método: `docs/diseno/MAQUETA_NADA_SATURADO_2026-11-10.html` (Pedidos, Catálogo y Hoy) y el PR #110.
- Flujo de ramas, commits y PR: `docs/guias/FLUJO_GIT.md`.
