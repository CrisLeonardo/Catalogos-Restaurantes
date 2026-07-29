/* ============================================================
   sounds.ts — Sonidos de notificación del panel admin
   Cliente only — usa Web Audio API (AudioContext).

   Un solo AudioContext global compartido por todos los importadores
   en la misma pestaña del navegador. Se desbloquea con primeAudio()
   que debe llamarse desde un gesto del usuario (click, keydown…).

   Todo el audio pasa por un BUS MAESTRO con limitador (ver getBus):
   antes cada oscilador se conectaba directo a ctx.destination y las
   voces se sumaban sin control. Los golpes de campana de una misma
   ráfaga se solapan a propósito, así que la suma se pasaba del máximo
   de la salida y el navegador recortaba la onda en seco. Medido con
   OfflineAudioContext en el aviso de mesero: pico 1.006 con el volumen
   por defecto y 1.333 con el slider al 100%, con 3.6 ms de onda
   recortada por ráfaga — distorsión audible. Con el limitador el pico
   se queda en 0.92 y no se recorta nada.
   ============================================================ */

/* ── Singleton AudioContext ──────────────────────────────────────────── */
let _ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!_ctx || _ctx.state === 'closed') _ctx = new AudioContext();
    // Chrome (sobre todo en móvil) auto-suspende el AudioContext tras un
    // rato sin actividad para ahorrar batería. Si un evento Realtime llega
    // después de esa siesta, el contexto sigue "desbloqueado" pero
    // suspendido y no se oye nada. Reintentar resume() en cada acceso —
    // no solo en primeAudio() — evita ese silencio intermitente.
    if (_ctx.state === 'suspended') _ctx.resume().catch(() => {});
    return _ctx;
  } catch { return null; }
}

/* ── Bus maestro: masterGain → limitador → destination ───────────────── */
let _bus: GainNode | null = null;

/**
 * Nodo al que se conectan TODAS las voces. Entre él y la salida hay un
 * DynamicsCompressor configurado como limitador (ratio alto, knee 0, ataque
 * muy corto): cuando dos o tres campanas se solapan —lo normal, están
 * diseñadas así— la suma pasa de 1.0 y sin limitador el navegador la recorta
 * en seco. Ese recorte es lo que hacía sonar el aviso de mesero como una
 * alarma distorsionada en vez de una campanilla.
 */
function getBus(ctx: AudioContext): GainNode {
  if (_bus && _bus.context === ctx) return _bus;

  const bus = ctx.createGain();
  bus.gain.value = 0.95;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -4.5;
  limiter.knee.value      = 0;
  limiter.ratio.value     = 20;
  limiter.attack.value    = 0.003;
  limiter.release.value   = 0.25;

  bus.connect(limiter);
  limiter.connect(ctx.destination);
  _bus = bus;

  // El contexto es nuevo: su reloj arranca en 0 y los tiempos de la cola
  // (scheduledUntil) pertenecían al contexto anterior. Sin este reset se
  // quedarían "en el futuro" para siempre y toda petición se descartaría.
  (Object.keys(scheduledUntil) as SoundKind[]).forEach((k) => { scheduledUntil[k] = 0; });

  return bus;
}

/**
 * Desbloquea el AudioContext del navegador.
 * Los navegadores modernos suspenden el contexto hasta recibir un gesto
 * del usuario. Llamar esto en cualquier onClick/onKeyDown antes de
 * necesitar sonido garantiza que los posteriores plays funcionen.
 */
