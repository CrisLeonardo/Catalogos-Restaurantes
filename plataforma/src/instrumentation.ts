import type { Instrumentation } from 'next';

/**
 * Todo error del servidor —una página, una acción, una ruta de API o el
 * proxy— pasa por aquí (Next lo llama solo). Se manda a Sentry si
 * `SENTRY_DSN` está puesta; si no, no hace nada. PLAN_ACCESO_Y_MONITOREO,
 * MON-01.
 *
 * Va la ruta PLANTILLA (`context.routePath`, p. ej. `/pedido/[token]`), no
 * `request.path`: varias direcciones llevan dentro algo que da acceso.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (!process.env.SENTRY_DSN) return;
  const { reportarError } = await import('@/lib/observability/sentry');
  const e = err as Error & { digest?: string };
  await reportarError({
    tipo: e.name,
    mensaje: e.message,
    stack: e.stack,
    origen: context.routeType,
    ruta: context.routePath,
    metodo: request.method,
    digest: e.digest,
  });
};
