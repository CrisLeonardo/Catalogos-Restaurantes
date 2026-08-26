'use client';

/* El panel derecho cuando no hay nada elegido.
   ------------------------------------------------------------------
   Es la pantalla que más horas va a estar puesta: la tablet sobre el
   mostrador con nadie tocándola. Por eso NO se queda en blanco ni
   enseña un "elige una mesa" — contesta la única pregunta que importa
   en hora pico: ¿quién me necesita ahora?

   Las tres secciones salen de datos que ya existían y que nadie estaba
   usando para nada: la llamada del comensal (waiter_calls), el reloj
   de etapa de un pedido listo sin llevar (order-status.ts) y el estado
   SERVED de una mesa que ya comió. */

import { Icon } from '@/components/icons';
import { Group, Hr, Label, Mono, Row, Tile } from '@/components/admin/waiter/pieces';
import { REASON_ICON } from '@/components/admin/waiter/reason-icon';
import { fmtMin, type TableWithState } from '@/lib/table-state';

interface Props {
  attention: TableWithState[];
  tables: TableWithState[];
  tableCount: number;
  now: number | null;
  money: (n: number) => string;
  onSelectTable: (n: number) => void;
  onCobrar: (n: number) => void;
}

/** Minutos transcurridos desde un ISO, o null si aún no hay reloj. */
function desde(iso: string | null | undefined, now: number | null): number | null {
  if (!iso || now == null) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? (now - t) / 60000 : null;
}

export default function AttentionPane({
  attention, tables, tableCount, now, money, onSelectTable, onCobrar,
}: Props) {
  const ocupadas = tables.filter((t) => t.occ);
  const enCocina = ocupadas.filter((t) => t.occ!.status === 'NEW' || t.occ!.status === 'PREP').length;
  const sinCobrar = ocupadas.reduce((s, t) => s + t.occ!.total, 0);

  const masLenta = ocupadas.reduce<number | null>((peor, t) => {
    const m = desde(t.occ!.since, now);
    return m == null ? peor : peor == null || m > peor ? m : peor;
  }, null);

  /* Ya comieron y nadie las cerró. Es la fuga de dinero más común de un
     salón lleno, y hasta ahora no se veía en ninguna pantalla. */
  const servidas = ocupadas
    .filter((t) => t.occ!.status === 'SERVED')
    .sort((a, b) => (a.occ!.servedAt ?? '').localeCompare(b.occ!.servedAt ?? ''));

  const salonVacio = ocupadas.length === 0;

  return (
    <div className="wp-scroll" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      {salonVacio ? (
        <div style={{ margin: 'auto', textAlign: 'center', padding: '40px 24px', maxWidth: 380 }}>
          <Icon name="home" size={26} style={{ color: 'var(--u-text-4)' }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--u-text)', marginTop: 12 }}>El salón está libre</div>
          <div style={{ fontSize: 13.5, color: 'var(--u-text-3)', marginTop: 6, lineHeight: 1.5 }}>
            Toca una mesa a la izquierda para empezar a tomarle el pedido.
          </div>
        </div>
      ) : (
        <>
          {attention.length > 0 ? (
            <section>
              <Label>Te necesitan ahora</Label>
              <Group>
                {attention.map((t, i) => {
                  const m = desde(t.state.since, now);
                  return (
                    <div key={t.n}>
                      {i > 0 && <Hr />}
                      <Row
                        onClick={() => onSelectTable(t.n)}
                        lead={<Tile accent><Icon name={REASON_ICON[t.state.reason ?? 'llamada']} size={14} /></Tile>}
                        title={`Mesa ${t.n}`}
                        sub={t.state.label}
                        right={
                          <>
                            <div style={{ fontSize: 13, color: 'var(--brand-accent-ink)', fontWeight: 600 }}>
                              {m == null ? '' : `hace ${fmtMin(m)}`}
                            </div>
                            <div style={{ marginTop: 3 }}>
                              <Mono size={13.5} color="var(--u-text-2)">{money(t.occ?.total ?? 0)}</Mono>
                            </div>
                          </>
                        }
                        trail={<Icon name="chevronRight" size={16} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />}
                      />
                    </div>
                  );
                })}
              </Group>
            </section>
          ) : (
            <section>
              <Label>Te necesitan ahora</Label>
              <Group>
                <Row
                  lead={<Tile><Icon name="checkCircle" size={14} /></Tile>}
                  title="Nadie está esperando"
                  sub="Ninguna mesa pidió la cuenta, ni tiene comida lista sin llevar."
                />
              </Group>
            </section>
          )}

          <section>
            <Label>El turno</Label>
            <Group style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
              <Stat label="Mesas con gente" valor={`${ocupadas.length} / ${tableCount}`} primera />
              <Stat label="En cocina" valor={String(enCocina)} />
              <Stat label="Sin cobrar" valor={money(sinCobrar)} />
              <Stat label="Mesa más lenta" valor={masLenta == null ? '—' : fmtMin(masLenta)} />
            </Group>
          </section>

          {servidas.length > 0 && (
            <section>
              <Label>Mesas servidas sin cobrar</Label>
              <Group>
                {servidas.map((t, i) => {
                  const m = desde(t.occ!.servedAt, now);
                  return (
                    <div key={t.n}>
                      {i > 0 && <Hr />}
                      <Row
                        title={`Mesa ${t.n}`}
                        sub={
                          (m == null ? 'Servida' : `Servida hace ${fmtMin(m)}`)
                          + (t.occ!.waiterName ? ` · ${t.occ!.waiterName}` : '')
                        }
                        right={<Mono>{money(t.occ!.total)}</Mono>}
                        trail={
                          <button
                            type="button"
                            onClick={() => onCobrar(t.n)}
                            className="press"
                            style={{
                              marginLeft: 14, flexShrink: 0, height: 34, padding: '0 14px', borderRadius: 9,
                              border: '1px solid var(--adm-border-2)', background: 'none', cursor: 'pointer',
                              color: 'var(--u-text-2)', fontSize: 13.5, fontWeight: 600,
                            }}
                          >
                            Cobrar
                          </button>
                        }
                      />
                    </div>
                  );
                })}
              </Group>
              <p style={{ margin: '8px 4px 0', fontSize: 12.5, lineHeight: 1.45, color: 'var(--u-text-3)' }}>
                Es la fuga de dinero más común de un salón lleno: mesas que ya comieron y nadie cerró.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, valor, primera = false }: { label: string; valor: string; primera?: boolean }) {
  return (
    <div style={{
      padding: '14px 18px',
      borderLeft: primera ? 'none' : '1px solid var(--adm-border)',
    }}>
      <div style={{ fontSize: 13, color: 'var(--u-text-3)' }}>{label}</div>
      <div style={{ marginTop: 4 }}>
        <Mono size={22}>{valor}</Mono>
      </div>
    </div>
  );
}
