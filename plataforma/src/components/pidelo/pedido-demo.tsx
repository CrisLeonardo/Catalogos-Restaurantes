'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Price, PrimaryButton } from '@/components/menu/ui';
import { useCart } from '@/lib/cart-context';
import { useThemeConfig } from '@/lib/theme/context';
import { formatPrice } from '@/lib/theme/resolve';
import { etapaSiguiente, pedidoDesdeCarrito, salaValida, type EtapaDemo, type PedidoDemo } from '@/lib/pidelo';
import { playOrderSound, primeAudio } from '@/lib/sounds';
import { PanelEnVivo } from '@/components/pidelo/panel-en-vivo';
import { useSala } from '@/components/pidelo/use-sala';
import { HojaOperativa } from '@/components/ui/hoja-operativa';
import { enlaceDeAlta, leerIntencion } from '@/lib/alta';

/* ============================================================
   «Pídelo tú mismo» en la demo (lib/pidelo.ts, auditoría EV-01)
   ------------------------------------------------------------
   En la demo el carrito no lleva al checkout —no hay restaurante
   real ni base—: lleva aquí. Dos pasos:
     1. A nombre de quién (opcional) y «Enviar a la cocina».
     2. «Así le llegó a la cocina»: el panel con el pedido, sonando.
   Si la demo se abrió desde el QR de la web (`?sala=`), el pedido
   también viaja a la computadora, que suena con él.

   Siempre montado en la demo (aunque cerrado) para que el canal de
   la sala ya esté suscrito cuando se toque «Enviar».
   ============================================================ */

/** El registro vive en el dominio raíz, no en `demo.`. Si la demo se abrió
    desde un caso de la portada (`?caso=mesas`), el alta llega con ese plan
    y ese caso ya elegidos (WEB-UX-01). */
function urlDeRegistro(): string {
  if (typeof window === 'undefined') return '/registro';
  const { protocol, host, search } = window.location;
  const q = new URLSearchParams(search);
  return `${protocol}//${host.replace(/^demo\./, '')}${enlaceDeAlta(leerIntencion(q.get('plan'), q.get('caso')))}`;
}

