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
 * 🔔 Llamar al mesero
 * Ráfagas urgentes triangle sol-do-sol (880→1047→880 Hz) × repeat.
 * Deliberadamente más agresivo e insistente que el de pedidos.
 */
export function playWaiterSound(volume = 0.75, repeat = 3, opts?: { force?: boolean }): void {
  if (!opts?.force && burstThrottled('waiter')) return;
  const ctx = getCtx();
  if (!ctx) return;
  const pBurst = 3;
  const total  = repeat * pBurst;
  for (let i = 0; i < total; i++) {
    const burst = Math.floor(i / pBurst);
    const pos   = i % pBurst;
    const t = ctx.currentTime + burst * 1.1 + pos * 0.22;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = pos === 1 ? 1047 : 880;
    osc.type = 'triangle';
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.start(t);
    osc.stop(t + 0.35);
  }
}

/**
 * 👨‍🍳 Cocina — nuevo pedido en pantalla de cocina
 * "Ding-dong" sawtooth descendente (784→523 Hz).
 * Onda sawtooth y patrón descendente lo distinguen claramente de pedidos.
 */
export function playKitchenSound(volume = 0.5, repeat = 1, opts?: { force?: boolean }): void {
  if (!opts?.force && burstThrottled('kitchen')) return;
  const ctx = getCtx();
  if (!ctx) return;
  for (let r = 0; r < repeat; r++) {
    const base = ctx.currentTime + r * 0.9;
    ([
      [784, 0],
      [523, 0.38],
    ] as [number, number][]).forEach(([freq, offset]) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sawtooth';
      const t = base + offset;
      gain.gain.setValueAtTime(volume * 0.38, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.start(t);
      osc.stop(t + 0.55);
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
