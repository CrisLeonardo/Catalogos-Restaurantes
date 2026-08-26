'use client';

/* El riel izquierdo — 340 px, siempre presente.
   ------------------------------------------------------------------
   Dos pestañas y nada más: Sala (la rejilla de mesas) y Pedidos (mesas,
   llevar y domicilio en una sola lista). El riel NUNCA navega: solo
   cambia qué está elegido, y el panel derecho se adapta.

   En el teléfono este archivo ES la pantalla: por debajo de 1024 px no
   hay panel derecho, así que aquí se cuela también la tira "Te
   necesitan ahora" que en la tablet vive a la derecha. Es el mismo
   componente en otro sitio, no un segundo diseño (ver `.wp-phone-only`
   en globals.css). */

import { Icon } from '@/components/icons';
import FloorMap from '@/components/admin/floor-map';
import MesaTile from '@/components/admin/waiter/mesa-tile';
import { Group, Hr, Label, Mono, Pill, Row, Seg, Tile } from '@/components/admin/waiter/pieces';
import type { Selection, PedidoRow } from '@/components/admin/waiter/types';
import type { TableWithState } from '@/lib/table-state';
import type { TableOccupancy } from '@/lib/db/orders';
import type { FloorTable, FloorFixture } from '@/lib/theme/defaults';
import { REASON_ICON } from '@/components/admin/waiter/reason-icon';

export type RailTab = 'sala' | 'pedidos';

interface Props {
  restaurantName: string;
  /** Todas las mesas del salón, ya resueltas por lib/table-state.ts. */
  tables: TableWithState[];
  /** Las que piden acción, de la más urgente a la menos. */
  attention: TableWithState[];
  selection: Selection;
  tab: RailTab;
  onTab: (t: RailTab) => void;
  onSelectTable: (n: number) => void;
  onSelectLlevar: () => void;
  pedidos: PedidoRow[];
  /** Pedidos para llevar en curso (los del mesero, sin cerrar). */
  llevarEnCurso: number;
  pickupEnabled: boolean;
  money: (n: number) => string;

  /* Plano del salón (opcional, lo dibuja el dueño en Ajustes). */
  planEnabled: boolean;
  planMode: boolean;
  onPlanMode: (v: boolean) => void;
  planTables: FloorTable[];
  planFixtures: FloorFixture[];
  levels: { id: string; name: string }[];
  activeLevel: string;
  onLevel: (id: string) => void;
  occupiedSet: Set<number>;
  occupiedSince: Record<number, TableOccupancy>;
  now: number | null;
}

