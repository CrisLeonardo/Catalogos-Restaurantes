'use client';

/* DÓNDE SE HACE CADA COSA (M-07, migración 130).
   ------------------------------------------------------------
   Hasta aquí un local tenía dos destinos de impresión y punto, así que
   todo lo que se cocina salía por el mismo papel: cualquiera con barra y
   cocina mandaba las cervezas a la plancha.

   Esta pantalla es donde eso se arregla. Dos bloques, y el orden importa:
   primero se declaran las estaciones —dónde se hace la comida—, y solo
   después se reparte el menú entre ellas. Al revés no se puede: no hay a
   qué asignar.

   La cuenta viva al lado de cada estación («Cocina · 12 categorías») no
   es decoración: mapear todo a la barra por error es invisible sin ella,
   y no se nota hasta que la cocina se queda mirando una impresora muda. */

import { useCallback, useEffect, useState, useTransition } from 'react';
import { Icon } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { PrinterPicker } from '@/components/admin/print-agent-settings';
import { getPrintAgentConfig, type ReportedPrinter } from '@/lib/actions/print-agent';
import {
  getStationsConfig, crearEstacion, actualizarEstacion, hacerPrincipal,
  borrarEstacion, asignarCategoria, limpiarAnulaciones, probarEstacion,
  type StationsConfig,
} from '@/lib/actions/print-stations';

const VACIO: StationsConfig = { disponible: false, stations: [], categorias: [] };

const hint: React.CSSProperties = {
  fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.55, margin: 0,
};

