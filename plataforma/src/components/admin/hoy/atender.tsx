import { List, ListLink, ListText, StatusDot, type Tone } from '@/components/ui/list';
import { MAX_EXCEPCIONES, type Excepcion, type NivelAviso } from '@/lib/hoy-etapa';

/* «Atender» (fichas 2.1, R01.3–4): lo primero de Hoy y solo si hay algo.
   Hasta tres filas a la vista; el resto en «Ver N más», que se abre sin
   salir de la pantalla. Nunca se pinta un «Todo bien». */

const TONO: Record<NivelAviso, Tone> = { urgente: 'danger', aviso: 'warn', info: 'neutral' };

function Fila({ e, href }: { e: Excepcion; href: string }) {
  return (
    <ListLink href={href}>
      <StatusDot tone={TONO[e.nivel]} size={9} />
      <ListText title={e.titulo} desc={e.detalle} />
      <span className="shrink-0 text-[13px] font-semibold text-adm-accent-ink">{e.accion}</span>
    </ListLink>
  );
}

export function Atender({ lista, href }: { lista: Excepcion[]; href: (ruta: string) => string }) {
  if (lista.length === 0) return null;
  const vista = lista.slice(0, MAX_EXCEPCIONES);
  const resto = lista.slice(MAX_EXCEPCIONES);
  return (
    <section aria-label="Necesita tu atención" className="min-w-0">
      <List>
        {vista.map((e) => <Fila key={e.key} e={e} href={href(e.ruta)} />)}
        {resto.length > 0 && (
          <details className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 text-[13px] font-semibold text-adm-accent-ink [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">Ver {resto.length} más</span>
              <span className="hidden group-open:inline">Ver menos</span>
            </summary>
            <div className="[&>*]:border-t [&>*]:border-adm-border">
              {resto.map((e) => <Fila key={e.key} e={e} href={href(e.ruta)} />)}
            </div>
          </details>
        )}
      </List>
    </section>
  );
}
