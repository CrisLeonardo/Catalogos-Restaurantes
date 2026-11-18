import { redirect } from 'next/navigation';

/* Comparativa se fundió en Finanzas como «Por restaurante» (línea N «nada
   saturado», 2026-11-18). La ruta reenvía con el mismo rango. */
const isYmd = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function ComparativaPage({
  searchParams,
}: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { from, to } = await searchParams;
  redirect(isYmd(from) && isYmd(to) ? `/mi-cuenta/finanzas?from=${from}&to=${to}` : '/mi-cuenta/finanzas');
}
