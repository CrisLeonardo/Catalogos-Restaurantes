'use client';

/* Cobrar algo que no está en la carta.
   ------------------------------------------------------------------
   Hallazgo M-09. Sin esto, lo que no está en el catálogo no se puede
   cobrar: el plato del día que nadie dio de alta, un descorche, un
   recargo, la torta que trajo el cliente. Y lo que pasa entonces no es
   que se deje de cobrar — es que el mesero apunta «Coca-Cola», suma Q40
   a mano en la calculadora y ese dinero no entra ni al arqueo, ni al
   informe, ni a la cuenta impresa.

   El precio lo escribe una persona, y es la única línea del sistema de
   la que eso es cierto (todo lo demás se contrasta contra el catálogo).
   Por eso queda escrito en la bitácora con su nombre y su importe: ver
   `createWaiterOrder`.

   Se abre desde el buscador, cuando la búsqueda no encuentra nada. Ese
   es el momento exacto en que el mesero ya comprobó que el plato no está
   en la carta, así que llega con el nombre puesto y solo falta el
   precio. */

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icons';

export interface OpenItemDraft {
  name: string;
  price: number;
  quantity: number;
  note?: string;
}

export default function OpenItemDialog({
  nombreInicial, money, onAdd, onClose,
}: {
  /** Lo que el mesero acababa de escribir en el buscador. */
  nombreInicial: string;
  money: (n: number) => string;
  onAdd: (draft: OpenItemDraft) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(nombreInicial);
  /* El precio se guarda como TEXTO mientras se teclea. Con un `number` en
     el estado, borrar el último dígito deja NaN y el campo se queda en
     blanco de una forma de la que no se puede salir escribiendo. */
  const [precio, setPrecio] = useState('');
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const precioRef = useRef<HTMLInputElement | null>(null);

  /* El nombre ya viene del buscador, así que el foco va donde de verdad
     falta algo. Si llega vacío —se abrió desde el menú de acciones— el
     autoFocus del nombre manda. */
  useEffect(() => {
    if (nombreInicial.trim()) precioRef.current?.focus();
  }, [nombreInicial]);

  const valor = Number(precio.replace(',', '.'));
  const precioOk = precio.trim() !== '' && Number.isFinite(valor) && valor >= 0 && valor <= 100_000;
  const listo = name.trim().length > 0 && precioOk;
  const total = precioOk ? valor * qty : 0;

  function agregar() {
    if (!listo) return;
    onAdd({
      name: name.trim(),
      price: Math.round(valor * 100) / 100,
      quantity: qty,
      note: note.trim() || undefined,
    });
  }

  return (
    <div
      onClick={onClose}
      className="waiter-sheet-scrim"
      style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Artículo libre"
        className="glass anim-slide-up waiter-sheet"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        style={{ width: '100%', maxWidth: 460, padding: '22px 20px 28px' }}
      >
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--u-text)' }}>
          Artículo libre
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--u-text-3)', marginTop: 6, lineHeight: 1.45 }}>
          Algo que no está en la carta: el plato del día, un descorche, un recargo.
          Entra a la cuenta como cualquier otro y queda registrado.
        </div>

        <Campo label="Qué es">
          <input
            autoFocus={!nombreInicial.trim()}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Descorche, plato del día…"
            aria-label="Nombre del artículo"
            maxLength={80}
            style={campoStyle}
          />
        </Campo>

        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Etiqueta>Precio por unidad</Etiqueta>
            <input
              ref={precioRef}
              value={precio}
              onChange={(e) => setPrecio(e.target.value.replace(/[^\d.,]/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter' && listo) { e.preventDefault(); agregar(); } }}
              /* `inputMode` y no `type="number"`: en el teléfono saca el
                 teclado numérico igual, y sin las flechitas que en una
                 tablet se tocan sin querer. */
              inputMode="decimal"
              placeholder="0.00"
              aria-label="Precio del artículo"
              style={{ ...campoStyle, marginTop: 0 }}
            />
          </div>
          <div style={{ flexShrink: 0 }}>
            <Etiqueta>Cantidad</Etiqueta>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 48 }}>
              <Paso icon="minus" label="Uno menos" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} />
              <span className="t-mono" style={{ minWidth: 30, textAlign: 'center', fontSize: 17, fontWeight: 700, color: 'var(--u-text)' }}>
                {qty}
              </span>
              <Paso icon="plus" label="Uno más" onClick={() => setQty((q) => Math.min(99, q + 1))} />
            </div>
          </div>
        </div>

        <Campo label="Nota para cocina (opcional)">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && listo) { e.preventDefault(); agregar(); } }}
            placeholder="Sin hielo, para llevar…"
            aria-label="Nota del artículo"
            maxLength={140}
            style={campoStyle}
          />
        </Campo>

        <button
          type="button"
          onClick={agregar}
          disabled={!listo}
          className="press btn-accent"
          style={{
            width: '100%', marginTop: 18, padding: 14, borderRadius: 13, border: 'none',
            cursor: listo ? 'pointer' : 'default', fontWeight: 700, fontSize: 15,
            opacity: listo ? 1 : 0.5,
          }}
        >
          {/* El importe DENTRO del botón, igual que «Cobrar Q412.50»: es lo
              que se le va a sumar a la cuenta de alguien y se lee antes de
              tocar, no después. */}
          {listo ? `Agregar · ${money(total)}` : 'Agregar a la cuenta'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="press glass-quiet"
          style={{
            width: '100%', marginTop: 9, padding: 13, borderRadius: 13, border: 'none',
            cursor: 'pointer', fontWeight: 600, fontSize: 14, color: 'var(--u-text-2)',
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

const campoStyle: React.CSSProperties = {
  width: '100%', height: 48, marginTop: 6, padding: '0 14px', borderRadius: 12, outline: 'none',
  border: '1px solid var(--u-hair-2)', background: 'color-mix(in srgb, var(--u-text) 5%, transparent)',
  /* 16 px de piso: por debajo, Safari amplía la página al enfocar el campo
     y el mesero acaba con la pantalla desplazada. */
  color: 'var(--u-text)', fontSize: 16,
};

function Etiqueta({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--u-text-3)' }}>
      {children}
    </span>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginTop: 14 }}>
      <Etiqueta>{label}</Etiqueta>
      {children}
    </label>
  );
}

function Paso({ icon, label, onClick, disabled }: {
  icon: 'plus' | 'minus'; label: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="press"
      style={{
        display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 11,
        border: '1px solid var(--u-hair-2)', background: 'none', color: 'var(--u-text-2)',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1,
      }}
    >
      <Icon name={icon} size={15} />
    </button>
  );
}
