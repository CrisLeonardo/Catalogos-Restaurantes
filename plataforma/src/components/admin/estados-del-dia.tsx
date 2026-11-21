'use client';

/* ============================================================
   ESTADOS DEL DÍA · panel (auditoría «La carta que vende», CV-32)
   ------------------------------------------------------------
   Una sola fila arriba de Platillos: «+ Estado» y los vigentes como
   círculos, con cuánto les queda. Publicar = foto + (opcional) una
   línea de texto + (opcional) el platillo al que lleva. Caducan solos
   a las 24 h. Nada más: es para hacerlo desde el teléfono en 20 s.

   La foto se sube o se toma de un platillo que ya la tiene (dueño,
   2026-11-20): tocar el platillo pone su foto y, de paso, hace que el
   estado lleve a él. Solo se ofrecen fotos de este restaurante en
   nuestro bucket, que son las que `publicarEstado` acepta.
   ============================================================ */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import AssetImage from '@/components/asset-image';
import ImageUpload from '@/components/admin/image-upload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Icon } from '@/components/icons';
import { publicarEstado, quitarEstado } from '@/lib/actions/estados';
import type { EstadoDelDia } from '@/lib/db/estados';

function quedan(expira: string, ahora: number): string {
  const min = Math.max(0, Math.round((new Date(expira).getTime() - ahora) / 60000));
  return min >= 60 ? `quedan ${Math.round(min / 60)} h` : `quedan ${min} min`;
}

