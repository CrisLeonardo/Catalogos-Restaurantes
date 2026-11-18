'use client';

/* Encuestas. Línea N «nada saturado» (maqueta aprobada el 2026-11-18:
   docs/diseno/MAQUETA_PROMOCIONES_NADA_SATURADO_2026-11-18.html).

   El promedio y la distribución caben en una tarjeta; debajo, lo que
   dijeron los clientes en una lista sólida. «Con comentario» y «3 o menos»
   solo aparecen cuando hay alguna. En la PC, el resumen va a la izquierda. */

import { useState } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import type { OrderRating, RatingsSummary } from '@/lib/db/encuestas';
import type { EstadoLectura } from '@/lib/db/lectura';
import AvisoLectura from '@/components/admin/aviso-lectura';
import s from './fidelidad.module.css';

interface Props {
  ratings: OrderRating[];
  summary: RatingsSummary;
  /** Con `error`, ni el promedio ni «Aún no hay reseñas» son ciertos: no se pintan. */
  estado: EstadoLectura;
  leidoEn: string;
}

type Filtro = 'todas' | 'comentario' | 'bajas';
const POR_PAGINA = 20;

function Estrellas({ valor, size = 14 }: { valor: number; size?: number }) {
  const llenas = Math.round(valor);
  return (
    <span className={s.estrellas} role="img" aria-label={`${llenas} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
          fill={n <= llenas ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </span>
  );
}

const respuestas = (n: number) => `${n.toLocaleString('es-GT')} ${n === 1 ? 'respuesta' : 'respuestas'}`;

export default function EncuestasPanel({ ratings, summary, estado, leidoEn }: Props) {
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [cuantas, setCuantas] = useState(POR_PAGINA);

  if (estado === 'error') {
    return (
      <AvisoLectura
        estado="error"
        que="las encuestas"
        noConcluir="No significa que no tengas reseñas ni que el promedio sea cero."
        leidoEn={leidoEn}
        sinDatos
      />
    );
  }

  if (summary.total === 0) {
    return (
      <div className={s.panel}>
        <EmptyState
          icon="thumbsUp"
          title="Aún no hay respuestas"
          desc="Quien pide desde su celular ve una encuesta de menos de 30 segundos al terminar. Sus calificaciones aparecerán aquí."
          action={{ label: 'Comparte tu código QR', href: '/admin/qr', icon: null }}
        />
      </div>
    );
  }

  const conComentario = ratings.filter((r) => r.comment?.trim());
  const bajas = ratings.filter((r) => r.rating <= 3);
  const lista = filtro === 'comentario' ? conComentario : filtro === 'bajas' ? bajas : ratings;
  const visibles = lista.slice(0, cuantas);
  const maximo = Math.max(1, ...Object.values(summary.distribution));
  const pildoras: { valor: Filtro; texto: string; cuenta: number }[] = [
    { valor: 'todas', texto: 'Todas', cuenta: summary.total },
    ...(conComentario.length > 0 ? [{ valor: 'comentario' as const, texto: 'Con comentario', cuenta: conComentario.length }] : []),
    ...(bajas.length > 0 ? [{ valor: 'bajas' as const, texto: '3 o menos', cuenta: bajas.length }] : []),
  ];

  return (
    <div className={`${s.panel} ${s.panelAncho}`}>
      <div className={s.encuestas}>
        <section className={`${s.tarjeta} ${s.resumen}`} aria-label="Resumen de las encuestas">
          <div className={s.promedio}>
            <b>{summary.average.toFixed(1)}</b>
            <Estrellas valor={summary.average} />
            <span>{respuestas(summary.total)}</span>
            <span>{summary.thisMonth === 0 ? 'ninguna este mes' : `${summary.thisMonth} este mes`}</span>
          </div>
          <ul className={s.distribucion} aria-label="Respuestas por estrellas">
            {([5, 4, 3, 2, 1] as const).map((n) => (
              <li key={n}>
                <span>{n}</span>
                <span className={s.barra} aria-hidden="true"><i style={{ width: `${(summary.distribution[n] / maximo) * 100}%` }} /></span>
                <span><span className="sr-only">{n} estrellas: </span>{summary.distribution[n]}</span>
              </li>
            ))}
          </ul>
          <details className={s.privacidad}>
            <summary>¿Quién ve el nombre?</summary>
            <p>
              La encuesta no es anónima: si el cliente dejó su nombre en el pedido, lo ves junto a su calificación para
              poder darle seguimiento, y así se le dice antes de responder.
            </p>
          </details>
        </section>

        <div className={s.panel}>
          {pildoras.length > 1 && (
            <div className={s.pildoras} role="group" aria-label="Filtrar respuestas">
              {pildoras.map((p) => (
                <button key={p.valor} type="button" className={s.pildora} aria-pressed={filtro === p.valor}
                  onClick={() => { setFiltro(p.valor); setCuantas(POR_PAGINA); }}>
                  {p.texto}<em>{p.cuenta}</em>
                </button>
              ))}
            </div>
          )}
          <ul className={`${s.tarjeta} ${s.lista}`}>
            {visibles.map((r) => (
              <li key={r.id} className={s.resena} data-baja={r.rating <= 2 ? '' : undefined}>
                <header>
                  <Estrellas valor={r.rating} />
                  <b>{r.customer_name || 'Sin nombre'}</b>
                  <time dateTime={r.created_at}>{new Date(r.created_at).toLocaleDateString('es-GT', { day: 'numeric', month: 'short' })}</time>
                </header>
                {r.comment?.trim() && <p>«{r.comment.trim()}»</p>}
              </li>
            ))}
          </ul>
          {lista.length > cuantas && (
            <button type="button" className={s.mas} onClick={() => setCuantas((n) => n + POR_PAGINA)}>
              Ver {Math.min(POR_PAGINA, lista.length - cuantas)} más
            </button>
          )}
          {filtro === 'todas' && ratings.length < summary.total && lista.length <= cuantas && (
            <p className={s.hojaResumen}>Se muestran las {ratings.length} más recientes de {summary.total}.</p>
          )}
        </div>
      </div>
    </div>
  );
}
