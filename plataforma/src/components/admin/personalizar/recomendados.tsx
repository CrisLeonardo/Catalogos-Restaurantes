'use client';

/* «Recomendados para tu carta» (ficha 2.7): tres composiciones completas
   elegidas por `lib/theme/recomendaciones.ts`, pintadas con la carta real y
   aplicables con un toque. El catálogo completo sigue un nivel más adentro. */

import { useMemo, type ReactNode } from 'react';
import { Icon } from '@/components/icons';
import { MiniCarta, type PlatoMuestra } from '@/components/admin/personalizar/muestra';
import { esElActual, recomendaciones, type SenalesDeCarta } from '@/lib/theme/recomendaciones';
import type { BuiltinTemplate } from '@/lib/theme/templates';
import type { ThemeConfig } from '@/lib/theme/defaults';
import s from './recomendados.module.css';

function porQue({ total, conFoto }: SenalesDeCarta): string {
  if (total === 0) return 'Cuando agregues platillos, las muestras usarán los tuyos.';
  const base = `${conFoto} de tus ${total} platillos ${conFoto === 1 ? 'tiene' : 'tienen'} foto`;
  const r = conFoto / total;
  if (r >= 0.6) return `${base}: lúcelas.`;
  if (r >= 0.25) return `${base}: te conviene una carta con miniaturas.`;
  return `${base}: una carta de texto se verá mejor.`;
}

export default function Recomendados({ senales, platos, nombre, logo, config, appliedId, onApply, acciones }: {
  senales: SenalesDeCarta;
  platos: PlatoMuestra[];
  nombre: string;
  logo: string | null;
  config: ThemeConfig;
  appliedId: string | null;
  onApply: (tpl: BuiltinTemplate) => void;
  /** El «⋯» de la sección: guardar como plantilla, volver al anterior. */
  acciones?: ReactNode;
}) {
  const recs = useMemo(() => recomendaciones(senales), [senales]);

  return (
    <section className={s.bloque} aria-labelledby="recomendados-titulo">
      <div className={s.cabeza}>
        <div className="min-w-0 flex-1">
          <h2 id="recomendados-titulo" className={s.titulo}>Recomendados para tu carta</h2>
          <p className={s.porque}>{porQue(senales)}</p>
        </div>
        {acciones}
      </div>
      <div className={s.lista}>
        {recs.map((r, i) => {
          const actual = esElActual(config, r.plantilla);
          const aplicado = appliedId === r.plantilla.id;
          return (
            <article key={r.clave} className={s.tarjeta} data-on={actual || aplicado ? '1' : undefined}>
              <MiniCarta config={r.plantilla.config} platos={platos} nombre={nombre} logo={logo} />
              <div className={s.pie}>
                <div className="min-w-0 flex-1">
                  <h3 className={s.nombre}>{r.titulo}{i === 0 && <span className={s.marca}>Recomendado</span>}</h3>
                  <p className={s.desc}>{r.desc}</p>
                </div>
                {aplicado ? (
                  <span className={s.estado}><Icon name="checkCircle" size={14} /> Aplicado</span>
                ) : actual ? (
                  <span className={s.estado} data-tono="neutro">El tuyo hoy</span>
                ) : (
                  <button type="button" className={s.usar} onClick={() => onApply(r.plantilla)}
                    aria-label={`Usar el diseño «${r.titulo}»`}>
                    Usar este
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