export function primeAudio(): void {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  try {
    getBus(ctx);
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch {}
}

/**
 * ¿El AudioContext está desbloqueado (puede sonar de verdad)?
 * Crear el contexto no requiere gesto del usuario, pero Chrome/Firefox/Safari
 * lo dejan en 'suspended' hasta el primer click/tap/tecla — sin eso, cualquier
 * sonido programado se pierde en silencio (RS visual sigue funcionando: el
 * toast y la tarjeta no dependen del audio). Usar esto para avisarle al
 * usuario que falta un toque cuando el panel se acaba de cargar/recargar.
 */
export function isAudioUnlocked(): boolean {
  const ctx = getCtx();
  return ctx?.state === 'running';
}

/**
 * Intenta desbloquear el AudioContext SIN esperar un gesto del usuario y
 * espera el resultado real de resume() antes de responder.
 * getCtx()/isAudioUnlocked() disparan resume() pero no esperan la promesa,
 * así que un chequeo síncrono justo después casi siempre reporta "bloqueado"
 * aunque el resume() termine resolviendo solo un instante después (algunos
 * entornos —como el WebView de Leogin Desktop— no exigen un gesto real y
 * lo resuelven solos). Ese hueco es lo que hacía ver el botón de sonido
 * como "apagado" en cada apertura de la app aunque el audio funcionara.
 * Devuelve el estado ya resuelto para que el llamador actualice su UI.
 */
export async function tryAutoUnlockAudio(): Promise<boolean> {
  const ctx = getCtx();
  if (!ctx) return false;
  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch { /* requiere gesto real, se resolverá con el listener */ }
  }
  return ctx.state === 'running';
}

/* ── Cola de reproducción por tipo de evento ─────────────────────────── */

export type SoundKind = 'order' | 'waiter' | 'kitchen';

/* Momento (en el reloj del AudioContext) en que termina lo último que se
   programó de cada tipo. Un aviso nuevo se encola DESPUÉS de ese momento en
   vez de empezar en ctx.currentTime y encimarse con el que sigue sonando:
   dos campanas del mismo tipo sonando a la vez no se entienden como "dos
   pedidos", se entienden como un sonido roto. El freno anterior comparaba
   solo el instante de inicio contra un hueco fijo (2.5 s para pedidos) más
   corto que la duración real del sonido (hasta 2.98 s con repetición 3), así
   que se solapaban de todas formas. */
const scheduledUntil: Record<SoundKind, number> = { order: 0, waiter: 0, kitchen: 0 };

/* Separación mínima entre el final de un aviso y el inicio del siguiente:
   sin este silencio se oirían como un solo sonido continuo. */
const QUEUE_GAP = 0.35;

/* Tope de cola: si ya hay más de esto esperando, el aviso se descarta. Con
   media sala llamando a la vez (o 15 pedidos encolados offline que sincronizan
   de golpe al volver la señal) encolar N avisos sería una alarma continua de
   medio minuto. El NÚMERO real lo comunican las tarjetas y el contador en
   pantalla; el sonido solo tiene que llamar la atención. */
const MAX_QUEUE_AHEAD = 1.5;

/**
 * Reserva un hueco en la cola de `kind` para un sonido de `duration` segundos.
 * Devuelve el instante de inicio, o null si hay que descartarlo por cola llena.
 */
function claimSlot(kind: SoundKind, ctx: AudioContext, duration: number): number | null {
  const now   = ctx.currentTime;
  const start = Math.max(now, scheduledUntil[kind] + QUEUE_GAP);
  if (start - now > MAX_QUEUE_AHEAD) return null;
  scheduledUntil[kind] = start + duration;
  return start;
}

/* ── Dedup entre pestañas ────────────────────────────────────────────── */
const CLAIM_KEY = 'leogin-notif-claims-v1';
const CLAIM_TTL = 20_000;

/**
 * ¿Le toca a ESTA pestaña sonar por este evento?
 *
 * Es normal tener el panel abierto en varias pestañas (resumen + pedidos, o
 * el navegador restaurando la sesión anterior). Cada pestaña recibe el mismo
 * evento Realtime con unos milisegundos de diferencia y sonaba por su cuenta:
 * dos o tres campanas desfasadas suenan exactamente como "llegaron varias
 * notificaciones a la vez". La primera pestaña que reclama el id gana; las
 * demás se quedan calladas pero SÍ muestran la tarjeta (lo visual nunca se
 * suprime). Si localStorage falla, se devuelve true: es mejor que suene dos
 * veces que quedarse mudo.
 */
