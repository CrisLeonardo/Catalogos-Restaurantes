'use client';

import { useState, useTransition } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Section, SectionNote } from '@/components/ui/section';
import { Icon } from '@/components/icons';
import { crearEncargo, cambiarEncargoActivo } from '@/lib/actions/encargos';
import { estadoEncargo, lugaresLibres, textoCierre, textoEntrega, type EstadoEncargo } from '@/lib/encargos';
import { TRANSFERENCIA_ETIQUETA, type EstadoTransferencia } from '@/lib/pago-transferencia';
import type { EncargoDelPanel } from '@/lib/db/encargos';
import { fmtCurrency, type PanelCurrency } from '@/lib/money';
import { STATUS_LABEL } from '@/lib/order-status';
import type { OrderStatus } from '@/types';

/* ============================================================
   ENCARGOS (/admin/encargos) — plan 2026-10-28, N6
   ------------------------------------------------------------
   Arriba, abrir una tanda nueva en un solo formulario corto. Abajo,
   cada tanda con su barra de cupo («28 de 40»), cuándo cierra y sus
   pedidos, para preparar la producción del día sin cuaderno.
   ============================================================ */

interface Props {
  restaurantId: string;
  timezone: string;
  currency: PanelCurrency;
  items: EncargoDelPanel[];
  aceptaTransferencia: boolean;
}

const ESTADO: Record<EstadoEncargo, { texto: string; chip: string }> = {
  abierto: { texto: 'Recibiendo', chip: 'chip-ok' },
  lleno: { texto: 'Cupo lleno', chip: 'chip-warn' },
  cerrado: { texto: 'Cerrado', chip: 'chip-alt' },
  pausado: { texto: 'Pausado', chip: 'chip-alt' },
};

/** Mañana a las 18:00, en el formato de un <input type="datetime-local">. */
function sugerenciaDeCierre(): { cierre: string; entrega: string } {
  const d = new Date(Date.now() + 86_400_000);
  const ymd = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  const pasado = new Date(Date.now() + 2 * 86_400_000);
  return { cierre: `${ymd(d)}T18:00`, entrega: ymd(pasado) };
}

export default function EncargosPanel({ restaurantId, timezone, currency, items, aceptaTransferencia }: Props) {
  const sug = sugerenciaDeCierre();
  const [titulo, setTitulo] = useState('');
  const [entregaFecha, setEntregaFecha] = useState(sug.entrega);
  const [entregaHora, setEntregaHora] = useState('');
  const [cierre, setCierre] = useState(sug.cierre);
  const [cupo, setCupo] = useState('40');
  const [pagoAdelantado, setPagoAdelantado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);
  const [pending, start] = useTransition();

  function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setHecho(false);
    start(async () => {
      const r = await crearEncargo(restaurantId, {
        titulo, entregaFecha, entregaHora, cierre, cupo: Number(cupo), pagoAdelantado,
      });
      if (r.error) return setError(r.error);
      setHecho(true);
      setTitulo('');
      setEntregaHora('');
    });
  }

  const campo = { display: 'flex', flexDirection: 'column', gap: 5 } as const;
  const etiqueta = { fontSize: 12, fontWeight: 600, color: 'var(--u-text-3)' } as const;

  return (
    <div className="flex flex-col gap-6">
      <Section title="Abrir encargos">
        <Card className="p-4">
          <form onSubmit={crear} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={campo}>
              <label htmlFor="enc-titulo" style={etiqueta}>¿Qué vas a preparar?</label>
              <Input id="enc-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Tamales del sábado" maxLength={80} required />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
              <div style={campo}>
                <label htmlFor="enc-fecha" style={etiqueta}>Día de entrega</label>
                <Input id="enc-fecha" type="date" value={entregaFecha} onChange={(e) => setEntregaFecha(e.target.value)} required />
              </div>
              <div style={campo}>
                <label htmlFor="enc-hora" style={etiqueta}>Horario <span style={{ fontWeight: 400 }}>(opcional)</span></label>
                <Input id="enc-hora" value={entregaHora} onChange={(e) => setEntregaHora(e.target.value)} placeholder="8 a 11 a. m." maxLength={60} />
              </div>
              <div style={campo}>
                <label htmlFor="enc-cierre" style={etiqueta}>Recibes encargos hasta</label>
                <Input id="enc-cierre" type="datetime-local" value={cierre} onChange={(e) => setCierre(e.target.value)} required />
              </div>
              <div style={campo}>
                <label htmlFor="enc-cupo" style={etiqueta}>Cupo (pedidos)</label>
                <Input id="enc-cupo" type="number" inputMode="numeric" min={1} max={10000} value={cupo} onChange={(e) => setCupo(e.target.value)} required />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--u-text)' }}>Pago por adelantado</div>
                <div style={{ fontSize: 12, color: 'var(--u-text-4)', lineHeight: 1.4 }}>
                  {aceptaTransferencia
                    ? 'Solo se puede encargar pagando por transferencia. Así nadie aparta y no llega.'
                    : 'Activa la transferencia en Ajustes › Pedidos y cobro para pedir pago adelantado.'}
                </div>
              </div>
              <Switch
                checked={pagoAdelantado}
                onCheckedChange={setPagoAdelantado}
                disabled={!aceptaTransferencia}
                aria-label="Pago por adelantado"
              />
            </div>
            {error && <p role="alert" style={{ fontSize: 13, color: 'var(--c-danger)', margin: 0 }}>{error}</p>}
            {hecho && <p role="status" style={{ fontSize: 13, color: 'var(--c-ok)', margin: 0 }}>Listo: tus clientes ya lo ven en tu menú.</p>}
            <div>
              <Button type="submit" disabled={pending} className="rounded-adm-full">
                <Icon name="plus" size={15} /> {pending ? 'Abriendo…' : 'Abrir encargos'}
              </Button>
            </div>
          </form>
        </Card>
        <SectionNote>
          Tus clientes lo ven arriba de tu menú con los lugares que quedan, y pueden encargar aunque
          tu local esté cerrado. Cada pedido lleva «Encargo» en la comanda.
        </SectionNote>
      </Section>

      <Section title="Tus encargos">
        {items.length === 0 ? (
          <Card className="p-4" style={{ fontSize: 13, color: 'var(--u-text-3)' }}>
            Aún no abres ninguno. Prueba con lo que más te piden por encargo: tamales, pasteles, el almuerzo de la semana.
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((f) => <Tanda key={f.id} f={f} restaurantId={restaurantId} timezone={timezone} currency={currency} />)}
          </div>
        )}
      </Section>
    </div>
  );
}