export default function EstadosDelDia({
  restaurantId, estados, platillos, faltaTabla, ahora,
}: {
  restaurantId: string;
  estados: EstadoDelDia[];
  /** `foto` solo viene cuando el platillo tiene una que se puede reusar. */
  platillos: Array<{ id: string; name: string; foto: string | null }>;
  faltaTabla: boolean;
  ahora: number;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [foto, setFoto] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [platillo, setPlatillo] = useState('');
  /** El platillo del que salió la foto, si salió de uno. */
  const [fotoDe, setFotoDe] = useState<string | null>(null);
  const [buscar, setBuscar] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const conFoto = useMemo(() => platillos.filter((p) => p.foto), [platillos]);
  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (!q) return conFoto;
    return conFoto.filter((p) => p.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q));
  }, [conFoto, buscar]);

  if (faltaTabla) return null;

  function usarFotoDe(p: { id: string; foto: string | null }) {
    if (!p.foto) return;
    setFoto(p.foto);
    setFotoDe(p.id);
    // Si no había elegido a dónde lleva, lleva a este platillo.
    if (!platillo || platillo === fotoDe) setPlatillo(p.id);
    setError(null);
  }

  function subida(url: string) {
    setFoto(url);
    if (fotoDe && platillo === fotoDe) setPlatillo('');
    setFotoDe(null);
  }

  function cerrar() {
    setAbierto(false); setFoto(null); setFotoDe(null); setTexto(''); setPlatillo(''); setBuscar(''); setError(null);
  }

  function publicar() {
    if (!foto) { setError('Sube una foto o elige la de un platillo.'); return; }
    setError(null);
    startTransition(async () => {
      const r = await publicarEstado({ restaurantId, imagenUrl: foto, texto, platilloId: platillo || null });
      if (!r.ok) { setError(r.error); return; }
      cerrar();
      router.refresh();
    });
  }

  function quitar(id: string) {
    startTransition(async () => {
      const r = await quitarEstado({ restaurantId, id });
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <section aria-labelledby="estados-t" className="flex flex-col gap-3 rounded-[18px] border border-[var(--adm-border)] bg-[var(--adm-card)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="estados-t" className="text-[15px] font-semibold text-adm-text">Estados del día</h2>
          <p className="text-[13px] text-adm-text-3">Salen arriba de tu carta como en WhatsApp y se quitan solos a las 24 h.</p>
        </div>
        {!abierto && (
          <Button size="touch" variant="secondary" onClick={() => setAbierto(true)}>
            <Icon name="plus" size={16} /> Estado
          </Button>
        )}
      </div>

      {estados.length > 0 && (
        <ul className="flex gap-3 overflow-x-auto pb-1" aria-label="Estados publicados">
          {estados.map((e) => (
            <li key={e.id} className="flex w-[84px] shrink-0 flex-col items-center gap-1 text-center">
              <span className="relative block h-[72px] w-[72px] overflow-hidden rounded-full border-2 border-[var(--adm-accent-fill)]">
                <AssetImage src={e.imagen_url} alt="" fill sizes="72px" style={{ objectFit: 'cover' }} />
              </span>
              <span className="w-full truncate text-[12px] text-adm-text-2">{e.texto || 'Sin texto'}</span>
              <span className="text-[11px] text-adm-text-3">{quedan(e.expira_at, ahora)}</span>
              <Button size="sm" variant="ghost" disabled={pendiente} onClick={() => quitar(e.id)} aria-label={`Quitar estado ${e.texto ?? ''}`.trim()}>
                Quitar
              </Button>
            </li>
          ))}
        </ul>
      )}

      {abierto && (
        <div className="flex flex-col gap-3 border-t border-[var(--adm-border)] pt-3">
          {/* `key`: al elegir la foto de un platillo, el cuadro de subir la enseña. */}
          <ImageUpload key={fotoDe ?? 'subida'} restaurantId={restaurantId} folder="estados" currentUrl={foto} onUpload={subida} />
          {conFoto.length > 0 && (
            <div className="flex flex-col gap-2">
              <span id="estado-de-platillo" className="text-[13px] text-adm-text-2">O usa la foto de un platillo</span>
              {conFoto.length > 12 && (
                <Input
                  type="search"
                  value={buscar}
                  onChange={(e) => setBuscar(e.target.value)}
                  placeholder="Buscar platillo"
                  aria-label="Buscar platillo"
                />
              )}
              {visibles.length > 0 ? (
                <ul aria-labelledby="estado-de-platillo" className="flex gap-2 overflow-x-auto pb-1">
                  {visibles.map((p) => {
                    const elegido = fotoDe === p.id;
                    return (
                      <li key={p.id} className="shrink-0">
                        <button
                          type="button"
                          aria-pressed={elegido}
                          onClick={() => usarFotoDe(p)}
                          className="press flex w-[76px] flex-col items-center gap-1 rounded-[12px] border-0 bg-transparent p-1 text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-adm-accent-ink"
                        >
                          <span className={`relative block h-[64px] w-[64px] overflow-hidden rounded-[12px] border-2 ${elegido ? 'border-[var(--adm-accent-fill)]' : 'border-[var(--adm-border)]'}`}>
                            <AssetImage src={p.foto!} alt="" fill sizes="64px" style={{ objectFit: 'cover' }} />
                            {elegido && (
                              <span aria-hidden className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-adm-accent-fill text-white">
                                <Icon name="check" size={12} />
                              </span>
                            )}
                          </span>
                          <span className={`line-clamp-2 w-full text-[12px] leading-tight ${elegido ? 'font-semibold text-adm-text' : 'text-adm-text-2'}`}>{p.name}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-[13px] text-adm-text-3">Ningún platillo con foto se llama así.</p>
              )}
            </div>
          )}
          <label className="flex flex-col gap-1 text-[13px] text-adm-text-2">
            Una línea (opcional)
            <Input value={texto} maxLength={80} onChange={(e) => setTexto(e.target.value)} placeholder="Ej. Salió la lasaña · 2 × Q45 hasta las 6" />
          </label>
          {platillos.length > 0 && (
            <div className="flex flex-col gap-1 text-[13px] text-adm-text-2">
              <span id="estado-platillo">Lleva a un platillo (opcional)</span>
              <Select
                aria-label="Platillo del estado"
                value={platillo}
                onValueChange={setPlatillo}
                placeholder="Ninguno"
                options={[{ value: '', label: 'Ninguno' }, ...platillos.map((p) => ({ value: p.id, label: p.name }))]}
              />
            </div>
          )}
          {error && <p role="alert" className="text-[13px] text-[var(--c-danger)]">{error}</p>}
          <div className="flex gap-2">
            <Button size="touch" variant="primary" disabled={pendiente || !foto} onClick={publicar}>
              {pendiente ? 'Publicando…' : 'Publicar estado'}
            </Button>
            <Button size="touch" variant="ghost" disabled={pendiente} onClick={cerrar}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
      {!abierto && error && <p role="alert" className="text-[13px] text-[var(--c-danger)]">{error}</p>}
    </section>
  );
}
