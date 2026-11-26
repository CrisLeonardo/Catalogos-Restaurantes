'use client';

/* ============================================================
   ¿QUÉ PLAN TE CONVIENE? — portada y /planes (fichas V.3, línea N)
   ------------------------------------------------------------
   Maqueta aprobada el 2026-11-18
   (docs/diseno/MAQUETA_WEB_PUBLICA_NADA_SATURADO_2026-11-18.html).

   Antes eran cuatro tarjetas largas que había que leer enteras para saber
   cuál tocaba. Ahora: cómo te piden (y, si es para llevar, si pasas de 300
   pedidos al mes) marca el plan, con la MISMA regla que el alta
   (`planParaTuCaso`, lib/alta.ts). Los cuatro caben en una tarjeta, con el
   precio en una sola línea (F04). Si prefieres otro, se respeta: el botón
   lleva al registro, que vuelve a preguntar.
   ============================================================ */

import { useState } from 'react';
import Link from 'next/link';
import { conEvento, EVENTOS } from '@/lib/analytics';
import { enlaceDeAlta, planParaTuCaso, type CasoDeLaWeb, type PlanAlta } from '@/lib/alta';
import { guardarPerfil } from '@/lib/perfil-negocio';
import s from './landing-planes.module.css';

export type PlanDeLaWeb = {
  code: PlanAlta;
  nombre: string;
  /** «Gratis» o «Q99». */
  precio: string;
  gratis: boolean;
  /** Una línea: lo que trae. */
  resumen: string;
};

const CASOS: { valor: CasoDeLaWeb; texto: string }[] = [
  { valor: 'carta', texto: 'Solo quiero mi carta' },
  { valor: 'llevar', texto: 'Para llevar o a domicilio' },
  { valor: 'mostrador', texto: 'En mostrador' },
  { valor: 'mesas', texto: 'En mesas con mesero' },
];

export function PlanPorPreguntas({ planes, origen, contacto, trialDays = 0 }: {
  planes: PlanDeLaWeb[];
  origen: 'portada' | 'planes';
  trialDays?: number;
  /** Canal de ventas real (site-chrome): «¿Dudas? Escríbenos por correo» bajo
      el botón, donde se decide el plan (WEB-UX-06). Lo pasa la página porque
      la configuración del canal vive en el servidor. */
  contacto?: { href: string; via: string };
}) {
  const [caso, setCaso] = useState<CasoDeLaWeb | null>(null);
  const [mas300, setMas300] = useState(false);
  const elegido = caso ? planParaTuCaso(caso, mas300) : null;
  const plan = planes.find((p) => p.code === elegido) ?? null;

  return (
    <div className={`lp-card ${s.caja}`}>
      <fieldset className={s.pregunta}>
        <legend>¿Cómo te piden tus clientes?</legend>
        <div className={s.opciones}>
          {CASOS.map((c) => (
            <button key={c.valor} type="button" className={s.opcion} aria-pressed={caso === c.valor} onClick={() => setCaso(c.valor)}>
              {c.texto}
            </button>
          ))}
        </div>
      </fieldset>

      {caso === 'llevar' && (
        <fieldset className={s.pregunta}>
          <legend>¿Más de 300 pedidos al mes?</legend>
          <div className={s.opciones}>
            <button type="button" className={s.opcion} aria-pressed={!mas300} onClick={() => setMas300(false)}>No</button>
            <button type="button" className={s.opcion} aria-pressed={mas300} onClick={() => setMas300(true)}>Sí</button>
          </div>
        </fieldset>
      )}

      <ul className={s.lista} aria-live="polite">
        {planes.map((p) => (
          <li key={p.code} className={s.plan} data-elegido={p.code === elegido ? '' : undefined}>
            <span className={s.nombre}>
              {p.nombre}
              {p.code === elegido && <em> · para ti</em>}
            </span>
            <span className={s.precio}><span>{p.precio}</span>{!p.gratis && <small> /mes</small>}</span>
            <span className={s.resumen}>{p.resumen}</span>
          </li>
        ))}
      </ul>

      {/* El plan y el caso viajan en el enlace hasta el alta (LZ-11).
          En línea además deja el perfil 'en-linea' de respaldo
          (lib/perfil-negocio.ts), igual que su página. */}
      <Link
        href={enlaceDeAlta(caso && elegido ? { plan: elegido, caso } : null)}
        {...conEvento(`lp-btn lp-btn-lg lp-btn-primary ${s.cta}`, EVENTOS.clicCrear, `${origen} · ${plan?.nombre ?? 'sin plan'}`)}
        onClick={elegido === 'EN_LINEA' ? () => guardarPerfil('en-linea') : undefined}
      >
        {plan ? (plan.gratis ? 'Empezar gratis con Básico' : trialDays > 0 ? 'Iniciar prueba' : `Empezar con ${plan.nombre}`) : 'Crear mi restaurante'}
      </Link>
      {plan && !plan.gratis && trialDays > 0 && (
        <p className={s.mas}>{trialDays} días gratis. Empieza sin tarjeta.</p>
      )}
      {origen === 'portada' && (
        <Link href="/planes#comparativa" className={s.mas}>Ver los cuatro planes lado a lado →</Link>
      )}
      {contacto && (
        <a href={contacto.href} target="_blank" rel="noopener noreferrer" className={s.mas}>
          ¿Dudas? Escríbenos {contacto.via}
        </a>
      )}
    </div>
  );
}