function Tanda({ f, restaurantId, timezone, currency }: { f: EncargoDelPanel; restaurantId: string; timezone: string; currency: PanelCurrency }) {
  const [abierta, setAbierta] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const estado = estadoEncargo(f);
  const pct = Math.min(100, Math.round((f.ocupados / f.cupo) * 100));
  const vivos = f.pedidos.filter((p) => p.status !== 'CANCEL');
  const total = vivos.reduce((s, p) => s + p.total, 0);

  function alternar() {
    setError(null);
    start(async () => {
      const r = await cambiarEncargoActivo(restaurantId, f.id, !f.activo);
      if (r.error) setError(r.error);
    });
  }

  return (
    <Card className="p-4" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--u-text)' }}>{f.titulo}</div>
          <div style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 2 }}>
            Entrega {textoEntrega(f)}
            {estado === 'abierto' || estado === 'lleno' ? ` · cierra ${textoCierre(f.cierreAt, timezone)}` : ''}
          </div>
        </div>
        <span className={`chip ${ESTADO[estado].chip}`}>{ESTADO[estado].texto}</span>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
          <span style={{ color: 'var(--u-text-2)', fontWeight: 600 }}>{f.ocupados} de {f.cupo} lugares</span>
          <span style={{ color: 'var(--u-text-4)' }}>
            {lugaresLibres(f) > 0 ? `quedan ${lugaresLibres(f)}` : 'sin lugares'} · {fmtCurrency(total, currency)}
          </span>
        </div>
        <div
          role="progressbar" aria-valuemin={0} aria-valuemax={f.cupo} aria-valuenow={f.ocupados} aria-label={`Lugares ocupados de ${f.titulo}`}
          style={{ height: 8, borderRadius: 'var(--radius-full)', background: 'var(--adm-bg-2)', overflow: 'hidden' }}
        >
          <div style={{ width: `${pct}%`, height: '100%', background: estado === 'lleno' ? 'var(--c-warn)' : 'var(--c-ok)', transformOrigin: 'left' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button type="button" size="sm" variant="secondary" onClick={() => setAbierta((v) => !v)} aria-expanded={abierta}>
          <Icon name={abierta ? 'chevronDown' : 'list'} size={14} /> {abierta ? 'Ocultar pedidos' : `Ver pedidos (${vivos.length})`}
        </Button>
        {estado !== 'cerrado' && (
          <Button type="button" size="sm" variant="outline" onClick={alternar} disabled={pending}>
            {f.activo ? 'Pausar' : 'Reanudar'}
          </Button>
        )}
      </div>
      {error && <p role="alert" style={{ fontSize: 12, color: 'var(--c-danger)', margin: 0 }}>{error}</p>}

      {abierta && (
        vivos.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--u-text-4)', margin: 0 }}>Todavía no hay pedidos.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
            {vivos.map((p) => (
              <li key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: '1px solid var(--u-hair)', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--u-text)' }}>
                    {p.orderNumber} · {p.customerName}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--u-text-4)' }}>
                    {p.orderType === 'DELIVERY' ? 'A domicilio' : 'Para llevar'}
                    {' · '}{STATUS_LABEL[p.status as OrderStatus] ?? p.status}
                    {p.transferStatus ? ` · ${TRANSFERENCIA_ETIQUETA[p.transferStatus as EstadoTransferencia]}` : ''}
                    {p.customerPhone ? (
                      <> · <a href={`https://wa.me/502${p.customerPhone.replace(/\D/g, '').slice(-8)}`} target="_blank" rel="noopener noreferrer" className="adm-action-link">{p.customerPhone}</a></>
                    ) : null}
                  </div>
                </div>
                <span className="t-mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--u-text-2)' }}>{fmtCurrency(p.total, currency)}</span>
              </li>
            ))}
          </ul>
        )
      )}
    </Card>
  );
}
