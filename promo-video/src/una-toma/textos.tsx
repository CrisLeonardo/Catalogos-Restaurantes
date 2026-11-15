// Los textos sobre la toma: una línea chica que da contexto y una palabra
// grande que cambia al ritmo de cada toque. Se leen sin sonido.
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { clamp, degradado, easeIn, easeOut, lerp, prog, T, useFormato } from './base';
import { fuente } from '../marca';

type Grupo = { de: number; a: number; chica?: string; grandes: { en: number; texto: string; acento?: boolean }[]; extra?: { en: number; texto: string } };

const me = T.mesero, co = T.cocina, ca = T.caja, du = T.duenio, re = T.revela;
const GRUPOS: Grupo[] = [
  { de: T.drop + 6, a: me.sale + 10, chica: 'El mesero', grandes: [
    { en: T.drop + 10, texto: 'toca.', acento: true },
    { en: me.tapMedio, texto: 'elige.' },
    { en: me.notaDesde, texto: 'anota.' },
    { en: me.tapEnviar, texto: 'envía.', acento: true },
  ] },
  { de: co.llega - 2, a: co.acerca + 30, chica: 'Llega a cocina', grandes: [{ en: co.llega + 4, texto: 'al instante.', acento: true }] },
  { de: co.acerca + 30, a: co.sale + 6, chica: 'Y se lee', grandes: [{ en: co.acerca + 36, texto: 'clarito.', acento: true }] },
  { de: ca.llega - 2, a: ca.corte + 18, chica: 'En caja', grandes: [{ en: ca.llega + 6, texto: 'cobras.', acento: true }] },
  { de: ca.corte + 18, a: ca.sale + 8, chica: 'Y al cerrar', grandes: [{ en: ca.corte + 22, texto: 'cuenta…' }, { en: ca.cuadra, texto: 'cuadra.', acento: true }] },
  { de: du.llega - 4, a: re.inicio, chica: 'Y tú', grandes: [{ en: du.llega, texto: 'lo ves todo.', acento: true }], extra: { en: du.suma + 12, texto: 'desde donde estés.' } },
];

const Grande: React.FC<{ texto: string; acento?: boolean; en: number; sale: number; tam: number }> = ({ texto, acento, en, sale, tam }) => {
  const f = useCurrentFrame();
  const t = easeOut(prog(f, en, en + 7));
  const s = easeIn(prog(f, sale, sale + 5));
  if (t <= 0 || s >= 1) return null;
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, whiteSpace: 'nowrap', fontFamily: fuente.titular, fontWeight: 800, fontSize: tam, letterSpacing: -tam * 0.035, lineHeight: 1.05, transform: `translateY(${(1 - t) * 40 - s * 40}px) scale(${lerp(1.12, 1, t)})`, transformOrigin: 'left bottom', opacity: t * (1 - s), filter: `blur(${(1 - t) * 10 + s * 8}px)`, ...(acento ? { background: degradado, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' } : { color: '#fff' }) }}>
      {texto}
    </div>
  );
};

export const Textos: React.FC = () => {
  const f = useCurrentFrame();
  const { vertical } = useFormato();
  const tamG = vertical ? 112 : 104;
  const tamC = vertical ? 50 : 46;
  const pos = vertical ? { left: 72, top: 150 } : { left: 110, top: 360 };
  return (
    <>
      {GRUPOS.filter((g) => f >= g.de - 2 && f < g.a + 6).map((g) => {
        const entra = easeOut(prog(f, g.de, g.de + 8));
        const sale = easeIn(prog(f, g.a - 4, g.a + 4));
        return (
          <div key={g.de} style={{ position: 'absolute', ...pos, width: vertical ? 960 : 760, textShadow: '0 4px 30px rgba(0,0,0,.5)' }}>
            {g.chica && (
              <div style={{ fontFamily: fuente.texto, fontWeight: 600, fontSize: tamC, color: 'rgba(255,255,255,.78)', transform: `translateY(${(1 - entra) * 20 - sale * 20}px)`, opacity: entra * (1 - sale), letterSpacing: -0.5 }}>{g.chica}</div>
            )}
            <div style={{ position: 'relative', height: tamG * 1.15, marginTop: 4 }}>
              {g.grandes.map((p, i) => (
                <Grande key={p.en} {...p} tam={tamG} sale={i < g.grandes.length - 1 ? g.grandes[i + 1].en - 3 : g.a - 3} />
              ))}
            </div>
            {g.extra && (
              <div style={{ fontFamily: fuente.texto, fontWeight: 600, fontSize: tamC, color: '#fff', marginTop: 10, opacity: clamp(prog(f, g.extra.en, g.extra.en + 8)) * (1 - sale), transform: `translateY(${(1 - easeOut(prog(f, g.extra.en, g.extra.en + 8))) * 20}px)` }}>{g.extra.texto}</div>
            )}
          </div>
        );
      })}
      {/* Revelación: el remate */}
      {f >= re.golpe - 2 && f < re.aLogo + 8 && (
        <div style={{ position: 'absolute', ...(vertical ? { left: 72, top: 150 } : { left: 110, top: 330 }), fontFamily: fuente.titular, fontWeight: 800, fontSize: vertical ? 104 : 80, letterSpacing: -3, lineHeight: 1.08, opacity: 1 - prog(f, re.aLogo - 2, re.aLogo + 8), textShadow: '0 4px 30px rgba(0,0,0,.5)' }}>
          {[
            { en: re.golpe, t: 'Nadie adivina.', acento: false },
            { en: re.golpe + 22, t: 'Todo cuadra.', acento: true },
          ].map((l) => {
            const t = easeOut(prog(f, l.en, l.en + 8));
            return (
              <div key={l.t} style={{ opacity: t, transform: `translateY(${(1 - t) * 36}px) scale(${lerp(1.1, 1, t)})`, transformOrigin: 'left bottom', filter: `blur(${(1 - t) * 10}px)`, ...(l.acento ? { background: degradado, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' } : { color: '#fff' }) }}>{l.t}</div>
            );
          })}
        </div>
      )}
    </>
  );
};
