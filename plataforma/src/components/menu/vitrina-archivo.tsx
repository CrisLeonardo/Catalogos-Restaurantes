'use client';

/* Archivo de ediciones y «Próximo drop» (Vitrina en modo lanzamiento).
   Maqueta: docs/diseno/vitrina/maqueta.html, secciones «Archivo» y la
   tarjeta borrosa del próximo drop.

   El archivo vende aunque ya no se pueda comprar: cada edición pasada sale en
   gris con cuánto duró («Agotado en 3 h 12 min»). Es la prueba de que aquí
   las cosas se acaban. */

import AssetImage from '@/components/asset-image';
import { useThemeContent } from '@/lib/theme/context';
import { duracionCorta, fechaCorta } from '@/lib/vitrina/edicion';
import type { EdicionArchivada } from '@/lib/db/vitrina';

function leyenda(e: EdicionArchivada): string {
  const cierra = new Date(e.closesAt).getTime();
  if (e.soldOutAt) {
    const agotada = new Date(e.soldOutAt).getTime();
    return e.opensAt
      ? `Agotado en ${duracionCorta(agotada - new Date(e.opensAt).getTime())}`
      : `Agotado el ${fechaCorta(agotada)}`;
  }
  return `Cerró el ${fechaCorta(cierra)}`;
}

export default function VitrinaArchivo({ archivo, avisame, foto }: {
  archivo: EdicionArchivada[];
  /** wa.me con «avísame cuando salga {próximo}», o null sin WhatsApp. */
  avisame: string | null;
  /** Foto (borrosa) para la tarjeta del próximo drop. */
  foto: string | null;
}) {
  const content = useThemeContent();
  const proximo = content.vitrina.nextTitle.trim();
  if (archivo.length === 0 && !proximo) return null;

  return (
    <section className="m-varch" aria-label="Ediciones">
      {archivo.length > 0 && (
        <>
          <h2 className="t-poster m-varch-title">Archivo</h2>
          <p className="m-varch-sub">Ediciones anteriores.</p>
          <div className="m-varch-row u-noscroll">
            {archivo.map((e) => (
              <figure key={e.id}>
                <div className="m-varch-ph" data-agotada={e.soldOutAt ? '1' : undefined}>
                  {e.image && <AssetImage src={e.image} alt={e.title} fill sizes="240px" style={{ objectFit: 'cover' }} />}
                </div>
                <figcaption>
                  <b>{e.title}</b>
                  {leyenda(e)}
                </figcaption>
              </figure>
            ))}
          </div>
        </>
      )}

      {proximo && (
        <div className="m-vnext">
          {foto && (
            <div aria-hidden className="m-vnext-bg">
              <AssetImage src={foto} alt="" fill sizes="480px" style={{ objectFit: 'cover' }} />
            </div>
          )}
          <div className="m-vnext-in">
            <span className="m-vitrina-kicker">Próximo</span>
            <span className="m-vnext-title">{proximo}</span>
            {content.vitrina.nextDate.trim() && <span className="m-vnext-date">{content.vitrina.nextDate}</span>}
            {avisame && (
              <a className="press m-vitrina-ghost" href={avisame} target="_blank" rel="noopener noreferrer">
                Avísame por WhatsApp
              </a>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
