'use client';

/* EL SALÓN — tres maneras de mirar el mismo local.
   ------------------------------------------------------------------
   · RIEL    — la columna de tablet/PC. Filas horizontales, una debajo
               de otra, con el total a la derecha.
   · FICHAS  — la rejilla del teléfono y de la pantalla de Mesas.
   · PLANO   — las mesas donde de verdad están, si el dueño dibujó el
               local en Ajustes › Salón.

   Las tres consumen `MesaServicio` y nada más: el color, el subtítulo y
   el orden los decide `lib/servicio/estado.ts`, para que no puedan
   contar historias distintas. Es la misma regla que sostenía el salón
   anterior, y es la que impide que el plano diga «Comiendo» donde la
   ficha dice «Falta servir».

   El PLANO no venía en el handoff. El primero encogía el lienzo hasta
   caber —mesas de dieciocho píxeles— y el segundo hizo lo contrario,
   un ancho mínimo que obligaba a arrastrar de lado. Ahora el plano cabe
   (se encuadra y, en pantalla vertical, se gira), las mesas miden lo que
   permite su vecina más cercana con suelo táctil, y se acerca con dos
   dedos: ver components/admin/salon/plano-visor.tsx. */

import { useMemo } from 'react';
import { Icon } from '@/components/icons';
import { ChipEstado, ChipMano, Mono } from '@/components/admin/servicio/pieces';
import { FIXTURE_META, fixtureLabel } from '@/components/admin/salon/fixtures';
import PlanoVisor from '@/components/admin/salon/plano-visor';
import { ESTADO_LABEL, subtituloDeMesa, type MesaServicio } from '@/lib/servicio/estado';
import { fmtMinShort } from '@/lib/table-state';
import type { FloorPlan } from '@/lib/theme/defaults';

export interface SalonProps {
  mesas: MesaServicio[];
  /** La mesa abierta ahora mismo. */
  sel: number | null;
  onPick: (n: number) => void;
  money: (n: number) => string;
}

/* ════════════════════════════════════════════════════════════
   RIEL (tablet y PC)
   ════════════════════════════════════════════════════════════ */

/**
 * En el riel de 232 px el subtítulo largo se parte en dos renglones y
 * engorda las cuarenta filas de golpe, así que ahí se abrevia y el chip
 * de estado se cae: lo que dice el chip ya lo dice el subtítulo corto.
 */
export function SalonRiel({ mesas, sel, onPick, money, estrecho }: SalonProps & { estrecho: boolean }) {
  return (
    <>
      {mesas.map((m) => (
        <button
          key={m.n}
          type="button"
          className="sv-mesa"
          data-st={m.estado}
          data-on={m.n === sel ? '1' : '0'}
          aria-pressed={m.n === sel}
          onClick={() => onPick(m.n)}
        >
          <span className="sv-mesa-n">{m.n}</span>
          {/* Dos renglones (PED-13, maqueta D-2): arriba el nombre y el
              estado; abajo «3 min · 3 platos» y el total. Antes el total y
              el chip se apilaban a la derecha y le comían el ancho al
              subtítulo, que salía «3 min · 3 pl…». */}
          <span className="sv-mesa-id">
            <span className="sv-mesa-row">
              <span className="sv-mesa-title">{m.etiqueta}</span>
              {m.atencion
                ? <ChipMano atencion={m.atencion} corto />
                : (!estrecho && m.estado !== 'libre' && <ChipEstado estado={m.estado} />)}
            </span>
            <span className="sv-mesa-row">
              <span className="sv-mesa-sub">{subtituloDeMesa(m, estrecho)}</span>
              {m.saldo > 0 && <span className="sv-mesa-total">{money(m.saldo)}</span>}
            </span>
          </span>
        </button>
      ))}
    </>
  );
}

/* ════════════════════════════════════════════════════════════
   FICHAS (teléfono y pantalla de Mesas)
   ════════════════════════════════════════════════════════════ */

