'use client';

import { useState } from 'react';
import { Hoja, HojaHead } from './pieces';
import { guardarPreferenciaServicio } from '@/lib/actions/servicio';
import {
  PUESTOS_FAVORITOS, ROLES_SERVICIO, leerPuestos, prepararPuestos,
  type PreferenciasServicio, type PuestosServicio, type RolServicio,
} from '@/lib/servicio/turno';
import type { Product } from '@/types';

export function HojaTurno({ restaurantId, rol, productos, populares, preferencias, puedePublicar, puestos, onAplicar, onClose }: {
  restaurantId: string;
  rol: RolServicio;
  productos: Product[];
  populares: string[];
  preferencias: PreferenciasServicio;
  puedePublicar: boolean;
  puestos: PuestosServicio;
  onAplicar: (puestos: PuestosServicio) => void;
  onClose: () => void;
}) {
  const activos = productos.filter((p) => p.is_active);
  const [perfil, setPerfil] = useState(rol);
  const [orden, setOrden] = useState(puestos);
  const [plato, setPlato] = useState('');
  const [alias, setAlias] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [busy, setBusy] = useState(false);

  function cambiarPerfil(siguiente: RolServicio) {
    setPerfil(siguiente);
    setOrden(siguiente === rol ? puestos : prepararPuestos(preferencias.favoritos[siguiente], populares, productos));
    setMensaje('');
  }

  async function publicar(tipo: 'favoritos' | 'alias') {
    if (busy) return;
    if (tipo === 'favoritos' && !leerPuestos(orden)) { setMensaje('Cada plato debe ocupar un solo puesto.'); return; }
    setBusy(true);
    try {
      const res = await guardarPreferenciaServicio(restaurantId, tipo, tipo === 'favoritos' ? perfil : plato,
        tipo === 'favoritos' ? orden : alias);
      setMensaje(res.error ?? (tipo === 'favoritos'
        ? 'Guardado para el perfil. Se usará al preparar otro turno.' : 'Alias guardado.'));
    } catch {
      setMensaje('Se perdió la conexión. Vuelve a intentar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Hoja label="Preparar turno" onClose={onClose}>
      <div className="sv-sheet-pad">
        <HojaHead title="Preparar turno" sub="Los números se quedan fijos hasta que cambies los favoritos." onClose={onClose} />
        {puedePublicar && (
          <label className="sv-turno-campo">Perfil
            <select className="sv-field" aria-label="Perfil" value={perfil} onChange={(e) => cambiarPerfil(e.target.value as RolServicio)}>
              {Object.entries(ROLES_SERVICIO).map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
            </select>
          </label>
        )}
        <button type="button" className="sv-cta" data-tone="quiet" onClick={() =>
          setOrden(prepararPuestos(preferencias.favoritos[perfil], populares, productos))}>
          {preferencias.favoritos[perfil] ? 'Cargar favoritos del perfil' : 'Cargar los más pedidos'}
        </button>
        <div className="sv-turno-puestos">
          {Array.from({ length: PUESTOS_FAVORITOS }, (_, i) => {
            const elegido = orden[i] ?? '';
            return (
              <label className="sv-turno-campo" key={i}>Puesto {i + 1}
                <select className="sv-field" aria-label={`Puesto ${i + 1}`} value={elegido} onChange={(e) => {
                  const siguiente = Array.from({ length: PUESTOS_FAVORITOS }, (_, n) => orden[n] ?? null);
                  siguiente[i] = e.target.value || null;
                  setOrden(siguiente);
                }}>
                  <option value="">Sin asignar</option>
                  {elegido && !activos.some((p) => p.id === elegido) && <option value={elegido}>Plato retirado</option>}
                  {activos.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            );
          })}
        </div>
        {perfil === rol && (
          <button type="button" className="sv-cta" disabled={busy} onClick={() => {
            if (!leerPuestos(orden)) { setMensaje('Cada plato debe ocupar un solo puesto.'); return; }
            onAplicar(orden);
          }}>Fijar favoritos en este dispositivo</button>
        )}
        {puedePublicar && (
          <>
            <button type="button" className="sv-cta" data-tone="quiet" disabled={busy}
              onClick={() => void publicar('favoritos')}>Guardar para {ROLES_SERVICIO[perfil]}</button>
            <label className="sv-turno-campo">Plato con alias de trabajo
              <select className="sv-field" aria-label="Plato con alias de trabajo" value={plato} onChange={(e) => {
                setPlato(e.target.value);
                setAlias(preferencias.alias[e.target.value] ?? '');
              }}>
                <option value="">Elige un plato</option>
                {activos.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            {plato && (
              <>
                <label className="sv-turno-campo">Alias
                  <input className="sv-field" value={alias} onChange={(e) => setAlias(e.target.value)}
                    maxLength={40} autoComplete="off" placeholder="Ej. plancha…" />
                </label>
                <button type="button" className="sv-cta" data-tone="quiet" disabled={busy}
                  onClick={() => void publicar('alias')}>Guardar alias</button>
              </>
            )}
          </>
        )}
        {mensaje && <p className="sv-foot-note" role="status">{mensaje}</p>}
      </div>
    </Hoja>
  );
}