export default function PrintStationsSettings() {
  const [cfg, setCfg] = useState<StationsConfig>(VACIO);
  const [printers, setPrinters] = useState<ReportedPrinter[]>([]);
  const [cargando, setCargando] = useState(true);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [nueva, setNueva] = useState('');
  /* Lo que se está TECLEANDO en el campo manual de cada estación, mientras
     no esté terminado. Sin esto, escribir una IP a mano dispara una acción
     de servidor por letra —y casi todas con un destino a medio escribir. */
  const [borrador, setBorrador] = useState<Record<string, string>>({});
  const [pendiente, start] = useTransition();

  const recargar = useCallback(async () => {
    const [c, agente] = await Promise.all([getStationsConfig(), getPrintAgentConfig()]);
    setCfg(c);
    setPrinters('reportedPrinters' in agente ? agente.reportedPrinters : []);
    setCargando(false);
  }, []);

  useEffect(() => { void recargar(); }, [recargar]);

  /** Toda acción sigue el mismo guion: avisar, recargar, y nunca dejar la
      pantalla diciendo algo distinto de lo que hay guardado. */
  const hacer = (accion: () => Promise<{ error?: string }>, bien: string) => {
    setMsg(null);
    start(async () => {
      const res = await accion();
      if (res.error) { setMsg({ text: res.error, ok: false }); return; }
      setMsg({ text: bien, ok: true });
      setBorrador({});
      await recargar();
    });
  };

  if (cargando) return null;

  /* Sin la migración 130 no hay estaciones que configurar. Se dice en una
     línea en vez de esconder la sección: quien la busca porque se la
     enseñaron merece saber que existe y que todavía no está lista. */
  if (!cfg.disponible) {
    return (
      <p style={hint}>
        Esta sección se enciende cuando se aplique la actualización pendiente de la base de
        datos. Mientras tanto, todas las comandas salen por la impresora de cocina de arriba,
        como siempre.
      </p>
    );
  }

  const principal = cfg.stations.find((s) => s.isDefault) ?? null;
  const cuenta = (id: string) => cfg.categorias.filter((c) => c.stationId === id).length;
  const sinRepartir = cfg.categorias.filter((c) => c.stationId === null).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {msg && (
        <div
          className={msg.ok ? 'chip-ok' : 'chip-danger'}
          style={{ padding: '8px 11px', borderRadius: 'var(--radius-lg)', fontSize: 12.5, fontWeight: 600 }}
        >
          {msg.text}
        </div>
      )}

      {/* ── 1. Las estaciones ─────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {cfg.stations.map((s) => (
          <Card key={s.id} className="p-3.5">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
              <input
                defaultValue={s.name}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== s.name) hacer(() => actualizarEstacion(s.id, { name: v }), 'Nombre guardado.');
                }}
                style={{
                  flex: 1, minWidth: 120, padding: '6px 9px', fontSize: 14, fontWeight: 700,
                  color: 'var(--u-text)', background: 'transparent',
                  border: '1px solid transparent', borderRadius: 'var(--radius-md)',
                }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--u-hair)'; }}
                aria-label={`Nombre de la estación ${s.name}`}
              />
              {s.isDefault ? (
                <span className="chip-ok" style={{ padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>
                  Principal
                </span>
              ) : (
                <Button
                  type="button" variant="secondary" size="sm" disabled={pendiente}
                  onClick={() => hacer(() => hacerPrincipal(s.id), `«${s.name}» es ahora la principal.`)}
                >
                  Hacer principal
                </Button>
              )}
            </div>

            <PrinterPicker
              label="Impresora"
              value={borrador[s.id] ?? s.target ?? ''}
              printers={printers}
              onChange={(v) => setBorrador((b) => ({ ...b, [s.id]: v }))}
              onCommit={(v) => {
                if ((v || null) === (s.target ?? null)) return;   // nada que guardar
                hacer(() => actualizarEstacion(s.id, { target: v || null }), 'Impresora guardada.');
              }}
              onTest={() => hacer(() => probarEstacion(s.id), `Prueba enviada a ${s.name}.`)}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              {/* La cuenta viva. Sin esto, dejar la cocina sin nada mapeado
                  no se nota hasta que la plancha se queda sin papeles. */}
              <span style={{ fontSize: 11.5, color: 'var(--u-text-3)', flex: 1, minWidth: 140 }}>
                {s.isDefault
                  ? `${cuenta(s.id) + sinRepartir} de ${cfg.categorias.length} categorías · también recoge lo que nadie repartió`
                  : `${cuenta(s.id)} de ${cfg.categorias.length} categorías`}
              </span>
              {!s.isDefault && (
                <Button
                  type="button" variant="ghost" size="sm" disabled={pendiente}
                  onClick={() => hacer(() => borrarEstacion(s.id), `«${s.name}» eliminada; sus categorías vuelven a ${principal?.name ?? 'la principal'}.`)}
                >
                  Eliminar
                </Button>
              )}
            </div>
          </Card>
        ))}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            placeholder="Barra, Parrilla, Postres…"
            maxLength={40}
            style={{
              flex: 1, minWidth: 160, padding: '9px 11px', fontSize: 13,
              borderRadius: 'var(--radius-md)', color: 'var(--u-text)',
              background: 'color-mix(in srgb, var(--u-text) 5%, transparent)',
              border: '1px solid var(--u-hair)',
            }}
            aria-label="Nombre de la estación nueva"
          />
          <Button
            type="button" variant="secondary" size="sm"
            disabled={pendiente || nueva.trim().length === 0}
            onClick={() => hacer(
              async () => { const r = await crearEstacion({ name: nueva, target: null }); if (!r.error) setNueva(''); return r; },
              'Estación creada. Elige su impresora abajo.',
            )}
          >
            <Icon name="plus" size={15} /> Añadir estación
          </Button>
        </div>
      </div>

      {/* ── 2. El reparto del menú ────────────────────────────── */}
      {cfg.stations.length > 1 && (
        <div style={{ borderTop: '1px solid var(--u-hair)', paddingTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--u-text)', marginBottom: 4 }}>
            Qué sale por cada estación
          </div>
          <p style={{ ...hint, marginBottom: 12 }}>
            Lo que no repartas sale por {principal ? `«${principal.name}»` : 'la principal'}. Una mesa que
            pide solo comida no gasta papel en la barra.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cfg.categorias.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ flex: 1, minWidth: 110, fontSize: 13, color: 'var(--u-text-2)' }}>
                  {c.name}
                  {/* La anulación por producto es invisible desde aquí: se
                      pone plato a plato. Sin este aviso, una categoría que
                      dice «Barra» puede mandar tres platos a otro sitio sin
                      que nada lo explique. */}
                  {c.productosConAnulacion > 0 && (
                    <button
                      type="button"
                      onClick={() => hacer(() => limpiarAnulaciones(c.id), 'Los platos de esa categoría vuelven a seguir a su categoría.')}
                      disabled={pendiente}
                      title="Quitar la estación puesta a mano en esos platos, para que vuelvan a seguir a su categoría."
                      style={{
                        marginLeft: 7, padding: '1px 7px', borderRadius: 99, fontSize: 10.5,
                        fontWeight: 700, cursor: 'pointer', color: 'var(--brand-accent-ink)',
                        background: 'color-mix(in srgb, var(--brand-accent) 12%, transparent)',
                        border: '1px solid color-mix(in srgb, var(--brand-accent) 30%, transparent)',
                      }}
                    >
                      {c.productosConAnulacion} aparte
                    </button>
                  )}
                </span>
                <div style={{ width: 210 }}>
                  <Select
                    value={c.stationId ?? ''}
                    onValueChange={(v) => hacer(() => asignarCategoria(c.id, v || null), `${c.name} guardada.`)}
                    options={[
                      { value: '', label: principal ? `${principal.name} (principal)` : 'La principal' },
                      ...cfg.stations.filter((s) => !s.isDefault).map((s) => ({ value: s.id, label: s.name })),
                    ]}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