export function SalonFichas({ mesas, sel, onPick, money }: SalonProps) {
  return (
    <div className="sv-grid">
      {mesas.map((m) => (
        <button
          key={m.n}
          type="button"
          className="sv-card"
          data-st={m.estado}
          data-on={m.n === sel ? '1' : '0'}
          aria-pressed={m.n === sel}
          onClick={() => onPick(m.n)}
        >
          <span className="sv-card-top">
            <span className="sv-card-n">{m.n}</span>
            {m.atencion ? <ChipMano atencion={m.atencion} corto /> : <ChipEstado estado={m.estado} big />}
          </span>
          <span style={{ display: 'block', textAlign: 'left' }}>
            {/* El alias del plano («Terraza 2») y el nombre que alguien le
                puso esta noche («cumpleaños de Sofi») son cosas distintas y
                caben las dos: el primero identifica la mesa, el segundo
                identifica a la gente. */}
            {(m.nombre || m.alias) && (
              <span className="sv-card-name">{m.nombre || m.alias}</span>
            )}
            <span className="sv-card-sub">{subtituloDeMesa(m)}</span>
            {m.estado === 'cocina' && m.pagada && <span className="sv-card-sub">Pagada</span>}
            {m.reserva && <span className="sv-card-sub">Reserva {m.reserva.hora}</span>}
          </span>
          {m.saldo > 0 && <span className="sv-card-total">{money(m.saldo)}</span>}
        </button>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   PLANO
   ════════════════════════════════════════════════════════════ */

/** ¿Hay plano que enseñar? Sin mesas colocadas, el plano está vacío. */
export function hayPlano(floorPlan: FloorPlan | null): boolean {
  return !!floorPlan?.enabled && floorPlan.tables.length > 0;
}

/** Los niveles que de verdad tienen algo dibujado. */
export function nivelesConMesas(floorPlan: FloorPlan | null): { id: string; name: string }[] {
  if (!floorPlan?.enabled) return [];
  const usados = new Set([
    ...floorPlan.tables.map((t) => t.level),
    ...(floorPlan.fixtures ?? []).map((f) => f.level),
  ]);
  return floorPlan.levels.filter((l) => usados.has(l.id));
}

/** Cuántas mesas de cada nivel tienen gente, para las pestañas de zona. */
export function ocupacionPorNivel(floorPlan: FloorPlan, mesas: MesaServicio[]): Map<string, { con: number; total: number }> {
  const porNumero = new Map(mesas.map((m) => [m.n, m]));
  const out = new Map<string, { con: number; total: number }>();
  for (const t of floorPlan.tables) {
    const m = porNumero.get(t.n);
    if (!m) continue;
    const c = out.get(t.level) ?? { con: 0, total: 0 };
    c.total += 1;
    if (m.estado !== 'libre') c.con += 1;
    out.set(t.level, c);
  }
  return out;
}

/* El encuadre, el giro en pantallas verticales, el tamaño de las mesas
   y el zoom los decide `PlanoVisor`, el mismo de Pedidos › Mesas. Este
   plano dibujaba en 4:3 cuando el editor guarda en 16:10 (el local salía
   estirado) y tenía 460 px de ancho mínimo en el teléfono. */
export function SalonPlano({
  mesas, sel, onPick, money, floorPlan, nivel,
}: SalonProps & { floorPlan: FloorPlan; nivel: string }) {
  const porNumero = useMemo(() => new Map(mesas.map((m) => [m.n, m])), [mesas]);
  const colocadas = useMemo(
    () => floorPlan.tables.filter((t) => t.level === nivel && porNumero.has(t.n)),
    [floorPlan, nivel, porNumero],
  );
  const forma = useMemo(() => new Map(colocadas.map((t) => [t.n, t.shape ?? 'square'])), [colocadas]);
  const fixtures = useMemo(() => (floorPlan.fixtures ?? []).filter((f) => f.level === nivel), [floorPlan, nivel]);

  /* Las que el dueño NO colocó no desaparecen: una mesa con gente que no
     esté en el plano seguiría teniendo dinero dentro, y esconderla es el
     hallazgo M-03 otra vez con otra forma. */
  const colocadasN = new Set(floorPlan.tables.map((t) => t.n));
  const sueltas = mesas.filter((m) => !colocadasN.has(m.n));

  return (
    <div className="sv-plano-wrap">
      <PlanoVisor
        className="sv-plano-visor"
        colocadas={colocadas}
        zonas={fixtures}
        mesaMax={84}
        claveGiro="leogin:plano-giro:servicio"
        renderZona={(f) => (
          <div className="sv-plano-fix">
            <Icon name={FIXTURE_META[f.kind].icon} size={13} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fixtureLabel(f)}</span>
          </div>
        )}
        renderMesa={(n, geo) => {
          const m = porNumero.get(n);
          if (!m) return null;
          const estado = m.estado === 'cocina' && m.pagada ? 'Por entregar · Pagada' : ESTADO_LABEL[m.estado];
          const sub = [m.personas ? `${m.personas} p.` : null, m.minutos != null ? fmtMinShort(m.minutos) : null]
            .filter(Boolean).join(' · ');
          const descripcion = [`Mesa ${m.n}`, estado, subtituloDeMesa(m), m.saldo > 0 ? `Saldo ${money(m.saldo)}` : null,
            m.reserva ? `Reserva a las ${m.reserva.hora}` : null]
            .filter(Boolean).join(' · ');
          return (
            <button
              type="button"
              className="sv-plano-mesa"
              data-st={m.estado}
              data-shape={forma.get(n)}
              data-dens={geo.densidad}
              data-on={m.n === sel ? '1' : '0'}
              title={descripcion}
              aria-label={descripcion}
              aria-pressed={m.n === sel}
              onClick={() => onPick(m.n)}
            >
              <span className="sv-plano-n">{m.n}</span>
              {geo.densidad !== 'mini' && (
                <>
                  <span className="sv-plano-sub">{ESTADO_LABEL[m.estado]}</span>
                  {m.estado === 'cocina' && m.pagada && <span className="sv-plano-sub">Pagada</span>}
                  {sub && <span className="sv-plano-total">{sub}</span>}
                  {m.saldo > 0 && <span className="sv-plano-total">{money(m.saldo)}</span>}
                  {m.reserva && <span className="sv-plano-sub">Reserva {m.reserva.hora}</span>}
                </>
              )}
              {m.atencion && <span className="sv-plano-mano" aria-hidden />}
            </button>
          );
        }}
      />

      {sueltas.length > 0 && (
        <div className="sv-plano-fuera">
          <div className="sv-kicker">
            Fuera del plano · {sueltas.length}
            <span className="sv-rule" />
          </div>
          <div className="sv-grid">
            {sueltas.map((m) => (
              <button
                key={m.n}
                type="button"
                className="sv-card"
                data-st={m.estado}
                data-on={m.n === sel ? '1' : '0'}
                aria-pressed={m.n === sel}
                onClick={() => onPick(m.n)}
              >
                <span className="sv-card-top">
                  <span className="sv-card-n">{m.n}</span>
                  {m.atencion ? <ChipMano atencion={m.atencion} corto /> : <ChipEstado estado={m.estado} big />}
                </span>
                <span className="sv-card-sub">{subtituloDeMesa(m)}</span>
                {m.saldo > 0 && <Mono size={15} className="sv-card-total">{money(m.saldo)}</Mono>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