export function PedidoDemo({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { items, total, clearCart } = useCart();
  const config = useThemeConfig();
  const [sala, setSala] = useState<string | null>(null);
  const [cliente, setCliente] = useState('');
  const [enviado, setEnviado] = useState<PedidoDemo | null>(null);
  const [enLaPc, setEnLaPc] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [etapa, setEtapa] = useState<EtapaDemo>('nuevo');
  const alCambiarEtapa = useCallback((e: EtapaDemo) => setEtapa((actual) => etapaSiguiente(actual, e)), []);
  const { listo, enviar, enviarEtapa } = useSala(sala, undefined, alCambiarEtapa);

  useEffect(() => {
    setSala(salaValida(new URLSearchParams(window.location.search).get('sala')));
  }, []);

  // Al pasar a «Así le llegó», el botón que tenía el foco desaparece: el
  // foco va al título de la hoja para no caer en <body>.
  const zona = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!enviado) return;
    zona.current?.closest('dialog')?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  }, [enviado]);

  // La hoja se abre desde el carrito, que se cierra al abrirla: al cerrar
  // esta, el foco caía en <body>. Va al resumen del carrito si aún lleva
  // algo y, si el pedido ya salió, a «Empezar…» de la barra de la demo.
  // En un efecto: corre después de que la hoja se desmonta.
  const estabaAbierta = useRef(false);
  useEffect(() => {
    if (open) { estabaAbierta.current = true; return; }
    if (!estabaAbierta.current) return;
    estabaAbierta.current = false;
    if (document.activeElement && document.activeElement !== document.body) return;
    (document.querySelector<HTMLElement>('[data-carrito-destino] button')
      ?? document.querySelector<HTMLElement>('aside[aria-label="Demo de Leogin"] a'))?.focus();
  }, [open]);

  if (!open) return null;
  const enMuestra = window.location.pathname.startsWith('/preview/');

  async function mandar() {
    if (enviando || items.length === 0) return;
    // El toque desbloquea el audio: sin un gesto, el navegador no deja sonar.
    primeAudio();
    setEnviando(true);
    const pedido = pedidoDesdeCarrito(items, cliente);
    const llego = sala && listo ? await enviar(pedido) : false;
    // Un respiro antes del sonido: así se siente como algo que viaja.
    window.setTimeout(() => {
      setEnviado(pedido);
      setEtapa('nuevo');
      setEnLaPc(llego);
      setEnviando(false);
      clearCart();
      playOrderSound(0.6, 2, { force: true });
      try { navigator.vibrate?.([80, 60, 80]); } catch { /* sin vibración */ }
    }, 650);
  }

  function cerrar() {
    setEnviado(null);
    setCliente('');
    onClose();
  }

  const titulo = enviado ? '¡Así le llegó a la cocina!' : 'Tu pedido de prueba';
  const cuerpo = !enviado ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p className="t-mute" style={{ fontSize: 'var(--m-fs-sm)', lineHeight: 1.5, margin: 0 }}>
        Es una demo: no se cobra ni se prepara nada. Envíalo y mira cómo lo recibe
        el restaurante{sala ? ', aquí y en la computadora' : ''}.
      </p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ color: 'var(--u-text-2)', fontSize: 'var(--m-fs-sm)' }}>
          {items.reduce((n, i) => n + i.quantity, 0)} {items.length === 1 && items[0].quantity === 1 ? 'platillo' : 'platillos'}
        </span>
        <Price amount={total} size={20} />
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--m-fs-sm)', color: 'var(--u-text-2)' }}>
        ¿A nombre de quién?
        <input
          value={cliente}
          onChange={(e) => setCliente(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void mandar(); } }}
          maxLength={24}
          placeholder="Tu nombre (opcional)"
          autoComplete="given-name"
          style={{
            padding: '12px 14px', borderRadius: 'var(--m-r-sm)', border: '1px solid var(--u-hair-2, var(--u-hair))',
            background: 'var(--surface-2)', color: 'var(--u-text)', fontSize: 16,
          }}
        />
      </label>
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <PanelEnVivo pedido={enviado} dinero={(n) => formatPrice(n, config)}
          etapa={etapa} onEtapa={(e) => { setEtapa(e); if (enLaPc) enviarEtapa(e); }} />
      </div>
      {enLaPc && (
        <p style={{ margin: 0, fontSize: 'var(--m-fs-sm)', color: 'var(--u-text-2)', textAlign: 'center' }}>
          Mira la computadora: allá también sonó. Lo que toques en una pantalla se ve en la otra.
        </p>
      )}
    </div>
  );
  const pie = !enviado ? (
    <PrimaryButton onClick={mandar} size="lg" full iconRight="arrowRight" disabled={enviando || items.length === 0}>
      {enviando ? 'Enviando…' : 'Enviar a la cocina'}
    </PrimaryButton>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Dentro de la carta de muestra (el alta o la vitrina de la portada,
          en un iframe) ya se está creando el restaurante o el enlace
          navegaría dentro del marco: ahí solo se vuelve a la carta. */}
      {!enMuestra && (
        <PrimaryButton href={urlDeRegistro()} size="lg" full iconRight="arrowRight">
          Quiero esto en mi restaurante
        </PrimaryButton>
      )}
      <button
        type="button"
        onClick={cerrar}
        className="press"
        style={{ background: 'none', border: 'none', color: 'var(--u-text-2)', fontSize: 'var(--m-fs-sm)', cursor: 'pointer', padding: 10, minHeight: 44 }}
      >
        Seguir viendo la carta
      </button>
    </div>
  );

  /* La misma hoja que el carrito (ui/hoja-operativa): antes era un <div>
     con role="dialog" que no movía el foco, no cerraba con Esc y dejaba
     el teclado en <body> (WEB-UX-09). La hoja trae todo eso y es sólida,
     no de vidrio. */
  return (
    <HojaOperativa
      label={titulo}
      title={<span className="t-display" style={{ fontSize: 24, lineHeight: 1.15 }}>{titulo}</span>}
      className="hoja-carrito hoja-pedido-demo"
      onClose={cerrar}
      footer={pie}
    >
      <div ref={zona}>{cuerpo}</div>
    </HojaOperativa>
  );
}