export function claimSoundEvent(kind: SoundKind, eventId: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const key = `${kind}:${eventId}`;
    const now = Date.now();
    const raw = localStorage.getItem(CLAIM_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};

    let mine = true;
    if (typeof map[key] === 'number' && now - map[key] < CLAIM_TTL) mine = false;

    // Purga de entradas viejas para que la clave no crezca sin límite.
    for (const k of Object.keys(map)) {
      if (now - map[k] > CLAIM_TTL) delete map[k];
    }
    if (mine) map[key] = now;
    localStorage.setItem(CLAIM_KEY, JSON.stringify(map));
    return mine;
  } catch { return true; }
}

/* ── Sonidos distintivos por tipo de evento ──────────────────────────── */

/**
 * Un solo "golpe de campana": oscilador fundamental + un parcial armónico
 * breve (relación inarmónica ~2.4×, típica de campanas y carrillones reales)
 * que decae más rápido que el fundamental. Ese segundo tono es lo que da el
 * brillo metálico corto del golpe — con un solo oscilador de onda cruda
 * (triangle/sawtooth) suena a "beep" de electrodoméstico barato en vez de a
 * campana. Se reutiliza en los tres avisos para que suenen a la misma familia
 * "profesional" pero con timbre/registro distintos entre sí.
 */
function bellStrike(
  ctx: AudioContext,
  freq: number,
  t: number,
  volume: number,
  opts?: { duration?: number; partial?: number; partialGain?: number; wave?: OscillatorType },
): void {
  const duration    = opts?.duration    ?? 0.5;
  const partial     = opts?.partial     ?? 2.42;
  const partialGain = opts?.partialGain ?? 0.32;
  const wave        = opts?.wave        ?? 'sine';
  const bus         = getBus(ctx);

  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(bus);
  osc.frequency.value = freq;
  osc.type = wave;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.start(t);
  osc.stop(t + duration);

  const osc2  = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.connect(gain2);
  gain2.connect(bus);
  osc2.frequency.value = freq * partial;
  osc2.type = 'sine';
  gain2.gain.setValueAtTime(0, t);
  gain2.gain.linearRampToValueAtTime(volume * partialGain, t + 0.006);
  gain2.gain.exponentialRampToValueAtTime(0.001, t + duration * 0.42);
  osc2.start(t);
  osc2.stop(t + duration * 0.42);
}

/* Geometría de cada aviso, en un solo lugar: sirve para tocarlo Y para
   calcular su duración real (la cola necesita saber cuánto ocupa).

   El hueco entre repeticiones (*_BURST menos lo que ocupa una ráfaga) importa
   tanto como el timbre. Con la repetición 3× del mesero, las ráfagas iban cada
   0.6 s y cada una ocupaba 0.57 s: 6 golpes de campana casi pegados, que se
   oyen como varias notificaciones llegando encimadas en vez de como UN aviso
   insistente. Ahora hay ~0.3 s de silencio real entre repeticiones, así que se
   percibe el patrón "ding-ding … ding-ding … ding-ding": un solo evento. */
const ORDER_NOTES   = [523, 659, 784];            // C5 → E5 → G5
const ORDER_STEP    = 0.15;
const ORDER_DUR     = 0.55;
const ORDER_BURST   = 1.15;

const WAITER_NOTES  = [784, 1047];                // G5 → C6
const WAITER_STEP   = 0.17;
const WAITER_DUR    = 0.4;
const WAITER_BURST  = 0.9;

const KITCHEN_NOTES = [698, 523];                 // F5 → C5
const KITCHEN_STEP  = 0.4;
const KITCHEN_DUR   = 0.65;
const KITCHEN_BURST = 1.45;

function spanOf(notes: number, step: number, dur: number, burst: number, repeat: number): number {
  return (repeat - 1) * burst + (notes - 1) * step + dur;
}

