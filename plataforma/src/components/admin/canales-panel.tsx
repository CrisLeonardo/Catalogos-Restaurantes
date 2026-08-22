'use client';

/* ============================================================
   /admin/canales — pedidos de apps externas (Fase 5A)
   ------------------------------------------------------------
   El trabajo del dueño aquí es uno solo: decir qué producto suyo
   corresponde a cada identificador que usa PedidosYa, Rappi o UberEats.
   Sin ese mapa, un pedido externo llega con un sku que Leogin no sabe
   traducir y se rechaza.

   Las llaves de API no se gestionan acá: las emite Leogin. Es a
   propósito — sin llave no entran pedidos, así que el dueño puede dejar
   sus mapeos listos antes de que el canal esté contratado.
   ============================================================ */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Stat, StatGroup } from '@/components/ui/stat';
import { saveChannelMapping, deleteChannelMapping } from '@/lib/actions/channels';
import { CHANNELS } from '@/lib/channels';
import type { ChannelMapRow, ChannelProductOption, ChannelSummary } from '@/lib/db/channels';

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', border: '1px solid var(--u-hair-2)',
  borderRadius: 'var(--radius-md)', padding: '9px 11px', color: 'var(--u-text)', fontSize: 14, outline: 'none',
};
const labelStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--u-text-3)', fontWeight: 500, letterSpacing: '0.04em',
  textTransform: 'uppercase', marginBottom: 4, display: 'block',
};

const CANAL_LABEL: Record<string, string> = {
  PEDIDOSYA: 'PedidosYa',
  RAPPI: 'Rappi',
  UBEREATS: 'UberEats',
  OTRO: 'Otro canal',
};

export default function CanalesPanel({
  restaurantId,
  mappings,
  products,
  summary,
}: {
  restaurantId: string;
  mappings: ChannelMapRow[];
  products: ChannelProductOption[];
  summary: ChannelSummary[];
}) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [channel, setChannel] = useState<string>('PEDIDOSYA');
  const [sku, setSku] = useState('');
  const [productId, setProductId] = useState('');

  function guardar() {
    setMsg(null);
    start(async () => {
      const res = await saveChannelMapping(restaurantId, { channel, externalSku: sku, productId });
      if (res.error) { setMsg(`Error: ${res.error}`); return; }
      setSku(''); setProductId('');
      setMsg('Mapeo guardado ✓');
      router.refresh();
    });
  }

  function borrar(id: string) {
    if (!window.confirm('¿Quitar este mapeo? Los pedidos que ya entraron no se tocan.')) return;
    setBusy(id); setMsg(null);
    start(async () => {
      const res = await deleteChannelMapping(restaurantId, id);
      setBusy(null);
      if (res.error) { setMsg(`Error: ${res.error}`); return; }
      router.refresh();
    });
  }

  const conPedidos = summary.filter((s) => s.pedidos > 0 || s.mapeados > 0);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Canales externos</h1>
        <p style={{ fontSize: 14, color: 'var(--u-text-3)', margin: '6px 0 0' }}>
          Hacé que los pedidos de PedidosYa, Rappi o UberEats entren a tu cocina junto con los demás,
          en vez de vivir en una pantalla aparte.
        </p>
      </div>

      {/* Resumen: separa "configurado" de "funcionando". Un canal con
          mapeos y cero pedidos casi siempre significa que falta la llave. */}
      {conPedidos.length > 0 && (
        <StatGroup>
          {conPedidos.map((s) => (
            <Stat
              key={s.channel}
              label={`${CANAL_LABEL[s.channel]} (${s.mapeados} producto${s.mapeados === 1 ? '' : 's'} mapeado${s.mapeados === 1 ? '' : 's'})`}
              value={`${s.pedidos} ${s.pedidos === 1 ? 'pedido' : 'pedidos'}`}
            />
          ))}
        </StatGroup>
      )}

      {/* ── Alta de mapeo ── */}
      <Card className="flex flex-col gap-3.5 p-4">
        <div className="t-kicker">Conectar un producto</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
          <div>
            <label style={labelStyle}>App</label>
            <Select
              options={CHANNELS.map((c) => ({ value: c, label: CANAL_LABEL[c] }))}
              value={channel}
              onValueChange={setChannel}
            />
          </div>
          <div>
            <label style={labelStyle}>Identificador en esa app</label>
            <input
              style={inputStyle}
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="burger-clasica"
            />
          </div>
          <div>
            <label style={labelStyle}>Tu producto</label>
            <Select
              options={[
                { value: '', label: 'Elegí un producto…' },
                ...products.map((p) => ({
                  value: p.id,
                  label: p.is_available ? p.name : `${p.name} (agotado)`,
                })),
              ]}
              value={productId}
              onValueChange={setProductId}
            />
          </div>
        </div>

        <p style={{ fontSize: 12, color: 'var(--u-text-3)', margin: 0, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <Icon name="alertCircle" size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          El precio siempre sale de tu carta, no de la app externa. Si allá está a otro precio, manda el tuyo.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button onClick={guardar} disabled={isPending || !sku.trim() || !productId} className="rounded-adm-full">
            {isPending ? 'Guardando…' : 'Guardar mapeo'}
          </Button>
          {msg && (
            <span style={{ fontSize: 13, color: msg.startsWith('Error') ? 'var(--c-danger)' : 'var(--c-ok)' }}>{msg}</span>
          )}
        </div>
      </Card>

      {/* ── Mapeos existentes ── */}
      {mappings.length === 0 ? (
        <Card className="p-7 text-center" style={{ color: 'var(--u-text-3)', fontSize: 14 }}>
          Todavía no conectaste ningún producto. Mientras el mapa esté vacío, los pedidos de apps
          externas se rechazan porque Leogin no sabe a qué plato corresponden.
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="table-scroll">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 520 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--u-hair)' }}>
                  {['App', 'Identificador', 'Tu producto', ''].map((h) => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--u-text-3)', fontWeight: 500, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mappings.map((m) => (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--u-hair)' }}>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{CANAL_LABEL[m.channel]}</td>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--ui-font-mono)' }}>{m.external_sku}</td>
                    <td style={{ padding: '10px 12px' }}>
                      {m.product_name}
                      {!m.product_available && (
                        <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--u-text-4)' }}>agotado</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <Button onClick={() => borrar(m.id)} disabled={isPending && busy === m.id} variant="outline" size="sm"
                        className="border-[var(--c-danger-line)] text-[var(--c-danger)]">
                        {busy === m.id ? '…' : 'Quitar'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="flex flex-col gap-2 p-4">
        <div className="t-kicker" style={{ fontSize: 10.5 }}>Cómo se conectan los pedidos</div>
        <p style={{ fontSize: 13, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.6 }}>
          Las apps externas no hablan con Leogin directamente: un conector en el medio (lo arma Leogin
          o tu integrador) recibe el pedido y lo empuja a <code style={{ fontFamily: 'var(--ui-font-mono)' }}>POST /api/v1/orders</code>{' '}
          con una llave que te damos nosotros. Cuando el pedido entra, aparece en tu cocina con el
          nombre de la app de donde vino.
        </p>
        <p style={{ fontSize: 12, color: 'var(--u-text-4)', margin: 0 }}>
          ¿Ya tenés el conector y no llega nada? Escribinos: casi siempre es que a la llave le falta permiso.
        </p>
      </Card>
    </div>
  );
}
