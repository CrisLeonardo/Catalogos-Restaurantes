/* ============================================================
   sounds.ts — Sonidos de notificación del panel admin
   Cliente only — usa Web Audio API (AudioContext).

   Un solo AudioContext global compartido por todos los importadores
   en la misma pestaña del navegador. Se desbloquea con primeAudio()
   que debe llamarse desde un gesto del usuario (click, keydown…).
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

/* ── Sonidos distintivos por tipo de evento ──────────────────────────── */

/* Freno de ráfagas: N eventos casi simultáneos (p. ej. 15 pedidos encolados
   que sincronizan de golpe al volver la señal, o media sala llamando al
   mesero a la vez) NO deben apilar N sonidos — encimados suenan como una
   alarma continua e inentendible y saturan al personal. Un aviso por
   ventana de unos segundos comunica lo mismo; el NÚMERO real lo muestran
   las tarjetas/contadores en pantalla. */
const MIN_GAP_MS = { order: 2500, waiter: 4000, kitchen: 2000 } as const;
const lastPlayed = { order: 0, waiter: 0, kitchen: 0 };

function burstThrottled(kind: keyof typeof MIN_GAP_MS): boolean {
  const now = Date.now();
  if (now - lastPlayed[kind] < MIN_GAP_MS[kind]) return true;
  lastPlayed[kind] = now;
  return false;
}

/**
 * 🛎 Pedido nuevo
 * 3 tonos ascendentes sine do-mi-sol (523→659→784 Hz).
 * Patrón agradable y reconocible como "llegó algo nuevo".
 * `force` salta el freno de ráfagas — para el botón "Probar" del panel de
 * sonidos: sin esto, el segundo clic en menos de 2.5-4s no sonaba nada y
 * parecía que el sonido estaba roto.
 */
export function playOrderSound(volume = 0.5, repeat = 1, opts?: { force?: boolean }): void {
  if (!opts?.force && burstThrottled('order')) return;
  const ctx = getCtx();
  if (!ctx) return;
  for (let r = 0; r < repeat; r++) {
    const base = ctx.currentTime + r * 1.05;
    [523, 659, 784].forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      const t = base + i * 0.14;
      gain.gain.setValueAtTime(volume * 0.55, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.start(t);
      osc.stop(t + 0.6);
    });
  }
}

/**
 * Un solo "golpe de campana": oscilador fundamental + un parcial armónico
 * breve (relación inarmónica ~2.4×, típica de campanas y carrillones reales)
 * que decae más rápido que el fundamental. Ese segundo tono es lo que da el
 * brillo metálico corto del golpe — con un solo oscilador de onda cruda
 * (triangle/sawtooth) suena a "beep" de electrodoméstico barato en vez de a
 * campana. Se reutiliza en mesero y cocina para que ambos suenen a la misma
 * familia "profesional" pero con timbre/registro distintos entre sí.
 */
function bellStrike(
  ctx: AudioContext,
  freq: number,
  t: number,
  volume: number,
  opts?: { duration?: number; partial?: number; partialGain?: number; wave?: OscillatorType },
): void {
  const duration    = opts?.duration    ?? 0.5;
  const partial      = opts?.partial     ?? 2.42;
  const partialGain   = opts?.partialGain ?? 0.32;
  const wave         = opts?.wave        ?? 'sine';

  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
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
  gain2.connect(ctx.destination);
  osc2.frequency.value = freq * partial;
  osc2.type = 'sine';
  gain2.gain.setValueAtTime(0, t);
  gain2.gain.linearRampToValueAtTime(volume * partialGain, t + 0.006);
  gain2.gain.exponentialRampToValueAtTime(0.001, t + duration * 0.42);
  osc2.start(t);
  osc2.stop(t + duration * 0.42);
}

/**
 * 🔔 Llamar al mesero
 * Campanilla de recepción: dos golpes brillantes ascendentes (sol5→do6,
 * 784→1047 Hz) por ráfaga, timbre de campana cálida (bellStrike) en vez del
 * "buzzer" triangle plano de antes. Registro agudo y tempo rápido para que
 * siga sintiéndose urgente e insistente, pero reconocible como una campana
 * real y no como una alarma genérica.
 */
export function playWaiterSound(volume = 0.75, repeat = 3, opts?: { force?: boolean }): void {
  if (!opts?.force && burstThrottled('waiter')) return;
  const ctx = getCtx();
  if (!ctx) return;
  const notes = [784, 1047]; // G5 → C6
  for (let r = 0; r < repeat; r++) {
    const base = ctx.currentTime + r * 0.6;
    notes.forEach((freq, i) => {
      bellStrike(ctx, freq, base + i * 0.17, volume, { duration: 0.4, partial: 2.42, partialGain: 0.38, wave: 'sine' });
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
  if (!opts?.force && burstThrottled('kitchen')) return;
  const ctx = getCtx();
  if (!ctx) return;
  const notes: [number, number][] = [[698, 0], [523, 0.4]]; // F5 → C5
  for (let r = 0; r < repeat; r++) {
    const base = ctx.currentTime + r * 1.15;
    notes.forEach(([freq, offset]) => {
      bellStrike(ctx, freq, base + offset, volume * 0.85, { duration: 0.65, partial: 2.0, partialGain: 0.25, wave: 'triangle' });
    });
  }
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
}

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  orderVolume:   0.5,
  waiterVolume:  0.75,
  kitchenVolume: 0.5,
  orderRepeat:   1,
  waiterRepeat:  3,
  kitchenRepeat: 1,
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