/**
 * 🛎 Pedido nuevo
 * Carrillón ascendente do-mi-sol (523→659→784 Hz) con timbre de campana.
 * Antes eran tres senoides crudas cuyo pico real era volume*0.55 (0.275 con el
 * volumen que traía por defecto) — el más flojo de los tres avisos con
 * diferencia y el más fácil de perder en un local con ruido, justo el que NO se
 * puede perder. Ahora usa bellStrike (cuerpo y brillo reales) y aprovecha el
 * margen completo: medido, es el aviso con más presencia de los tres.
 * `force` salta la cola — para el botón "Probar" del panel de sonidos: sin
 * esto, el segundo clic seguido caía en el hueco de la cola y parecía roto.
 */
export function playOrderSound(volume = 0.6, repeat = 1, opts?: { force?: boolean }): void {
  const ctx = getCtx();
  if (!ctx) return;
  const reps = Math.max(1, Math.min(3, Math.round(repeat)));
  const dur  = spanOf(ORDER_NOTES.length, ORDER_STEP, ORDER_DUR, ORDER_BURST, reps);
  const base = opts?.force ? ctx.currentTime : claimSlot('order', ctx, dur);
  if (base == null) return;

  for (let r = 0; r < reps; r++) {
    const t0 = base + r * ORDER_BURST;
    ORDER_NOTES.forEach((freq, i) => {
      bellStrike(ctx, freq, t0 + i * ORDER_STEP, volume, {
        duration: ORDER_DUR, partial: 2.42, partialGain: 0.3, wave: 'sine',
      });
    });
  }
}

/**
 * 🔔 Llamar al mesero
 * Campanilla de recepción: dos golpes brillantes ascendentes (sol5→do6,
 * 784→1047 Hz) por ráfaga. Registro agudo y tempo rápido para que se sienta
 * urgente e insistente, pero reconocible como una campana real.
 * Los dos golpes de cada ráfaga se solapan 0.23 s a propósito y su suma se iba
 * por encima del máximo de la salida (ver cabecera del archivo): ahora pasa por
 * el limitador del bus, que deja el pico en 0.92 sin recortar nada.
 * Las repeticiones van cada 0.9 s en vez de 0.6 s: con 0.6 s quedaban 0.03 s de
 * silencio entre una y otra, o sea 6 campanadas casi pegadas que se oyen como
 * varias llamadas llegando a la vez en vez de como UNA llamada insistente.
 */
export function playWaiterSound(volume = 0.75, repeat = 3, opts?: { force?: boolean }): void {
  const ctx = getCtx();
  if (!ctx) return;
  const reps = Math.max(1, Math.min(3, Math.round(repeat)));
  const dur  = spanOf(WAITER_NOTES.length, WAITER_STEP, WAITER_DUR, WAITER_BURST, reps);
  const base = opts?.force ? ctx.currentTime : claimSlot('waiter', ctx, dur);
  if (base == null) return;

  for (let r = 0; r < reps; r++) {
    const t0 = base + r * WAITER_BURST;
    WAITER_NOTES.forEach((freq, i) => {
      bellStrike(ctx, freq, t0 + i * WAITER_STEP, volume, {
        duration: WAITER_DUR, partial: 2.42, partialGain: 0.38, wave: 'sine',
      });
    });
  }
}

/**
 * 👨‍🍳 Cocina — nuevo pedido en pantalla de cocina
 * "Ding-dong" de timbre cálido y grave (fa5→do5, 698→523 Hz) con fundamental
 * triangle (más redondo/cálido que sine) + parcial de campana, tempo pausado.
 * Registro más grave y contorno más lento que el de mesero para que ambos
 * sean inconfundibles entre sí incluso a volumen bajo o de oído.
 */
