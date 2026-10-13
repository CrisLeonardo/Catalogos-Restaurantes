'use client';

/* Cortes recientes — el historial de turnos de caja.

   Desde la migración 145:
     · se agrupan por DÍA DE NEGOCIO y el día es la suma de sus turnos;
     · un corte no se borra: el último se puede ANULAR con motivo y firma,
       queda tachado a la vista y el turno vuelve a abrirse para contarlo
       de nuevo (PROD-06). */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { anularCorte, type CashCount } from '@/lib/actions/finanzas';
import { DENOM_FIELDS } from '@/lib/finanzas-constants';
import CashHistoryExportButton from '@/components/admin/cash-history-export-button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icons';
import { useFirmaEncargado } from '@/components/admin/caja/firma-encargado';
import { fmtMoney } from '@/lib/money';

const money = (n: number) => fmtMoney(n);

/** "Vie 9 oct" de un día de negocio YYYY-MM-DD. */
function formatDay(dia: string) {
  const s = new Date(`${dia}T12:00:00Z`).toLocaleDateString('es-GT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function formatTime(iso: string | null | undefined, tz: string) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz }); }
  catch { return iso.slice(11, 16); }
}
function isWithin24h(iso: string) {
  return Date.now() - new Date(iso).getTime() < 24 * 60 * 60 * 1000;
}
const cerradoEn = (c: CashCount) => c.closed_at ?? c.created_at;
const anulado = (c: CashCount) => c.status === 'VOID';

function DenomBreakdown({ breakdown }: { breakdown: Record<string, number> }) {
  const entries = DENOM_FIELDS
    .map(d => ({ ...d, qty: breakdown[d.field] || 0 }))
    .filter(d => d.qty > 0);

  if (entries.length === 0) return null;

  const billetes = entries.filter(d => d.kind === 'B');
  const monedas  = entries.filter(d => d.kind === 'M');

  return (
    <div style={{ marginTop: 8, padding: '10px 12px', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', borderRadius: 'var(--radius-md)', fontSize: 11 }}>
      {billetes.length > 0 && (
        <div style={{ marginBottom: monedas.length > 0 ? 6 : 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--u-text-4)' }}>
            Billetes
          </span>
          {billetes.map(d => (
            <div key={d.field} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--u-text-3)', marginTop: 2 }}>
              <span>{d.label} × {d.qty}</span>
              <span style={{ fontFamily: 'var(--ui-font-mono)' }}>{money((d.qty * d.centavos) / 100)}</span>
            </div>
          ))}
        </div>
      )}
      {monedas.length > 0 && (
        <div>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--u-text-4)' }}>
            Monedas
          </span>
          {monedas.map(d => (
            <div key={d.field} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--u-text-3)', marginTop: 2 }}>
              <span>{d.label} × {d.qty}</span>
              <span style={{ fontFamily: 'var(--ui-font-mono)' }}>{money((d.qty * d.centavos) / 100)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CashCountCard({
  entry, timezone, canVoid, onVoid,
}: { entry: CashCount; timezone: string; canVoid: boolean; onVoid: () => void }) {
  const [expanded, setExpanded] = useState(false);

  const diff = Number(entry.difference);
  const esAnulado = anulado(entry);
  const diffColor = esAnulado ? 'var(--u-text-4)' : Math.abs(diff) < 0.005 ? 'var(--c-ok)' : 'var(--c-danger)';
  const diffLabel = esAnulado ? 'Anulado' : Math.abs(diff) < 0.005 ? 'Cuadrada' : diff > 0 ? 'Sobrante' : 'Faltante';
  const hasBreakdown = !!entry.denomination_breakdown;
  /* El periodo que cubrió: «14:02 – 22:40». Los cortes de antes de la 145
     solo saben cuándo se cerraron. */
  const periodo = entry.period_start
    ? `${formatTime(entry.opened_at ?? entry.period_start, timezone)} – ${formatTime(cerradoEn(entry), timezone)}`
    : formatTime(cerradoEn(entry), timezone);

  return (
    <div className="caja-corte" data-void={esAnulado ? '1' : '0'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <span className="t-mono" style={{ fontSize: 13, color: 'var(--u-text-2)', fontWeight: 600, textDecoration: esAnulado ? 'line-through' : 'none' }}>
              {periodo}
            </span>
            {entry.shift_label && <span className="caja-marca">{entry.shift_label}</span>}
          </div>
          {(entry.cashier_name || entry.opened_by_name) && (
            <div style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 2 }}>
              {entry.opened_by_name && entry.opened_by_name !== entry.cashier_name
                ? `Abrió ${entry.opened_by_name.split(' ')[0]} · cerró ${entry.cashier_name?.split(' ')[0] ?? '—'}`
                : entry.cashier_name}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div className="t-mono" style={{ fontWeight: 700, fontSize: 14, color: diffColor, textDecoration: esAnulado ? 'line-through' : 'none' }}>
            {diff >= 0 ? '+' : ''}{money(diff)}
          </div>
          <div style={{ fontSize: 11, color: diffColor, opacity: 0.85 }}>{diffLabel}</div>
        </div>
      </div>

      <div className="t-mono" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 5, fontSize: 11, color: 'var(--u-text-4)' }}>
        <span>Esp. {money(Number(entry.expected_cash))}</span>
        <span aria-hidden>·</span>
        <span>Cont. {money(Number(entry.counted_cash))}</span>
        {Number(entry.opening_float) > 0 && (<><span aria-hidden>·</span><span>Fondo {money(Number(entry.opening_float))}</span></>)}
        {Number(entry.expenses_total ?? 0) > 0 && (<><span aria-hidden>·</span><span>Gastos {money(Number(entry.expenses_total))}</span></>)}
      </div>

      {esAnulado && entry.void_reason && (
        <div style={{ fontSize: 12, color: 'var(--u-text-3)', marginTop: 5 }}>
          Anulado {formatTime(entry.voided_at, timezone)}: «{entry.void_reason}»
        </div>
      )}
      {entry.notes && (
        <div style={{ fontSize: 11, color: 'var(--u-text-4)', marginTop: 4, fontStyle: 'italic' }}>
          &quot;{entry.notes}&quot;
        </div>
      )}

      {expanded && hasBreakdown && (
        <DenomBreakdown breakdown={entry.denomination_breakdown as Record<string, number>} />
      )}

      {(hasBreakdown || canVoid) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
          {hasBreakdown && (
            <button type="button" onClick={() => setExpanded((v) => !v)} className="caja-link">
              {expanded ? 'Ocultar desglose' : 'Ver desglose'}
            </button>
          )}
          <div style={{ flex: 1 }} />
          {canVoid && (
            <button type="button" onClick={onVoid} className="press caja-cobro-btn"
              aria-label={`Anular el corte de las ${formatTime(cerradoEn(entry), timezone)}`}>
              Anular
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* Anular el último corte (PROD-06): motivo y firma, y el turno vuelve a
   abrirse con su mismo fondo para contarlo otra vez. Nada se borra. */
function AnularCorte({ entry, restaurantId, timezone, selfApproves, onClose }: {
  entry: CashCount; restaurantId: string; timezone: string; selfApproves: boolean; onClose: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const firma = useFirmaEncargado(restaurantId, selfApproves);
  const router = useRouter();
  const listo = motivo.trim().length >= 3 && firma.valor.lista && !firma.valor.bloqueada;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anular el corte de las {formatTime(cerradoEn(entry), timezone)}</DialogTitle>
          <DialogDescription>
            El corte queda en el historial como anulado, con el motivo y quién lo autorizó. El turno vuelve a
            abrirse con el mismo fondo ({money(Number(entry.opening_float))}) para contarlo de nuevo.
          </DialogDescription>
        </DialogHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label htmlFor="corte-motivo" className="caja-campo-label">Motivo</label>
            <textarea id="corte-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={200}
              placeholder="Ej. se contó mal un fajo de Q100" className="adm-field" style={{ resize: 'none' }} />
          </div>
          {firma.bloque}
          {error && (
            <div className="note note-danger">
              <Icon name="alertCircle" size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" disabled={!listo || pending} onClick={() => start(async () => {
            const res = await anularCorte({
              restaurantId, id: entry.id, reason: motivo.trim(),
              approverId: firma.valor.approverId, approverPin: firma.valor.approverPin,
            });
            if (res.error) { setError(res.error); firma.limpiarPin(); return; }
            router.refresh();
            onClose();
          })}>
            {pending ? 'Anulando…' : 'Anular y volver a contar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Los cortes por día de negocio, del más reciente al más viejo. */
function porDia(history: CashCount[]): { dia: string; cortes: CashCount[] }[] {
  const out: { dia: string; cortes: CashCount[] }[] = [];
  for (const c of history) {
    const ultimo = out[out.length - 1];
    if (ultimo && ultimo.dia === c.business_date) ultimo.cortes.push(c);
    else out.push({ dia: c.business_date, cortes: [c] });
  }
  return out;
}

export default function CashHistoryPanel({
  history, restaurantId, timezone = 'America/Guatemala', selfApproves = false, shiftOpen = false,
}: {
  history: CashCount[];
  restaurantId: string;
  timezone?: string;
  selfApproves?: boolean;
  /** Hay un turno abierto: el último corte ya no se puede anular. */
  shiftOpen?: boolean;
}) {
  const [anulando, setAnulando] = useState<CashCount | null>(null);
  // Solo el último corte vivo, de las últimas 24 h y sin otro turno encima.
  const ultimoVivo = history.find((c) => !anulado(c));
  const anulable = ultimoVivo && !shiftOpen && isWithin24h(cerradoEn(ultimoVivo)) ? ultimoVivo.id : null;

  return (
    <div className="caja-tarjeta" style={{ gap: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 8, flexWrap: 'wrap' }}>
        <div className="adm-label adm-label-caps" style={{ color: 'var(--u-text-3)' }}>Cortes recientes</div>
        {history.length > 0 && <CashHistoryExportButton restaurantId={restaurantId} />}
      </div>
      {history.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--u-text-4)', marginTop: 8 }}>
          Aún no hay arqueos guardados.
        </div>
      ) : (
        porDia(history).map(({ dia, cortes }) => {
          /* El día es la suma de sus turnos (FUN-01). Los anulados no suman. */
          const vivos = cortes.filter((c) => !anulado(c));
          const diaDiff = Math.round(vivos.reduce((s, c) => s + Number(c.difference), 0) * 100) / 100;
          const diaContado = vivos.reduce((s, c) => s + Number(c.counted_cash), 0);
          return (
            <div key={dia} className="caja-dia">
              <div className="caja-dia-cabeza">
                <span style={{ fontWeight: 700, color: 'var(--u-text)' }}>{formatDay(dia)}</span>
                <span style={{ color: 'var(--u-text-4)' }}>
                  {vivos.length} {vivos.length === 1 ? 'turno' : 'turnos'}
                </span>
                <span style={{ flex: 1 }} />
                {vivos.length > 1 && (
                  <span className="t-mono" style={{ color: 'var(--u-text-3)' }}>
                    Contado {money(diaContado)} ·{' '}
                    <span style={{ color: Math.abs(diaDiff) < 0.005 ? 'var(--c-ok)' : 'var(--c-danger)', fontWeight: 700 }}>
                      {diaDiff >= 0 ? '+' : ''}{money(diaDiff)}
                    </span>
                  </span>
                )}
              </div>
              {cortes.map((c) => (
                <CashCountCard key={c.id} entry={c} timezone={timezone}
                  canVoid={c.id === anulable} onVoid={() => setAnulando(c)} />
              ))}
            </div>
          );
        })
      )}
      {anulando && (
        <AnularCorte entry={anulando} restaurantId={restaurantId} timezone={timezone}
          selfApproves={selfApproves} onClose={() => setAnulando(null)} />
      )}
    </div>
  );
}
