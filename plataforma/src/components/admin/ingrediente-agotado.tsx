'use client';

/* ============================================================
   «SE ACABÓ» / «YA HAY» EN UN INGREDIENTE (auditoría 1.10, O04)
   ------------------------------------------------------------
   Antes de apagar, enseña qué platillos lo llevan en su receta. Al
   confirmar, `leogin_agotar_ingrediente` (migración 180) los agota en
   una transacción; «Ya hay» devuelve los que no esperan otro ingrediente
   ni se agotaron aparte. Maqueta: MAQUETA_INVENTARIO_2026-11-09.html.
   ============================================================ */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { HojaOperativa } from '@/components/ui/hoja-operativa';
import { Button } from '@/components/ui/button';
import { agotarIngrediente, platillosDeIngrediente, type PlatilloAfectado } from '@/lib/actions/inventory';

export default function IngredienteAgotado({ restaurantId, ingredientId, nombre, agotado, usos }: {
  restaurantId: string; ingredientId: string; nombre: string; agotado: boolean; usos: number;
}) {
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [platillos, setPlatillos] = useState<PlatilloAfectado[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, start] = useTransition();

  const nuevos = (platillos ?? []).filter((p) => !p.yaAgotado);

  function abrir() {
    setError(null);
    setAbierta(true);
    start(async () => {
      const r = await platillosDeIngrediente(restaurantId, ingredientId);
      if (r.error) setError(r.error); else setPlatillos(r.platillos ?? []);
    });
  }

  function cambiar(a: boolean) {
    setError(null);
    start(async () => {
      const r = await agotarIngrediente(restaurantId, ingredientId, a);
      if (r.error) { setError(r.error); return; }
      setAbierta(false);
      const n = r.platillos ?? 0;
      setAviso(a
        ? `${n} ${n === 1 ? 'platillo agotado' : 'platillos agotados'}`
        : n > 0 ? `${n} ${n === 1 ? 'platillo vuelve' : 'platillos vuelven'} al menú` : 'Ninguno vuelve todavía');
      router.refresh();
    });
  }

  if (usos === 0 && !agotado) return null;

  return (
    <>
      {agotado ? (
        <Button type="button" size="sm" variant="secondary" disabled={pendiente} onClick={() => cambiar(false)}
          aria-label={`Ya hay ${nombre}: devolver sus platillos`}>
          {pendiente ? '…' : 'Ya hay'}
        </Button>
      ) : (
        <Button type="button" size="sm" variant="outline" disabled={pendiente} onClick={abrir}
          aria-label={`Se acabó ${nombre}: agotar sus platillos`}>
          Se acabó
        </Button>
      )}
      {aviso && <span role="status" className="sr-only">{aviso}</span>}
      {!abierta && error && <span role="alert" style={{ fontSize: 12, color: 'var(--c-danger)' }}>{error}</span>}
      {abierta && (
        <HojaOperativa
          label={`¿Se acabó ${nombre.toLowerCase()}?`}
          title={`¿Se acabó ${nombre}?`}
          onClose={() => setAbierta(false)}
          resumen={<p style={{ margin: 0, fontSize: 14, color: 'var(--u-text-2)' }}>
            Estos platillos lo llevan en su receta y quedarán agotados hasta que digas «Ya hay»:
          </p>}
          footer={(
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button type="button" size="touch" variant="destructive" style={{ flex: '1 1 200px' }}
                disabled={pendiente || platillos === null || nuevos.length === 0} onClick={() => cambiar(true)}>
                {pendiente && platillos !== null ? 'Agotando…' : nuevos.length === 0 && platillos !== null
                  ? 'Nada que agotar' : `Agotar ${nuevos.length} ${nuevos.length === 1 ? 'platillo' : 'platillos'}`}
              </Button>
              <Button type="button" size="touch" variant="ghost" onClick={() => setAbierta(false)}>Cancelar</Button>
            </div>
          )}
        >
          {platillos === null ? (
            <p style={{ margin: 0, fontSize: 14, color: 'var(--u-text-3)' }}>{error ?? 'Buscando sus platillos…'}</p>
          ) : platillos.length === 0 ? (
            <p style={{ margin: 0, fontSize: 14, color: 'var(--u-text-3)' }}>Ningún platillo visible lo lleva en su receta.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, border: '1px solid var(--adm-border)', borderRadius: 12 }}>
              {platillos.map((p, i) => (
                <li key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '10px 12px', borderTop: i ? '1px solid var(--adm-border)' : 'none', fontSize: 14 }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 999, flexShrink: 0,
                    ...(p.yaAgotado
                      ? { color: 'var(--c-warn)', background: 'var(--c-warn-bg)', border: '1px solid var(--c-warn-line)' }
                      : { color: 'var(--u-text-2)', background: 'var(--adm-card)', border: '1px solid var(--adm-border-2)' }) }}>
                    {p.yaAgotado ? 'Ya agotado' : p.categoria ?? 'Sin categoría'}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {platillos !== null && platillos.length > 0 && (
            <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--u-text-3)' }}>
              Al decir «Ya hay» vuelven, salvo que les falte otro ingrediente o los hayas agotado aparte.
            </p>
          )}
          {error && platillos !== null && <p role="alert" style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--c-danger)' }}>{error}</p>}
        </HojaOperativa>
      )}
    </>
  );
}