export function playKitchenSound(volume = 0.5, repeat = 1, opts?: { force?: boolean }): void {
  const ctx = getCtx();
  if (!ctx) return;
  const reps = Math.max(1, Math.min(2, Math.round(repeat)));
  const dur  = spanOf(KITCHEN_NOTES.length, KITCHEN_STEP, KITCHEN_DUR, KITCHEN_BURST, reps);
  const base = opts?.force ? ctx.currentTime : claimSlot('kitchen', ctx, dur);
  if (base == null) return;

  for (let r = 0; r < reps; r++) {
    const t0 = base + r * KITCHEN_BURST;
    KITCHEN_NOTES.forEach((freq, i) => {
      bellStrike(ctx, freq, t0 + i * KITCHEN_STEP, volume, {
        duration: KITCHEN_DUR, partial: 2.0, partialGain: 0.25, wave: 'triangle',
      });
    });
  }
}

/* ── Recordatorio insistente de pedido sin atender ───────────────────── */

/**
 * Mientras haya un pedido nuevo que nadie ha atendido, el aviso se repite
 * cada NAG_EVERY_MS. Un solo chime se pierde con facilidad: si el encargado
 * estaba en la bodega, atendiendo a alguien en la caja o el local está
 * ruidoso, ese único sonido ya pasó y el pedido queda invisible hasta que
 * alguien se acuerde de mirar la pantalla.
 *
 * Singleton a propósito: dos componentes montados a la vez no pueden crear
 * dos recordatorios que se pisen. Tiene tope (MAX_NAGS) para que un panel
 * abandonado toda la noche no quede sonando indefinidamente.
 */
const NAG_EVERY_MS = 22_000;
const MAX_NAGS     = 10;

let nagTimer: ReturnType<typeof setInterval> | null = null;
let nagCount = 0;

/* Throttle compartido entre pestañas para el recordatorio. claimSoundEvent no
   sirve aquí porque no hay un id de evento: el recordatorio no es un pedido
   concreto sino "sigue habiendo algo sin atender". Con dos pestañas abiertas,
   cada una con su propio intervalo desfasado, se oirían recordatorios el doble
   de seguido y a contratiempo — justo el efecto de "suenan varias a la vez".
   La primera que llega en cada ventana toca; la otra se calla ese turno. */
const NAG_TICK_KEY = 'leogin-notif-nag-order-at';

function nagTickIsMine(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const now  = Date.now();
    const prev = Number(localStorage.getItem(NAG_TICK_KEY) ?? 0);
    // 0.8× para que una sola pestaña nunca se bloquee a sí misma por la
    // deriva normal de setInterval.
    if (Number.isFinite(prev) && now - prev < NAG_EVERY_MS * 0.8) return false;
    localStorage.setItem(NAG_TICK_KEY, String(now));
    return true;
  } catch { return true; }
}

export function startOrderNag(volume: number, repeat: number): void {
  stopOrderNag();
  nagCount = 0;
  nagTimer = setInterval(() => {
    nagCount += 1;
    if (nagCount > MAX_NAGS) { stopOrderNag(); return; }
    if (!nagTickIsMine()) return;
    playOrderSound(volume, repeat);
  }, NAG_EVERY_MS);
}

export function stopOrderNag(): void {
  if (nagTimer) { clearInterval(nagTimer); nagTimer = null; }
  nagCount = 0;
}

/* ── Configuración de sonido (localStorage) ──────────────────────────── */
const SETTINGS_KEY = 'notif-sound-v1';

export interface SoundSettings {
  orderVolume:   number; // 0-1
  waiterVolume:  number;
  kitchenVolume: number;
  orderRepeat:   number; // 1-3
  waiterRepeat:  number;
  kitchenRepeat: number;
  /** Repetir el aviso de pedido nuevo hasta que alguien lo atienda. */
  orderNag:      boolean;
}

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  orderVolume:   0.7,
  waiterVolume:  0.75,
  kitchenVolume: 0.5,
  orderRepeat:   2,
  waiterRepeat:  3,
  kitchenRepeat: 1,
  orderNag:      true,
};

export function loadSoundSettings(): SoundSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SOUND_SETTINGS };
    return { ...DEFAULT_SOUND_SETTINGS, ...(JSON.parse(raw) as Partial<SoundSettings>) };
  } catch { return { ...DEFAULT_SOUND_SETTINGS }; }
}

export function saveSoundSettings(s: SoundSettings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
}
