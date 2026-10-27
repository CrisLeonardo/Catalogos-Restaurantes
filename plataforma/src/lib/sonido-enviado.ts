/* «Pedido enviado» (estrategia §5.4): un «pop» suave que sube, y una
   vibración corta en Android. Es el pico del comensal, no una alarma:
   dura menos de un cuarto de segundo y va bajito.

   Sin archivos: dos tonos sintetizados. El AudioContext se crea aquí y
   se cierra al terminar; la página ya tuvo el toque de «Enviar pedido»,
   así que el navegador deja sonar. En el iPhone con el interruptor en
   silencio, el audio web no suena: así se respeta el silencio del
   aparato. Solo cliente. */

export function celebrarEnvio(): void {
  try { navigator.vibrate?.(28); } catch { /* sin vibración */ }
  try {
    const AC = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const t = ctx.currentTime + 0.02;
    const nota = (f0: number, f1: number, desde: number, dur: number, vol: number) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f0, desde);
      osc.frequency.exponentialRampToValueAtTime(f1, desde + dur * 0.6);
      g.gain.setValueAtTime(0.0001, desde);
      g.gain.exponentialRampToValueAtTime(vol, desde + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, desde + dur);
      osc.connect(g).connect(ctx.destination);
      osc.start(desde);
      osc.stop(desde + dur + 0.02);
    };
    nota(520, 880, t, 0.16, 0.16);
    nota(1040, 1320, t + 0.09, 0.14, 0.07);
    setTimeout(() => { ctx.close().catch(() => {}); }, 600);
  } catch { /* sin audio */ }
}