export default function Rail({
  restaurantName, tables, attention, selection, tab, onTab,
  onSelectTable, onSelectLlevar, pedidos, llevarEnCurso, pickupEnabled, money,
  planEnabled, planMode, onPlanMode, planTables, planFixtures,
  levels, activeLevel, onLevel, occupiedSet, occupiedSince, now,
}: Props) {
  const conGente = tables.filter((t) => t.state.kind !== 'libre').length;
  const selMesa = selection.kind === 'mesa' ? selection.n : null;

  /* El resumen del turno en una línea. Sin mesas ocupadas no se
     inventa nada: "0 mesas con gente" es ruido, el salón vacío ya se
     ve en la rejilla. */
  const resumen = conGente === 0
    ? 'Salón libre'
    : `${conGente} ${conGente === 1 ? 'mesa' : 'mesas'} con gente`
      + (attention.length > 0 ? ` · ${attention.length} te ${attention.length === 1 ? 'necesita' : 'necesitan'}` : '');

  const states: Record<number, TableWithState['state']> = {};
  for (const t of tables) states[t.n] = t.state;

  return (
    <div className="wp-rail">
      <div style={{ padding: '16px 16px 10px', flexShrink: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--u-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {restaurantName}
        </div>
        <div style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 3 }}>{resumen}</div>
      </div>

      <div style={{ padding: '0 16px 12px', flexShrink: 0 }}>
        <Seg
          value={tab}
          onChange={onTab}
          ariaLabel="Qué se ve en el riel"
          options={[
            { value: 'sala', label: 'Sala' },
            { value: 'pedidos', label: 'Pedidos' },
          ]}
        />
      </div>

      <div className="wp-scroll" style={{ padding: '0 16px 16px' }}>
        {tab === 'sala' ? (
          <>
            {/* Solo en el teléfono: aquí no hay panel derecho donde
                poner esto, y es lo primero que hay que ver al entrar. */}
            {attention.length > 0 && (
              <div className="wp-phone-only" style={{ marginBottom: 18 }}>
                <Label>Te necesitan ahora</Label>
                <Group>
                  {attention.map((t, i) => (
                    <div key={t.n}>
                      {i > 0 && <Hr />}
                      <Row
                        onClick={() => onSelectTable(t.n)}
                        lead={<Tile accent><Icon name={REASON_ICON[t.state.reason ?? 'llamada']} size={14} /></Tile>}
                        title={`Mesa ${t.n}`}
                        sub={<span style={{ color: 'var(--brand-accent-ink)', fontWeight: 600 }}>{t.state.label}</span>}
                        trail={<Icon name="chevronRight" size={16} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />}
                      />
                    </div>
                  ))}
                </Group>
              </div>
            )}

            <div style={{ marginBottom: 8 }}>
              <Label
                action={planEnabled ? (planMode ? 'Rejilla' : 'Plano') : undefined}
                onAction={() => onPlanMode(!planMode)}
              >
                Mesas
              </Label>
            </div>

            {planEnabled && planMode ? (
              <>
                {levels.length > 1 && (
                  <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 10, scrollbarWidth: 'none' }}>
                    {levels.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => onLevel(l.id)}
                        className="press"
                        style={{
                          flexShrink: 0, padding: '6px 12px', borderRadius: 99, cursor: 'pointer',
                          border: '1px solid ' + (l.id === activeLevel ? 'var(--adm-accent-500)' : 'var(--adm-border-2)'),
                          background: l.id === activeLevel ? 'color-mix(in srgb, var(--adm-accent-500) 12%, transparent)' : 'none',
                          color: l.id === activeLevel ? 'var(--brand-accent-ink)' : 'var(--u-text-2)',
                          fontSize: 12.5, fontWeight: 600,
                        }}
                      >
                        {l.name}
                      </button>
                    ))}
                  </div>
                )}
                <FloorMap
                  tables={planTables}
                  fixtures={planFixtures}
                  occupied={occupiedSet}
                  occupiedSince={occupiedSince}
                  states={states}
                  now={now}
                  onSelect={onSelectTable}
                />
              </>
            ) : (
              <div className="wp-mesas">
                {tables.map((t) => (
                  <MesaTile
                    key={t.n}
                    n={t.n}
                    state={t.state}
                    amount={t.occ ? money(t.occ.total) : undefined}
                    selected={selMesa === t.n}
                    onSelect={onSelectTable}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {pedidos.length === 0 ? (
              <div style={{ padding: '28px 8px', textAlign: 'center', fontSize: 13.5, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
                No hay nada en marcha.<br />Elige una mesa en Sala para empezar.
              </div>
            ) : pedidos.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={p.onSelect}
                className="press"
                aria-current={p.selected ? 'true' : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                  padding: '11px 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: p.selected ? 'var(--adm-accent-500)' : 'none',
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{
                    display: 'block', fontSize: 14.5, fontWeight: 600,
                    color: p.selected ? '#ffffff' : 'var(--u-text)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {p.title}
                  </span>
                  <span style={{ display: 'block', marginTop: 2 }}>
                    <Pill color={p.selected ? 'rgba(255,255,255,0.86)' : p.tone}>
                      <span style={{ fontSize: 12.5 }}>{p.estado} · {p.detalle}</span>
                    </Pill>
                  </span>
                </span>
                <Mono size={14} color={p.selected ? 'rgba(255,255,255,0.92)' : 'var(--u-text)'}>{p.total}</Mono>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Para llevar vive abajo del todo, fuera de la rejilla: no es una
          mesa, pero abre exactamente el mismo panel derecho. */}
      {pickupEnabled && (
        <div style={{ flexShrink: 0, borderTop: '1px solid var(--adm-border)', padding: '10px 12px' }}>
          <Row
            onClick={onSelectLlevar}
            pad="8px 10px"
            style={{
              borderRadius: 10,
              background: selection.kind === 'llevar' ? 'var(--adm-accent-500)' : 'none',
            }}
            lead={<Tile><Icon name="bag" size={14} /></Tile>}
            title={
              <span style={{ fontSize: 13.5, fontWeight: 500, color: selection.kind === 'llevar' ? '#ffffff' : 'var(--u-text-2)' }}>
                Para llevar{llevarEnCurso > 0 ? ` · ${llevarEnCurso} en curso` : ''}
              </span>
            }
            trail={
              <Icon
                name="plus"
                size={16}
                style={{ color: selection.kind === 'llevar' ? '#ffffff' : 'var(--brand-accent-ink)', flexShrink: 0 }}
              />
            }
          />
        </div>
      )}
    </div>
  );
}
